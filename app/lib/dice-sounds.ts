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
const SAMPLES = {
  general: {
    surfaces: [
      "surfaces/surface_wood_tray1.mp3",
      "surfaces/surface_wood_tray3.mp3",
      "surfaces/surface_wood_tray5.mp3",
      "surfaces/surface_felt2.mp3",
      "surfaces/surface_felt4.mp3",
      "surfaces/surface_wood_table1.mp3",
    ],
    dicehits: [
      "dicehit/dicehit_plastic1.mp3",
      "dicehit/dicehit_plastic4.mp3",
      "dicehit/dicehit_plastic7.mp3",
      "dicehit/dicehit_plastic10.mp3",
      "dicehit/dicehit_plastic13.mp3",
      "dicehit/dicehit_plastic15.mp3",
    ],
  },
  darkAcademia: {
    surfaces: [
      "surfaces/surface_wood_table1.mp3",
      "surfaces/surface_wood_table3.mp3",
      "surfaces/surface_wood_table5.mp3",
      "surfaces/surface_wood_tray2.mp3",
      "surfaces/surface_wood_tray4.mp3",
    ],
    dicehits: [
      "dicehit/dicehit_wood2.mp3",
      "dicehit/dicehit_wood5.mp3",
      "dicehit/dicehit_wood8.mp3",
      "dicehit/dicehit_wood10.mp3",
      "dicehit/dicehit_plastic3.mp3",
      "dicehit/dicehit_plastic6.mp3",
    ],
  },
  vampire: {
    surfaces: [
      "surfaces/surface_metal1.mp3",
      "surfaces/surface_metal2.mp3",
      "surfaces/surface_metal4.mp3",
      "surfaces/surface_metal6.mp3",
      "surfaces/surface_metal8.mp3",
    ],
    dicehits: [
      "dicehit/dicehit_metal1.mp3",
      "dicehit/dicehit_metal3.mp3",
      "dicehit/dicehit_metal5.mp3",
      "dicehit/dicehit_metal7.mp3",
      "dicehit/dicehit_metal10.mp3",
      "dicehit/dicehit_metal12.mp3",
    ],
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

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function playSample(
  ctx: AudioContext,
  dest: AudioNode,
  buffer: AudioBuffer,
  time: number,
  {
    volume = 1,
    playbackRate = 1,
    detuneCents = 0,
  }: { volume?: number; playbackRate?: number; detuneCents?: number } = {},
): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(playbackRate, time);
  if (source.detune && detuneCents !== 0) {
    source.detune.setValueAtTime(detuneCents, time);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  source.connect(gain);
  gain.connect(dest);

  source.start(time);
  return source;
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
  // Transient click: high-Q bandpass filtered noise
  const noiseLen = 0.04;
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
    theme === "vampire" ? 1800 : theme === "dark-academia" ? 2400 : 3200,
    time,
  );
  bandpass.Q.setValueAtTime(theme === "vampire" ? 4 : 5, time);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.7, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + noiseLen);

  noiseSrc.connect(bandpass).connect(noiseGain).connect(dest);
  noiseSrc.start(time);

  // Resonant acrylic/wood body chime (decaying sine)
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = theme === "dark-academia" ? "triangle" : "sine";
  const baseFreq =
    theme === "vampire"
      ? 620 + Math.random() * 120
      : theme === "dark-academia"
        ? 450 + Math.random() * 100
        : 850 + Math.random() * 200;

  osc.frequency.setValueAtTime(baseFreq, time);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, time + 0.08);

  oscGain.gain.setValueAtTime(volume * 0.5, time);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

  osc.connect(oscGain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.09);

  // Surface tap thud
  const thudOsc = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thudOsc.type = "sine";
  const thudFreq = theme === "vampire" ? 65 : theme === "dark-academia" ? 110 : 140;
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

