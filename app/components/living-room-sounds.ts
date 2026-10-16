/**
 * The little sounds the Living Room's things make when touched: a lamp's
 * switch, the cat purring, a guitar strum, popcorn, the clock's chime. All
 * synthesised on one shared AudioContext, so nothing is fetched and nothing
 * goes over the call (everyone else's tab plays its own when told).
 */

let shared: AudioContext | null = null;
let quiet = false;
let level = 0.6;

/** Deafened means deafened; the volume follows the room's ambience slider. */
export function setThingSound(options: { muted?: boolean; volume?: number }) {
  if (options.muted !== undefined) quiet = options.muted;
  if (options.volume !== undefined) level = Math.max(0, Math.min(1, options.volume));
}

function audio(): { context: AudioContext; out: GainNode } | null {
  if (quiet || level <= 0) return null;
  try {
    shared ??= new AudioContext();
  } catch {
    return null;
  }
  const context = shared;
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  const out = context.createGain();
  out.gain.value = 0.25 + level * 0.75;
  out.connect(context.destination);
  // Each sound has its own output; let it go once it is done.
  setTimeout(() => out.disconnect(), 6000);
  return { context, out };
}

let noiseBuffer: AudioBuffer | null = null;
function noise(context: AudioContext) {
  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) return noiseBuffer;
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

function envelope(context: AudioContext, out: AudioNode, at: number, attack: number, peak: number, release: number) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
  gain.connect(out);
  return gain;
}

function tone(context: AudioContext, out: AudioNode, type: OscillatorType, frequency: number, at: number, attack: number, peak: number, release: number) {
  const osc = context.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  osc.connect(envelope(context, out, at, attack, peak, release));
  osc.start(at);
  osc.stop(at + attack + release + 0.05);
  return osc;
}

function burst(context: AudioContext, out: AudioNode, at: number, filter: BiquadFilterType, frequency: number, q: number, peak: number, length: number) {
  const source = context.createBufferSource();
  source.buffer = noise(context);
  source.loop = true;
  const band = context.createBiquadFilter();
  band.type = filter;
  band.frequency.setValueAtTime(frequency, at);
  band.Q.value = q;
  source.connect(band).connect(envelope(context, out, at, 0.004, peak, length));
  source.start(at, Math.random() * 1.5);
  source.stop(at + length + 0.05);
  return { source, band };
}

/** A wall switch's click. */
export function playSwitch(on: boolean) {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  burst(a.context, a.out, now, "bandpass", on ? 3200 : 2400, 4, 0.5, 0.03);
  tone(a.context, a.out, "square", on ? 1800 : 1300, now, 0.002, 0.04, 0.02);
}

/** A lit match, a whoosh and the fire catching. */
export function playIgnite() {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  burst(a.context, a.out, now, "highpass", 3500, 0.7, 0.25, 0.12);
  const { band } = burst(a.context, a.out, now + 0.08, "lowpass", 300, 0.8, 0.5, 0.9);
  band.frequency.exponentialRampToValueAtTime(1800, now + 0.5);
}

/** Embers hissing out. */
export function playDouse() {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  const { band } = burst(a.context, a.out, now, "highpass", 2000, 0.5, 0.3, 1.1);
  band.frequency.exponentialRampToValueAtTime(6000, now + 1);
}

/** Curtain rings sliding along the rod. */
export function playCurtains() {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  for (let i = 0; i < 7; i++) {
    const at = now + i * 0.06 + Math.random() * 0.02;
    tone(a.context, a.out, "triangle", 2600 + Math.random() * 900, at, 0.002, 0.05, 0.05);
  }
  burst(a.context, a.out, now, "bandpass", 900, 0.6, 0.12, 0.5);
}

