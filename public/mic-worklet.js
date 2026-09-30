/**
 * The microphone input chain, running off the main thread.
 *
 * Everything you say passes through here on its way to the mesh: gain, a
 * voice-activity gate, and optionally RNNoise. It lives in `public/` rather
 * than the app tree because an AudioWorklet is fetched as a plain classic
 * script by `audioWorklet.addModule()` — the bundler never gets to see it.
 * `public/pdf.worker.mjs` is here for the same reason.
 *
 * RNNoise is optional and arrives late: the main thread compiles the wasm and
 * posts the module in once it is ready. Until then — or forever, if it fails —
 * gain and the gate still work, which matters because they are the half of
 * this people notice.
 */

/** RNNoise is 48 kHz only and wants exactly this many samples per call. */
const FRAME = 480;
/** A worklet is handed audio in blocks of this size and cannot ask for more. */
const QUANTUM = 128;

/**
 * Auto-gain. It levels *you*, not your syllables: what it steers by is a
 * running estimate of how loud your speech is over the last second or so, and
 * the gain it applies may only drift a few dB a second. Chasing each 10 ms
 * frame instead is what makes a voice pump — loud words ducked, quiet ones
 * swelled — and that wobble is most of the difference between "fine" and the
 * smooth, even voice people know from Discord. Peaks the slow loop cannot
 * catch are the limiter's job, not the gain's.
 */
const TARGET_RMS_DB = -20;
const GAIN_MIN_DB = -12;
const GAIN_MAX_DB = 30;
/**
 * Seconds of speech the level estimate averages over, once it has settled.
 * Only speech advances it, so this is seconds of talking, not of clock.
 */
const LEVEL_WINDOW = 1.5;
/** The first moments of a call adapt quickly; after that, gently. */
const WARMUP_SECONDS = 1.5;
const WARMUP_WINDOW = 0.15;
const WARMUP_DB_PER_SEC = 18;
const GAIN_UP_DB_PER_SEC = 3;
const GAIN_DOWN_DB_PER_SEC = 6;
/**
 * A cough or a desk thump lasts a frame or two, and so does a breathy word
 * ending. Capping how far one frame can pull the estimate either way keeps
 * either from moving the next sentence.
 */
const LEVEL_OUTLIER_DB = 10;
/**
 * Never boost the room's own noise above this. A quiet voice in a noisy room
 * is better a little quiet than drowned in hiss that was made twenty dB louder
 * along with it.
 */
const MAX_NOISE_DB = -50;

/**
 * Gate envelope timings, in seconds. Release is slow so word tails survive,
 * and the hold rides over the gaps between words so a sentence reaches the
 * room in one piece rather than chopped at every breath.
 */
const GATE_ATTACK = 0.004;
const GATE_RELEASE = 0.12;
const GATE_HOLD = 0.35;
/**
 * The hold is earned: it grows with how long the sound that opened the gate
 * lasted (twice as long, up to GATE_HOLD). A sentence gets all of it; a gulp
 * or a cough that fooled the detector for a few frames is let go almost at
 * once instead of being stretched into a third of a second of open mic.
 */
const GATE_HOLD_PER_SPEECH = 2;
/**
 * RNNoise's speech probability flickers around any single threshold; opening
 * high and closing lower keeps the gate from chattering on a soft word.
 */
const VAD_OPEN = 0.6;
const VAD_STAY = 0.4;

/**
 * The limiter: a gain that dips just ahead of any peak that would pass
 * -1 dBFS and recovers smoothly afterwards. It works on 1 ms blocks and looks
 * one block ahead, so the dip is a ramp rather than a step — audible as
 * nothing at all, where a clipper would crackle.
 */
const LIMIT = 0.891;
const LIMIT_BLOCK = 48;
const LIMIT_RELEASE = 0.08;

/**
 * Voice clarity: a high-pass under the voice and a gentle cut to the low end.
 *
 * Nothing a voice needs lives below ~90 Hz — only desk thumps, fan rumble and
 * the pop of a "p" — and a microphone close to the mouth (every headset) adds
 * several dB of boom around 100–200 Hz that makes a voice sound muffled and
 * bassy on the other end. The browser's own processing does the high-pass
 * only while echo cancellation is on, so it is done here, first, where the
 * noise floor, the gate and auto-gain all see the cleaned-up signal.
 */
const HIGH_PASS_HZ = 90;
const LOW_SHELF_HZ = 200;
const LOW_SHELF_DB = -4;