/**
 * Play a physically realistic, theme- and material-tailored dice rolling audio sequence.
 *
 * Distinct physical choreography for:
 * - 1 die: Solo, clean, isolated drop and crisp single settle.
 * - 2 dice: Staggered paired drop, mid-air die-on-die clash, independent rebounds, dual settle.
 * - 3 dice: Trio spray, cascading cross-collisions, triplet settle.
 * - 4 dice: Handful flurry, continuous ricochets, 4-stage settle cascade.
 * - 5+ dice (capped at 5): Full handful shower, dense tumbling chatter, multi-dice settling rain.
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
  const basePathStr = basePath || "";

  // Resolve acoustic material
  const effectiveMaterial: DiceMaterial =
    material && material !== "auto"
      ? material
      : isVampire
        ? "metal"
        : isDarkAcademia
          ? "wood"
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

  // Pre-fetch sample buffers (or load from cache)
  const surfaceUrls = set.surfaces.map((s) => `${basePathStr}/assets/dice-box-threejs/sounds/${s}`);
  const hitUrls = set.dicehits.map((s) => `${basePathStr}/assets/dice-box-threejs/sounds/${s}`);

  const [surfaceBuffers, hitBuffers] = await Promise.all([
    Promise.all(surfaceUrls.map((u) => loadSoundBuffer(ctx, u))),
    Promise.all(hitUrls.map((u) => loadSoundBuffer(ctx, u))),
  ]);

  if (isCancelled) return;

  const validSurfaces = surfaceBuffers.filter((b): b is AudioBuffer => Boolean(b));
  const validHits = hitBuffers.filter((b): b is AudioBuffer => Boolean(b));

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

  // Cap dice sound tier at 5: rolls of 5, 6, 10, etc. get the rich 5-dice sound tier
  const tier = Math.min(Math.max(1, Math.floor(diceCount || 1)), 5);

  interface Step {
    delay: number;
    volume: number;
    pitch: number;
    isSurface: boolean;
    isClatter: boolean;
  }

  let steps: Step[] = [];

  if (tier === 1) {
    // TIER 1: Solo Die — isolated hits, clean single rebound, solitary definitive settle
    steps = [
      { delay: 0.0, volume: 1.0, pitch: 1.0, isSurface: true, isClatter: true },
      { delay: 0.15, volume: 0.68, pitch: 1.04, isSurface: true, isClatter: true },
      { delay: 0.32, volume: 0.46, pitch: 0.96, isSurface: false, isClatter: true },
      { delay: 0.50, volume: 0.30, pitch: 1.02, isSurface: false, isClatter: true },
      { delay: 0.72, volume: 0.48, pitch: 1.0, isSurface: true, isClatter: true }, // Settle
    ];
  } else if (tier === 2) {
    // TIER 2: Two Dice — paired staggered drops, die-on-die mid-air clash, dual staggered settles
    steps = [
      { delay: 0.0, volume: 0.92, pitch: 0.98, isSurface: true, isClatter: true }, // Die 1 drop
      { delay: 0.034, volume: 0.88, pitch: 1.06, isSurface: true, isClatter: true }, // Die 2 drop
      { delay: 0.115, volume: 0.78, pitch: 1.02, isSurface: false, isClatter: true }, // Die-on-die clash!
      { delay: 0.165, volume: 0.62, pitch: 0.96, isSurface: true, isClatter: true }, // Die 1 rebound
      { delay: 0.215, volume: 0.58, pitch: 1.05, isSurface: true, isClatter: true }, // Die 2 rebound
      { delay: 0.345, volume: 0.52, pitch: 0.98, isSurface: false, isClatter: true }, // Secondary die-die clash
      { delay: 0.51, volume: 0.35, pitch: 1.04, isSurface: false, isClatter: true }, // Roll tick
      { delay: 0.565, volume: 0.32, pitch: 0.95, isSurface: false, isClatter: true }, // Roll tick
      { delay: 0.69, volume: 0.46, pitch: 0.98, isSurface: true, isClatter: true }, // Die 1 settles
      { delay: 0.775, volume: 0.43, pitch: 1.04, isSurface: true, isClatter: true }, // Die 2 settles
    ];
  } else if (tier === 3) {
    // TIER 3: Three Dice — trio drop cascade, frequent die-on-die clashes, triplet settle
    steps = [
      { delay: 0.0, volume: 0.90, pitch: 0.96, isSurface: true, isClatter: true }, // Die 1
      { delay: 0.026, volume: 0.86, pitch: 1.03, isSurface: true, isClatter: true }, // Die 2
      { delay: 0.052, volume: 0.82, pitch: 1.08, isSurface: true, isClatter: true }, // Die 3
      { delay: 0.098, volume: 0.75, pitch: 1.0, isSurface: false, isClatter: true }, // Clash 1-2
      { delay: 0.138, volume: 0.72, pitch: 1.05, isSurface: false, isClatter: true }, // Clash 2-3
      { delay: 0.185, volume: 0.60, pitch: 0.95, isSurface: true, isClatter: true }, // Rebound A
      { delay: 0.235, volume: 0.56, pitch: 1.02, isSurface: true, isClatter: true }, // Rebound B
      { delay: 0.285, volume: 0.52, pitch: 0.98, isSurface: true, isClatter: true }, // Rebound C
      { delay: 0.365, volume: 0.48, pitch: 1.04, isSurface: false, isClatter: true }, // Mid-tumble clash
      { delay: 0.45, volume: 0.38, pitch: 0.97, isSurface: false, isClatter: true }, // Rolling chatter
      { delay: 0.52, volume: 0.34, pitch: 1.06, isSurface: false, isClatter: true }, // Rolling chatter
      { delay: 0.585, volume: 0.30, pitch: 0.94, isSurface: false, isClatter: true }, // Rolling chatter
      { delay: 0.665, volume: 0.44, pitch: 0.97, isSurface: true, isClatter: true }, // Die 1 settles
      { delay: 0.735, volume: 0.42, pitch: 1.03, isSurface: true, isClatter: true }, // Die 2 settles
      { delay: 0.815, volume: 0.40, pitch: 1.07, isSurface: true, isClatter: true }, // Die 3 settles
    ];
  } else if (tier === 4) {
    // TIER 4: Four Dice — flurry of drops, continuous ricochets, 4-stage settle cascade
    steps = [
      { delay: 0.0, volume: 0.88, pitch: 0.94, isSurface: true, isClatter: true },
      { delay: 0.022, volume: 0.84, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.045, volume: 0.80, pitch: 1.06, isSurface: true, isClatter: true },
      { delay: 0.070, volume: 0.78, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.105, volume: 0.74, pitch: 1.03, isSurface: false, isClatter: true }, // Cross-clash
      { delay: 0.145, volume: 0.70, pitch: 0.96, isSurface: false, isClatter: true },
      { delay: 0.185, volume: 0.64, pitch: 1.05, isSurface: true, isClatter: true },
      { delay: 0.235, volume: 0.58, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.285, volume: 0.54, pitch: 1.02, isSurface: false, isClatter: true },
      { delay: 0.345, volume: 0.50, pitch: 0.95, isSurface: true, isClatter: true },
      { delay: 0.42, volume: 0.44, pitch: 1.04, isSurface: false, isClatter: true },
      { delay: 0.485, volume: 0.38, pitch: 0.98, isSurface: false, isClatter: true },
      { delay: 0.55, volume: 0.34, pitch: 1.06, isSurface: false, isClatter: true },
      { delay: 0.645, volume: 0.44, pitch: 0.95, isSurface: true, isClatter: true }, // Settle 1
      { delay: 0.715, volume: 0.42, pitch: 1.01, isSurface: true, isClatter: true }, // Settle 2
      { delay: 0.78, volume: 0.40, pitch: 1.05, isSurface: true, isClatter: true }, // Settle 3
      { delay: 0.855, volume: 0.38, pitch: 0.98, isSurface: true, isClatter: true }, // Settle 4
    ];
  } else {
    // TIER 5 (5+ Dice / 10 Dice): Full Handful Shower — rich multi-dice cascade & settling rain
    steps = [
      { delay: 0.0, volume: 0.86, pitch: 0.92, isSurface: true, isClatter: true },
      { delay: 0.018, volume: 0.84, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.038, volume: 0.82, pitch: 1.04, isSurface: true, isClatter: true },
      { delay: 0.058, volume: 0.80, pitch: 1.09, isSurface: true, isClatter: true },
      { delay: 0.082, volume: 0.76, pitch: 0.95, isSurface: true, isClatter: true },
      { delay: 0.108, volume: 0.74, pitch: 1.02, isSurface: false, isClatter: true }, // Multi clash
      { delay: 0.138, volume: 0.70, pitch: 1.07, isSurface: false, isClatter: true },
      { delay: 0.172, volume: 0.66, pitch: 0.96, isSurface: true, isClatter: true },
      { delay: 0.21, volume: 0.62, pitch: 1.03, isSurface: false, isClatter: true },
      { delay: 0.255, volume: 0.58, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.305, volume: 0.55, pitch: 1.05, isSurface: false, isClatter: true },
      { delay: 0.36, volume: 0.50, pitch: 0.94, isSurface: true, isClatter: true },
      { delay: 0.42, volume: 0.46, pitch: 1.02, isSurface: false, isClatter: true },
      { delay: 0.485, volume: 0.42, pitch: 0.97, isSurface: false, isClatter: true },
      { delay: 0.545, volume: 0.38, pitch: 1.04, isSurface: false, isClatter: true },
      { delay: 0.605, volume: 0.34, pitch: 0.99, isSurface: false, isClatter: true },
      { delay: 0.64, volume: 0.44, pitch: 0.94, isSurface: true, isClatter: true }, // Settle 1
      { delay: 0.695, volume: 0.42, pitch: 0.99, isSurface: true, isClatter: true }, // Settle 2
      { delay: 0.755, volume: 0.40, pitch: 1.04, isSurface: true, isClatter: true }, // Settle 3
      { delay: 0.815, volume: 0.38, pitch: 1.08, isSurface: true, isClatter: true }, // Settle 4
      { delay: 0.88, volume: 0.36, pitch: 0.96, isSurface: true, isClatter: true }, // Settle 5
    ];
  }

  // Pitch modifier for materials
  const materialPitchFactor =
    effectiveMaterial === "glass"
      ? 1.18
      : effectiveMaterial === "metal"
        ? 0.92
        : effectiveMaterial === "wood"
          ? 0.96
          : 1.0;

  for (const s of steps) {
    const t = now + s.delay + (Math.random() * 0.012 - 0.006);
    const rateVariance = (Math.random() * 0.08 - 0.04);
    const finalPlaybackRate = Math.max(0.65, Math.min(1.4, (s.pitch + rateVariance) * materialPitchFactor));

    // 1. Surface impact
    if (s.isSurface) {
      if (validSurfaces.length > 0) {
        const sBuf = randomPick(validSurfaces);
        playSample(ctx, channelOut, sBuf, t, {
          volume: s.volume * 0.88,
          playbackRate: finalPlaybackRate * 0.95,
        });
      } else {
        synthProceduralDiceHit(ctx, channelOut, t, s.volume * 0.7, theme);
      }
    }

    // 2. Dice facet / cross-collision clatter
    if (s.isClatter) {
      if (validHits.length > 0) {
        const hBuf = randomPick(validHits);
        playSample(ctx, channelOut, hBuf, t + 0.008, {
          volume: s.volume * 0.85,
          playbackRate: finalPlaybackRate,
        });
      } else {
        synthProceduralDiceHit(ctx, channelOut, t + 0.008, s.volume * 0.6, theme);
      }
    }
  }
}
