/**
 * The "Singing voice" tuner: a gentle pitch correction for karaoke (or any
 * time), running off the main thread. See `app/lib/voice-effects.ts`, which
 * puts it at the front of the singing-voice graph.
 *
 * Not the robotic hard-tune of a rap record. It finds the note you are
 * singing, works out how far you are off it, and pulls you part of the way
 * there over a few tens of milliseconds, so a flat note comes out nearly in
 * tune and a slide or a vibrato still sounds like you.
 *
 * Pitch: YIN on a 12 kHz copy of the input. Shifting: pitch-synchronous
 * overlap-add (two-period Hann grains, laid down a little closer together or
 * further apart than they were taken), which for the small shifts used here is
 * close to transparent. With no correction to make, the grains go back exactly
 * where they came from and add up to the input unchanged.
 *
 * It lives in `public/` for the same reason as `mic-worklet.js`.
 */

const RATE = 48000;
/** The pitch detector's copy of the signal: 48 kHz / 4. */
const DECIMATE = 4;
const LOW_RATE = RATE / DECIMATE;
/** Singing range the detector looks in. */
const MIN_HZ = 75;
const MAX_HZ = 1100;
const MAX_TAU = Math.ceil(LOW_RATE / MIN_HZ);
const MIN_TAU = Math.floor(LOW_RATE / MAX_HZ);
/** Detector window, in low-rate samples (32 ms), and how often it runs (5.3 ms). */
const WINDOW = 384;
const HOP = 64;
// Lenient: a breathy or noisy sung note still counts as a note.
const YIN_THRESHOLD = 0.25;
/** Below this the input is breath or room, not a note. */
const VOICED_RMS = 0.006;

/** The longest pitch period, at full rate, and the delay that covers its grains. */
const MAX_PERIOD = Math.ceil(RATE / MIN_HZ);
const LATENCY = Math.ceil(2.6 * MAX_PERIOD);
/** Grain half-length when there is no pitch to follow (unvoiced sounds, silence). */
const UNVOICED_PERIOD = 256;
const RING = 8192;
const MASK = RING - 1;

/**
 * How it pulls you in tune. STRENGTH is the share of the error corrected,
 * MAX_SHIFT caps it (semitones; further in a key, where the notes are up to
 * two semitones apart), RETUNE_MS is how quickly it gets there, and a note is
 * only let go for another once that one is NOTE_HYSTERESIS semitones nearer,
 * so a voice halfway between two notes does not flip between them.
 */
const DEFAULT_STRENGTH = 0.85;
const MAX_SHIFT = 0.55;
const MAX_SHIFT_IN_KEY = 1.05;
const RETUNE_MS = 40;
const NOTE_HYSTERESIS = 0.2;
/** After this long without a note, the next one is found afresh. */
const NOTE_FORGET_S = 0.12;

class PitchTuneProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.strength = typeof opts.strength === "number" ? opts.strength : DEFAULT_STRENGTH;

    this.input = new Float32Array(RING);
    this.output = new Float32Array(RING);
    // How much window landed on each output sample. Dividing by it keeps the
    // level exact while grain sizes change with the pitch, or bunch up when
    // the pitch is raised.
    this.weight = new Float32Array(RING);
    this.written = 0; // input samples so far

    // Detector: a 2-pole low-pass ahead of decimation, then a ring of 12 kHz samples.
    this.low = new Float32Array(1024);
    this.lowCount = 0;
    this.sinceYin = 0;
    this.diff = new Float32Array(MAX_TAU + 2);
    const w = (2 * Math.PI * 1500) / RATE;
    const alpha = Math.sin(w) / (2 * 0.707);
    const a0 = 1 + alpha;
    this.lp = {
      b0: (1 - Math.cos(w)) / 2 / a0,
      b1: (1 - Math.cos(w)) / a0,
      b2: (1 - Math.cos(w)) / 2 / a0,
      a1: (-2 * Math.cos(w)) / a0,
      a2: (1 - alpha) / a0,
      x1: 0,
      x2: 0,
      y1: 0,
      y2: 0,
    };

    // Pitch state.
    this.period = UNVOICED_PERIOD; // full-rate samples
    this.voiced = false;
    this.note = null;
    this.unvoicedFor = 0;
    this.shift = 0; // semitones currently applied
    this.ratio = 1;
    this.retune = 1 - Math.exp(-((HOP * DECIMATE) / RATE) / (RETUNE_MS / 1000));
    // The song's key, when the music bot knows it: the notes you are pulled to
    // (pitch classes, C = 0), and how far the song is played off concert pitch
    // (semitones; the DJ booth's tempo matching bends it). Null: every note.
    this.scale = null;
    this.offset = 0;

    // Overlap-add state: the next grain's place in the output, and the input mark it copies.
    this.synthesis = 0;
    this.analysis = 0;
    this.analysisPeriod = UNVOICED_PERIOD;

    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (typeof data.strength === "number") this.strength = Math.max(0, Math.min(1, data.strength));
      if ("scale" in data) {
        this.scale = Array.isArray(data.scale) && data.scale.length ? new Set(data.scale.map((pc) => ((pc % 12) + 12) % 12)) : null;
        this.offset = Number.isFinite(data.offset) ? data.offset : 0;
        this.note = null;
      }
    };
  }

  /** YIN over the newest WINDOW + MAX_TAU low-rate samples. Returns tau, or 0 for no pitch. */
  detect() {
    const ring = this.low;
    const size = ring.length;
    const end = this.lowCount;
    const start = end - WINDOW - MAX_TAU;
    if (start < 0) return 0;
    const at = (i) => ring[(start + i) & (size - 1)];

    let energy = 0;
    for (let j = 0; j < WINDOW; j++) {
      const x = at(j);
      energy += x * x;
    }
    if (Math.sqrt(energy / WINDOW) < VOICED_RMS) return 0;

    const d = this.diff;
    let running = 0;
    d[0] = 1;
    let best = 0;
    for (let tau = 1; tau <= MAX_TAU; tau++) {
      let sum = 0;
      for (let j = 0; j < WINDOW; j++) {
        const delta = at(j) - at(j + tau);
        sum += delta * delta;
      }
      running += sum;
      d[tau] = running > 0 ? (sum * tau) / running : 1;
      if (tau > MIN_TAU + 1 && !best && d[tau - 1] < YIN_THRESHOLD && d[tau - 1] <= d[tau]) {
        best = tau - 1;
        break;
      }
    }
    if (!best) return 0;
    // Parabolic interpolation around the dip for a sub-sample period.
    const a = d[best - 1];
    const b = d[best];
    const c = d[best + 1];
    const denom = a - 2 * b + c;
    return best + (denom !== 0 ? (0.5 * (a - c)) / denom : 0);
  }

  /** The nearest note you could mean: any semitone, or one of the song's key. */
  nearest(midi) {
    if (!this.scale) return Math.round(midi);
    const base = midi - this.offset;
    const round = Math.round(base);
    let best = round;
    let distance = Infinity;
    for (let k = -2; k <= 2; k++) {
      const candidate = round + k;
      if (!this.scale.has(((candidate % 12) + 12) % 12)) continue;
      const d = Math.abs(base - candidate);
      if (d < distance) {
        distance = d;
        best = candidate;
      }
    }
    return best + this.offset;
  }

  /** Runs the detector and moves the correction toward where it should be. */
  analyse() {
    const tau = this.detect();
    let target = 0;
    const hop = (HOP * DECIMATE) / RATE;
    if (tau > 0) {
      const hz = LOW_RATE / tau;
      const midi = 69 + 12 * Math.log2(hz / 440);
      const near = this.nearest(midi);
      if (this.note === null || Math.abs(midi - near) + NOTE_HYSTERESIS < Math.abs(midi - this.note)) this.note = near;
      const error = midi - this.note;
      const cap = this.scale ? MAX_SHIFT_IN_KEY : MAX_SHIFT;
      target = Math.max(-cap, Math.min(cap, -error * this.strength));
      this.period = Math.max(MIN_TAU * DECIMATE, Math.min(MAX_PERIOD, tau * DECIMATE));
      this.voiced = true;
      this.unvoicedFor = 0;
    } else {
      this.voiced = false;
      this.unvoicedFor += hop;
      if (this.unvoicedFor > NOTE_FORGET_S) this.note = null;
    }
    this.shift += (target - this.shift) * this.retune;
    if (!this.voiced && Math.abs(this.shift) < 0.002) this.shift = 0;
    this.ratio = Math.pow(2, this.shift / 12);
  }

  /** Copies the two-period grain centred on input `centre` into the output, centred on `place`. */
  grain(centre, place, half) {
    const length = 2 * half;
    for (let i = 0; i < length; i++) {
      const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / half);
      const offset = i - half;
      const at = (place + offset) & MASK;
      this.output[at] += this.input[(centre + offset) & MASK] * w;
      this.weight[at] += w;
    }
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    const frames = output.length;

    // 1. Take the input in, and feed the detector its decimated copy.
    const lp = this.lp;
    for (let i = 0; i < frames; i++) {
      const x = input ? input[i] : 0;
      this.input[(this.written + i) & MASK] = x;
      const y = lp.b0 * x + lp.b1 * lp.x1 + lp.b2 * lp.x2 - lp.a1 * lp.y1 - lp.a2 * lp.y2;
      lp.x2 = lp.x1;
      lp.x1 = x;
      lp.y2 = lp.y1;
      lp.y1 = y;
      if ((this.written + i) % DECIMATE === 0) {
        this.low[this.lowCount & (this.low.length - 1)] = y;
        this.lowCount++;
        if (++this.sinceYin >= HOP) {
          this.sinceYin = 0;
          this.analyse();
        }
      }
    }
    this.written += frames;

    // 2. Lay down every grain that reaches into the block about to be read.
    const readFrom = this.written - frames - LATENCY;
    const readTo = readFrom + frames;
    while (this.synthesis - MAX_PERIOD < readTo) {
      const half = Math.round(this.voiced ? this.period : UNVOICED_PERIOD);
      if (this.synthesis - half >= readTo) break;
      // The input mark nearest this grain's place: marks step a period at a time,
      // so a grain is repeated (pitch up) or skipped (pitch down) as the two drift.
      while (this.analysis + this.analysisPeriod / 2 < this.synthesis) {
        this.analysis += this.analysisPeriod;
        this.analysisPeriod = half;
      }
      let centre = Math.round(this.analysis);
      const newest = this.written - 1 - half;
      if (centre > newest) centre = newest;
      this.grain(centre, Math.round(this.synthesis), half);
      this.synthesis += half / this.ratio;
    }

    // 3. Read the block out, clearing it behind us for the next lap of the ring.
    for (let i = 0; i < frames; i++) {
      const index = (readFrom + i) & MASK;
      output[i] = readFrom + i >= 0 ? this.output[index] / Math.max(this.weight[index], 0.1) : 0;
      this.output[index] = 0;
      this.weight[index] = 0;
    }
    return true;
  }
}

registerProcessor("pitch-tune", PitchTuneProcessor);
