/**
 * Realistic & Thematic 3D Dice Sound Engine
 *
 * Plays multi-bounce physical dice tumbling sounds using authentic recorded audio samples
 * (surfaces & resin dice collisions) with randomized micro-timing, pitch variance, and velocity decay.
 *
 * Custom audio design for themes:
 * - Vampire theme: Eerie subterranean crypt thud, dark stone vault resonance, echoing bone clatter,
 *   subtle gothic pipe organ swell, and distant chapel bell harmonics.
 * - Dark Academia theme: Deep library mahogany desk resonance, antique wooden dice tray clatter,
 *   and warm scholarly acoustics.
 * - General themes: Crisp resin dice tumbling in felt/tray with realistic multi-bounce physics.
 *
 * Includes an instant procedural Web Audio fallback if sample assets take time to fetch.
 */

import { basePath } from "./client";

let audioCtx: AudioContext | null = null;
const audioBufferCache = new Map<string, AudioBuffer>();
const pendingFetches = new Map<string, Promise<AudioBuffer | null>>();
let activeStopCallbacks: Array<() => void> = [];

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** Preload and cache a sound buffer */
async function loadSoundBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  if (audioBufferCache.has(url)) {
    return audioBufferCache.get(url)!;
  }
  if (pendingFetches.has(url)) {
    return pendingFetches.get(url)!;
  }

  const fetchPromise = (async () => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const arrayBuf = await resp.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      audioBufferCache.set(url, decoded);
      return decoded;
    } catch {
      return null;
    } finally {
      pendingFetches.delete(url);
    }
  })();

  pendingFetches.set(url, fetchPromise);
  return fetchPromise;
}

