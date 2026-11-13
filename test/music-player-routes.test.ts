import { beforeEach, expect, it, vi } from "vitest";

const fetchLyrics = vi.fn();
const playerState = vi.fn();
vi.mock("@/lib/musicbot", () => ({ fetchLyrics: (...args: unknown[]) => fetchLyrics(...args) }));
vi.mock("@/lib/hub-client", () => ({ playerState: (...args: unknown[]) => playerState(...args) }));
vi.mock("@/lib/music-room", () => ({
  musicRoom: async (_request: Request, channelId: string | null) =>
    channelId === "room-1"
      ? { userId: "u1", userName: "mewis", channelId, serverId: "server-1" }
      : Response.json({ error: "You can't open that voice room." }, { status: 403 }),
}));

import { GET } from "@/app/api/(features)/music/lyrics/route";

beforeEach(() => {
  fetchLyrics.mockReset();
  playerState.mockReset();
  playerState.mockResolvedValue({
    channelId: "room-1",
    track: { id: "t1", title: "Zehir", artist: "manifest", duration: 201, pageUrl: "https://youtu.be/abcdefghijk", query: "zehir manifest" },
    queue: [],
    history: [],
    paused: false,
    positionMs: 0,
    updatedAt: Date.now(),
    volume: 100,
    loop: "off",
  });
  fetchLyrics.mockResolvedValue({ track: "Zehir", artist: "manifest", lines: [[1, "x"]], source: "musixmatch" });
});

it("opening a song only reads lyrics already saved: nothing is looked up", async () => {
  const response = await GET(new Request("https://x/api/music/lyrics?voiceChannelId=room-1"));
  expect(fetchLyrics).toHaveBeenCalledWith("Zehir", "manifest", 201, {
    musixmatch: "cached", cachedOnly: true, pickScope: "server-1", keys: ["https://youtu.be/abcdefghijk", "zehir manifest"],
  });
  expect(await response.json()).toMatchObject({ trackId: "t1", lines: [[1, "x"]], synced: true, source: "musixmatch" });
});

it("Search for lyrics searches like /lyricsnow (lrclib, then Musixmatch)", async () => {
  await GET(new Request("https://x/api/music/lyrics?voiceChannelId=room-1&find=1"));
  expect(fetchLyrics).toHaveBeenCalledWith("Zehir", "manifest", 201, {
    musixmatch: true, pickScope: "server-1", keys: ["https://youtu.be/abcdefghijk", "zehir manifest"],
  });
});

it("a room you can't open gets nothing", async () => {
  const response = await GET(new Request("https://x/api/music/lyrics?voiceChannelId=elsewhere&find=1"));
  expect(response.status).toBe(403);
  expect(fetchLyrics).not.toHaveBeenCalled();
});

it("hands on timed words only when there is a word list for every line", async () => {
  const words = [[[1, 1.4, "x", [200, 400]]]];
  fetchLyrics.mockResolvedValue({ track: "Zehir", artist: "manifest", lines: [[1, "x"]], words });
  expect((await (await GET(new Request("https://x/api/music/lyrics?voiceChannelId=room-1"))).json()).words).toEqual(words);
  fetchLyrics.mockResolvedValue({ track: "Zehir", artist: "manifest", lines: [[1, "x"], [2, "y"]], words });
  expect((await (await GET(new Request("https://x/api/music/lyrics?voiceChannelId=room-1"))).json()).words).toBeNull();
});
