import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import { FRAME, Leveler, createEffect, dbOf, int16ToMono, monoToStereo, rms } from "../src/voice/dsp.js";
import { createOpus } from "../src/voice/opus.js";
import { VoiceLink } from "../src/voice/voice.js";

function link() {
  const manager = { log: () => undefined, bridge: {}, cfg: {} };
  const entry = { bridge: { discordGuildId: "1" }, channel: { discordChannelId: "2", hoffleChannelId: "v", name: "Lounge" } };
  const voice = new VoiceLink(manager, entry);
  const plays = [];
  voice.player = { play: (resource) => plays.push(resource) };
  voice.encoder = createOpus({ music: true, bitrate: 64_000 });
  return { voice, plays };
}

const tone = (amplitude) => {
  const out = new Float32Array(FRAME * 2);
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * 300 * i) / 48_000);
  return out;
};

test("silence from Hoffle never makes the bot talk on Discord", () => {
  const { voice, plays } = link();
  for (let i = 0; i < 50; i++) {
    voice.mixer.push("quiet-mic", new Float32Array(FRAME));
    voice.step();
  }
  assert.equal(plays.length, 0);
  assert.equal(voice.burst, null);
  voice.encoder.free();
});

test("someone talking starts one burst, its quiet tail plays, then it ends", () => {
  const { voice, plays } = link();
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
  voice.encoder.free();
});

test("a stalled Discord player can't make the delay grow", () => {
  const { voice } = link();
  for (let i = 0; i < 60; i++) {
    voice.mixer.push("mewis", tone(0.3).subarray(0, FRAME));
    voice.step();
  }
  assert.ok(voice.burst.readableLength <= 8);
  voice.encoder.free();
});

test("a quiet Discord voice reaches Hoffle boosted, after a small cushion, and shows in the status", () => {
  const { voice } = link();
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
  voice.encoder.free();
});
