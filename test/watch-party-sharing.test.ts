// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { applyQueue, continueWatch, sanitizeShared, type WatchState } from "@/lib/lounge-shared";
import { upstreamUrl } from "@/lib/jellyfin-proxy";
import { cueAt, parseVtt, pickedSubtitle, type SubtitleTrack } from "@/app/lib/subtitles";

const ITEM = "86bfa7a3dadfd688091aadb8d1bc73e2";
const KEY = "0123456789abcdef0123456789abcdef";
const film = (over: Partial<WatchState> = {}): WatchState => ({
  url: `https://deeppixel.online/jellyfin/Items/${ITEM}/Download?api_key=${KEY}`,
  title: "Film", position: 0, at: 1, paused: false, by: "Mara", ...over,
});

describe("one conversion per film", () => {
  let n = 0;
  const id = () => `session${++n}`;

  it("names a conversion for a new film and keeps it through pauses and seeks", () => {
    const first = continueWatch(null, film({ quality: "4" }), id);
    expect(first.session).toBeTruthy();
    const paused = continueWatch(first, film({ position: 300, paused: true }), id);
    expect(paused.session).toBe(first.session);
    expect(paused.quality).toBe("4");
  });

  it("starts a new conversion when the quality or the film changes", () => {
    const first = continueWatch(null, film({ quality: "8" }), id);
    expect(continueWatch(first, film({ quality: "4" }), id).session).not.toBe(first.session);
    expect(continueWatch(first, film({ url: "https://example.com/b.mp4" }), id).session).not.toBe(first.session);
  });

  it("never takes a session from a client", () => {
    const clean = sanitizeShared("watch", { ...film(), session: "mine", quality: "4" }, "Mara", 5) as WatchState;
    expect(clean.session).toBeUndefined();
    expect(clean.quality).toBe("4");
    expect((sanitizeShared("watch", { ...film(), quality: "1080p" }, "Mara", 5) as WatchState).quality).toBeUndefined();
  });

  it("keeps a queued film's quality for when it starts", () => {
    const added = applyQueue(null, { op: "add", url: film().url, title: "Film", quality: "4" }, { userId: "u1", name: "Mara", roomUserIds: ["u1"] }, null, 10);
    expect(added?.watch?.quality).toBe("4");
  });
});

describe("the watch-party proxy", () => {
  const parts = { item: ITEM, session: "abc12345", quality: "4", file: "master.m3u8" };

  it("rebuilds Jellyfin's URL with the room's session and quality, whatever the viewer sent", () => {
    const query = new URLSearchParams({ api_key: KEY, MediaSourceId: ITEM, PlaySessionId: "other", VideoBitrate: "99000000" });
    const url = new URL(upstreamUrl(parts, query)!);
    expect(url.origin).toBe("http://127.0.0.1:8096");
    expect(url.pathname).toBe(`/jellyfin/Videos/${ITEM}/master.m3u8`);
    expect(url.searchParams.get("PlaySessionId")).toBe("abc12345");
    expect(url.searchParams.get("DeviceId")).toBe("huddle-party-abc12345");
    expect(url.searchParams.get("VideoBitrate")).toBe("4000000");
  });

  it("passes segment timing through", () => {
    const query = new URLSearchParams({ api_key: KEY, runtimeTicks: "30000000", actualSegmentLengthTicks: "30000000" });
    const url = new URL(upstreamUrl({ ...parts, file: "hls1/main/7.ts" }, query)!);
    expect(url.pathname).toBe(`/jellyfin/Videos/${ITEM}/hls1/main/7.ts`);
    expect(url.searchParams.get("runtimeTicks")).toBe("30000000");
  });

  it("reaches nothing else on Jellyfin", () => {
    const query = new URLSearchParams({ api_key: KEY });
    expect(upstreamUrl({ ...parts, file: "../../System/Configuration" }, query)).toBeNull();
    expect(upstreamUrl({ ...parts, file: "stream.mkv" }, query)).toBeNull();
    expect(upstreamUrl({ ...parts, quality: "40" }, query)).toBeNull();
    expect(upstreamUrl({ ...parts, item: "../Users" }, query)).toBeNull();
    expect(upstreamUrl({ ...parts, session: "a/b" }, query)).toBeNull();
    expect(upstreamUrl(parts, new URLSearchParams({ api_key: "x&y=z" }))).toBeNull();
  });
});

describe("subtitles", () => {
  const vtt = `WEBVTT

Region: id:subtitle width:80%

00:00:15.724 --> 00:00:18.685 region:subtitle line:90%
Pekala millet,
 <i>İşte gidiyoruz</i>

00:01:49.159 --> 00:01:50.994
{\\an8}MATURITNÍ PLES &amp; BOMBA

01:02:03.000 --> 01:02:04.500
late`;

  it("reads cues, without styling tags or ASS overrides", () => {
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(3);
    expect(cues[0]).toEqual({ start: 15.724, end: 18.685, text: "Pekala millet,\nİşte gidiyoruz" });
    expect(cues[1].text).toBe("MATURITNÍ PLES & BOMBA");
    expect(cues[2].start).toBe(3723);
  });

  it("shows the line on screen at a moment, and nothing between lines", () => {
    const cues = parseVtt(vtt);
    expect(cueAt(cues, 16)).toBe("Pekala millet,\nİşte gidiyoruz");
    expect(cueAt(cues, 30)).toBe("");
  });

  it("picks the language the viewer used last, preferring a full track over a forced one", () => {
    const tracks: SubtitleTrack[] = [
      { index: 5, label: "English (forced)", language: "eng", url: "a" },
      { index: 6, label: "English", language: "eng", url: "b" },
    ];
    localStorage.setItem("huddle-subtitle-language", "eng");
    expect(pickedSubtitle("film-1", tracks)?.index).toBe(6);
    localStorage.setItem("huddle-subtitle-language", "off");
    expect(pickedSubtitle("film-1", tracks)).toBeNull();
  });
});
