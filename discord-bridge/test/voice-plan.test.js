import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionOf, planVoice, seatState } from "../src/voice/plan.js";

const me = "bridge-bot";
const human = (id) => ({ id, bot: false });
const hoffler = (id, extra = {}) => ({ id, connectionId: `c-${id}`, ...extra });

test("nobody anywhere: nothing happens", () => {
  assert.deepEqual(planVoice({ discord: [], hoffle: [], selfId: me }), {
    seats: [],
    onDiscord: false,
    audio: false,
    hofflePeople: 0,
    discordPeople: 0,
  });
});

test("people only on Discord show up in Hoffle, but the bot stays out and no sound moves", () => {
  const plan = planVoice({ discord: [human("ayse"), human("qwerse")], hoffle: [], selfId: me });
  assert.deepEqual(plan.seats, ["ayse", "qwerse"]);
  assert.equal(plan.onDiscord, false);
  assert.equal(plan.audio, false);
});

test("people only on Hoffle bring the bot into Discord, without sound yet", () => {
  const plan = planVoice({ discord: [], hoffle: [hoffler("mewis")], selfId: me });
  assert.deepEqual(plan.seats, []);
  assert.equal(plan.onDiscord, true);
  assert.equal(plan.audio, false);
});

test("people on both sides: seats, the bot, and sound", () => {
  const plan = planVoice({
    discord: [human("ayse"), { id: me, bot: true }],
    hoffle: [hoffler("mewis"), hoffler("ayse-seat", { discord: true }), hoffler("bot:music", { bot: true })],
    selfId: me,
  });
  assert.deepEqual(plan.seats, ["ayse"], "the bridge bot never gets a seat of its own");
  assert.equal(plan.onDiscord, true);
  assert.equal(plan.audio, true);
  assert.equal(plan.hofflePeople, 1, "Discord seats and bots on Hoffle don't count as people there");
});

test("a Discord music bot is carried while people are around, never on its own", () => {
  const alone = planVoice({ discord: [{ id: "jockie", bot: true }], hoffle: [], selfId: me });
  assert.deepEqual(alone.seats, []);
  const withHoffle = planVoice({ discord: [{ id: "jockie", bot: true }], hoffle: [hoffler("mewis")], selfId: me });
  assert.deepEqual(withHoffle.seats, ["jockie"]);
  assert.equal(withHoffle.audio, true);
});

test("someone a moderator removed stays out", () => {
  const plan = planVoice({
    discord: [human("ayse"), human("troll")],
    hoffle: [hoffler("mewis")],
    selfId: me,
    blocked: new Set(["troll"]),
  });
  assert.deepEqual(plan.seats, ["ayse"]);
});

test("Discord's mute and deafen map onto the seat", () => {
  assert.deepEqual(seatState({ selfMute: true }), { muted: true, deafened: false });
  assert.deepEqual(seatState({ serverDeaf: true }), { muted: false, deafened: true });
  assert.deepEqual(seatState({ suppress: true }), { muted: true, deafened: false });
  assert.deepEqual(seatState(null), { muted: false, deafened: false });
});

test("LiveKit identities split at the last bar", () => {
  assert.equal(connectionOf("discord:123|abc-def"), "abc-def");
  assert.equal(connectionOf("u1|c|2"), "2");
  assert.equal(connectionOf("recorder"), "");
});
