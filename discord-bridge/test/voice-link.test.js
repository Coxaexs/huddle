import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import { FRAME, Leveler, createEffect, dbOf, int16ToMono, monoToInt16, monoToStereo, rms } from "../src/voice/dsp.js";
import { createOpus } from "../src/voice/opus.js";
import { DiscordSpeaker } from "../src/voice/speaker.js";
import { VoiceLink } from "../src/voice/voice.js";

function link() {
  const manager = { log: () => undefined, bridge: {}, cfg: {} };
  const entry = { bridge: { discordGuildId: "1" }, channel: { discordChannelId: "2", hoffleChannelId: "v", name: "Lounge" } };
  return new VoiceLink(manager, entry);
}

/** A speaker whose Discord player only notes what it was asked to play. */
function speaker() {
  const plays = [];
  return { voice: new DiscordSpeaker({ player: { play: (resource) => plays.push(resource) } }), plays };
}

const tone = (amplitude) => {
  const out = new Float32Array(FRAME * 2);
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * 300 * i) / 48_000);
  return out;
};

test("silence from Hoffle never makes the bot talk on Discord", () => {
  const { voice, plays } = speaker();
  for (let i = 0; i < 50; i++) {
    voice.mixer.push("quiet-mic", new Float32Array(FRAME));
    voice.step();
  }
  assert.equal(plays.length, 0);
  assert.equal(voice.burst, null);
  voice.stop();
});

test("someone talking starts one burst, its quiet tail plays, then it ends", () => {
  const { voice, plays } = speaker();
  for (let i = 0; i < 10; i++) {
    voice.mixer.push("mewis", tone(0.3).subarray(0, FRAME));
    voice.step();
  }
  assert.equal(plays.length, 1, "one burst for one stretch of talking");
  const burst = voice.burst;
  assert.ok(burst.readableLength > 0, "Opus packets are waiting to play");
  // Quiet: the tail keeps playing for a moment, then the burst ends.
  let steps = 0;
  while (voice.burst && steps < 100) {
    voice.mixer.push("mewis", new Float32Array(FRAME));
    voice.step();
    steps++;
  }
  assert.ok(steps > 10 && steps < 20, `ended after ${steps} quiet frames`);
  assert.equal(burst.readableEnded || burst._readableState.ended, true);
  // Talking again starts a fresh burst.
  for (let i = 0; i < 4; i++) {
    voice.mixer.push("mewis", tone(0.3).subarray(0, FRAME));
    voice.step();
  }
  assert.equal(plays.length, 2);
  assert.equal(voice.talking, true);
  voice.stop();
});

test("a stalled Discord player can't make the delay grow", () => {
  const { voice } = speaker();
  for (let i = 0; i < 60; i++) {
    voice.mixer.push("mewis", tone(0.3).subarray(0, FRAME));
    voice.step();
  }
  assert.ok(voice.burst.readableLength <= 8);
  voice.stop();
});

test("a quiet Discord voice reaches Hoffle boosted, after a small cushion, and shows in the status", () => {
  const voice = link();
  const stream = new PassThrough({ objectMode: true });
  voice.connection = { receiver: { subscribe: () => stream } };
  const captured = [];
  const person = {
    id: "u1",
    name: "Temmuz",
    lkUp: true,
    heard: true,
    listening: null,
    decoder: createOpus(),
    leveler: new Leveler(),
    effect: createEffect("none"),
    meter: { packets: 0, decodeErrors: 0, gaps: 0, lastAt: 0, peak: 0, speech: 0 },
    lk: { capture: (frame) => captured.push(frame), publishing: true, resets: 0 },
  };
  voice.people.set("u1", person);
  voice.onSpeaking("u1");
  // What Discord would send for a quiet mic: about -36 dBFS.
  const sender = createOpus();
  const quiet = tone(0.022).subarray(0, FRAME);
  const packet = () => sender.encode(monoToStereo(quiet));
  stream.write(packet());
  stream.write(packet());
  assert.equal(captured.length, 0, "the first frames wait for the cushion");
  stream.write(packet());
  assert.equal(captured.length, 3, "then go to LiveKit together");
  for (let i = 0; i < 60; i++) stream.write(packet());
  assert.equal(captured.length, 63, "after that, each frame goes straight on");
  const outDb = dbOf(rms(int16ToMono(captured.at(-1))));
  assert.ok(outDb > -21, `arrived in Hoffle at ${outDb.toFixed(1)} dBFS`);
  const [shown] = voice.status().people;
  assert.equal(shown.packets, 63);
  assert.equal(shown.decodeErrors, 0);
  assert.ok(shown.boostDb > 12, `status shows a ${shown.boostDb} dB boost`);
  assert.ok(shown.speakingLevelDb < -30);
  stream.end();
  sender.free();
  person.decoder.free();
});

