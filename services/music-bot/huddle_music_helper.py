import asyncio
import importlib.metadata
import json
import os
import sys
import time
import shutil
import tempfile
from aiohttp import web
import yt_dlp


YDL_OPTIONS = {
    "format": "bestaudio/best",
    "default_search": "ytsearch1",
    "noplaylist": True,
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "nocheckcertificate": True,
    # Let current yt-dlp select its working client. Pinning the older
    # android/web clients hides DASH audio-only formats on modern YouTube and
    # leaves only low-quality itag 18.
}

# Age-restricted videos need a signed-in YouTube session. Point
# YTDLP_COOKIES at a Netscape-format cookies.txt exported from a browser.
# yt-dlp writes the jar back on exit, so work on a private copy and leave a
# read-only mount untouched.
_cookies_source = os.environ.get("YTDLP_COOKIES", "").strip()
if _cookies_source and os.path.isfile(_cookies_source):
    _cookies_copy = os.path.join(tempfile.mkdtemp(prefix="ytdlp-"), "cookies.txt")
    shutil.copyfile(_cookies_source, _cookies_copy)
    YDL_OPTIONS["cookiefile"] = _cookies_copy


def resolve_track(query: str) -> dict:
    with yt_dlp.YoutubeDL(YDL_OPTIONS) as ydl:
        result = ydl.extract_info(query, download=False)
        if result and result.get("entries"):
            result = next((entry for entry in result["entries"] if entry), None)
        if not result:
            raise ValueError("No playable result was found.")

        formats = [
            item
            for item in result.get("formats", [])
            if item.get("url") and item.get("acodec") not in (None, "none")
        ]
        if formats:
            formats.sort(
                key=lambda item: (
                    item.get("vcodec") == "none",
                    item.get("abr") or 0,
                    item.get("tbr") or 0,
                ),
                reverse=True,
            )
            stream_url = formats[0]["url"]
        else:
            stream_url = result.get("url")
        if not stream_url:
            raise ValueError("The result has no playable audio stream.")

        return {
            "title": result.get("title") or query,
            "artist": result.get("artist")
            or result.get("uploader")
            or result.get("channel"),
            "duration": result.get("duration"),
            "thumbnail": result.get("thumbnail"),
            "page_url": result.get("webpage_url") or result.get("original_url"),
            "audio_url": stream_url,
            "audio_format": formats[0].get("format_id") if formats else None,
            "audio_bitrate": formats[0].get("abr") if formats else None,
        }


async def health(_request: web.Request):
    return web.json_response({"ok": True})


async def resolve(request: web.Request):
    try:
        body = await request.json()
        query = str(body.get("query") or "").strip()[:500]
        if not query:
            return web.json_response({"error": "Give me a song name or URL."}, status=400)
        result = await asyncio.get_running_loop().run_in_executor(
            None, resolve_track, query
        )
        return web.json_response(result)
    except Exception as error:
        message = str(error)
        if "confirm your age" in message and "cookiefile" not in YDL_OPTIONS:
            message = (
                "That video is age-restricted and the music bot has no YouTube "
                "cookies. Try another upload, or ask the server admin to set "
                "YTDLP_COOKIES."
            )
        return web.json_response({"error": message}, status=502)


# YouTube breaks yt-dlp's extractors every few weeks, so a helper built once
# would quietly stop playing. Once a day (YTDLP_UPDATE_HOURS, 0 turns it off)
# yt-dlp is upgraded with pip in the interpreter running this file. A loaded
# module cannot be swapped in place, so when the version changes the helper
# exits and its supervisor (systemd Restart=always, Docker's restart policy)
# starts it again on the new one.
YTDLP_UPDATE_HOURS = float(os.environ.get("YTDLP_UPDATE_HOURS", "24") or 0)
_ytdlp_status = {"running": yt_dlp.version.__version__, "checked_at": None, "result": "not checked yet"}


def _installed_ytdlp_version() -> str:
    try:
        return importlib.metadata.version("yt-dlp")
    except importlib.metadata.PackageNotFoundError:
        return yt_dlp.version.__version__


async def update_ytdlp() -> dict:
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "pip", "install", "--quiet", "--no-cache-dir", "--upgrade", "yt-dlp",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    installed = _installed_ytdlp_version()
    _ytdlp_status.update(
        checked_at=int(time.time()),
        installed=installed,
        result="ok" if proc.returncode == 0 else "pip failed: " + stderr.decode(errors="replace").strip()[-200:],
    )
    if proc.returncode == 0 and installed != yt_dlp.version.__version__:
        print(f"[music-bot] yt-dlp {yt_dlp.version.__version__} -> {installed}; restarting onto it", flush=True)
        asyncio.get_running_loop().call_later(1, os._exit, 0)
    return dict(_ytdlp_status)


async def ytdlp_updater():
    await asyncio.sleep(60)
    while True:
        try:
            await update_ytdlp()
        except Exception as error:  # a failed check must not take the helper down
            _ytdlp_status.update(checked_at=int(time.time()), result=f"check failed: {error}")
        await asyncio.sleep(YTDLP_UPDATE_HOURS * 3600)


async def status(_request: web.Request):
    return web.json_response({"ok": True, "ytdlp": _ytdlp_status, "autoUpdate": YTDLP_UPDATE_HOURS > 0})


async def start_updater(app_instance: web.Application):
    if YTDLP_UPDATE_HOURS > 0:
        app_instance["ytdlp_updater"] = asyncio.create_task(ytdlp_updater())


app = web.Application(client_max_size=1024 * 1024)
app.on_startup.append(start_updater)
app.router.add_get("/health", health)
app.router.add_get("/status", status)
app.router.add_post("/resolve", resolve)


if __name__ == "__main__":
    # Loopback by default so a bare-metal install is not exposed; the Docker
    # image sets HOST=0.0.0.0 so the hoffle container can reach it.
    web.run_app(
        app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8731")),
        print=None,
    )