/** A cat's purr: low noise, pulsing about 25 times a second. */
export function playPurr() {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  const now = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = noise(context);
  source.loop = true;
  const low = context.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 260;
  const pulse = context.createGain();
  pulse.gain.value = 0.5;
  const lfo = context.createOscillator();
  lfo.frequency.value = 24;
  const depth = context.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(pulse.gain);
  const body = context.createGain();
  body.gain.setValueAtTime(0.0001, now);
  body.gain.exponentialRampToValueAtTime(0.9, now + 0.25);
  body.gain.setValueAtTime(0.9, now + 1.6);
  body.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
  source.connect(low).connect(pulse).connect(body).connect(out);
  source.start(now);
  lfo.start(now);
  source.stop(now + 2.5);
  lfo.stop(now + 2.5);
  // A small "mrrp" on top.
  const chirp = context.createOscillator();
  chirp.type = "sawtooth";
  chirp.frequency.setValueAtTime(420, now);
  chirp.frequency.exponentialRampToValueAtTime(640, now + 0.12);
  chirp.frequency.exponentialRampToValueAtTime(380, now + 0.22);
  const vowel = context.createBiquadFilter();
  vowel.type = "bandpass";
  vowel.frequency.value = 900;
  vowel.Q.value = 3;
  chirp.connect(vowel).connect(envelope(context, out, now, 0.03, 0.12, 0.2));
  chirp.start(now);
  chirp.stop(now + 0.3);
}

/** Blåhaj's squeak. */
export function playSqueak() {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  const now = context.currentTime;
  const osc = context.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(900, now);
  osc.frequency.exponentialRampToValueAtTime(1500, now + 0.08);
  osc.frequency.exponentialRampToValueAtTime(700, now + 0.22);
  osc.connect(envelope(context, out, now, 0.02, 0.3, 0.23));
  osc.start(now);
  osc.stop(now + 0.3);
}

/** A plucked string (Karplus-Strong, run ahead of time into a buffer). */
function pluck(context: AudioContext, frequency: number, seconds: number, brightness = 0.5) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.floor(rate * seconds), rate);
  const data = buffer.getChannelData(0);
  const period = Math.max(2, Math.round(rate / frequency));
  const line = new Float32Array(period);
  for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
  let last = 0;
  const damping = 0.996 - (1 - brightness) * 0.004;
  for (let i = 0; i < data.length; i++) {
    const k = i % period;
    const value = line[k];
    data[i] = value;
    line[k] = damping * (value + last) * 0.5;
    last = value;
  }
  return buffer;
}

const strumCache = new Map<string, AudioBuffer[]>();
/** A strum across six strings: one of a few friendly open chords. */
export function playStrum() {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  const chords = [
    [82.41, 123.47, 164.81, 207.65, 246.94, 329.63], // E
    [110, 164.81, 220, 277.18, 329.63, 440], // A
    [98, 123.47, 146.83, 196, 246.94, 392], // G
    [130.81, 164.81, 196, 261.63, 329.63, 392], // C
  ];
  const which = Math.floor(Math.random() * chords.length);
  const key = `${context.sampleRate}:${which}`;
  let strings = strumCache.get(key);
  if (!strings) {
    strings = chords[which].map((f) => pluck(context, f, 2.6, 0.6));
    strumCache.set(key, strings);
  }
  const now = context.currentTime;
  const body = context.createBiquadFilter();
  body.type = "peaking";
  body.frequency.value = 220;
  body.gain.value = 6;
  body.connect(out);
  strings.forEach((buffer, i) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = 0.32;
    source.connect(gain).connect(body);
    source.start(now + i * 0.028);
  });
}

/** Popcorn: a handful of pops. */
export function playPops(count = 7) {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  for (let i = 0; i < count; i++) {
    const at = now + Math.random() * 0.7;
    burst(a.context, a.out, at, "bandpass", 1200 + Math.random() * 1600, 2, 0.35, 0.03 + Math.random() * 0.03);
  }
}

/** The globe whirring round on its axis. */
export function playWhirr() {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  const { band } = burst(a.context, a.out, now, "bandpass", 700, 1.2, 0.18, 1.4);
  band.frequency.exponentialRampToValueAtTime(240, now + 1.4);
}

/** The grandfather clock: the first phrase of the Westminster chime, on bells. */
export function playChime() {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  const now = context.currentTime;
  [659.25, 587.33, 523.25, 392].forEach((f, i) => {
    const at = now + i * 0.62;
    // A bell: a fundamental and some unharmonic partials, the high ones dying first.
    for (const [ratio, peak, release] of [[1, 0.22, 2.2], [2.76, 0.07, 1.0], [5.4, 0.04, 0.5], [0.5, 0.08, 2.6]] as const) {
      tone(context, out, "sine", f * ratio, at, 0.005, peak, release);
    }
  });
}

