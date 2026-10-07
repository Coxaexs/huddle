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

  // Cap dice sound tier at 10: rolls of 1 through 10 (and above) get unique choreography
  const tier = Math.min(Math.max(1, Math.floor(diceCount || 1)), 10);

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
      { delay: 0.0, volume: 0.92, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.034, volume: 0.88, pitch: 1.06, isSurface: true, isClatter: true },
      { delay: 0.115, volume: 0.78, pitch: 1.02, isSurface: false, isClatter: true },
      { delay: 0.165, volume: 0.62, pitch: 0.96, isSurface: true, isClatter: true },
      { delay: 0.215, volume: 0.58, pitch: 1.05, isSurface: true, isClatter: true },
      { delay: 0.345, volume: 0.52, pitch: 0.98, isSurface: false, isClatter: true },
      { delay: 0.51, volume: 0.35, pitch: 1.04, isSurface: false, isClatter: true },
      { delay: 0.565, volume: 0.32, pitch: 0.95, isSurface: false, isClatter: true },
      { delay: 0.69, volume: 0.46, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.775, volume: 0.43, pitch: 1.04, isSurface: true, isClatter: true },
    ];
  } else if (tier === 3) {
    // TIER 3: Three Dice — trio drop cascade, frequent die-on-die clashes, triplet settle
    steps = [
      { delay: 0.0, volume: 0.90, pitch: 0.96, isSurface: true, isClatter: true },
      { delay: 0.026, volume: 0.86, pitch: 1.03, isSurface: true, isClatter: true },
      { delay: 0.052, volume: 0.82, pitch: 1.08, isSurface: true, isClatter: true },
      { delay: 0.098, volume: 0.75, pitch: 1.0, isSurface: false, isClatter: true },
      { delay: 0.138, volume: 0.72, pitch: 1.05, isSurface: false, isClatter: true },
      { delay: 0.185, volume: 0.60, pitch: 0.95, isSurface: true, isClatter: true },
      { delay: 0.235, volume: 0.56, pitch: 1.02, isSurface: true, isClatter: true },
      { delay: 0.285, volume: 0.52, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.365, volume: 0.48, pitch: 1.04, isSurface: false, isClatter: true },
      { delay: 0.45, volume: 0.38, pitch: 0.97, isSurface: false, isClatter: true },
      { delay: 0.52, volume: 0.34, pitch: 1.06, isSurface: false, isClatter: true },
      { delay: 0.585, volume: 0.30, pitch: 0.94, isSurface: false, isClatter: true },
      { delay: 0.665, volume: 0.44, pitch: 0.97, isSurface: true, isClatter: true },
      { delay: 0.735, volume: 0.42, pitch: 1.03, isSurface: true, isClatter: true },
      { delay: 0.815, volume: 0.40, pitch: 1.07, isSurface: true, isClatter: true },
    ];
  } else if (tier === 4) {
    // TIER 4: Four Dice — flurry of drops, continuous ricochets, 4-stage settle cascade
    steps = [
      { delay: 0.0, volume: 0.88, pitch: 0.94, isSurface: true, isClatter: true },
      { delay: 0.022, volume: 0.84, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.045, volume: 0.80, pitch: 1.06, isSurface: true, isClatter: true },
      { delay: 0.070, volume: 0.78, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.105, volume: 0.74, pitch: 1.03, isSurface: false, isClatter: true },
      { delay: 0.145, volume: 0.70, pitch: 0.96, isSurface: false, isClatter: true },
      { delay: 0.185, volume: 0.64, pitch: 1.05, isSurface: true, isClatter: true },
      { delay: 0.235, volume: 0.58, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.285, volume: 0.54, pitch: 1.02, isSurface: false, isClatter: true },
      { delay: 0.345, volume: 0.50, pitch: 0.95, isSurface: true, isClatter: true },
      { delay: 0.42, volume: 0.44, pitch: 1.04, isSurface: false, isClatter: true },
      { delay: 0.485, volume: 0.38, pitch: 0.98, isSurface: false, isClatter: true },
      { delay: 0.55, volume: 0.34, pitch: 1.06, isSurface: false, isClatter: true },
      { delay: 0.645, volume: 0.44, pitch: 0.95, isSurface: true, isClatter: true },
      { delay: 0.715, volume: 0.42, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.78, volume: 0.40, pitch: 1.05, isSurface: true, isClatter: true },
      { delay: 0.855, volume: 0.38, pitch: 0.98, isSurface: true, isClatter: true },
    ];
  } else if (tier === 5) {
    // TIER 5: Five Dice — 5-dice flurry, dense mid-tumble clashes, 5-stage settle cascade
    steps = [
      { delay: 0.0, volume: 0.86, pitch: 0.92, isSurface: true, isClatter: true },
      { delay: 0.018, volume: 0.84, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.038, volume: 0.82, pitch: 1.04, isSurface: true, isClatter: true },
      { delay: 0.058, volume: 0.80, pitch: 1.09, isSurface: true, isClatter: true },
      { delay: 0.082, volume: 0.76, pitch: 0.95, isSurface: true, isClatter: true },
      { delay: 0.108, volume: 0.74, pitch: 1.02, isSurface: false, isClatter: true },
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
      { delay: 0.64, volume: 0.44, pitch: 0.94, isSurface: true, isClatter: true },
      { delay: 0.695, volume: 0.42, pitch: 0.99, isSurface: true, isClatter: true },
      { delay: 0.755, volume: 0.40, pitch: 1.04, isSurface: true, isClatter: true },
      { delay: 0.815, volume: 0.38, pitch: 1.08, isSurface: true, isClatter: true },
      { delay: 0.88, volume: 0.36, pitch: 0.96, isSurface: true, isClatter: true },
    ];
  } else if (tier === 6) {
    // TIER 6: Six Dice — heavier spray, rolling tumble wash, 6 settles
    steps = [
      { delay: 0.0, volume: 0.85, pitch: 0.91, isSurface: true, isClatter: true },
      { delay: 0.016, volume: 0.83, pitch: 0.97, isSurface: true, isClatter: true },
      { delay: 0.033, volume: 0.81, pitch: 1.03, isSurface: true, isClatter: true },
      { delay: 0.051, volume: 0.79, pitch: 1.08, isSurface: true, isClatter: true },
      { delay: 0.070, volume: 0.77, pitch: 0.94, isSurface: true, isClatter: true },
      { delay: 0.090, volume: 0.75, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.115, volume: 0.72, pitch: 1.05, isSurface: false, isClatter: true },
      { delay: 0.145, volume: 0.68, pitch: 0.97, isSurface: false, isClatter: true },
      { delay: 0.180, volume: 0.64, pitch: 1.02, isSurface: true, isClatter: true },
      { delay: 0.220, volume: 0.60, pitch: 0.96, isSurface: false, isClatter: true },
      { delay: 0.265, volume: 0.56, pitch: 1.04, isSurface: true, isClatter: true },
      { delay: 0.315, volume: 0.52, pitch: 0.98, isSurface: false, isClatter: true },
      { delay: 0.370, volume: 0.48, pitch: 1.02, isSurface: true, isClatter: true },
      { delay: 0.430, volume: 0.44, pitch: 0.95, isSurface: false, isClatter: true },
      { delay: 0.490, volume: 0.40, pitch: 1.03, isSurface: false, isClatter: true },
      { delay: 0.550, volume: 0.36, pitch: 0.98, isSurface: false, isClatter: true },
      { delay: 0.630, volume: 0.44, pitch: 0.93, isSurface: true, isClatter: true },
      { delay: 0.680, volume: 0.42, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.735, volume: 0.40, pitch: 1.03, isSurface: true, isClatter: true },
      { delay: 0.790, volume: 0.38, pitch: 1.07, isSurface: true, isClatter: true },
      { delay: 0.850, volume: 0.36, pitch: 0.95, isSurface: true, isClatter: true },
      { delay: 0.910, volume: 0.34, pitch: 1.02, isSurface: true, isClatter: true },
    ];
  } else if (tier === 7) {
    // TIER 7: Seven Dice — wide scatter pattern, continuous clatter, 7 settles
    steps = [
      { delay: 0.0, volume: 0.84, pitch: 0.90, isSurface: true, isClatter: true },
      { delay: 0.014, volume: 0.82, pitch: 0.96, isSurface: true, isClatter: true },
      { delay: 0.029, volume: 0.80, pitch: 1.02, isSurface: true, isClatter: true },
      { delay: 0.045, volume: 0.78, pitch: 1.07, isSurface: true, isClatter: true },
      { delay: 0.062, volume: 0.76, pitch: 0.93, isSurface: true, isClatter: true },
      { delay: 0.080, volume: 0.74, pitch: 0.99, isSurface: true, isClatter: true },
      { delay: 0.100, volume: 0.72, pitch: 1.04, isSurface: true, isClatter: true },
      { delay: 0.122, volume: 0.70, pitch: 1.06, isSurface: false, isClatter: true },
      { delay: 0.150, volume: 0.66, pitch: 0.98, isSurface: false, isClatter: true },
      { delay: 0.185, volume: 0.62, pitch: 1.03, isSurface: true, isClatter: true },
      { delay: 0.225, volume: 0.58, pitch: 0.95, isSurface: false, isClatter: true },
      { delay: 0.270, volume: 0.54, pitch: 1.02, isSurface: true, isClatter: true },
      { delay: 0.320, volume: 0.50, pitch: 0.97, isSurface: false, isClatter: true },
      { delay: 0.375, volume: 0.46, pitch: 1.04, isSurface: true, isClatter: true },
      { delay: 0.435, volume: 0.42, pitch: 0.96, isSurface: false, isClatter: true },
      { delay: 0.495, volume: 0.38, pitch: 1.02, isSurface: false, isClatter: true },
      { delay: 0.555, volume: 0.34, pitch: 0.97, isSurface: false, isClatter: true },
      { delay: 0.625, volume: 0.43, pitch: 0.92, isSurface: true, isClatter: true },
      { delay: 0.670, volume: 0.41, pitch: 0.97, isSurface: true, isClatter: true },
      { delay: 0.720, volume: 0.39, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.770, volume: 0.37, pitch: 1.06, isSurface: true, isClatter: true },
      { delay: 0.825, volume: 0.35, pitch: 0.94, isSurface: true, isClatter: true },
      { delay: 0.880, volume: 0.33, pitch: 1.00, isSurface: true, isClatter: true },
      { delay: 0.940, volume: 0.31, pitch: 1.05, isSurface: true, isClatter: true },
    ];
  } else if (tier === 8) {
    // TIER 8: Eight Dice — dense tumble storm, cross-boundary collisions, 8 settles
    steps = [
      { delay: 0.0, volume: 0.83, pitch: 0.89, isSurface: true, isClatter: true },
      { delay: 0.013, volume: 0.81, pitch: 0.95, isSurface: true, isClatter: true },
      { delay: 0.026, volume: 0.79, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.040, volume: 0.77, pitch: 1.06, isSurface: true, isClatter: true },
      { delay: 0.055, volume: 0.75, pitch: 0.92, isSurface: true, isClatter: true },
      { delay: 0.071, volume: 0.73, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.089, volume: 0.71, pitch: 1.03, isSurface: true, isClatter: true },
      { delay: 0.108, volume: 0.69, pitch: 1.07, isSurface: true, isClatter: true },
      { delay: 0.130, volume: 0.68, pitch: 1.04, isSurface: false, isClatter: true },
      { delay: 0.158, volume: 0.65, pitch: 0.96, isSurface: false, isClatter: true },
      { delay: 0.190, volume: 0.61, pitch: 1.02, isSurface: true, isClatter: true },
      { delay: 0.228, volume: 0.57, pitch: 0.94, isSurface: false, isClatter: true },
      { delay: 0.272, volume: 0.53, pitch: 1.03, isSurface: true, isClatter: true },
      { delay: 0.322, volume: 0.49, pitch: 0.97, isSurface: false, isClatter: true },
      { delay: 0.375, volume: 0.45, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.432, volume: 0.41, pitch: 0.95, isSurface: false, isClatter: true },
      { delay: 0.490, volume: 0.37, pitch: 1.02, isSurface: false, isClatter: true },
      { delay: 0.548, volume: 0.33, pitch: 0.96, isSurface: false, isClatter: true },
      { delay: 0.620, volume: 0.42, pitch: 0.91, isSurface: true, isClatter: true },
      { delay: 0.660, volume: 0.40, pitch: 0.96, isSurface: true, isClatter: true },
      { delay: 0.705, volume: 0.38, pitch: 1.00, isSurface: true, isClatter: true },
      { delay: 0.750, volume: 0.36, pitch: 1.05, isSurface: true, isClatter: true },
      { delay: 0.800, volume: 0.34, pitch: 0.93, isSurface: true, isClatter: true },
      { delay: 0.850, volume: 0.32, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.905, volume: 0.30, pitch: 1.03, isSurface: true, isClatter: true },
      { delay: 0.965, volume: 0.28, pitch: 1.07, isSurface: true, isClatter: true },
    ];
  } else if (tier === 9) {
    // TIER 9: Nine Dice — torrential roll cascade, dense micro-chatter, 9 settles
    steps = [
      { delay: 0.0, volume: 0.82, pitch: 0.88, isSurface: true, isClatter: true },
      { delay: 0.012, volume: 0.80, pitch: 0.94, isSurface: true, isClatter: true },
      { delay: 0.024, volume: 0.78, pitch: 1.00, isSurface: true, isClatter: true },
      { delay: 0.037, volume: 0.76, pitch: 1.05, isSurface: true, isClatter: true },
      { delay: 0.051, volume: 0.74, pitch: 0.91, isSurface: true, isClatter: true },
      { delay: 0.066, volume: 0.72, pitch: 0.97, isSurface: true, isClatter: true },
      { delay: 0.082, volume: 0.70, pitch: 1.02, isSurface: true, isClatter: true },
      { delay: 0.099, volume: 0.68, pitch: 1.06, isSurface: true, isClatter: true },
      { delay: 0.117, volume: 0.66, pitch: 0.93, isSurface: true, isClatter: true },
      { delay: 0.138, volume: 0.65, pitch: 1.03, isSurface: false, isClatter: true },
      { delay: 0.165, volume: 0.62, pitch: 0.95, isSurface: false, isClatter: true },
      { delay: 0.198, volume: 0.58, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.235, volume: 0.54, pitch: 0.94, isSurface: false, isClatter: true },
      { delay: 0.278, volume: 0.50, pitch: 1.02, isSurface: true, isClatter: true },
      { delay: 0.328, volume: 0.46, pitch: 0.96, isSurface: false, isClatter: true },
      { delay: 0.380, volume: 0.42, pitch: 1.00, isSurface: true, isClatter: true },
      { delay: 0.435, volume: 0.38, pitch: 0.94, isSurface: false, isClatter: true },
      { delay: 0.490, volume: 0.35, pitch: 1.01, isSurface: false, isClatter: true },
      { delay: 0.545, volume: 0.32, pitch: 0.95, isSurface: false, isClatter: true },
      { delay: 0.640, volume: 0.41, pitch: 0.90, isSurface: true, isClatter: true },
      { delay: 0.680, volume: 0.39, pitch: 0.95, isSurface: true, isClatter: true },
      { delay: 0.720, volume: 0.37, pitch: 0.99, isSurface: true, isClatter: true },
      { delay: 0.765, volume: 0.35, pitch: 1.04, isSurface: true, isClatter: true },
      { delay: 0.810, volume: 0.33, pitch: 0.92, isSurface: true, isClatter: true },
      { delay: 0.858, volume: 0.31, pitch: 0.97, isSurface: true, isClatter: true },
      { delay: 0.910, volume: 0.29, pitch: 1.02, isSurface: true, isClatter: true },
      { delay: 0.965, volume: 0.27, pitch: 1.06, isSurface: true, isClatter: true },
      { delay: 1.025, volume: 0.25, pitch: 0.95, isSurface: true, isClatter: true },
    ];
  } else {
    // TIER 10 (10+ Dice): Grand Handful Roar — 10 distinct drops, massive continuous colliding wash & 10 settles
    steps = [
      { delay: 0.0, volume: 0.80, pitch: 0.87, isSurface: true, isClatter: true },
      { delay: 0.010, volume: 0.78, pitch: 0.93, isSurface: true, isClatter: true },
      { delay: 0.021, volume: 0.77, pitch: 0.99, isSurface: true, isClatter: true },
      { delay: 0.033, volume: 0.75, pitch: 1.04, isSurface: true, isClatter: true },
      { delay: 0.046, volume: 0.73, pitch: 0.90, isSurface: true, isClatter: true },
      { delay: 0.060, volume: 0.71, pitch: 0.96, isSurface: true, isClatter: true },
      { delay: 0.075, volume: 0.69, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.091, volume: 0.67, pitch: 1.05, isSurface: true, isClatter: true },
      { delay: 0.108, volume: 0.65, pitch: 0.92, isSurface: true, isClatter: true },
      { delay: 0.126, volume: 0.63, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.145, volume: 0.62, pitch: 1.02, isSurface: false, isClatter: true },
      { delay: 0.170, volume: 0.59, pitch: 0.94, isSurface: false, isClatter: true },
      { delay: 0.200, volume: 0.56, pitch: 1.00, isSurface: true, isClatter: true },
      { delay: 0.235, volume: 0.52, pitch: 0.93, isSurface: false, isClatter: true },
      { delay: 0.275, volume: 0.48, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.320, volume: 0.44, pitch: 0.95, isSurface: false, isClatter: true },
      { delay: 0.370, volume: 0.40, pitch: 0.99, isSurface: true, isClatter: true },
      { delay: 0.425, volume: 0.36, pitch: 0.93, isSurface: false, isClatter: true },
      { delay: 0.480, volume: 0.33, pitch: 1.00, isSurface: false, isClatter: true },
      { delay: 0.535, volume: 0.30, pitch: 0.94, isSurface: false, isClatter: true },
      { delay: 0.660, volume: 0.40, pitch: 0.89, isSurface: true, isClatter: true },
      { delay: 0.700, volume: 0.38, pitch: 0.94, isSurface: true, isClatter: true },
      { delay: 0.740, volume: 0.36, pitch: 0.98, isSurface: true, isClatter: true },
      { delay: 0.785, volume: 0.34, pitch: 1.03, isSurface: true, isClatter: true },
      { delay: 0.830, volume: 0.32, pitch: 0.91, isSurface: true, isClatter: true },
      { delay: 0.875, volume: 0.30, pitch: 0.96, isSurface: true, isClatter: true },
      { delay: 0.925, volume: 0.28, pitch: 1.01, isSurface: true, isClatter: true },
      { delay: 0.978, volume: 0.26, pitch: 1.05, isSurface: true, isClatter: true },
      { delay: 1.035, volume: 0.24, pitch: 0.94, isSurface: true, isClatter: true },
      { delay: 1.095, volume: 0.22, pitch: 0.99, isSurface: true, isClatter: true },
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
