import assert from "node:assert/strict";
import { test } from "node:test";
import { assignHelpers, connectionOf, helperNick, planVoice, seatState, showable, userOf } from "../src/voice/plan.js";

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
  assert.equal(userOf("discord:123|abc-def"), "discord:123");
  assert.equal(userOf("bot-music"), "bot-music");
});

test("the voice helpers sitting in the Discord channel never get a Hoffle seat", () => {
  const plan = planVoice({
    discord: [human("ayse"), { id: "helper-a", bot: true }, { id: "helper-b", bot: true }],
    hoffle: [hoffler("mewis"), hoffler("tem")],
    selfId: me,
    selfIds: ["helper-a", "helper-b"],
  });
  assert.deepEqual(plan.seats, ["ayse"]);
  assert.equal(plan.audio, true);
  // With only helpers left on Discord, there is nobody there to hear Hoffle.
  const alone = planVoice({ discord: [{ id: "helper-a", bot: true }], hoffle: [hoffler("mewis")], selfId: me, selfIds: ["helper-a"] });
  assert.equal(alone.audio, false);
  assert.equal(alone.onDiscord, true);
});

test("who a helper can stand in for: people first, then bots, each in join order", () => {
  const people = showable([
    hoffler("music", { bot: true, joinedAt: 1 }),
    hoffler("late", { joinedAt: 30 }),
    hoffler("ayse-seat", { discord: true, joinedAt: 2 }),
    hoffler("rec", { recorder: true, joinedAt: 3 }),
    hoffler("early", { joinedAt: 10 }),
  ]);
  assert.deepEqual(
    people.map((person) => person.id),
    ["early", "late", "music"],
  );
});

const seat = (id) => ({ id: `u-${id}`, connectionId: `c-${id}` });

test("helpers go to people in order, and the rest stay in the mix", () => {
  const out = assignHelpers({ people: [seat("a"), seat("b"), seat("c")], helpers: ["h1", "h2"] });
  assert.deepEqual([...out], [["c-a", "h1"], ["c-b", "h2"]]);
});

test("someone keeps their helper when others come and go", () => {
  const current = new Map([["c-b", "h2"]]);
  const out = assignHelpers({ people: [seat("a"), seat("b")], helpers: ["h1", "h2"], current });
  assert.equal(out.get("c-b"), "h2");
  assert.equal(out.get("c-a"), "h1");
  // A helper that is no longer free for this channel is given up.
  const gone = assignHelpers({ people: [seat("b")], helpers: ["h1"], current });
  assert.deepEqual([...gone], [["c-b", "h1"]]);
});

test("a newcomer gets the helper they had last time, but never ahead of someone who joined first", () => {
  const last = new Map([["u-b", "h2"]]);
  const back = assignHelpers({ people: [seat("a"), seat("b")], helpers: ["h1", "h2"], last });
  assert.equal(back.get("c-b"), "h2", "b gets its old helper back");
  assert.equal(back.get("c-a"), "h1");
  const short = assignHelpers({ people: [seat("a"), seat("b")], helpers: ["h2"], last });
  assert.deepEqual([...short], [["c-a", "h2"]], "with one helper, the first to join gets it");
});

test("a helper's name on Discord is the person's, cut to Discord's 32 characters", () => {
  assert.equal(helperNick({ displayName: "  mewis  the   cat " }), "mewis the cat");
  assert.equal(helperNick({ displayName: "", username: "qwerse" }), "qwerse");
  assert.equal(helperNick({}), "Hoffle");
  assert.equal([...helperNick({ displayName: "🎤".repeat(40) })].length, 32);
});
