/**
 * Echo cancellation for screen-share audio.
 *
 * Sharing a whole screen with system audio captures everything the computer
 * plays, which includes the room's own voices coming out of this page, so the
 * room hears itself back. Chromium is asked to leave the page's playback out
 * (`restrictOwnAudio`), but it can only do that by process: as soon as an
 * audio router sits in between (SteelSeries Sonar, Voicemeeter, Nahimic) the
 * voices are played again by the router's own process, and the exclusion
 * misses them.
 *
 * So this takes the voices themselves as a reference and subtracts their echo
 * from the capture. Input 0 is the captured audio, input 1 the voices as this
 * page plays them (stereo, each panned as it is heard), output 0 the capture
 * with them removed. Each ear is cancelled against the same ear of the
 * reference.
 *
 * The echo here never crosses a room, only software, so it is a clean delayed
 * and coloured copy of the voices, and a linear filter can take it out almost
 * completely. What makes it hard is that whatever is being shared plays over
 * it the whole time, so the filter has to learn through loud, unrelated sound:
 *
 * - The filters are frequency-domain Kalman filters (Enzner & Vary;
 *   partitioned as in Kuech et al. 2014), which size every step against how
 *   much of the error they cannot explain. Loud shared audio makes them learn
 *   carefully instead of chasing it.
 * - How much a filter has to learn is how many taps it has, so a long one
 *   only searches for the delay, and a short one placed at that delay does
 *   the cancelling: an eighth of the taps to pin down through the noise.
 * - Speex's two-path logic picks which filter is heard: it only changes once
 *   a new one removes measurably more. Without an echo nothing ever does, so
 *   the shared audio passes through as it was.
 *
 * It lives in `public/` for the same reason as `mic-worklet.js`.
 */

/** Samples per block; the output runs one block (≈11 ms) behind the input. */
const FRAME = 512;
const WINDOW = FRAME * 2;
const BINS = FRAME + 1;
/**
 * How late an echo may arrive. Playback, the router and the loopback capture
 * together come to 50–150 ms on a typical Windows machine.
 */
const TAIL_SECONDS = 0.35;
/** Blocks in the short filter: one before the echo's block and two after it, ≈43 ms. */
const SPAN = 4;
const PREEMPH = 0.9;
/** Thresholds assume 16-bit sample values, as in Speex. */
const SCALE = 32768;
/** Kalman filters: starting uncertainty of every weight, how fast it may drift, and its floor. */
const P_START = 0.5;
const A2 = 0.9999;
const P_FLOOR = 1e-6;
/** The long filter never grows this sure of itself, so it keeps looking. */
const SEARCH_P_MIN = 1e-2;
/** Per-block smoothing of the error spectrum the steps are measured against. */
const NOISE_SMOOTH = 0.6;
/** Share of the long filter's energy that must sit in one span before the short filter goes there. */
const LOCK_SHARE = 0.5;
/** Speex's two-path thresholds. */
const VAR1_SMOOTH = 0.36;
const VAR2_SMOOTH = 0.7225;
const VAR1_UPDATE = 0.5;
const VAR2_UPDATE = 0.25;
const VAR_BACKTRACK = 4;

/**
 * A real FFT of WINDOW points, done as a complex FFT of half the size. Speex's
 * scaling: the forward transform is divided by WINDOW, the inverse is not.
 */
