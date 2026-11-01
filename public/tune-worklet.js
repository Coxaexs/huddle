/**
 * The "Singing voice" tuner: autotune for karaoke (or any time), running off
 * the main thread. See `app/lib/voice-effects.ts`, which puts it at the front
 * of the singing-voice graph.
 *
 * It finds the note you are singing and snaps you onto it within a few
 * milliseconds: a flat note comes out dead in tune, and a wobbly one comes
 * out steady, with the clean step between notes you hear on a record. The
 * "natural" style keeps your vibrato and slides and only centres them.
 *
 * Which note you mean: the song's melody when the music bot sends it (so a
 * note sung well off is still pulled onto the right one), else the song's key,
 * else a key it learns from the notes you hold, else the nearest semitone.
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
 * two semitones apart), RETUNE_MS is how quickly it gets there. The note is
 * chosen from your pitch smoothed over CENTRE_MS, so a vibrato is pulled
 * steady rather than read as two notes, and only let go for another once
 * that one is NOTE_HYSTERESIS semitones nearer, so a voice halfway between
 * two notes does not flip between them.
 */
const DEFAULT_STRENGTH = 1;
const MAX_SHIFT = 0.8;
const MAX_SHIFT_IN_KEY = 1.3;
const RETUNE_MS = 5;
const CENTRE_MS = 60;
const NOTE_HYSTERESIS = 0.2;
const NOTE_LEAVE = 0.5;
/** After this long without a note, the next one is found afresh. */
const NOTE_FORGET_S = 0.12;

/**
 * The "natural" style: a slower pull onto the note, and the correction follows
 * your smoothed pitch rather than every wobble, so a vibrato or a slide comes
 * through as you sang it while the note under it still lands in tune.
 */
const NATURAL_RETUNE_MS = 30;
const NATURAL_CENTRE_MS = 220;

/**
 * The song's melody, when the music bot has it (read from the separated vocal
 * stem): a voice up to MELODY_REACH semitones off the note the original singer
 * sings around now is taken to mean that note, in whatever octave you sing it.
 * The room's clock runs a little ahead of what you hear and you sing a little
 * after, so the notes looked at reach MELODY_BEFORE_MS back and MELODY_AFTER_MS on.
 */
const MELODY_REACH = 3.5;
const MELODY_BEFORE_MS = 450;
const MELODY_AFTER_MS = 250;
/** Held notes are kept while still a candidate this much nearer than another. */
const MELODY_HYSTERESIS = 0.6;

/**
 * Learning the key by ear, when the bot does not know it: how long the notes
 * you hold have to add up to (s) before a key is trusted, how often it is
 * re-weighed, and how clearly the best key has to beat the next one.
 */
const LEARN_AFTER_S = 6;
const LEARN_EVERY_S = 0.5;
const LEARN_MARGIN = 0.04;
const LEARN_MIN_FIT = 0.55;
// Krumhansl-Kessler key profiles, from the tonic up.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

