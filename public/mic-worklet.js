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

/** Where auto-gain tries to land speech. Loud enough to hear, far from clipping. */
const TARGET_RMS_DB = -18;
const GAIN_MIN_DB = -12;
const GAIN_MAX_DB = 30;
/** Turning down is a clipping emergency; turning up can afford to be gentle. */
const GAIN_DOWN_DB_PER_SEC = 40;
const GAIN_UP_DB_PER_SEC = 6;

/** Gate envelope timings, in seconds. Release is slow so word tails survive. */
const GATE_ATTACK = 0.005;
const GATE_RELEASE = 0.08;
const GATE_HOLD = 0.25;

/** Where the soft knee starts, -1 dBFS. Above this the curve bends to 0 dBFS. */
const LIMIT = 0.891;

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

const SILENT_DB = -100;

const toDb = (linear) => (linear > 1e-10 ? 20 * Math.log10(linear) : SILENT_DB);
const fromDb = (db) => Math.pow(10, db / 20);
const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

class MicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const settings = (options && options.processorOptions) || {};
    this.mode = settings.mode || "browser";
    this.gainDb = 0;
    this.manualGainDb = settings.gainDb || 0;
    this.autoGain = settings.autoGain !== false;
    /** "auto", or a dBFS number the user dialled in. */
    this.sensitivity = settings.sensitivity === undefined ? "auto" : settings.sensitivity;
    this.gateEnabled = settings.gate !== false;

    // Input accumulates until there is a whole frame; output is primed with one
    // frame of silence so the drain never runs dry. That priming is the 10 ms
    // of latency this chain costs.
    this.inBuffer = new Float32Array(FRAME);
    this.inLength = 0;
    this.outBuffer = new Float32Array(FRAME * 4);
    this.outRead = 0;
    this.outWrite = FRAME;
    this.outCount = FRAME;

    // Gate and level state.
    this.gateGain = 0;
    this.gateTarget = 0;
    this.holdFrames = 0;
    this.floorWindows = new Array(FLOOR_WINDOW_COUNT).fill(Infinity);
    this.floorCurrent = Infinity;
    this.floorFrames = 0;
    this.currentGain = 1;
    this.inputDb = SILENT_DB;
    this.outputDb = SILENT_DB;
    this.vad = 0;
    this.framesSinceReport = 0;

    // RNNoise, once (and if) the main thread hands us a compiled module.
    this.rnnoise = null;

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
    let vad = -1;
    if (this.rnnoise && this.mode === "rnnoise") {
      vad = this.rnnoise.process(frame);
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

    const speech =
      vad >= 0 ? vad > 0.6 : rmsDb > floorDb + SPEECH_MARGIN_DB && rmsDb > -65;
    this.vad = vad >= 0 ? vad : speech ? 1 : 0;

    // Auto-gain only learns from speech. Adapting during pauses would patiently
    // amplify the room until the next word arrives far too loud.
    if (this.autoGain) {
      if (speech && rmsDb > SILENT_DB) {
        const desired = clamp(TARGET_RMS_DB - rmsDb, GAIN_MIN_DB, GAIN_MAX_DB);
        const secondsPerFrame = FRAME / sampleRate;
        const step =
          (desired < this.gainDb ? GAIN_DOWN_DB_PER_SEC : GAIN_UP_DB_PER_SEC) *
          secondsPerFrame;
        const delta = desired - this.gainDb;
        this.gainDb += Math.abs(delta) < step ? delta : Math.sign(delta) * step;
      }
    } else {
      this.gainDb = this.manualGainDb;
    }

    // Gate decision. On "auto" we trust the speech detector; on a manual
    // threshold the user is explicitly saying how loud counts as them.
    let open = true;
    if (this.gateEnabled) {
      open = this.sensitivity === "auto" ? speech : rmsDb > this.sensitivity;
    }
    if (open) this.holdFrames = Math.ceil(GATE_HOLD / (FRAME / sampleRate));
    else if (this.holdFrames > 0) this.holdFrames -= 1;
    this.gateTarget = open || this.holdFrames > 0 ? 1 : 0;

    // Apply gain and the gate envelope per sample. Both are ramped: a gate that
    // switches instantly clicks, and a gain that jumps zippers.
    const targetGain = fromDb(this.gainDb);
    const attack = Math.exp(-1 / (GATE_ATTACK * sampleRate));
    const release = Math.exp(-1 / (GATE_RELEASE * sampleRate));
    let peak = 0;
    let outSum = 0;
    for (let i = 0; i < FRAME; i++) {
      const coefficient = this.gateTarget > this.gateGain ? attack : release;
      this.gateGain = this.gateTarget + (this.gateGain - this.gateTarget) * coefficient;
      this.currentGain += (targetGain - this.currentGain) * 0.02;

      let sample = frame[i] * this.currentGain * this.gateGain;
      const magnitude = sample < 0 ? -sample : sample;
      if (magnitude > LIMIT) {
        // Soft knee above the ceiling: audible as compression, never as clipping.
        const over = (magnitude - LIMIT) / (1 - LIMIT);
        sample = (sample < 0 ? -1 : 1) * (LIMIT + (1 - LIMIT) * Math.tanh(over));
      }
      frame[i] = sample;
      const absolute = sample < 0 ? -sample : sample;
      if (absolute > peak) peak = absolute;
      outSum += sample * sample;
    }
    this.outputDb = toDb(Math.sqrt(outSum / FRAME));

    // A frame that still peaks near full scale means the AGC is behind; pull it
    // down now rather than waiting for the slow loop to notice.
    if (this.autoGain && peak > 0.99) this.gainDb = Math.max(GAIN_MIN_DB, this.gainDb - 1);

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
