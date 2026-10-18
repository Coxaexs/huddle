// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { attachWatchSource } from "@/app/lib/watch-source";

const ITEM = "9617412d4b00d752c2ac3d6dfceb5d4c";
// Each test its own server, so the cached PlaybackInfo of one never answers another.
let server = 0;
const link = () => `https://media${++server}.example.com/jellyfin/Items/${ITEM}/Download?api_key=k`;

afterEach(() => vi.unstubAllGlobals());

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