/** Pearson correlation of a pitch-class histogram with a profile rotated to `tonic`. */
function keyFit(histogram, profile, tonic) {
  let mh = 0;
  let mp = 0;
  for (let i = 0; i < 12; i++) {
    mh += histogram[i];
    mp += profile[i];
  }
  mh /= 12;
  mp /= 12;
  let num = 0;
  let dh = 0;
  let dp = 0;
  for (let i = 0; i < 12; i++) {
    const h = histogram[(i + tonic) % 12] - mh;
    const p = profile[i] - mp;
    num += h * p;
    dh += h * h;
    dp += p * p;
  }
  return dh > 0 && dp > 0 ? num / Math.sqrt(dh * dp) : 0;
}

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
    this.centre = 0; // smoothed sung pitch (MIDI), valid while this.note is set
    this.unvoicedFor = 0;
    this.shift = 0; // semitones currently applied
    this.ratio = 1;
    this.retune = 1 - Math.exp(-((HOP * DECIMATE) / RATE) / (RETUNE_MS / 1000));
    this.settle = 1 - Math.exp(-((HOP * DECIMATE) / RATE) / (CENTRE_MS / 1000));
    // The song's key, when the music bot knows it: the notes you are pulled to
    // (pitch classes, C = 0), and how far the song is played off concert pitch
    // (semitones; the DJ booth's tempo matching bends it). Null: every note.
    this.scale = null;
    this.offset = 0;
    // The key learnt from what you sing, used while the bot gives none.
    this.histogram = new Float32Array(12);
    this.heldFor = 0;
    this.sinceLearn = 0;
    this.learnt = null;
    // "hard": snapped onto the note, wobbles and all; "natural": see NATURAL_RETUNE_MS.
    this.style = opts.style === "natural" ? "natural" : "hard";
    this.retuneHard = this.retune;
    this.retuneNatural = 1 - Math.exp(-((HOP * DECIMATE) / RATE) / (NATURAL_RETUNE_MS / 1000));
    this.settleHard = this.settle;
    this.settleNatural = 1 - Math.exp(-((HOP * DECIMATE) / RATE) / (NATURAL_CENTRE_MS / 1000));
    if (this.style === "natural") {
      this.retune = this.retuneNatural;
      this.settle = this.settleNatural;
    }
    // The melody: flat [startMs, endMs, midi, ...] sorted by start, and the
    // song's clock (position in ms at a time on this context's clock, in s).
    this.melody = null;
    this.longest = 0;
    this.clock = null;
    this.melodyNote = null;

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
      if (data.style === "hard" || data.style === "natural") {
        this.style = data.style;
        this.retune = data.style === "natural" ? this.retuneNatural : this.retuneHard;
        this.settle = data.style === "natural" ? this.settleNatural : this.settleHard;
      }
      if ("song" in data) {
        // Another song: what was learnt of the last one's key no longer holds.
        this.histogram.fill(0);
        this.heldFor = 0;
        this.learnt = null;
        this.melody = null;
        this.melodyNote = null;
      }
      if ("melody" in data) {
        const notes = Array.isArray(data.melody) || ArrayBuffer.isView(data.melody) ? data.melody : null;
        this.melody = notes && notes.length >= 3 ? Float32Array.from(notes) : null;
        this.longest = 0;
        if (this.melody) {
          for (let i = 0; i + 2 < this.melody.length; i += 3) {
            this.longest = Math.max(this.longest, this.melody[i + 1] - this.melody[i]);
          }
        }
        this.melodyNote = null;
      }
      if ("clock" in data) {
        const clock = data.clock;
        this.clock = clock && Number.isFinite(clock.positionMs) && Number.isFinite(clock.at)
          ? { positionMs: clock.positionMs, at: clock.at, playing: clock.playing !== false }
          : null;
      }
    };
  }

  /** This context's clock (s): the worklet scope's own, else counted from the samples. */
  now() {
    return typeof currentTime === "number" ? currentTime : this.written / RATE;
  }

  /**
   * The melody note you mean, from the notes the original singer sings around
   * now (moved to your octave), or null when there is none near enough.
   */
  melodyTarget(midi) {
    const notes = this.melody;
    const clock = this.clock;
    if (!notes || !clock || !clock.playing) return null;
    const position = clock.positionMs + (this.now() - clock.at) * 1000;
    const from = position - MELODY_BEFORE_MS;
    const to = position + MELODY_AFTER_MS;
    // First note that could still be sounding at `from`: binary search on starts.
    let lo = 0;
    let hi = notes.length / 3;
    const earliest = from - this.longest;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid * 3] < earliest) lo = mid + 1;
      else hi = mid;
    }
    let best = null;
    let distance = Infinity;
    let keep = Infinity;
    for (let i = lo * 3; i + 2 < notes.length && notes[i] <= to; i += 3) {
      if (notes[i + 1] < from) continue;
      const base = notes[i + 2];
      const candidate = base + 12 * Math.round((midi - base) / 12);
      const d = Math.abs(midi - candidate);
      if (d < distance) {
        distance = d;
        best = candidate;
      }
      if (candidate === this.melodyNote) keep = d;
    }
    if (best === null) return null;
    // Between two candidates, stay on the one already held.
    if (this.melodyNote !== null && keep <= MELODY_REACH && keep < distance + MELODY_HYSTERESIS) {
      return this.melodyNote;
    }
    return distance <= MELODY_REACH ? best : null;
  }

  /** Counts a held note towards the key, and re-weighs the key now and then. */
  learn(note, seconds) {
    const pc = ((Math.round(note) % 12) + 12) % 12;
    this.histogram[pc] += seconds;
    this.heldFor += seconds;
    this.sinceLearn += seconds;
    if (this.heldFor < LEARN_AFTER_S || this.sinceLearn < LEARN_EVERY_S) return;
    this.sinceLearn = 0;
    // The best fitting key, and the best one with other notes than it.
    let first = { fit: -1, tonic: 0 };
    const fits = [];
    for (let tonic = 0; tonic < 12; tonic++) {
      fits.push({ fit: keyFit(this.histogram, MAJOR_PROFILE, tonic), tonic });
      // A minor key has its relative major's notes (three semitones up).
      fits.push({ fit: keyFit(this.histogram, MINOR_PROFILE, tonic), tonic: (tonic + 3) % 12 });
    }
    for (const f of fits) if (f.fit > first.fit) first = f;
    let second = -1;
    for (const f of fits) if (f.tonic !== first.tonic && f.fit > second) second = f.fit;
    this.learnt = first.fit >= LEARN_MIN_FIT && first.fit - second >= LEARN_MARGIN
      ? new Set(MAJOR_STEPS.map((step) => (first.tonic + step) % 12))
      : null;
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
    const scale = this.scale || this.learnt;
    if (!scale) return Math.round(midi);
    const offset = this.scale ? this.offset : 0;
    const base = midi - offset;
    const round = Math.round(base);
    let best = round;
    let distance = Infinity;
    for (let k = -2; k <= 2; k++) {
      const candidate = round + k;
      if (!scale.has(((candidate % 12) + 12) % 12)) continue;
      const d = Math.abs(base - candidate);
      if (d < distance) {
        distance = d;
        best = candidate;
      }
    }
    return best + offset;
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
      if (this.note === null) {
        this.centre = midi;
        this.note = near;
      } else {
        this.centre += (midi - this.centre) * this.settle;
        const centreNear = this.nearest(this.centre);
        if (Math.abs(this.centre - centreNear) + NOTE_HYSTERESIS < Math.abs(this.centre - this.note)) {
          this.note = centreNear;
        } else if (Math.abs(midi - near) + NOTE_LEAVE < Math.abs(midi - this.note)) {
          // The voice itself is plainly on another note now (a leap, the end of
          // a slide): go there, and start the average again from it.
          this.note = near;
          this.centre = midi;
        }
      }
      // The melody, where there is one, knows better than any key which note you mean.
      const tune = this.melodyTarget(this.style === "natural" ? this.centre : midi);
      this.melodyNote = tune;
      if (tune !== null) this.note = tune;
      else if (Math.abs(midi - this.centre) < 0.35) this.learn(this.note, hop);
      // Natural: correct where the voice sits, so its vibrato rides on top.
      const error = (this.style === "natural" ? this.centre : midi) - this.note;
      const cap = tune !== null ? MELODY_REACH : this.scale || this.learnt ? MAX_SHIFT_IN_KEY : MAX_SHIFT;
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