/** A ghostly "oooh" for the vampire's skull. */
export function playBoo() {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  const now = context.currentTime;
  const osc = context.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.linearRampToValueAtTime(330, now + 0.5);
  osc.frequency.linearRampToValueAtTime(180, now + 1.4);
  const vibrato = context.createOscillator();
  vibrato.frequency.value = 6;
  const depth = context.createGain();
  depth.gain.value = 9;
  vibrato.connect(depth).connect(osc.frequency);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
  osc.connect(gain).connect(out);
  osc.start(now);
  vibrato.start(now);
  osc.stop(now + 1.6);
  vibrato.stop(now + 1.6);
}

/** The arcade cabinet's coin-up jingle. */
export function playArcade() {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) => {
    tone(a.context, a.out, "square", f, now + i * 0.075, 0.003, 0.06, 0.07);
  });
}

/** A terminal chattering out data. */
export function playData() {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  for (let i = 0; i < 14; i++) {
    tone(a.context, a.out, "square", 600 + Math.floor(Math.random() * 8) * 220, now + i * 0.045, 0.002, 0.035, 0.03);
  }
}

/** A sip of something hot. */
export function playSip() {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  const { band } = burst(a.context, a.out, now, "bandpass", 1800, 3, 0.2, 0.35);
  band.frequency.linearRampToValueAtTime(3200, now + 0.3);
  tone(a.context, a.out, "sine", 180, now + 0.42, 0.01, 0.12, 0.08);
}

/** Thunder: a crack, then a long low roll. `distance` 0 (overhead) .. 1 (far off). */
export function playThunder(distance = Math.random()) {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  if (distance < 0.5) burst(a.context, a.out, now, "highpass", 900, 0.5, 0.5 * (1 - distance), 0.25);
  const roll = burst(a.context, a.out, now + 0.05, "lowpass", 220 - distance * 120, 0.7, 0.9 - distance * 0.4, 3.2 + distance * 1.5);
  roll.band.frequency.exponentialRampToValueAtTime(60, now + 3.5);
  const rumble = burst(a.context, a.out, now + 0.4, "lowpass", 90, 1, 0.6, 2.4);
  rumble.band.frequency.exponentialRampToValueAtTime(40, now + 2.6);
}

/** Rain on the windows, until the returned function stops it. */
export function startRain(): () => void {
  const a = audio();
  if (!a) return () => undefined;
  const { context } = a;
  // Its own output, kept: audio() lets a sound's output go after a few seconds.
  const out = context.createGain();
  out.gain.value = 0;
  out.connect(context.destination);
  const source = context.createBufferSource();
  source.buffer = noise(context);
  source.loop = true;
  const hiss = context.createBiquadFilter();
  hiss.type = "bandpass";
  hiss.frequency.value = 2400;
  hiss.Q.value = 0.4;
  const patter = context.createBiquadFilter();
  patter.type = "highshelf";
  patter.frequency.value = 5000;
  patter.gain.value = -8;
  source.connect(hiss).connect(patter).connect(out);
  source.start();
  out.gain.setTargetAtTime(0.12 * (0.25 + level * 0.75), context.currentTime, 1.2);
  return () => {
    out.gain.setTargetAtTime(0, context.currentTime, 0.8);
    setTimeout(() => { try { source.stop(); } catch { /* Already stopped. */ } out.disconnect(); }, 3000);
  };
}

/** A marshmallow toasting: a soft sizzle and a few pops. */
export function playSizzle() {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  burst(a.context, a.out, now, "highpass", 4500, 0.6, 0.08, 3.5);
  for (let i = 0; i < 5; i++) burst(a.context, a.out, now + 0.4 + Math.random() * 3, "bandpass", 1800 + Math.random() * 1500, 3, 0.18, 0.025);
}