class RealFFT {
  constructor(n) {
    const h = n >> 1;
    this.n = n;
    this.h = h;
    const bits = Math.log2(h);
    this.rev = new Uint16Array(h);
    for (let i = 0; i < h; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(h / 2);
    this.sin = new Float64Array(h / 2);
    for (let k = 0; k < h / 2; k++) {
      this.cos[k] = Math.cos((2 * Math.PI * k) / h);
      this.sin[k] = Math.sin((2 * Math.PI * k) / h);
    }
    this.wr = new Float64Array(h);
    this.wi = new Float64Array(h);
    for (let k = 0; k < h; k++) {
      this.wr[k] = Math.cos((2 * Math.PI * k) / n);
      this.wi[k] = Math.sin((2 * Math.PI * k) / n);
    }
    this.re = new Float64Array(h);
    this.im = new Float64Array(h);
  }

  core(inverse) {
    const { re, im, h } = this;
    for (let size = 2; size <= h; size <<= 1) {
      const half = size >> 1;
      const step = h / size;
      for (let i = 0; i < h; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = this.cos[k];
          const wi = inverse ? this.sin[k] : -this.sin[k];
          const a = i + j;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }

  /** x[n] real → outRe/outIm[h + 1], starting at `at`. */
  forward(x, outRe, outIm, at = 0) {
    const { re, im, h, rev, wr, wi } = this;
    for (let k = 0; k < h; k++) {
      re[rev[k]] = x[2 * k];
      im[rev[k]] = x[2 * k + 1];
    }
    this.core(false);
    const s = 1 / this.n;
    outRe[at] = (re[0] + im[0]) * s;
    outIm[at] = 0;
    outRe[at + h] = (re[0] - im[0]) * s;
    outIm[at + h] = 0;
    for (let k = 1; k < h; k++) {
      const zr = re[k];
      const zi = im[k];
      const cr = re[h - k];
      const ci = -im[h - k];
      const er = (zr + cr) * 0.5;
      const ei = (zi + ci) * 0.5;
      const or = (zi - ci) * 0.5;
      const oi = -(zr - cr) * 0.5;
      const c = wr[k];
      const sn = -wi[k];
      outRe[at + k] = (er + or * c - oi * sn) * s;
      outIm[at + k] = (ei + or * sn + oi * c) * s;
    }
  }

  /** inRe/inIm[h + 1] from `at` → x[n] real. */
  inverse(inRe, inIm, x, at = 0) {
    const { re, im, h, rev, wr, wi } = this;
    for (let k = 0; k < h; k++) {
      const ar = inRe[at + k];
      const ai = inIm[at + k];
      const br = inRe[at + h - k];
      const bi = -inIm[at + h - k];
      const er = (ar + br) * 0.5;
      const ei = (ai + bi) * 0.5;
      const dr = (ar - br) * 0.5;
      const di = (ai - bi) * 0.5;
      const or = dr * wr[k] - di * wi[k];
      const oi = dr * wi[k] + di * wr[k];
      re[rev[k]] = er - oi;
      im[rev[k]] = ei + or;
    }
    this.core(true);
    // Unnormalised, like Speex: ×n against the exact inverse's 1/h.
    for (let k = 0; k < h; k++) {
      x[2 * k] = re[k] * 2;
      x[2 * k + 1] = im[k] * 2;
    }
  }
}

/** The reference's recent history: one spectrum per block, newest first. */
class History {
  constructor(blocks) {
    this.blocks = blocks;
    this.Xr = new Float32Array(blocks * BINS);
    this.Xi = new Float32Array(blocks * BINS);
    this.X2 = new Float32Array(blocks * BINS);
    this.head = 0;
  }

  /** Offset into Xr/Xi/X2 of the block `age` blocks back. */
  slot(age) {
    return ((this.head + age) % this.blocks) * BINS;
  }

  push(fft, buf, silent) {
    this.head = (this.head + this.blocks - 1) % this.blocks;
    const s = this.slot(0);
    const { Xr, Xi, X2 } = this;
    if (silent) {
      Xr.fill(0, s, s + BINS);
      Xi.fill(0, s, s + BINS);
      X2.fill(0, s, s + BINS);
      return;
    }
    fft.forward(buf, Xr, Xi, s);
    for (let k = 0; k < BINS; k++) X2[s + k] = Xr[s + k] * Xr[s + k] + Xi[s + k] * Xi[s + k];
  }

  clear() {
    this.Xr.fill(0);
    this.Xi.fill(0);
    this.X2.fill(0);
  }
}

/**
 * A partitioned frequency-domain Kalman filter over `parts` blocks of the
 * history, starting `offset` blocks back. Each weight carries an uncertainty
 * P, and the step it takes is that uncertainty against all of the error the
 * block could not explain.
 */
class Kalman {
  constructor(fft, history, parts, pMin = 0) {
    this.fft = fft;
    this.history = history;
    this.parts = parts;
    // A floor under P keeps a filter able to notice an echo turning up somewhere new.
    this.pMin = pMin;
    this.offset = 0;
    this.Wr = new Float32Array(parts * BINS);
    this.Wi = new Float32Array(parts * BINS);
    this.P = new Float32Array(parts * BINS);
    this.Er = new Float64Array(BINS);
    this.Ei = new Float64Array(BINS);
    this.noise = new Float64Array(BINS);
    this.denom = new Float64Array(BINS);
    this.Yr = new Float64Array(BINS);
    this.Yi = new Float64Array(BINS);
    this.buf = new Float64Array(WINDOW);
    this.reset();
  }

  reset() {
    this.Wr.fill(0);
    this.Wi.fill(0);
    this.P.fill(P_START);
    this.Er.fill(0);
    this.Ei.fill(0);
    this.noise.fill(0);
    this.count = 0;
  }

  /** The estimate for this block: the last FRAME samples of Σ X[offset + j] · W[j]. */
  filter(out) {
    const { Xr, Xi } = this.history;
    const { Wr, Wi, Yr, Yi, buf } = this;
    Yr.fill(0);
    Yi.fill(0);
    for (let j = 0; j < this.parts; j++) {
      const s = this.history.slot(this.offset + j);
      const w = j * BINS;
      for (let k = 0; k < BINS; k++) {
        const xr = Xr[s + k];
        const xi = Xi[s + k];
        const wr = Wr[w + k];
        const wi = Wi[w + k];
        Yr[k] += xr * wr - xi * wi;
        Yi[k] += xr * wi + xi * wr;
      }
    }
    this.fft.inverse(Yr, Yi, buf);
    for (let i = 0; i < FRAME; i++) out[i] = buf[FRAME + i];
  }

  /** Learns from last block's error, against last block's history (one block further back now). */
  adapt() {
    const { Xr, Xi, X2 } = this.history;
    const { Wr, Wi, P, Er, Ei, denom, parts, pMin } = this;
    for (let k = 0; k < BINS; k++) denom[k] = this.noise[k] + 1e-6;
    for (let j = 0; j < parts; j++) {
      const s = this.history.slot(this.offset + j + 1);
      const w = j * BINS;
      for (let k = 0; k < BINS; k++) denom[k] += 0.5 * X2[s + k] * P[w + k];
    }
    for (let j = 0; j < parts; j++) {
      const s = this.history.slot(this.offset + j + 1);
      const w = j * BINS;
      for (let k = 0; k < BINS; k++) {
        const p = P[w + k];
        const mu = p / denom[k];
        const xr = Xr[s + k];
        const xi = Xi[s + k];
        const wr = (Wr[w + k] += mu * (xr * Er[k] + xi * Ei[k]));
        const wi = (Wi[w + k] += mu * (xr * Ei[k] - xi * Er[k]));
        const next = A2 * (1 - 0.5 * mu * X2[s + k]) * p + (1 - A2) * (wr * wr + wi * wi + P_FLOOR);
        P[w + k] = next > pMin ? next : pMin;
      }
    }
    // Alternately updated MDF: keep the weights a linear (not circular)
    // convolution, one block plus the newest each time.
    const { buf, fft } = this;
    for (let j = 0; j < parts; j++) {
      if (j !== 0 && this.count % Math.max(1, parts - 1) !== j - 1) continue;
      const w = j * BINS;
      fft.inverse(Wr, Wi, buf, w);
      buf.fill(0, FRAME);
      fft.forward(buf, Wr, Wi, w);
    }
    this.count++;
  }

  /** Keeps this block's error (time domain) for the next update. */
  remember(e) {
    const { buf, Er, Ei, noise } = this;
    buf.fill(0, 0, FRAME);
    buf.set(e, FRAME);
    this.fft.forward(buf, Er, Ei);
    for (let k = 0; k < BINS; k++) {
      noise[k] = NOISE_SMOOTH * noise[k] + (1 - NOISE_SMOOTH) * (Er[k] * Er[k] + Ei[k] * Ei[k]);
    }
  }

  forget() {
    this.Er.fill(0);
    this.Ei.fill(0);
  }

  /** Energy of each block of weights. */
  energies(out) {
    const { Wr, Wi } = this;
    for (let j = 0; j < this.parts; j++) {
      let sum = 0;
      const w = j * BINS;
      for (let k = 0; k < BINS; k++) sum += Wr[w + k] * Wr[w + k] + Wi[w + k] * Wi[w + k];
      out[j] = sum;
    }
  }

  /** Moves the filter to start `offset` blocks back, keeping the weights that still overlap. */
  moveTo(offset, from) {
    const shift = offset - this.offset;
    const { Wr, Wi, P, parts } = this;
    const order = shift > 0 ? [...Array(parts).keys()] : [...Array(parts).keys()].reverse();
    for (const j of order) {
      const src = j + shift;
      const w = j * BINS;
      if (src >= 0 && src < parts) {
        Wr.copyWithin(w, src * BINS, src * BINS + BINS);
        Wi.copyWithin(w, src * BINS, src * BINS + BINS);
        P.copyWithin(w, src * BINS, src * BINS + BINS);
      } else if (from) {
        // New ground: start from what the long filter found there.
        const f = (offset + j) * BINS;
        Wr.set(from.Wr.subarray(f, f + BINS), w);
        Wi.set(from.Wi.subarray(f, f + BINS), w);
        P.fill(P_START, w, w + BINS);
      } else {
        Wr.fill(0, w, w + BINS);
        Wi.fill(0, w, w + BINS);
        P.fill(P_START, w, w + BINS);
      }
    }
    this.offset = offset;
  }
}

/** One ear: cancels one reference channel out of one capture channel. */
class Canceller {
  constructor(fft) {
    this.fft = fft;
    this.M = Math.max(SPAN, Math.ceil((TAIL_SECONDS * sampleRate) / FRAME));
    // One block more than the filters reach: they learn against last block's history.
    this.history = new History(this.M + 1);
    this.search = new Kalman(fft, this.history, this.M, SEARCH_P_MIN);
    this.near = new Kalman(fft, this.history, SPAN);
    this.locked = false;
    // The filter that is heard, by absolute block, and the blocks it covers.
    this.Fr = new Float32Array(this.M * BINS);
    this.Fi = new Float32Array(this.M * BINS);
    this.fgFrom = 0;
    this.fgTo = 0;
    this.fgY = new Float64Array(BINS);
    this.fgYi = new Float64Array(BINS);
    this.energy = new Float64Array(this.M);
    this.xOld = new Float64Array(FRAME);
    this.x = new Float64Array(FRAME);
    this.d = new Float64Array(FRAME);
    this.yf = new Float64Array(FRAME);
    this.ys = new Float64Array(FRAME);
    this.yn = new Float64Array(FRAME);
    this.es = new Float64Array(FRAME);
    this.en = new Float64Array(FRAME);
    this.buf = new Float64Array(WINDOW);
    this.window = new Float64Array(WINDOW);
    for (let i = 0; i < WINDOW; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WINDOW);
    this.memX = 0;
    this.memD = 0;
    this.memE = 0;
    this.reset();
  }

  reset() {
    this.history.clear();
    this.search.reset();
    this.near.reset();
    this.near.offset = 0;
    this.locked = false;
    this.candidate = -1;
    this.candidateFor = 0;
    this.Fr.fill(0);
    this.Fi.fill(0);
    this.fgFrom = 0;
    this.fgTo = 0;
    this.xOld.fill(0);
    this.blocks = 0;
    this.Davg1 = 0;
    this.Davg2 = 0;
    this.Dvar1 = 0;
    this.Dvar2 = 0;
    this.screwedUp = 0;
    // Blocks of reference in the history that carry any sound; with none,
    // every estimate is zero and all of the work can be skipped.
    this.liveBlocks = 0;
  }

  /** The heard filter's estimate, over just the blocks it has weights in. */
  foreground(out) {
    const { Xr, Xi } = this.history;
    const { Fr, Fi, fgY: Yr, fgYi: Yi, buf } = this;
    Yr.fill(0);
    Yi.fill(0);
    for (let j = this.fgFrom; j < this.fgTo; j++) {
      const s = this.history.slot(j);
      const w = j * BINS;
      for (let k = 0; k < BINS; k++) {
        const xr = Xr[s + k];
        const xi = Xi[s + k];
        const wr = Fr[w + k];
        const wi = Fi[w + k];
        Yr[k] += xr * wr - xi * wi;
        Yi[k] += xr * wi + xi * wr;
      }
    }
    this.fft.inverse(Yr, Yi, buf);
    for (let i = 0; i < FRAME; i++) out[i] = buf[FRAME + i];
  }

  /** Makes `filter` the heard one. */
  promote(filter) {
    this.Fr.fill(0, this.fgFrom * BINS, this.fgTo * BINS);
    this.Fi.fill(0, this.fgFrom * BINS, this.fgTo * BINS);
    this.fgFrom = filter.offset;
    this.fgTo = filter.offset + filter.parts;
    this.Fr.set(filter.Wr, this.fgFrom * BINS);
    this.Fi.set(filter.Wi, this.fgFrom * BINS);
  }

  /**
   * Where is the echo? The span of blocks holding most of the long filter's
   * energy. The short filter follows it there once it has stayed put a
   * moment, so one noisy reading does not throw away what it has learnt.
   */
  locate() {
    const { energy, M } = this;
    this.search.energies(energy);
    let total = 0;
    for (let j = 0; j < M; j++) total += energy[j];
    let best = 0;
    let bestAt = 0;
    for (let at = 0; at + SPAN <= M; at++) {
      let sum = 0;
      for (let j = at; j < at + SPAN; j++) sum += energy[j];
      if (sum > best) {
        best = sum;
        bestAt = at;
      }
    }
    if (total <= 0 || best < LOCK_SHARE * total) {
      this.candidate = -1;
      return;
    }
    if (this.locked && bestAt === this.near.offset) {
      this.candidate = -1;
      return;
    }
    if (bestAt !== this.candidate) {
      this.candidate = bestAt;
      this.candidateFor = 0;
    }
    if (++this.candidateFor < 4) return;
    // The long filter's weights are a head start wherever the short one lands.
    this.near.moveTo(bestAt, this.search);
    if (!this.locked) this.near.P.fill(P_START * 0.1);
    this.locked = true;
    this.candidate = -1;
  }

  /** One block: capture `din` and reference `xin` in, cleaned capture to `out` (all ±1 floats). */
  process(din, xin, out) {
    const { x, d, buf, fft, search, near } = this;
    let Sxx = 0;
    for (let i = 0; i < FRAME; i++) {
      const xs = xin[i] * SCALE;
      x[i] = xs - PREEMPH * this.memX;
      this.memX = xs;
      Sxx += x[i] * x[i];
      const ds = din[i] * SCALE;
      d[i] = ds - PREEMPH * this.memD;
      this.memD = ds;
    }
    const silent = Sxx < FRAME * 1e-2;
    buf.set(this.xOld, 0);
    buf.set(x, FRAME);
    this.history.push(fft, buf, silent && this.xOld[FRAME - 1] === 0);
    this.xOld.set(x);
    this.liveBlocks = silent ? Math.max(0, this.liveBlocks - 1) : this.history.blocks;
    if (this.liveBlocks === 0) {
      // Nothing to cancel: the capture goes through untouched, and the next
      // update must not learn from an error this far out of date.
      search.forget();
      near.forget();
      this.deemphasize(d, out);
      return;
    }

    const { yf, ys, yn, es, en } = this;
    this.foreground(yf);
    let Sff = 0;
    let Sdd = 0;
    for (let i = 0; i < FRAME; i++) {
      const e = d[i] - yf[i];
      Sff += e * e;
      Sdd += d[i] * d[i];
    }

    search.adapt();
    search.filter(ys);
    for (let i = 0; i < FRAME; i++) es[i] = d[i] - ys[i];
    search.remember(es);

    // The background: the short filter once it knows where to sit, the long one until then.
    let bg = search;
    let yb = ys;
    let eb = es;
    if (this.locked) {
      near.adapt();
      near.filter(yn);
      for (let i = 0; i < FRAME; i++) en[i] = d[i] - yn[i];
      bg = near;
      yb = yn;
      eb = en;
    }

    let Dbf = 10;
    let See = 0;
    for (let i = 0; i < FRAME; i++) {
      const diff = yf[i] - yb[i];
      Dbf += diff * diff;
      See += eb[i] * eb[i];
    }

    // Two-path logic (Speex's): is the background now clearly better than
    // what is heard, or clearly worse?
    const delta = Sff - See;
    this.Davg1 = 0.6 * this.Davg1 + 0.4 * delta;
    this.Davg2 = 0.85 * this.Davg2 + 0.15 * delta;
    this.Dvar1 = VAR1_SMOOTH * this.Dvar1 + 0.16 * Sff * Dbf;
    this.Dvar2 = VAR2_SMOOTH * this.Dvar2 + 0.0225 * Sff * Dbf;
    let fade = false;
    if (
      delta * Math.abs(delta) > Sff * Dbf ||
      this.Davg1 * Math.abs(this.Davg1) > VAR1_UPDATE * this.Dvar1 ||
      this.Davg2 * Math.abs(this.Davg2) > VAR2_UPDATE * this.Dvar2
    ) {
      this.Davg1 = this.Davg2 = this.Dvar1 = this.Dvar2 = 0;
      this.promote(bg);
      fade = true;
    } else if (
      bg === near &&
      this.fgFrom === near.offset &&
      this.fgTo === near.offset + near.parts &&
      (-delta * Math.abs(delta) > VAR_BACKTRACK * Sff * Dbf ||
        -this.Davg1 * Math.abs(this.Davg1) > VAR_BACKTRACK * this.Dvar1 ||
        -this.Davg2 * Math.abs(this.Davg2) > VAR_BACKTRACK * this.Dvar2)
    ) {
      // The short filter wandered off: put it back where the heard one is.
      near.Wr.set(this.Fr.subarray(this.fgFrom * BINS, this.fgTo * BINS));
      near.Wi.set(this.Fi.subarray(this.fgFrom * BINS, this.fgTo * BINS));
      for (let i = 0; i < FRAME; i++) en[i] = d[i] - yf[i];
      this.Davg1 = this.Davg2 = this.Dvar1 = this.Dvar2 = 0;
    }
    if (bg === near) near.remember(en);

    if (!Number.isFinite(Sff + See + Sxx)) {
      this.screwedUp += 50;
    } else if (Sff > Sdd + WINDOW * 10000) {
      this.screwedUp++;
    } else {
      this.screwedUp = 0;
    }
    if (this.screwedUp >= 50) {
      // Diverged: start over, and let this block through as it was.
      this.reset();
      this.deemphasize(d, out);
      return;
    }

    // What is heard: the capture minus the heard estimate, cross-faded into
    // the new one when it was just replaced.
    const win = this.window;
    for (let i = 0; i < FRAME; i++) {
      const estimate = fade ? win[i + FRAME] * yf[i] + win[i] * yb[i] : yf[i];
      buf[i] = d[i] - estimate;
    }
    this.deemphasize(buf, out);

    if (++this.blocks % 8 === 0) this.locate();
  }

  deemphasize(e, out) {
    for (let i = 0; i < FRAME; i++) {
      this.memE = e[i] + PREEMPH * this.memE;
      out[i] = this.memE / SCALE;
    }
  }
}

class ScreenEchoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const fft = new RealFFT(WINDOW);
    this.ears = [new Canceller(fft), new Canceller(fft)];
    this.cap = [new Float32Array(FRAME), new Float32Array(FRAME)];
    this.ref = [new Float32Array(FRAME), new Float32Array(FRAME)];
    this.out = [new Float32Array(FRAME), new Float32Array(FRAME)];
    this.fill = 0;
    this.running = true;
    this.port.onmessage = (event) => {
      if (event.data?.type === "stop") this.running = false;
    };
  }

  process(inputs, outputs) {
    const capture = inputs[0] || [];
    const reference = inputs[1] || [];
    const output = outputs[0] || [];
    const length = (output[0] || capture[0] || []).length;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < 2; ch++) {
        const c = capture[ch] || capture[0];
        const r = reference[ch] || reference[0];
        this.cap[ch][this.fill] = c ? c[i] : 0;
        this.ref[ch][this.fill] = r ? r[i] : 0;
        if (output[ch]) output[ch][i] = this.out[ch][this.fill];
      }
      if (++this.fill === FRAME) {
        this.fill = 0;
        for (let ch = 0; ch < 2; ch++) this.ears[ch].process(this.cap[ch], this.ref[ch], this.out[ch]);
      }
    }
    return this.running;
  }
}

registerProcessor("screen-echo", ScreenEchoProcessor);