/**
 * The noise floor is the quietest frame seen recently, measured over three
 * rotating half-second windows. Tracking a minimum rather than smoothing an
 * average is what makes it robust: a long sentence always has gaps between
 * words for the minimum to find, so the floor never climbs into your own voice
 * and gates you out of your own call. Three seconds of memory is enough that a
 * sustained note does not slowly become "the room" either.
 */
const FLOOR_WINDOW_FRAMES = 50;
const FLOOR_WINDOW_COUNT = 6;
/** How far above the floor counts as speech, when RNNoise is not doing it. */
const SPEECH_MARGIN_DB = 9;

/**
 * Voice focus ("voice" mode): RNNoise can tell speech from noise but not whose
 * speech it is. What it can lean on is distance — the person at the mic is
 * reliably louder than a TV or a flatmate across the room. So we remember how
 * loud *your* speech has been and only let through speech within this many dB
 * of it. The level decays slowly so moving back from the mic is forgiven.
 */
const FOCUS_MARGIN_DB = 12;
const FOCUS_DECAY_DB_PER_SEC = 2;
const FOCUS_START_DB = -45;

const SILENT_DB = -100;

const toDb = (linear) => (linear > 1e-10 ? 20 * Math.log10(linear) : SILENT_DB);
const fromDb = (db) => Math.pow(10, db / 20);
const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

class MicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const settings = (options && options.processorOptions) || {};
    this.mode = settings.mode || "browser";
    this.manualGainDb = settings.gainDb || 0;
    this.autoGain = settings.autoGain !== false;
    // Where auto-gain settled last time on this microphone, so the first words
    // of a call are already at the right level instead of the first seconds.
    this.gainDb = this.autoGain
      ? clamp(Number(settings.initialGainDb) || 0, GAIN_MIN_DB, GAIN_MAX_DB)
      : this.manualGainDb;
    /** "auto", or a dBFS number the user dialled in. */
    this.sensitivity = settings.sensitivity === undefined ? "auto" : settings.sensitivity;
    this.gateEnabled = settings.gate !== false;
    this.clarity = settings.clarity !== false;
    this.equaliser = [
      biquad(highPass(HIGH_PASS_HZ, sampleRate)),
      biquad(lowShelf(LOW_SHELF_HZ, LOW_SHELF_DB, sampleRate)),
    ];

    // Input accumulates until there is a whole frame; output is primed with one
    // frame of silence so the drain never runs dry. That priming, the gate's
    // one frame of lookahead and the limiter's 1 ms are the 21 ms of latency
    // this chain costs.
    this.inBuffer = new Float32Array(FRAME);
    this.inLength = 0;
    this.outBuffer = new Float32Array(FRAME * 4);
    this.outRead = 0;
    this.outWrite = FRAME;
    this.outCount = FRAME;

    // Gate and level state.
    this.gateGain = 0;
    this.holdFrames = 0;
    this.openFrames = 0;
    this.speaking = false;
    this.speechPower = 0;
    this.speechSeconds = 0;
    // The gate looks one frame ahead: each frame is held back until the next
    // has been heard, so a word's first consonant opens the gate in time for
    // itself instead of arriving 10 ms before the gate does.
    this.pending = new Float32Array(FRAME);
    this.pendingOpen = 0;
    // The limiter's one-block lookahead, and the gain it had reached.
    this.limitBlock = new Float32Array(LIMIT_BLOCK);
    this.limitGain = 1;
    this.limitRelease = 1 - Math.exp(-LIMIT_BLOCK / (LIMIT_RELEASE * sampleRate));
    this.output = new Float32Array(FRAME);
    this.floorWindows = new Array(FLOOR_WINDOW_COUNT).fill(Infinity);
    this.floorCurrent = Infinity;
    this.floorFrames = 0;
    this.currentGain = fromDb(this.gainDb);
    this.inputDb = SILENT_DB;
    this.outputDb = SILENT_DB;
    this.vad = 0;
    this.nearSpeechDb = FOCUS_START_DB;
    this.framesSinceReport = 0;

    // RNNoise, once (and if) the main thread hands us a compiled module.
    this.rnnoise = null;
    this.vadFrame = new Float32Array(FRAME);

    this.port.onmessage = (event) => this.handleMessage(event.data);
    this.port.postMessage({ type: "started" });
  }

  handleMessage(message) {
    if (!message) return;

    if (message.type === "settings") {
      if (message.mode !== undefined) this.mode = message.mode;
      if (message.gainDb !== undefined) this.manualGainDb = message.gainDb;
      if (message.autoGain !== undefined) this.autoGain = message.autoGain;
      if (message.sensitivity !== undefined) this.sensitivity = message.sensitivity;
      if (message.gate !== undefined) this.gateEnabled = message.gate;
      if (message.clarity !== undefined) this.clarity = message.clarity;
      // Leaving auto-gain hands control back to the slider immediately rather
      // than drifting there from wherever the AGC happened to be.
      if (message.autoGain === false) this.gainDb = this.manualGainDb;
      return;
    }

    if (message.type === "wasm") {
      try {
        this.rnnoise = instantiateRnnoise(message.bytes);
        this.port.postMessage({ type: "rnnoise", ready: true });
      } catch (error) {
        this.rnnoise = null;
        this.port.postMessage({ type: "rnnoise", ready: false, error: String(error) });
      }
    }
  }

  /** One 480-sample frame: denoise, measure, decide gain and gate. */
  processFrame(frame) {
    // Always run, so switching it off and on again never starts from stale
    // filter state (which clicks); only the result is optional.
    for (const filter of this.equaliser) filter.run(frame, this.clarity);

    let vad = -1;
    const focus = this.mode === "voice";
    if (this.rnnoise) {
      if (this.mode === "rnnoise" || focus) {
        vad = this.rnnoise.process(frame);
      } else {
        // Listening only. The gate still needs to know speech from a swallow,
        // a sip or a click — loudness alone cannot tell them apart, and on
        // loudness alone they all open it — while what you send stays exactly
        // what the chosen mode makes of it.
        this.vadFrame.set(frame);
        vad = this.rnnoise.process(this.vadFrame);
      }
    }

    let sum = 0;
    for (let i = 0; i < FRAME; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / FRAME);
    const rmsDb = toDb(rms);
    this.inputDb = rmsDb;

    if (rms < this.floorCurrent) this.floorCurrent = rms;
    if ((this.floorFrames += 1) >= FLOOR_WINDOW_FRAMES) {
      this.floorFrames = 0;
      this.floorWindows.shift();
      this.floorWindows.push(this.floorCurrent);
      this.floorCurrent = Infinity;
    }
    // The in-progress window counts too, so a room that goes quiet is believed
    // immediately rather than half a second late.
    const floor = Math.min(this.floorCurrent, ...this.floorWindows);
    const floorDb = toDb(floor === Infinity ? rms : floor);

    let speech =
      vad >= 0
        ? vad > (this.speaking ? VAD_STAY : VAD_OPEN)
        : rmsDb > floorDb + (this.speaking ? SPEECH_MARGIN_DB - 3 : SPEECH_MARGIN_DB) &&
          rmsDb > -65;
    this.speaking = speech;

    const secondsPerFrame = FRAME / sampleRate;
    if (focus && speech) {
      // Confident, loud speech teaches us what "you" sound like; everything
      // else only lets the reference drift down slowly.
      const decay = FOCUS_DECAY_DB_PER_SEC * secondsPerFrame;
      if (vad < 0 || vad > 0.85) {
        this.nearSpeechDb = Math.max(rmsDb, this.nearSpeechDb - decay);
      }
      if (rmsDb < this.nearSpeechDb - FOCUS_MARGIN_DB) speech = false;
    }
    this.vad = vad >= 0 ? (speech ? vad : 0) : speech ? 1 : 0;

    // Auto-gain only learns from speech. Adapting during pauses would patiently
    // amplify the room until the next word arrives far too loud.
    if (this.autoGain) {
      if (speech && rmsDb > SILENT_DB) this.learnLevel(rms, floorDb, secondsPerFrame);
    } else {
      this.gainDb = this.manualGainDb;
    }

    // Gate decision. On "auto" we trust the speech detector; on a manual
    // threshold the user is explicitly saying how loud counts as them.
    let open = true;
    if (focus) {
      // Voice focus is the gate; a manual threshold still applies on top.
      open = speech && (this.sensitivity === "auto" || rmsDb > this.sensitivity);
    } else if (this.gateEnabled) {
      open = this.sensitivity === "auto" ? speech : rmsDb > this.sensitivity;
    }
    if (open) {
      this.openFrames += 1;
      this.holdFrames = Math.min(
        Math.ceil(GATE_HOLD / secondsPerFrame),
        this.openFrames * GATE_HOLD_PER_SPEECH,
      );
    } else if (this.holdFrames > 0) {
      this.holdFrames -= 1;
    } else {
      this.openFrames = 0;
    }
    const openNow = open || this.holdFrames > 0 ? 1 : 0;

    // What leaves now is the frame before this one, gated by what both of them
    // decided: if this frame opens the gate, the ramp starts in the last one.
    const out = this.output;
    const gateTarget = Math.max(this.pendingOpen, openNow);
    const targetGain = fromDb(this.gainDb);
    const attack = Math.exp(-1 / (GATE_ATTACK * sampleRate));
    const release = Math.exp(-1 / (GATE_RELEASE * sampleRate));
    const coefficient = gateTarget > this.gateGain ? attack : release;
    for (let i = 0; i < FRAME; i++) {
      this.gateGain = gateTarget + (this.gateGain - gateTarget) * coefficient;
      // Both are ramped: a gate that switches instantly clicks, and a gain
      // that jumps zippers.
      this.currentGain += (targetGain - this.currentGain) * 0.002;
      out[i] = this.pending[i] * this.currentGain * this.gateGain;
    }
    this.pending.set(frame);
    this.pendingOpen = openNow;

    this.limit(out);
    let outSum = 0;
    for (let i = 0; i < FRAME; i++) {
      frame[i] = out[i];
      outSum += out[i] * out[i];
    }
    this.outputDb = toDb(Math.sqrt(outSum / FRAME));

    this.framesSinceReport += 1;
    if (this.framesSinceReport >= 5) {
      this.framesSinceReport = 0;
      this.port.postMessage({
        type: "telemetry",
        inputDb: this.inputDb,
        outputDb: this.outputDb,
        floorDb,
        vad: this.vad,
        gateOpen: this.gateGain > 0.5,
        gainDb: this.gainDb,
      });
    }
  }

  /**
   * One frame of speech into the level estimate, and the gain a step towards
   * whatever puts that level on target.
   */
  learnLevel(rms, floorDb, secondsPerFrame) {
    const warming = this.speechSeconds < WARMUP_SECONDS;
    this.speechSeconds += secondsPerFrame;

    // Averaged as power, so it follows loudness the way ears do, with any
    // single frame's say capped either way.
    const power = rms * rms;
    if (this.speechPower === 0) {
      this.speechPower = power;
    } else {
      const window = warming ? WARMUP_WINDOW : LEVEL_WINDOW;
      const spread = fromDb(LEVEL_OUTLIER_DB);
      const capped = clamp(power, this.speechPower / spread, this.speechPower * spread);
      this.speechPower += (capped - this.speechPower) * (secondsPerFrame / window);
    }
    const levelDb = toDb(Math.sqrt(this.speechPower));

    let desired = clamp(TARGET_RMS_DB - levelDb, GAIN_MIN_DB, GAIN_MAX_DB);
    if (floorDb > -90) desired = Math.min(desired, Math.max(0, MAX_NOISE_DB - floorDb));

    const rate = warming
      ? WARMUP_DB_PER_SEC
      : desired < this.gainDb
        ? GAIN_DOWN_DB_PER_SEC
        : GAIN_UP_DB_PER_SEC;
    const step = rate * secondsPerFrame;
    const delta = desired - this.gainDb;
    this.gainDb += Math.abs(delta) < step ? delta : Math.sign(delta) * step;
  }

  /**
   * Holds `samples` under LIMIT in place, one 1 ms block behind.
   *
   * Each block gets the gain it needs to stay under the ceiling; the gain at a
   * block edge is the lower of its two neighbours' (and of the slow recovery
   * from the last dip), and inside a block it ramps linearly edge to edge. Both
   * ends of every ramp are then at or below what that block needs, so no
   * sample can pass the ceiling, and nothing ever changes in a single step.
   */
  limit(samples) {
    const blocks = FRAME / LIMIT_BLOCK;
    const held = this.limitBlock;
    let needHeld = blockNeed(held, 0);
    for (let b = 0; b < blocks; b++) {
      const offset = b * LIMIT_BLOCK;
      const need = blockNeed(samples, offset);
      const recovered = this.limitGain + (1 - this.limitGain) * this.limitRelease;
      const edge = Math.min(needHeld, need, recovered);
      const from = this.limitGain;
      for (let i = 0; i < LIMIT_BLOCK; i++) {
        const gain = from + ((edge - from) * i) / LIMIT_BLOCK;
        const next = samples[offset + i];
        samples[offset + i] = held[i] * gain;
        held[i] = next;
      }
      this.limitGain = edge;
      needHeld = need;
    }
  }
  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;

    // Push this quantum in, processing whole frames as they complete.
    for (let i = 0; i < QUANTUM; i++) {
      this.inBuffer[this.inLength++] = input ? input[i] : 0;
      if (this.inLength < FRAME) continue;
      this.inLength = 0;
      this.processFrame(this.inBuffer);
      for (let j = 0; j < FRAME; j++) {
        this.outBuffer[this.outWrite] = this.inBuffer[j];
        this.outWrite = (this.outWrite + 1) % this.outBuffer.length;
      }
      this.outCount += FRAME;
    }

    // Drain a quantum back out. Priming the buffer at construction means this
    // only ever underruns if something has gone very wrong.
    for (let i = 0; i < QUANTUM; i++) {
      if (this.outCount > 0) {
        output[i] = this.outBuffer[this.outRead];
        this.outRead = (this.outRead + 1) % this.outBuffer.length;
        this.outCount -= 1;
      } else {
        output[i] = 0;
      }
    }

    return true;
  }
}

