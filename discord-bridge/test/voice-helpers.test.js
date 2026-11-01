import assert from "node:assert/strict";
import { test } from "node:test";
import { PermissionFlagsBits } from "discord.js";
import { VoiceHelpers, pictureSource, profileOf, voiceStateOf } from "../src/voice/helpers.js";

const cfg = { publicUrl: "https://hoffle.example", hoffleUrl: "http://127.0.0.1:8730", voiceBotTokens: ["t1", "t2"] };

test("pictures come only from Hoffle itself or Discord's CDN", () => {
  assert.equal(
    pictureSource("/hangout/api/uploads/a.png", cfg),
    "http://127.0.0.1:8730/hangout/api/uploads/a.png",
    "an upload is fetched from Hoffle on this machine",
  );
  assert.equal(pictureSource("https://hoffle.example/hangout/api/uploads/b.png?v=2", cfg), "http://127.0.0.1:8730/hangout/api/uploads/b.png?v=2");
  assert.equal(pictureSource("https://cdn.discordapp.com/avatars/1/x.png", cfg), "https://cdn.discordapp.com/avatars/1/x.png");
  assert.equal(pictureSource("http://cdn.discordapp.com/avatars/1/x.png", cfg), null);
  assert.equal(pictureSource("http://192.168.1.1/admin.png", cfg), null, "never somewhere inside the network");
  assert.equal(pictureSource("https://evil.example/face.png", cfg), null);
  assert.equal(pictureSource(null, cfg), null);
});

test("a helper shows the person's name, picture, mute and deafen", () => {
  assert.deepEqual(profileOf({ displayName: "mewis", avatarUrl: "/a.png" }), { nick: "mewis", avatar: "/a.png" });
  assert.deepEqual(profileOf({ displayName: "tem" }), { nick: "tem", avatar: null });
  assert.deepEqual(voiceStateOf({ muted: true }), { selfMute: true, selfDeaf: false });
  assert.deepEqual(voiceStateOf({ serverMuted: true, deafened: true }), { selfMute: true, selfDeaf: true });
});

/** A ready helper in one Discord server with one voice channel, with these permissions there. */
function readyHelper(pool, index, { allowed = true } = {}) {
  const helper = pool.list[index];
  const me = { nickname: null, avatar: null };
  const channel = {
    id: "vc",
    permissionsFor: () => ({ has: (flag) => allowed || flag === PermissionFlagsBits.ViewChannel }),
  };
  const edits = [];
  const guild = {
    id: "g",
    name: "Guild",
    channels: { cache: new Map([["vc", channel]]) },
    members: {
      me,
      editMe: async (body) => {
        edits.push(body);
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    },
  };
  helper.client = { guilds: { cache: new Map([["g", guild]]) } };
  helper.ready = true;
  helper.userId = `user-${index}`;
  helper.appId = `app-${index}`;
  helper.name = `Hoffle Voice ${index + 1}`;
  return { helper, edits };
}

test("a helper serves one channel per server, and only where it may connect and speak", () => {
  const pool = new VoiceHelpers(cfg, { log: () => undefined });
  readyHelper(pool, 0);
  readyHelper(pool, 1, { allowed: false });
  const linkA = {};
  const linkB = {};
  assert.deepEqual(pool.freeFor("g", "vc", linkA), ["helper-1"], "helper 2 may not speak there");
  assert.deepEqual(pool.freeFor("elsewhere", "vc", linkA), [], "not in that server");
  pool.list[0].slot("g").owner = linkA;
  assert.deepEqual(pool.freeFor("g", "vc", linkA), ["helper-1"], "still free for the channel it sits in");
  assert.deepEqual(pool.freeFor("g", "vc", linkB), [], "but not for another channel in the same server");
  pool.list[0].slot("g").owner = null;
  pool.list[0].slot("g").backoffUntil = Date.now() + 60_000;
  assert.deepEqual(pool.freeFor("g", "vc", linkA), [], "taken out on Discord: it waits a minute");
  assert.deepEqual(pool.userIds(), ["user-0", "user-1"]);
  assert.deepEqual(pool.inGuild("g"), ["app-0", "app-1"]);
  assert.deepEqual(
    pool.report().map((helper) => helper.id),
    ["app-0", "app-1"],
  );
});

test("name changes fold together, so only the newest one is written", async () => {
  const pool = new VoiceHelpers(cfg, { log: () => undefined });
  const { helper, edits } = readyHelper(pool, 0);
  helper.slot("g").applied = { nick: null, avatar: null };
  helper.setProfile("g", { nick: "first", avatar: null });
  helper.setProfile("g", { nick: "second", avatar: null });
  helper.setProfile("g", { nick: "third", avatar: null });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(edits, [{ nick: "first" }, { nick: "third" }], "the one in flight, then straight to the newest");
  helper.setProfile("g", { nick: "third", avatar: null });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(edits.length, 2, "nothing written when nothing changed");
});

test("letting go of a helper frees it at once and gives its own name back later", () => {
  const pool = new VoiceHelpers(cfg, { log: () => undefined });
  let changes = 0;
  pool.onChange = () => changes++;
  const { helper } = readyHelper(pool, 0);
  const link = {};
  helper.take("g", link, { nick: "mewis", avatar: null });
  assert.equal(helper.slot("g").owner, link);
  helper.letGo("g", {});
  assert.equal(helper.slot("g").owner, link, "only its owner can let it go");
  helper.letGo("g", link);
  assert.equal(helper.slot("g").owner, null);
  assert.ok(helper.slot("g").resetTimer, "its name goes back after a while");
  assert.equal(changes, 1, "the other channels hear it is free");
  clearTimeout(helper.slot("g").resetTimer);
});
