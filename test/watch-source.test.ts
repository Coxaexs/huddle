// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { attachWatchSource, playsHlsItself } from "@/app/lib/watch-source";

const ITEM = "9617412d4b00d752c2ac3d6dfceb5d4c";
// Each test its own server, so the cached PlaybackInfo of one never answers another.
let server = 0;
const link = () => `https://media${++server}.example.com/jellyfin/Items/${ITEM}/Download?api_key=k`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A <video> whose browser claims to play everything, HLS included. */
function overconfidentVideo() {
  const video = document.createElement("video");
  video.canPlayType = () => "probably";
  vi.spyOn(video, "load").mockImplementation(() => undefined);
  return video;
}

function jellyfinSays(streams: object[]) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify({ MediaSources: [{ Id: ITEM, Container: "mp4", MediaStreams: streams }] })));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

it("falls back to Jellyfin's conversion when playing the file directly fails", async () => {
  jellyfinSays([{ Type: "Video", Codec: "hevc", CodecTag: "hev1", Profile: "Main 10", Level: 120, BitDepth: 10 }, { Type: "Audio", Codec: "aac" }]);
  const video = overconfidentVideo();
  const problem = vi.fn();
  const detach = attachWatchSource(video, link(), { onProblem: problem });
  await tick();
  expect(video.src).toContain(`/Videos/${ITEM}/stream?static=true`);
  video.dispatchEvent(new Event("error"));
  expect(video.src).toContain(`/Videos/${ITEM}/master.m3u8`);
  expect(problem).not.toHaveBeenCalled();
  detach();
});

it("treats sound without a picture as a failure too", async () => {
  jellyfinSays([{ Type: "Video", Codec: "hevc", Profile: "Main", Level: 120 }, { Type: "Audio", Codec: "aac" }]);
  const video = overconfidentVideo();
  attachWatchSource(video, link());
  await tick();
  video.dispatchEvent(new Event("loadeddata"));
  expect(video.src).toContain("master.m3u8");
});

it("tells the viewer only once every fallback has failed", async () => {
  const video = document.createElement("video");
  video.canPlayType = () => "";
  vi.spyOn(video, "load").mockImplementation(() => undefined);
  const problem = vi.fn();
  attachWatchSource(video, "https://example.com/clip.mp4", { onProblem: problem, retryWithoutCors: true });
  video.crossOrigin = "anonymous";
  video.dispatchEvent(new Event("error"));
  expect(problem).not.toHaveBeenCalled();
  expect(video.crossOrigin).toBeNull();
  video.dispatchEvent(new Event("error"));
  expect(problem).toHaveBeenCalledTimes(1);
});

it("stops Jellyfin's conversion when the film is taken off", async () => {
  const fetch = jellyfinSays([{ Type: "Video", Codec: "hevc", Profile: "Main 10", BitDepth: 10 }, { Type: "Audio", Codec: "eac3" }]);
  const video = overconfidentVideo();
  const detach = attachWatchSource(video, link());
  await tick();
  expect(video.src).toContain("master.m3u8");
  detach();
  expect(fetch.mock.calls.at(-1)?.[0]).toContain("/Videos/ActiveEncodings?");
  expect((fetch.mock.calls.at(-1)?.[1] as RequestInit).method).toBe("DELETE");
});

it("plays the room's shared conversion, through Huddle, at the starter's quality", async () => {
  jellyfinSays([{ Type: "Video", Codec: "h264", Profile: "High", Level: 40 }, { Type: "Audio", Codec: "aac" }]);
  const video = overconfidentVideo();
  // 4 Mbps was chosen: converted even though this browser could play the file.
  attachWatchSource(video, link(), { quality: "4", session: "room1234" });
  await tick();
  expect(video.src).toContain(`/hangout/api/watch/jellyfin/${ITEM}/room1234/4/master.m3u8?`);
});

it("moves from the file to the room's shared conversion, not a private one", async () => {
  jellyfinSays([{ Type: "Video", Codec: "hevc", Profile: "Main 10", BitDepth: 10 }, { Type: "Audio", Codec: "aac" }]);
  const video = overconfidentVideo();
  attachWatchSource(video, link(), { quality: "original", session: "room1234" });
  await tick();
  expect(video.src).toContain("/Videos/");
  video.dispatchEvent(new Event("error"));
  expect(video.src).toContain(`/hangout/api/watch/jellyfin/${ITEM}/room1234/8/master.m3u8?`);
});

it("does not stop the room's shared conversion when one viewer leaves", async () => {
  const fetch = jellyfinSays([{ Type: "Video", Codec: "hevc", Profile: "Main 10", BitDepth: 10 }, { Type: "Audio", Codec: "eac3" }]);
  const video = overconfidentVideo();
  const detach = attachWatchSource(video, link(), { quality: "8", session: "room1234" });
  await tick();
  detach();
  expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
});

it("trusts Apple's HLS but not the Chromium browsers that now claim it", () => {
  const says = { canPlayType: () => "maybe" as const };
  const userAgent = (value: string) => vi.stubGlobal("navigator", { userAgent: value });
  userAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)");
  expect(playsHlsItself(says)).toBe(true);
  userAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1");
  expect(playsHlsItself(says)).toBe(true);
  userAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 huddle-desktop/1.1.1 Chrome/152.0.7977.130 Electron/44.7.0 Safari/537.36");
  expect(playsHlsItself(says)).toBe(false);
  userAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36 OPR/120.0.0.0");
  expect(playsHlsItself(says)).toBe(false);
  userAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0");
  expect(playsHlsItself(says)).toBe(false);
  userAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/151.0.7922.34 Safari/537.36");
  expect(playsHlsItself(says)).toBe(false);
  expect(playsHlsItself({ canPlayType: () => "" })).toBe(false);
});

/** A <video> that says it is playing, with this many frames behind it, on a Chromium browser. */
function playingVideo(frames: number) {
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Chrome/152.0.0.0 Safari/537.36" });
  const video = document.createElement("video");
  vi.spyOn(video, "load").mockImplementation(() => undefined);
  Object.defineProperty(video, "paused", { get: () => false });
  Object.defineProperty(video, "readyState", { get: () => 4 });
  video.getVideoPlaybackQuality = () => ({ totalVideoFrames: frames }) as VideoPlaybackQuality;
  return video;
}

it("speaks up when a video plays on without ever decoding a frame", () => {
  vi.useFakeTimers();
  const onProblem = vi.fn();
  const detach = attachWatchSource(playingVideo(0), "https://example.com/film.mp4", { onProblem });
  vi.advanceTimersByTime(5000);
  expect(onProblem).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(onProblem).toHaveBeenCalledOnce();
  detach();
});

it("leaves a video alone once frames are coming", () => {
  vi.useFakeTimers();
  const onProblem = vi.fn();
  const detach = attachWatchSource(playingVideo(12), "https://example.com/film.mp4", { onProblem });
  vi.advanceTimersByTime(60000);
  expect(onProblem).not.toHaveBeenCalled();
  detach();
});

it("does not mistake a hidden tab's paused decoding for a broken film", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const onProblem = vi.fn();
  const detach = attachWatchSource(playingVideo(0), "https://example.com/film.mp4", { onProblem });
  vi.advanceTimersByTime(60000);
  expect(onProblem).not.toHaveBeenCalled();
  detach();
  vi.restoreAllMocks();
});
