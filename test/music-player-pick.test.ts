import { beforeEach, expect, it, vi } from "vitest";

const lyricsCandidates = vi.fn();
const pickLyrics = vi.fn();
const playerState = vi.fn();
vi.mock("@/lib/musicbot", () => ({
  lyricsCandidates: (...args: unknown[]) => lyricsCandidates(...args),
  pickLyrics: (...args: unknown[]) => pickLyrics(...args),
  fetchLyrics: vi.fn(),
}));
vi.mock("@/lib/hub-client", () => ({ playerState: (...args: unknown[]) => playerState(...args) }));
vi.mock("@/lib/music-room", () => ({
  musicRoom: async (_request: Request, channelId: string | null) =>
    channelId === "room-1"
      ? { userId: "u1", userName: "mewis", channelId, serverId: "server-1" }
      : Response.json({ error: "You can't open that voice room." }, { status: 403 }),
}));

import { GET, POST } from "@/app/api/(features)/music/lyrics/pick/route";

const post = (body: unknown) =>
  POST(new Request("https://x/api/music/lyrics/pick", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  lyricsCandidates.mockReset();
  pickLyrics.mockReset();
  playerState.mockReset().mockResolvedValue({
    channelId: "room-1",
    track: { id: "t1", title: "manifest - Zehir", artist: "manifest", duration: 184 },
    queue: [], history: [], paused: false, positionMs: 0, updatedAt: Date.now(), volume: 100, loop: "off",
  });
});

it("lists lrclib songs that could be the one playing, or for other words", async () => {
  lyricsCandidates.mockResolvedValue({ query: "manifest Zehir", candidates: [{ id: 12 }] });
  const response = await GET(new Request("https://x/api/music/lyrics/pick?voiceChannelId=room-1"));
  expect(lyricsCandidates).toHaveBeenCalledWith("manifest - Zehir", "manifest", 184, undefined);
  expect(await response.json()).toEqual({ trackId: "t1", query: "manifest Zehir", candidates: [{ id: 12 }] });
  await GET(new Request("https://x/api/music/lyrics/pick?voiceChannelId=room-1&q=zehir%20akustik"));
  expect(lyricsCandidates).toHaveBeenLastCalledWith("manifest - Zehir", "manifest", 184, "zehir akustik");
});

it("saves a pick for the playing song in this server", async () => {
  pickLyrics.mockResolvedValue({ track: "Zehir", artist: "manifest", lines: [[5, "Right one"]], source: "lrclib", picked: true });
  const response = await post({ voiceChannelId: "room-1", trackId: "t1", lrclibId: 12 });
  expect(pickLyrics).toHaveBeenCalledWith({ title: "manifest - Zehir", artist: "manifest", scope: "server-1", lrclibId: 12, by: "mewis" });
  expect(await response.json()).toMatchObject({ trackId: "t1", lines: [[5, "Right one"]], picked: true });
});

it("refuses a pick once the song has changed", async () => {
  const response = await post({ voiceChannelId: "room-1", trackId: "old-song", lrclibId: 12 });
  expect(response.status).toBe(409);
  expect(pickLyrics).not.toHaveBeenCalled();
});

it("goes back to the automatic match", async () => {
  pickLyrics.mockResolvedValue(null);
  const response = await post({ voiceChannelId: "room-1", trackId: "t1", lrclibId: null });
  expect(pickLyrics).toHaveBeenCalledWith(expect.objectContaining({ lrclibId: null }));
  expect(await response.json()).toEqual({ trackId: "t1", cleared: true });
});

it("a room you can't open gets nothing", async () => {
  expect((await post({ voiceChannelId: "elsewhere", trackId: "t1", lrclibId: 12 })).status).toBe(403);
  expect(pickLyrics).not.toHaveBeenCalled();
});