// Sample asset lists in /public/assets/dice-box-threejs/sounds/
// Every variant of a family is used, so a big handful never repeats the same click back to back.
const numbered = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i + 1}.mp3`);
const SAMPLES = {
  general: {
    surfaces: numbered("surfaces/surface_wood_tray", 7),
    dicehits: numbered("dicehit/dicehit_plastic", 15),
  },
  darkAcademia: {
    surfaces: numbered("surfaces/surface_wood_table", 7),
    dicehits: numbered("dicehit/dicehit_wood", 12),
  },
  vampire: {
    surfaces: numbered("surfaces/surface_metal", 9),
    dicehits: numbered("dicehit/dicehit_metal", 12),
  },
};

/** Preload a subset of frequently used dice sounds in background */
export function preloadDiceSounds(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const basePathStr = basePath || "";
  const toPreload = [
    SAMPLES.general.surfaces[0],
    SAMPLES.general.dicehits[0],
    SAMPLES.vampire.surfaces[0],
    SAMPLES.vampire.dicehits[0],
    SAMPLES.darkAcademia.surfaces[0],
    SAMPLES.darkAcademia.dicehits[0],
  ];
  for (const rel of toPreload) {
    void loadSoundBuffer(ctx, `${basePathStr}/assets/dice-box-threejs/sounds/${rel}`);
  }
}

/**
 * Procedural fallback synthesis for a realistic dice impact
 * Combines a resonant body, transient noise click, and low surface tap.
 */
function synthProceduralDiceHit(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  volume = 0.4,
  theme: string = "default",
): void {
  const isMatrix = theme === "matrix";
  const isCyberpunk = theme === "cyberpunk";

  // Transient click: high-Q bandpass filtered noise
  const noiseLen = isMatrix ? 0.025 : 0.04;
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseLen), ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.15));
  }
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(
    isMatrix
      ? 3800
      : isCyberpunk
        ? 1400
        : theme === "vampire"
          ? 1800
          : theme === "dark-academia"
            ? 2400
            : 3200,
    time,
  );
  bandpass.Q.setValueAtTime(isMatrix ? 6 : isCyberpunk ? 3 : theme === "vampire" ? 4 : 5, time);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.7, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + noiseLen);

  noiseSrc.connect(bandpass).connect(noiseGain).connect(dest);
  noiseSrc.start(time);

  // Resonant body chime
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type =
    isMatrix
      ? "sawtooth"
      : isCyberpunk
        ? "sawtooth"
        : theme === "dark-academia"
          ? "triangle"
          : "sine";
  const baseFreq =
    isMatrix
      ? 1400 + Math.random() * 300
      : isCyberpunk
        ? 240 + Math.random() * 80
        : theme === "vampire"
          ? 620 + Math.random() * 120
          : theme === "dark-academia"
            ? 450 + Math.random() * 100
            : 850 + Math.random() * 200;

  osc.frequency.setValueAtTime(baseFreq, time);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * (isMatrix ? 0.5 : 0.7), time + 0.08);

  oscGain.gain.setValueAtTime(volume * 0.5, time);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

  osc.connect(oscGain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.09);

  // Surface tap thud
  const thudOsc = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thudOsc.type = "sine";
  const thudFreq =
    isCyberpunk
      ? 55
      : theme === "vampire"
        ? 65
        : theme === "dark-academia"
          ? 110
          : isMatrix
            ? 95
            : 140;
  thudOsc.frequency.setValueAtTime(thudFreq, time);
  thudOsc.frequency.exponentialRampToValueAtTime(thudFreq * 0.5, time + 0.09);

  thudGain.gain.setValueAtTime(volume * 0.6, time);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);

  thudOsc.connect(thudGain).connect(dest);
  thudOsc.start(time);
  thudOsc.stop(time + 0.1);
}

/**
 * Vampire Theme Atmosphere:
 * - Bat wing flutter & cloak whoosh on release (soft filtered aerodynamic flutter)
 * - Whisper of cold tomb air
 * - Delicate cold crypt water droplet on settle
 * Zero artificial synth oscillators or buzzing organ tones.
 */
function addVampireAtmosphere(ctx: AudioContext, masterOut: AudioNode, startTime: number): void {
  // 1. Soft bat wing flutter / cloak snap on release
  const flutterDur = 0.28;
  const flutterBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * flutterDur), ctx.sampleRate);
  const flutterData = flutterBuf.getChannelData(0);
  for (let i = 0; i < flutterData.length; i++) {
    flutterData[i] = (Math.random() * 2 - 1) * 0.45;
  }
  const flutterSrc = ctx.createBufferSource();
  flutterSrc.buffer = flutterBuf;

  const flutterFilter = ctx.createBiquadFilter();
  flutterFilter.type = "bandpass";
  flutterFilter.frequency.setValueAtTime(750, startTime);
  flutterFilter.frequency.exponentialRampToValueAtTime(320, startTime + flutterDur);
  flutterFilter.Q.value = 1.8;

  const flutterGain = ctx.createGain();
  flutterGain.gain.setValueAtTime(0.0001, startTime);
  flutterGain.gain.linearRampToValueAtTime(0.18, startTime + 0.03);
  flutterGain.gain.linearRampToValueAtTime(0.03, startTime + 0.07);
  flutterGain.gain.linearRampToValueAtTime(0.14, startTime + 0.11);
  flutterGain.gain.linearRampToValueAtTime(0.03, startTime + 0.16);
  flutterGain.gain.linearRampToValueAtTime(0.09, startTime + 0.20);
  flutterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + flutterDur);

  flutterSrc.connect(flutterFilter).connect(flutterGain).connect(masterOut);
  flutterSrc.start(startTime);
  flutterSrc.stop(startTime + flutterDur + 0.05);

  // 2. Whisper of cold tomb draught
  const breathDur = 0.38;
  const breathBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * breathDur), ctx.sampleRate);
  const breathData = breathBuf.getChannelData(0);
  for (let i = 0; i < breathData.length; i++) {
    breathData[i] = (Math.random() * 2 - 1) * 0.3;
  }
  const breathSrc = ctx.createBufferSource();
  breathSrc.buffer = breathBuf;

  const breathFilter = ctx.createBiquadFilter();
  breathFilter.type = "lowpass";
  breathFilter.frequency.setValueAtTime(550, startTime);

  const breathGain = ctx.createGain();
  breathGain.gain.setValueAtTime(0.0001, startTime);
  breathGain.gain.linearRampToValueAtTime(0.055, startTime + 0.08);
  breathGain.gain.exponentialRampToValueAtTime(0.0001, startTime + breathDur);

  breathSrc.connect(breathFilter).connect(breathGain).connect(masterOut);
  breathSrc.start(startTime);
  breathSrc.stop(startTime + breathDur + 0.05);

  // 3. Delicate cold crypt water droplet on settle (t + 0.74s)
  const dripTime = startTime + 0.74;
  const dripOsc = ctx.createOscillator();
  const dripGain = ctx.createGain();
  dripOsc.type = "sine";
  dripOsc.frequency.setValueAtTime(1950, dripTime);
  dripOsc.frequency.exponentialRampToValueAtTime(1420, dripTime + 0.045);

  dripGain.gain.setValueAtTime(0.0001, dripTime);
  dripGain.gain.linearRampToValueAtTime(0.045, dripTime + 0.004);
  dripGain.gain.exponentialRampToValueAtTime(0.0001, dripTime + 0.06);

  dripOsc.connect(dripGain).connect(masterOut);
  dripOsc.start(dripTime);
  dripOsc.stop(dripTime + 0.07);
}

/**
 * Matrix Theme Atmosphere:
 * - Subtle digital scanline / data-stream chirps on roll start
 * - Rapid phosphor flicker / sub carrier hum
 */
function addMatrixAtmosphere(ctx: AudioContext, masterOut: AudioNode, startTime: number): void {
  // Cascading micro data blips (green code falling)
  const blipFreqs = [1850, 2400, 3100];
  blipFreqs.forEach((freq, i) => {
    const t = startTime + i * 0.045;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.8, t + 0.035);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(g).connect(masterOut);
    osc.start(t);
    osc.stop(t + 0.04);
  });

  // Soft digital carrier hum
  const humOsc = ctx.createOscillator();
  const humGain = ctx.createGain();
  humOsc.type = "triangle";
  humOsc.frequency.setValueAtTime(120, startTime);
  humGain.gain.setValueAtTime(0.0001, startTime);
  humGain.gain.linearRampToValueAtTime(0.04, startTime + 0.05);
  humGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);
  humOsc.connect(humGain).connect(masterOut);
  humOsc.start(startTime);
  humOsc.stop(startTime + 0.42);
}

/**
 * Cyberpunk Theme Atmosphere:
 * - Overdriven sub-bass servo thud on release
 * - 60Hz neon transformer buzz / electric crackle
 */
function addCyberpunkAtmosphere(ctx: AudioContext, masterOut: AudioNode, startTime: number): void {
  // Industrial sub power-surge punch
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(55, startTime);
  sub.frequency.exponentialRampToValueAtTime(28, startTime + 0.35);
  subGain.gain.setValueAtTime(0.0001, startTime);
  subGain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
  subGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.38);
  sub.connect(subGain).connect(masterOut);
  sub.start(startTime);
  sub.stop(startTime + 0.4);

  // Neon tube electrical arc sizzle
  const arcDur = 0.22;
  const arcBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * arcDur), ctx.sampleRate);
  const data = arcBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    // 60Hz AM modulated noise
    const am = Math.sin((i / ctx.sampleRate) * 2 * Math.PI * 60);
    data[i] = (Math.random() * 2 - 1) * Math.abs(am) * 0.4;
  }
  const arcSrc = ctx.createBufferSource();
  arcSrc.buffer = arcBuf;
  const arcFilt = ctx.createBiquadFilter();
  arcFilt.type = "highpass";
  arcFilt.frequency.setValueAtTime(2200, startTime);
  const arcGain = ctx.createGain();
  arcGain.gain.setValueAtTime(0.07, startTime);
  arcGain.gain.exponentialRampToValueAtTime(0.0001, startTime + arcDur);
  arcSrc.connect(arcFilt).connect(arcGain).connect(masterOut);
  arcSrc.start(startTime);
  arcSrc.stop(startTime + arcDur + 0.02);
}

/**
 * Stop any currently playing dice audio sequence
 */
export function stopDiceRollSound(): void {
  for (const cancel of activeStopCallbacks) {
    try {
      cancel();
    } catch {
      // ignore
    }
  }
  activeStopCallbacks = [];
}

export type DiceMaterial = "plastic" | "metal" | "wood" | "glass";

interface DiceRollSoundOptions {
  theme?: string;
  diceCount?: number;
  material?: DiceMaterial | "auto";
}

/** Above this, more dice add nothing you could hear. */
const MAX_SOUNDING_DICE = 50;

/** One thing you hear: a die landing, a die rocking to a stop, or two dice knocking together. */
interface DiceHit {
  time: number;
  /** 0..1, how hard: sets loudness and how bright it is. */
  energy: number;
  pan: number;
  kind: "surface" | "rattle" | "collision";
}

/**
 * Lays out a roll die by die. Each die leaves the hand a little after the last, lands, bounces
 * with shorter and softer hops, rolls a moment and rocks on an edge before it stops. Dice also
 * knock into each other, and the more there are the more often: that is what makes a big handful
 * sound like a handful and not one die played many times.
 */
function choreographRoll(diceCount: number): DiceHit[] {
  const n = Math.min(Math.max(1, Math.floor(diceCount || 1)), MAX_SOUNDING_DICE);
  const hits: DiceHit[] = [];
  const width = Math.min(0.85, 0.15 + n * 0.04);
  // A handful takes longer to leave the hand than a pair.
  const pour = n === 1 ? 0 : Math.min(0.34, 0.035 + n * 0.007);

  for (let i = 0; i < n; i++) {
    const pan = n === 1 ? (Math.random() - 0.5) * 0.2 : (Math.random() * 2 - 1) * width;
    // The first dozen get every hop; past that they are buried in the pile and only the
    // landing and the stop come through, which also keeps 50 dice cheap to play.
    const full = i < 12;
    let t = i === 0 ? 0 : pour * Math.pow(Math.random(), 0.85);
    let energy = 0.8 + Math.random() * 0.2;
    let gap = 0.08 + Math.random() * 0.07;
    const maxHops = full ? 5 : 1;
    for (let hop = 0; hop <= maxHops && energy > 0.12; hop++) {
      hits.push({ time: t, energy, pan, kind: "surface" });
      t += gap;
      gap *= 0.58 + Math.random() * 0.16;
      energy *= 0.48 + Math.random() * 0.18;
    }
    // Rolls a little, then rocks on an edge: the quick "tk-tk-tk" at the end of every real roll.
    t += 0.05 + Math.random() * 0.14;
    const rocks = full ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
    let rockGap = 0.03 + Math.random() * 0.03;
    let rockEnergy = 0.22 + Math.random() * 0.14;
    for (let r = 0; r < rocks; r++) {
      hits.push({ time: t, energy: rockEnergy, pan, kind: "rattle" });
      t += rockGap;
      rockGap *= 0.62 + Math.random() * 0.15;
      rockEnergy *= 0.5 + Math.random() * 0.15;
    }
  }

  if (n >= 2) {
    // Grows a little faster than the number of dice: more dice, more of them in each other's way.
    const collisions = Math.min(140, Math.round(1.8 * Math.pow(n - 1, 1.1)));
    const meanDelay = 0.1 + n * 0.005;
    for (let c = 0; c < collisions; c++) {
      const time = Math.min(1.4, 0.015 + Math.random() * pour + -Math.log(1 - Math.random() * 0.97) * meanDelay);
      const energy = (0.4 + Math.random() * 0.55) * Math.exp(-time / 0.55);
      const pan = (Math.random() * 2 - 1) * width;
      hits.push({ time, energy, pan, kind: "collision" });
      // Two dice that meet often knock twice as they part.
      if (Math.random() < 0.35) {
        hits.push({ time: time + 0.012 + Math.random() * 0.02, energy: energy * 0.5, pan, kind: "collision" });
      }
    }
  }

  return hits.sort((a, b) => a.time - b.time);
}

/** A short, dark small-room tail, so the dice sound like they are on a table in a room. */
let roomImpulse: AudioBuffer | null = null;
function getRoomImpulse(ctx: AudioContext): AudioBuffer {
  if (roomImpulse && roomImpulse.sampleRate === ctx.sampleRate) return roomImpulse;
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * 0.45);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = Math.floor(rate * 0.006); i < length; i++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.3;
      data[i] = lp * Math.exp(-(i / rate) / 0.085);
    }
  }
  roomImpulse = buffer;
  return buffer;
}

/** Picks a buffer, never the one picked last time for that family. */
function freshPick(buffers: AudioBuffer[], last: { i: number }): AudioBuffer {
  if (buffers.length < 2) return buffers[0];
  let i = Math.floor(Math.random() * (buffers.length - 1));
  if (i >= last.i) i++;
  last.i = i;
  return buffers[i];
}

/**
 * Play a theme- and material-tailored dice roll.
 *
 * Every die is played on its own (see choreographRoll), up to 50 of them, panned across the
 * table, with soft hits duller than hard ones, dice knocking into each other, and a short room
 * tail. A compressor holds a big handful together without clipping.
 */
export async function playDiceRollSound({
  theme = "default",
  diceCount = 1,
  material = "auto",
}: DiceRollSoundOptions = {}): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Interrupt previous roll sound if any is running
  stopDiceRollSound();

  const isVampire = theme === "vampire";
  const isDarkAcademia = theme === "dark-academia" || theme === "darkacademia";
  const isMatrix = theme === "matrix";
  const isCyberpunk = theme === "cyberpunk";
  const basePathStr = basePath || "";

  // Resolve acoustic material
  const effectiveMaterial: DiceMaterial =
    material && material !== "auto"
      ? material
      : isVampire || isCyberpunk
        ? "metal"
        : isDarkAcademia
          ? "wood"
          : isMatrix
            ? "glass"
            : "plastic";

  // Master Gain for this roll
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.85, ctx.currentTime);
  masterGain.connect(ctx.destination);

  let isCancelled = false;
  activeStopCallbacks.push(() => {
    isCancelled = true;
    try {
      masterGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      setTimeout(() => {
        try {
          masterGain.disconnect();
        } catch {
          // ignore
        }
      }, 100);
    } catch {
      // ignore
    }
  });

  // Sound selection based on material & theme
  const set =
    effectiveMaterial === "metal"
      ? SAMPLES.vampire
      : effectiveMaterial === "wood"
        ? SAMPLES.darkAcademia
        : SAMPLES.general;

  const surfaceUrls = set.surfaces.map((s) => `${basePathStr}/assets/dice-box-threejs/sounds/${s}`);
  const hitUrls = set.dicehits.map((s) => `${basePathStr}/assets/dice-box-threejs/sounds/${s}`);
  const cached = (urls: string[]) => urls.flatMap((u) => audioBufferCache.get(u) ?? []);

  // Once a family has some samples cached, play right away with those and let the rest
  // load for next time; the very first roll waits for the files.
  const loadAll = Promise.all([...surfaceUrls, ...hitUrls].map((u) => loadSoundBuffer(ctx, u)));
  if (cached(surfaceUrls).length === 0 || cached(hitUrls).length === 0) {
    await loadAll;
  }

  if (isCancelled) return;

  const validSurfaces = cached(surfaceUrls);
  const validHits = cached(hitUrls);

  const now = ctx.currentTime + 0.01;

  // Channel output routing
  let channelOut: AudioNode = masterGain;

  if (isVampire) {
    // Clean stone crypt spatial reflection: two gentle non-harmonic early taps (36ms & 84ms)
    const earlyEcho1 = ctx.createDelay();
    earlyEcho1.delayTime.setValueAtTime(0.036, now);
    const earlyEcho2 = ctx.createDelay();
    earlyEcho2.delayTime.setValueAtTime(0.084, now);

    const stoneFilter = ctx.createBiquadFilter();
    stoneFilter.type = "lowpass";
    stoneFilter.frequency.setValueAtTime(2200, now);

    const echoGain = ctx.createGain();
    echoGain.gain.setValueAtTime(0.22, now);

    earlyEcho1.connect(stoneFilter);
    earlyEcho2.connect(stoneFilter);
    stoneFilter.connect(echoGain);
    echoGain.connect(masterGain);

    const cryptBus = ctx.createGain();
    cryptBus.gain.setValueAtTime(0.95, now);
    cryptBus.connect(masterGain);
    cryptBus.connect(earlyEcho1);
    cryptBus.connect(earlyEcho2);

    channelOut = cryptBus;

    // Atmospheric vampire layer: bat flutter, cloak whoosh, cold draught & tomb drip
    addVampireAtmosphere(ctx, masterGain, now);
  } else if (isMatrix) {
    // Data rain CRT scanline filter
    const matrixEq = ctx.createBiquadFilter();
    matrixEq.type = "peaking";
    matrixEq.frequency.setValueAtTime(2800, now);
    matrixEq.gain.setValueAtTime(4.5, now);
    matrixEq.Q.setValueAtTime(2.0, now);
    matrixEq.connect(masterGain);
    channelOut = matrixEq;
    addMatrixAtmosphere(ctx, masterGain, now);
  } else if (isCyberpunk) {
    // Overdriven electro-metallic impact filter
    const cyberEq = ctx.createBiquadFilter();
    cyberEq.type = "peaking";
    cyberEq.frequency.setValueAtTime(160, now);
    cyberEq.gain.setValueAtTime(5.0, now);
    cyberEq.Q.setValueAtTime(1.5, now);
    cyberEq.connect(masterGain);
    channelOut = cyberEq;
    addCyberpunkAtmosphere(ctx, masterGain, now);
  } else if (isDarkAcademia || effectiveMaterial === "wood") {
    // Rich mahogany warmth filter
    const warmEq = ctx.createBiquadFilter();
    warmEq.type = "peaking";
    warmEq.frequency.setValueAtTime(260, now);
    warmEq.gain.setValueAtTime(3.5, now);
    warmEq.Q.setValueAtTime(1.2, now);
    warmEq.connect(masterGain);
    channelOut = warmEq;
  } else if (effectiveMaterial === "glass") {
    // Crystal glass sparkle filter
    const highEq = ctx.createBiquadFilter();
    highEq.type = "highshelf";
    highEq.frequency.setValueAtTime(3400, now);
    highEq.gain.setValueAtTime(4.0, now);
    highEq.connect(masterGain);
    channelOut = highEq;
  }

  // All the dice go through one bus: a gentle compressor glues a handful together and keeps
  // 50 dice from clipping, and a little of it is sent into the room tail.
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.setValueAtTime(-20, now);
  glue.knee.setValueAtTime(12, now);
  glue.ratio.setValueAtTime(4, now);
  glue.attack.setValueAtTime(0.002, now);
  glue.release.setValueAtTime(0.12, now);
  glue.connect(channelOut);
  const diceBus = ctx.createGain();
  diceBus.gain.setValueAtTime(2, now);
  diceBus.connect(glue);
  const room = ctx.createConvolver();
  room.buffer = getRoomImpulse(ctx);
  const roomSend = ctx.createGain();
  roomSend.gain.setValueAtTime(isVampire ? 0.08 : 0.16, now);
  diceBus.connect(roomSend).connect(room).connect(channelOut);

  // Pitch modifier for materials
  const materialPitchFactor =
    effectiveMaterial === "glass"
      ? 1.18
      : effectiveMaterial === "metal"
        ? 0.92
        : effectiveMaterial === "wood"
          ? 0.96
          : 1.0;

  const hits = choreographRoll(diceCount);
  const sounding = Math.min(Math.max(1, Math.floor(diceCount || 1)), MAX_SOUNDING_DICE);
  // More dice overlap, so each one is a bit quieter; the whole roll still gets louder.
  const perHit = 1 / Math.pow(sounding, 0.45);
  const lastSurface = { i: -1 };
  const lastHit = { i: -1 };

  const play = (buffer: AudioBuffer, hit: DiceHit, time: number, volume: number, rate: number) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(Math.max(0.6, Math.min(1.6, rate)), time);
    // Soft hits have less top end than hard ones.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(1400 + 16000 * Math.pow(hit.energy, 1.5), time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    source.connect(tone).connect(gain);
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(hit.pan, time);
      gain.connect(panner).connect(diceBus);
    } else {
      gain.connect(diceBus);
    }
    source.start(time);
  };

  for (const hit of hits) {
    const t = now + hit.time;
    const rate = (0.94 + Math.random() * 0.12) * materialPitchFactor;
    const loud = perHit * Math.pow(hit.energy, 1.25);

    if (hit.kind === "collision") {
      if (validHits.length) play(freshPick(validHits, lastHit), hit, t, loud * 0.95, rate * (1 + Math.random() * 0.08));
      else synthProceduralDiceHit(ctx, diceBus, t, loud * 0.5, theme);
      continue;
    }

    // A die on the table. Rocking to a stop is a smaller, higher contact than a landing.
    const surfaceRate = hit.kind === "rattle" ? rate * (1.1 + Math.random() * 0.12) : rate * 0.96;
    if (validSurfaces.length) play(freshPick(validSurfaces, lastSurface), hit, t, loud * 0.9, surfaceRate);
    else synthProceduralDiceHit(ctx, diceBus, t, loud * 0.6, theme);
    // A hard landing also rings the die itself.
    if (hit.kind === "surface" && hit.energy > 0.45 && validHits.length) {
      play(freshPick(validHits, lastHit), hit, t + 0.004, loud * 0.4, rate * 1.04);
    }
  }
}

/**
 * A real-sounding glass shatter, rendered into a buffer:
 * - the break: a hard broadband crack with a short low thump under it
 * - the burst: dozens of fragments, each a tiny noise tick that rings as a few
 *   inharmonic, fast-decaying partials (what makes small glass sound like glass)
 * - the settle: sparse, quieter tinkles as shards land and skitter on the table
 */
function synthGlassShatter(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * 2.2);
  const buffer = ctx.createBuffer(2, length, rate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const add = (i: number, v: number, pan: number) => {
    if (i < 0 || i >= length) return;
    left[i] += v * (1 - pan);
    right[i] += v * (1 + pan);
  };

  // The break: hard crack, filtered so it is bright but not hissy.
  let lp = 0;
  for (let i = 0; i < rate * 0.09; i++) {
    const t = i / rate;
    const white = Math.random() * 2 - 1;
    lp += (white - lp) * 0.55;
    const env = Math.exp(-t / 0.018);
    const crack = (white - lp * 0.6) * env * 0.9;
    const thump = Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t / 0.03) * 0.5;
    add(i, crack + thump, 0);
  }

  const fragment = (start: number, amp: number, pan: number) => {
    const base = 2600 + Math.random() * 6200;
    const partials = [1, 2.32 + Math.random() * 0.2, 3.9 + Math.random() * 0.5];
    const decay = 0.025 + Math.random() * 0.09;
    const len = Math.floor(rate * decay * 5);
    const s0 = Math.floor(start * rate);
    const phases = partials.map(() => Math.random() * Math.PI * 2);
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      let v = 0;
      for (let k = 0; k < partials.length; k++) {
        v += Math.sin(2 * Math.PI * base * partials[k] * t + phases[k]) * Math.exp(-t / (decay / (1 + k * 0.7))) / (k + 1);
      }
      // Tiny noise tick at the start of each fragment.
      if (i < rate * 0.003) v += (Math.random() * 2 - 1) * 0.8 * (1 - i / (rate * 0.003));
      add(s0 + i, v * amp, pan);
    }
  };

  // The burst: dense at first, thinning out.
  for (let n = 0; n < 70; n++) {
    const t = 0.004 + -Math.log(1 - Math.random() * 0.995) * 0.09;
    fragment(t, 0.32 * Math.exp(-t / 0.35) * (0.4 + Math.random() * 0.6), Math.random() * 1.6 - 0.8);
  }
  // The settle: shards landing and skittering.
  for (let n = 0; n < 34; n++) {
    const t = 0.25 + Math.random() * 1.35;
    fragment(t, 0.13 * Math.exp(-(t - 0.25) / 0.7) * (0.3 + Math.random() * 0.7), Math.random() * 1.8 - 0.9);
  }

  // Normalise so it never clips.
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const gain = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < length; i++) {
    left[i] *= gain;
    right[i] *= gain;
  }
  return buffer;
}

/**
 * Play material-specific critical fumble (Nat 1) disaster audio:
 * - Glass: a real shatter (crack, fragment burst, shards settling)
 * - Metal: heavy anvil-like screen-cracking slam and sub-bass shockwave
 * - Wood: violent timber snap and hollow splinter crack
 * - Plastic: thermal sizzling melt and gooey dripping bubbles
 */
export async function playCriticalFumbleSound({
  material = "plastic",
  theme = "default",
}: {
  material?: DiceMaterial;
  theme?: string;
} = {}): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.92, now);
  master.connect(ctx.destination);

  if (theme === "matrix") {
    // Digital matrix code glitch collapse: cascading bitcrushed pitches down into system error
    [1600, 950, 420, 180].forEach((freq, i) => {
      const t = now + i * 0.05;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.3, t + 0.08);
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.09);
    });
    return;
  }

  if (theme === "cyberpunk") {
    // High-voltage neon short-circuit arc overload
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = "sawtooth";
    sub.frequency.setValueAtTime(90, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    sg.gain.setValueAtTime(0.8, now);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    sub.connect(sg).connect(master);
    sub.start(now);
    sub.stop(now + 0.36);

    const arcBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.35), ctx.sampleRate);
    const ad = arcBuf.getChannelData(0);
    for (let i = 0; i < ad.length; i++) ad[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ad.length * 0.25));
    const arcSrc = ctx.createBufferSource();
    arcSrc.buffer = arcBuf;
    const arcFilt = ctx.createBiquadFilter();
    arcFilt.type = "bandpass";
    arcFilt.frequency.setValueAtTime(1800, now);
    arcFilt.Q.setValueAtTime(3.5, now);
    const ag = ctx.createGain();
    ag.gain.setValueAtTime(0.8, now);
    ag.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    arcSrc.connect(arcFilt).connect(ag).connect(master);
    arcSrc.start(now);
    return;
  }

  if (material === "glass") {
    // 1. Shattered glass: rendered sample by sample (see synthGlassShatter).
    const src = ctx.createBufferSource();
    src.buffer = synthGlassShatter(ctx);
    src.connect(master);
    src.start(now);
  } else if (material === "metal") {
    // 2. Heavy Metal Breaks the Screen: Sub-bass shockwave punch + anvil clang + jarring screen impact crunch
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.22);
    subGain.gain.setValueAtTime(0.95, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    sub.connect(subGain).connect(master);
    sub.start(now);
    sub.stop(now + 0.46);

    // Anvil metal clang overtones
    [840, 1420, 2180].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.4 / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 0.35);
    });

    // Screen glass shattering crack
    const crackBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.28), ctx.sampleRate);
    const cd = crackBuf.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (cd.length * 0.18));
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;
    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = "bandpass";
    crackFilter.frequency.setValueAtTime(2400, now);
    crackFilter.Q.setValueAtTime(3.0, now);
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.75, now);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    crackSrc.connect(crackFilter).connect(crackGain).connect(master);
    crackSrc.start(now + 0.01);
  } else if (material === "wood") {
    // 3. Wood Snaps in Half: Sharp dry timber snap + splintering crack + hollow wood fragments
    [0, 0.018].forEach((offset) => {
      const t = now + offset;
      const snapBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.16), ctx.sampleRate);
      const sd = snapBuf.getChannelData(0);
      for (let i = 0; i < sd.length; i++) sd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sd.length * 0.14));
      const sSrc = ctx.createBufferSource();
      sSrc.buffer = snapBuf;
      const snapFilt = ctx.createBiquadFilter();
      snapFilt.type = "bandpass";
      snapFilt.frequency.setValueAtTime(1450, t);
      snapFilt.Q.setValueAtTime(4.0, t);
      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0.85, t);
      sGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      sSrc.connect(snapFilt).connect(sGain).connect(master);
      sSrc.start(t);
    });

    // Hollow wood body fracture resonance
    const woodOsc = ctx.createOscillator();
    const woodGain = ctx.createGain();
    woodOsc.type = "triangle";
    woodOsc.frequency.setValueAtTime(340, now);
    woodOsc.frequency.exponentialRampToValueAtTime(120, now + 0.18);
    woodGain.gain.setValueAtTime(0.7, now);
    woodGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    woodOsc.connect(woodGain).connect(master);
    woodOsc.start(now);
    woodOsc.stop(now + 0.24);
  } else {
    // 4. Plastic Melts: Thermal sizzle & soft bubbling melting drip
    const sizzleDur = 0.55;
    const sBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sizzleDur), ctx.sampleRate);
    const sd = sBuf.getChannelData(0);
    for (let i = 0; i < sd.length; i++) sd[i] = (Math.random() * 2 - 1) * 0.5;
    const sSrc = ctx.createBufferSource();
    sSrc.buffer = sBuf;
    const sFilter = ctx.createBiquadFilter();
    sFilter.type = "bandpass";
    sFilter.frequency.setValueAtTime(2600, now);
    sFilter.frequency.exponentialRampToValueAtTime(750, now + sizzleDur);
    sFilter.Q.setValueAtTime(4.5, now);
    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0.001, now);
    sGain.gain.linearRampToValueAtTime(0.65, now + 0.05);
    sGain.gain.exponentialRampToValueAtTime(0.0001, now + sizzleDur);
    sSrc.connect(sFilter).connect(sGain).connect(master);
    sSrc.start(now);

    // Bubbling melting drips
    [0.12, 0.26, 0.38].forEach((dripT, idx) => {
      const t = now + dripT;
      const dripOsc = ctx.createOscillator();
      const dripG = ctx.createGain();
      dripOsc.type = "sine";
      dripOsc.frequency.setValueAtTime(480 - idx * 60, t);
      dripOsc.frequency.exponentialRampToValueAtTime(180 - idx * 30, t + 0.12);
      dripG.gain.setValueAtTime(0.32, t);
      dripG.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      dripOsc.connect(dripG).connect(master);
      dripOsc.start(t);
      dripOsc.stop(t + 0.13);
    });
  }
}

/**
 * Play celebratory critical hit (Nat 20) triumphant audio:
 * Radiant celestial fanfare arpeggio, sparkling bell harmonics & warm victory chord.
 */
export async function playCriticalSuccessSound({
  theme = "default",
}: {
  theme?: string;
} = {}): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.88, now);
  master.connect(ctx.destination);

  if (theme === "matrix") {
    // "The One" digital awakening: green phosphor terminal chime arpeggio (E5, B5, E6, G#6, B6)
    const matrixNotes = [
      { freq: 659.25, time: 0.0 },
      { freq: 987.77, time: 0.05 },
      { freq: 1318.51, time: 0.1 },
      { freq: 1661.22, time: 0.16 },
      { freq: 1975.53, time: 0.24 },
    ];
    matrixNotes.forEach(({ freq, time }) => {
      const t = now + time;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.28, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.72);
    });
    return;
  }

  if (theme === "cyberpunk") {
    // Cyberpunk synthwave fanfare: punchy synth brass triad (D4, F#4, A4) with high neon sparkle
    const cyberNotes = [293.66, 369.99, 440.0, 587.33, 880.0];
    cyberNotes.forEach((freq, i) => {
      const t = now + i * 0.035;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.85);
    });
    return;
  }

  // Radiant triumphant harmonic arpeggio: C5, E5, G5, B5, D6, G6
  const chordNotes = [
    { freq: 523.25, time: 0.0 },   // C5
    { freq: 659.25, time: 0.04 },  // E5
    { freq: 783.99, time: 0.08 },  // G5
    { freq: 987.77, time: 0.12 },  // B5
    { freq: 1174.66, time: 0.16 }, // D6
    { freq: 1567.98, time: 0.22 }, // G6
  ];

  chordNotes.forEach(({ freq, time }) => {
    const t = now + time;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.24, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);

    // Warm sparkling bell shimmer
    const shimmer = ctx.createOscillator();
    const sGain = ctx.createGain();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(freq * 2, t);
    sGain.gain.setValueAtTime(0.08, t);
    sGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

    osc.connect(g).connect(master);
    shimmer.connect(sGain).connect(master);

    osc.start(t);
    osc.stop(t + 0.9);
    shimmer.start(t);
    shimmer.stop(t + 0.5);
  });

  // Deep warm victory foundation chord (C3 + G3)
  [130.81, 196.0].forEach((freq) => {
    const bass = ctx.createOscillator();
    const bg = ctx.createGain();
    bass.type = "sine";
    bass.frequency.setValueAtTime(freq, now + 0.02);
    bg.gain.setValueAtTime(0.001, now + 0.02);
    bg.gain.linearRampToValueAtTime(0.25, now + 0.08);
    bg.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    bass.connect(bg).connect(master);
    bass.start(now + 0.02);
    bass.stop(now + 1.25);
  });
}