/**
 * Biquad coefficients, from the Audio EQ Cookbook (R. Bristow-Johnson), each
 * already divided through by a0.
 */
function highPass(frequency, rate) {
  const w = (2 * Math.PI * frequency) / rate;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  return [(1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
}

function lowShelf(frequency, gainDb, rate) {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * frequency) / rate;
  const cos = Math.cos(w);
  // Shelf slope S = 1: the steepest that stays free of a bump at the corner.
  const alpha = (Math.sin(w) / 2) * Math.SQRT2;
  const root = 2 * Math.sqrt(A) * alpha;
  const a0 = A + 1 + (A - 1) * cos + root;
  return [
    (A * (A + 1 - (A - 1) * cos + root)) / a0,
    (2 * A * (A - 1 - (A + 1) * cos)) / a0,
    (A * (A + 1 - (A - 1) * cos - root)) / a0,
    (-2 * (A - 1 + (A + 1) * cos)) / a0,
    (A + 1 + (A - 1) * cos - root) / a0,
  ];
}

/** One filter with its own memory (transposed direct form II), run in place. */
function biquad([b0, b1, b2, a1, a2]) {
  let z1 = 0;
  let z2 = 0;
  return {
    run(samples, apply) {
      for (let i = 0; i < samples.length; i++) {
        const x = samples[i];
        const y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        if (apply) samples[i] = y;
      }
    },
  };
}

/** The gain that keeps a block of `samples` from `offset` under the ceiling. */
function blockNeed(samples, offset) {
  let peak = 0;
  for (let i = offset; i < offset + LIMIT_BLOCK; i++) {
    const magnitude = samples[i] < 0 ? -samples[i] : samples[i];
    if (magnitude > peak) peak = magnitude;
  }
  return peak > LIMIT ? LIMIT / peak : 1;
}

/**
 * Brings up RNNoise from the raw wasm bytes.
 *
 * The published build is closure-compiled down to two imports and exports its
 * own memory, so the 1.9 MB of emscripten glue that normally ships alongside it
 * is just these twenty lines. Exports are mangled; the names below come from
 * the glue's own table.
 *
 * Compiling here rather than on the main thread is not a preference: a worklet
 * lives in its own agent cluster, and a `WebAssembly.Module` posted across that
 * boundary is dropped without an error on either side. Bytes survive the trip,
 * and synchronous compilation — which the main thread forbids at this size — is
 * allowed here. It costs one audio glitch, once, when you switch the mode on.
 */
function instantiateRnnoise(bytes) {
  const module = new WebAssembly.Module(bytes);
  let memory = null;
  let heapU8 = null;

  const instance = new WebAssembly.Instance(module, {
    a: {
      // emscripten_resize_heap
      a: (requested) => {
        requested >>>= 0;
        if (requested > 2147483648) return 0;
        const pages = Math.ceil((requested - memory.buffer.byteLength) / 65536);
        try {
          memory.grow(pages);
          heapU8 = new Uint8Array(memory.buffer);
          return 1;
        } catch (error) {
          return 0;
        }
      },
      // emscripten_memcpy_big
      b: (dest, src, num) => heapU8.copyWithin(dest, src, src + num),
    },
  });

  const wasm = instance.exports;
  memory = wasm.c;
  heapU8 = new Uint8Array(memory.buffer);
  wasm.d(); // __wasm_call_ctors

  const state = wasm.f(0); // rnnoise_create(NULL)
  const pointer = wasm.g(FRAME * 4); // malloc
  const index = pointer / 4;

  return {
    /** Denoises in place and hands back the frame's speech probability. */
    process(frame) {
      // The heap can move under us when wasm grows, so re-view it each time.
      const heap = new Float32Array(memory.buffer);
      // RNNoise works in int16 units even though the API is float.
      for (let i = 0; i < FRAME; i++) heap[index + i] = frame[i] * 32768;
      const vad = wasm.j(state, pointer, pointer); // rnnoise_process_frame
      const out = new Float32Array(memory.buffer);
      for (let i = 0; i < FRAME; i++) frame[i] = out[index + i] / 32768;
      return vad;
    },
  };
}

registerProcessor("mic-processor", MicProcessor);
