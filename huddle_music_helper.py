import asyncio
import json
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
    "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
}


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
        return web.json_response({"error": str(error)}, status=502)


app = web.Application(client_max_size=1024 * 1024)
app.router.add_get("/health", health)
app.router.add_post("/resolve", resolve)


if __name__ == "__main__":
    web.run_app(app, host="127.0.0.1", port=8731, print=None)