/** A helper voice as the link sees it: connected or not, with its own mixer. */
function helperVoice(person, live = true) {
  const { voice } = speaker();
  return { person, live, speaker: voice, helper: { key: "helper-1", tag: "Hoffle Voice#0001" }, name: person.displayName };
}

const frame = (amplitude) => monoToInt16(tone(amplitude).subarray(0, FRAME));

test("a Hoffle person with a connected helper is played by it, not mixed into the bot", () => {
  const voice = link();
  voice.speaker = speaker().voice;
  const mewis = helperVoice({ id: "u-mewis", connectionId: "c1", displayName: "mewis" });
  voice.voices.set("c1", mewis);
  voice.hear("u-mewis|c1/TR_a", "u-mewis|c1", frame(0.3));
  voice.hear("u-ayse|c2/TR_b", "u-ayse|c2", frame(0.3));
  assert.deepEqual([...mewis.speaker.mixer.inputs.keys()], ["u-mewis|c1/TR_a"]);
  assert.deepEqual([...voice.speaker.mixer.inputs.keys()], ["u-ayse|c2/TR_b"], "someone without a helper is in the mix");
  voice.speaker.stop();
  mewis.speaker.stop();
});

test("until its helper is connected, a person stays in the mix, then moves over cleanly", () => {
  const voice = link();
  voice.speaker = speaker().voice;
  const mewis = helperVoice({ id: "u-mewis", connectionId: "c1", displayName: "mewis" }, false);
  voice.voices.set("c1", mewis);
  voice.hear("u-mewis|c1/TR_a", "u-mewis|c1", frame(0.3));
  assert.ok(voice.speaker.mixer.inputs.has("u-mewis|c1/TR_a"), "mixed while the helper connects");
  mewis.live = true;
  voice.hear("u-mewis|c1/TR_a", "u-mewis|c1", frame(0.3));
  assert.ok(mewis.speaker.mixer.inputs.has("u-mewis|c1/TR_a"), "then on the helper");
  assert.equal(voice.speaker.mixer.inputs.has("u-mewis|c1/TR_a"), false, "and gone from the mix, so it isn't heard twice");
  voice.forget("u-mewis|c1/TR_a");
  assert.equal(mewis.speaker.mixer.size, 0);
  voice.speaker.stop();
  mewis.speaker.stop();
});

test("a bot on LiveKit without its seat's connection id still finds its helper by user", () => {
  const voice = link();
  voice.speaker = speaker().voice;
  const music = helperVoice({ id: "bot-music", connectionId: "c9", displayName: "Music", bot: true });
  voice.voices.set("c9", music);
  voice.hear("bot-music/TR_m", "bot-music", frame(0.3));
  assert.ok(music.speaker.mixer.inputs.has("bot-music/TR_m"));
  voice.speaker.stop();
  music.speaker.stop();
});

test("both the bot and each helper send a frame every tick, and the status lists the helpers", () => {
  const voice = link();
  const main = speaker();
  voice.speaker = main.voice;
  const mewis = helperVoice({ id: "u-mewis", connectionId: "c1", displayName: "mewis" });
  const helperPlays = [];
  mewis.speaker = new DiscordSpeaker({ player: { play: (resource) => helperPlays.push(resource) } });
  voice.voices.set("c1", mewis);
  for (let i = 0; i < 4; i++) {
    voice.hear("u-mewis|c1/TR_a", "u-mewis|c1", frame(0.3));
    voice.hear("u-ayse|c2/TR_b", "u-ayse|c2", frame(0.3));
    voice.step();
  }
  assert.equal(main.plays.length, 1, "the bot talks for the people without a helper");
  assert.equal(helperPlays.length, 1, "the helper talks for its person");
  const [shown] = voice.status().helpers;
  assert.deepEqual(shown, { name: "mewis", helper: "Hoffle Voice#0001", live: true, talking: true });
  voice.speaker.stop();
  mewis.speaker.stop();
});