/** A stone skipping: a plip for each touch of the water, `hops` of them, closer together each time. */
export function playSkips(hops: number, first = 0.35) {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  let at = context.currentTime + first;
  let gap = 0.42;
  for (let i = 0; i < hops; i++) {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(900 - i * 60, at);
    osc.frequency.exponentialRampToValueAtTime(380, at + 0.08);
    osc.connect(envelope(context, out, at, 0.004, 0.22 - i * 0.03, 0.1));
    osc.start(at);
    osc.stop(at + 0.2);
    burst(context, out, at, "bandpass", 1400, 1.5, 0.12, 0.08);
    at += gap;
    gap *= 0.72;
  }
  // The last one sinks.
  burst(context, out, at, "lowpass", 700, 1, 0.25, 0.3);
}

/** The cinema's intermission bell: a brass bell rung three times. */
export function playIntermission() {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  const now = context.currentTime;
  for (let i = 0; i < 3; i++) {
    const at = now + i * 0.55;
    for (const [ratio, peak, release] of [[1, 0.2, 1.8], [2.4, 0.08, 0.9], [3.9, 0.05, 0.5], [6.2, 0.03, 0.3]] as const) {
      tone(context, out, "sine", 1046.5 * ratio, at, 0.003, peak, release);
    }
  }
}

/** A little fanfare for a winner. */
export function playFanfare() {
  const a = audio();
  if (!a) return;
  const now = a.context.currentTime;
  const notes: Array<[number, number, number]> = [[523.25, 0, 0.14], [659.25, 0.15, 0.14], [783.99, 0.3, 0.14], [1046.5, 0.45, 0.6]];
  for (const [f, at, length] of notes) {
    for (const [ratio, gain] of [[1, 0.14], [2, 0.05], [3, 0.03]] as const) tone(a.context, a.out, "sawtooth", f * ratio, now + at, 0.01, gain, length);
  }
  burst(a.context, a.out, now + 0.45, "highpass", 6000, 0.5, 0.1, 0.6);
}

/** The Minecraft room's creeper: a rising hiss that thinks better of it. */
export function playHiss() {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  const now = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = noise(context);
  source.loop = true;
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(4200, now);
  band.frequency.linearRampToValueAtTime(6000, now + 1.3);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.15);
  gain.gain.linearRampToValueAtTime(0.35, now + 1.2);
  gain.gain.linearRampToValueAtTime(0.0001, now + 1.5);
  source.connect(band).connect(gain).connect(out);
  source.start(now);
  source.stop(now + 1.55);
}

/** MSN's nudge: a buzzy wobble and the "new message" two-note chime. */
export function playNudge() {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  const now = context.currentTime;
  for (let i = 0; i < 6; i++) tone(context, out, "square", i % 2 ? 140 : 120, now + i * 0.07, 0.005, 0.05, 0.06);
  tone(context, out, "sine", 880, now + 0.5, 0.005, 0.2, 0.35);
  tone(context, out, "sine", 1318.5, now + 0.62, 0.005, 0.2, 0.6);
}

/** The lava lamp: a slow, liquid bloop. */
export function playBloop() {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  const now = context.currentTime;
  [0, 0.35, 0.6].forEach((at, i) => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(260 + i * 60, now + at);
    osc.frequency.exponentialRampToValueAtTime(520 + i * 90, now + at + 0.14);
    osc.connect(envelope(context, out, now + at, 0.01, 0.18, 0.2));
    osc.start(now + at);
    osc.stop(now + at + 0.3);
  });
}

/** The zombie at the boarded window: three thumps on the planks and a long groan. */
export function playGroan() {
  const a = audio();
  if (!a) return;
  const { context, out } = a;
  const now = context.currentTime;
  [0, 0.32, 0.6].forEach((at) => {
    burst(context, out, now + at, "lowpass", 220, 0.8, 0.5, 0.18);
    tone(context, out, "sine", 70, now + at, 0.004, 0.35, 0.16);
  });
  const osc = context.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(110, now + 0.5);
  osc.frequency.linearRampToValueAtTime(78, now + 2.0);
  const wobble = context.createOscillator();
  const depth = context.createGain();
  wobble.frequency.value = 4.5;
  depth.gain.value = 7;
  wobble.connect(depth).connect(osc.frequency);
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  filter.Q.value = 5;
  osc.connect(filter).connect(envelope(context, out, now + 0.5, 0.2, 0.3, 1.4));
  osc.start(now + 0.5);
  wobble.start(now + 0.5);
  osc.stop(now + 2.2);
  wobble.stop(now + 2.2);
}
