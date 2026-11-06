import { beforeEach, expect, it, vi } from "vitest";

/** Everything between the player and the bot is real here; only the bot is faked. */
const room = { userId: "ana", userName: "ana", admin: false, channelId: "room-1", serverId: "server-1" };

vi.mock("@/lib/music-room", () => ({
  musicRoom: async (_request: Request, channelId: string | null) =>
    channelId === "room-1"
      ? room
      : Response.json({ error: "You can't open that voice room." }, { status: 403 }),
}));
vi.mock("@/lib/storage", async (original) => ({
  ...(await original<typeof import("@/lib/storage")>()),
  bindings: () => ({ MUSICWATCH_BOT_KEY: "key", MUSICWATCH_BASE_URL: "https://bot.test" }),
}));

import { GET, POST } from "@/app/api/(features)/music/playlists/route";
import { resetMemoryRateLimits } from "@/lib/rate-limit";

const bot = vi.fn();

function post(body: Record<string, unknown>) {
  return POST(
    new Request("https://x/api/music/playlists", {
      method: "POST",
      body: JSON.stringify({ voiceChannelId: "room-1", ...body }),
    }),
  );
}

/** What the bot was sent: the path and JSON body of every call. */
function sent() {
  return bot.mock.calls.map(([url, init]) => ({
    path: `${(url as URL).pathname}${(url as URL).search}`,
    body: init?.body ? JSON.parse(init.body as string) : null,
  }));
}

beforeEach(() => {
  resetMemoryRateLimits();
  room.admin = false;
  bot.mockReset();
  bot.mockImplementation(async () =>
    Response.json({
      message: "Done by the bot.",
      playlists: [
        { name: "Mine", count: 1, can_edit: true, tracks: [] },
        { name: "Theirs", count: 1, can_edit: false, tracks: [] },
        { name: "Stemmed songs", count: 9, can_edit: true, auto: "stems", tracks: [] },
      ],
    }),
  );
  vi.stubGlobal("fetch", bot);
});

it("reads the list as the person asking, and says what they may change", async () => {
  const response = await GET(new Request("https://x/api/music/playlists?voiceChannelId=room-1"));
  const { playlists } = (await response.json()) as { playlists: Array<{ name: string; canEdit: boolean }> };
  expect(sent()[0].path).toBe("/api/guilds/huddle%3Aroom-1/playlists?by=ana");
  expect(playlists.map((list) => [list.name, list.canEdit])).toEqual([
    ["Mine", true],
    ["Theirs", false],
    ["Stemmed songs", false],
  ]);
});

it("tells the bot when the person is an admin", async () => {
  room.admin = true;
  await GET(new Request("https://x/api/music/playlists?voiceChannelId=room-1"));
  expect(sent()[0].path).toBe("/api/guilds/huddle%3Aroom-1/playlists?by=ana&admin=1");
});

it("makes a playlist as the person asking, with a tidy name", async () => {
  const response = await post({ action: "create", name: "  Gece\n\t yarısı " });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ message: "Done by the bot.", name: "Gece yarısı" });
  expect(sent()[0].body).toEqual({ action: "create", name: "Gece yarısı", by: "ana", admin: false });
});

it("adds a song as the person asking", async () => {
  const query = "https://www.youtube.com/watch?v=abcdefghijk";
  const response = await post({ action: "add_song", name: "Mine", query });
  expect(response.status).toBe(200);
  expect(sent()[0].body).toEqual({ action: "add_song", name: "Mine", query, by: "ana", admin: false });
});

it("a body can't claim to be someone else or an admin", async () => {
  await post({ action: "add_song", name: "Mine", query: "zehir", by: "kiwi", admin: true });
  expect(sent()[0].body).toMatchObject({ by: "ana", admin: false });
});

it.each([
  "manifest zehir",
  "https://www.youtube.com/watch?v=abcdefghijk",
  "https://youtu.be/abcdefghijk",
  "https://music.youtube.com/watch?v=abcdefghijk",
  "https://open.spotify.com/track/abc",
])("takes %s as a song", async (query) => {
  const response = await post({ action: "add_song", name: "Mine", query });
  expect(response.status).toBe(200);
  expect(sent()[0].body.query).toBe(query);
});

it.each([
  "http://127.0.0.1:8722/api/admin/state",
  "https://example.com/youtube.com/watch",
  "https://youtube.com.example.com/watch?v=abcdefghijk",
  "HTTP://169.254.169.254/latest",
  "httpx://127.0.0.1/",
  "",
])("never hands the bot %j to fetch", async (query) => {
  const response = await post({ action: "add_song", name: "Mine", query });
  expect(response.status).toBe(400);
  expect(bot).not.toHaveBeenCalled();
});

it("passes on the bot's refusal as it is", async () => {
  bot.mockImplementation(async () =>
    Response.json({ error: "Only an admin or whoever made Theirs can change it." }, { status: 403 }),
  );
  const response = await post({ action: "add_song", name: "Theirs", query: "zehir" });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "Only an admin or whoever made Theirs can change it." });
});

it("a bot that is down is still an outage", async () => {
  bot.mockImplementation(async () => new Response("boom", { status: 500 }));
  expect((await post({ action: "create", name: "Gece" })).status).toBe(502);
});

it("a room you can't open changes nothing", async () => {
  const response = await post({ voiceChannelId: "elsewhere", action: "create", name: "Gece" });
  expect(response.status).toBe(403);
  expect(bot).not.toHaveBeenCalled();
});

it("stops someone making playlists over and over", async () => {
  for (let made = 0; made < 10; made += 1) {
    expect((await post({ action: "create", name: `List ${made}` })).status).toBe(200);
  }
  expect((await post({ action: "create", name: "One more" })).status).toBe(429);
  expect(bot).toHaveBeenCalledTimes(10);
});

it("cuts a long name by characters, so an emoji stays whole", async () => {
  await post({ action: "create", name: `${"a".repeat(49)}🎵🎵` });
  expect(sent()[0].body.name).toBe(`${"a".repeat(49)}🎵`);
});

it("playing a playlist works as it did", async () => {
  await post({ name: "Mine", mode: "queue" });
  expect(sent()[0].body).toMatchObject({ action: "load", name: "Mine" });
});
