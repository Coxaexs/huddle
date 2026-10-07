/**
 * Turkish: EMA Lightning (canberkkkkkk/ema-lightning, Apache-2.0), run from
 * its ONNX export (ozcancelik/ema-lightning-onnx, Apache-2.0). This is a
 * TypeScript port of that repository's web/tts.js, which mirrors
 * ema_lightning's frontend.py, chunker.py and engine.py. Output is 48 kHz.
 */
import { cachedBytes, concat, f32, i64, session } from "./runtime";

const MODEL = "https://huggingface.co/ozcancelik/ema-lightning-onnx/resolve/13c431db0356b2f7fafb1247cd823ec0d777c820/";

export const TURKISH_RATE = 48000;
const FIRST_WINDOW = 25;
const WINDOW = 100;
const CONTEXT = 8;
const MAX_WORD_FRAMES = 250;
const MAX_FRAMES = 3000;

// ---------- text frontend ----------

const TURKISH = new Set("çğıöşüÇĞİÖŞÜ");
const TYPOGRAPHY: Record<string, string> = {
  "’": "'", "‘": "'", "ʼ": "'", "´": "'", "`": "'", "“": '"', "”": '"', "„": '"',
  "«": '"', "»": '"', "–": "-", "—": "-", "−": "-", "…": "...",
};
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\x00-\x08\x0b-\x1f\x7f-\x9f؜‎‏‪-‮⁦-⁩]/g;
const BLOCK_BYTES = 8 * 1024;

function blocks(text: string): string[] {
  const out: string[] = [];
  let block: string[] = [];
  let size = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const n = new TextEncoder().encode(word).length + 1;
    if (block.length && size + n > BLOCK_BYTES) {
      out.push(block.join(" "));
      block = [];
      size = 0;
    }
    block.push(word);
    size += n;
  }
  if (block.length) out.push(block.join(" "));
  return out;
}

function alphabet(text: string, vocab: Set<string>): string {
  text = text.replace(UNSAFE, " ");
  text = [...text].map((ch) => TYPOGRAPHY[ch] ?? ch).join("");
  text = text.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr");
  let out = "";
  for (let ch of text) {
    if (!TURKISH.has(ch)) ch = ch.normalize("NFKD").replace(/\p{M}/gu, "");
    out += ch && [...ch].every((c) => vocab.has(c)) ? ch : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

function frontend(text: string, vocab: Set<string>, normalize: (t: string) => string): string {
  text = text.replace(UNSAFE, " ");
  // Chat writes "14:30da" and "3te"; the normalizer reads numbers with a
  // suffix only when the apostrophe is there ("14:30'da"), as in print.
  text = text.replace(/(\d)([a-zçğıöşü]{1,5})\b/giu, "$1'$2");
  if (!text.trim()) return "";
  return alphabet(blocks(text).map(normalize).join(" "), vocab);
}

// ---------- chunker ----------

const LETTERS_PER_SECOND = 18;
const MAX_SECONDS = 10;
const MAX_LETTERS = 250;
const SENTENCE_PAUSE = 0.25;
const CLAUSE_PAUSE = 0.12;
const CUTS: Array<[RegExp, number]> = [
  [/[.!?]+["')]*(?= )/g, SENTENCE_PAUSE],
  [/[,;:](?= )/g, CLAUSE_PAUSE],
  [/\S(?= )/g, CLAUSE_PAUSE],
];

function finish(piece: string): string {
  if (/[.!?]$/.test(piece.replace(/["')]+$/, ""))) return piece;
  return piece.replace(/[,;:\- ]+$/, "") + ".";
}

function chunk(text: string, speed: number): Array<[string, number]> {
  const limit = Math.floor(Math.min(MAX_LETTERS, LETTERS_PER_SECOND * MAX_SECONDS * speed));
  const pieces: Array<[string, number]> = [];
  let rest = text.trim();
  while (rest) {
    let cut = rest.length;
    let pause = 0;
    if (rest.length > limit) {
      cut = limit;
      const head = rest.slice(0, limit + 1);
      for (const [pattern, gap] of CUTS) {
        const ends = [...head.matchAll(pattern)].map((m) => (m.index ?? 0) + m[0].length);
        if (ends.length) {
          cut = ends[ends.length - 1];
          pause = gap;
          break;
        }
      }
    }
    const piece = rest.slice(0, cut).trim();
    rest = rest.slice(cut).trim();
    if (/\p{L}/u.test(piece)) pieces.push([finish(piece), pause]);
  }
  if (pieces.length) pieces[pieces.length - 1][1] = 0;
  return pieces;
}

// ---------- seeded Gaussian noise ----------

function gaussian(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (n: number) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
      const r = Math.sqrt(-2 * Math.log(1 - uniform()));
      const th = 2 * Math.PI * uniform();
      out[i] = r * Math.cos(th);
      if (i + 1 < n) out[i + 1] = r * Math.sin(th);
    }
    return out;
  };
}

// ---------- engine ----------

function words(text: string) {
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] !== " " && (i === 0 || text[i - 1] === " ")) starts.push(i);
  if (!starts.length) starts.push(0);
  const bounds = [0, ...starts.slice(1), text.length];
  const cw: number[] = [];
  const wstart: number[] = [];
  for (let w = 0; w + 1 < bounds.length; w++) {
    for (let i = bounds[w]; i < bounds[w + 1]; i++) {
      cw.push(w);
      wstart.push(bounds[w]);
    }
  }
  return { cw, wstart };
}

function plan(cw: number[], wstart: number[], dur: Float32Array, speed: number) {
  const L = cw.length;
  const nWords = cw[L - 1] + 1;
  const d = Float32Array.from(dur, (x) => x / speed);
  const sums = new Float64Array(nWords);
  for (let i = 0; i < L; i++) sums[cw[i]] += d[i];
  const counts = Array.from(sums, (s) => Math.min(MAX_WORD_FRAMES, Math.max(1, Math.round(s))));
  const T = Math.min(counts.reduce((a, b) => a + b, 0), MAX_FRAMES);
  const fw = new Int32Array(T);
  const fp = new Float32Array(T);
  for (let w = 0, f = 0; w < nWords; w++) {
    for (let j = 0; j < counts[w] && f < T; j++, f++) {
      fw[f] = w;
      fp[f] = j / counts[w];
    }
  }
  const c = Float32Array.from(d, (x) => Math.max(x, 1e-4));
  const done = new Float32Array(L);
  const total = new Float32Array(nWords);
  for (let i = 0, acc = 0; i < L; i++) {
    acc += c[i];
    done[i] = acc;
    total[cw[i]] += c[i];
  }
  const before = (i: number) => done[i] - c[i];
  const wlen = new Float32Array(nWords);
  for (const w of cw) wlen[w] += 1;
  const woff = new Float32Array(nWords);
  for (let w = 1; w < nWords; w++) woff[w] = woff[w - 1] + Math.max(wlen[w - 1], 1);
  const cg = new Float32Array(L);
  const fg = new Float32Array(T);
  for (let i = 0; i < L; i++) {
    const cp = Math.min(1, Math.max(0, (done[i] - before(wstart[i]) - 0.5 * c[i]) / Math.max(total[cw[i]], 1e-8)));
    cg[i] = woff[cw[i]] + cp * Math.max(wlen[cw[i]], 1);
  }
  for (let f = 0; f < T; f++) fg[f] = woff[fw[f]] + fp[f] * Math.max(wlen[fw[f]], 1);
  return { T, fw, cg, fg };
}

function windows(frames: number, first: number): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let s = 0; s < frames; ) {
    const e = Math.min(frames, s + (s === 0 ? first : WINDOW));
    spans.push([s, e]);
    s = e;
  }
  return spans;
}

function loadNormalizer(bytes: ArrayBuffer) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return WebAssembly.compile(bytes).then((module) => WebAssembly.instantiate(module, {})).then((instance) => {
    const w = instance.exports as {
      memory: WebAssembly.Memory;
      alloc(n: number): number;
      dealloc(p: number, n: number): void;
      normalize(p: number, n: number): void;
      result_ptr(): number;
      result_len(): number;
    };
    return (text: string) => {
      const input = enc.encode(text);
      const ptr = w.alloc(input.length);
      new Uint8Array(w.memory.buffer, ptr, input.length).set(input);
      w.normalize(ptr, input.length);
      w.dealloc(ptr, input.length);
      return dec.decode(new Uint8Array(w.memory.buffer, w.result_ptr(), w.result_len()));
    };
  });
}

type Session = Awaited<ReturnType<typeof session>>;

export class TurkishVoice {
  private constructor(
    private readonly text: Session,
    private readonly sound: Session,
    private readonly decoder: Session,
    private readonly meta: { vocab: string[]; times: number[]; latent_dim: number; hop: number },
    private readonly normalize: (t: string) => string,
  ) {}

  static async load(): Promise<TurkishVoice> {
    const meta = JSON.parse(new TextDecoder().decode(await cachedBytes(MODEL + "meta.json")));
    const normalize = await loadNormalizer(await cachedBytes(MODEL + "normalizer.wasm"));
    const [text, sound, decoder] = await Promise.all(
      ["text.onnx", "sound.onnx", "decoder.onnx"].map(async (name) => session(await cachedBytes(MODEL + name))),
    );
    return new TurkishVoice(text, sound, decoder, meta, normalize);
  }

  async synthesize(input: string, { speed = 1, seed = 0 } = {}): Promise<Float32Array> {
    const vocab = new Set(this.meta.vocab.filter((v) => v.length === 1));
    const stoi = new Map(this.meta.vocab.map((ch, i) => [ch, i] as const));
    const pieces = chunk(frontend(input, vocab, this.normalize), speed);
    const nSteps = this.meta.times.length;
    const D = this.meta.latent_dim;
    const hop = this.meta.hop;
    const out: Float32Array[] = [];

    for (let k = 0; k < pieces.length; k++) {
      const [piece, pause] = pieces[k];
      const ids = [...piece].map((ch) => stoi.get(ch) ?? 1);
      const { cw, wstart } = words(piece);
      const { h, dur } = await this.text.run({ ids: i64(ids) });
      const { T, fw, cg, fg } = plan(cw, wstart, (await dur.getData()) as Float32Array, speed);
      const noise = gaussian(seed * 1000003 + k)(nSteps * T * D);
      const { latents } = await this.sound.run({
        h,
        cg: f32(cg, [1, cg.length]),
        fg: f32(fg, [1, T]),
        cw: i64(cw),
        fw: i64(fw),
        noise: f32(noise, [1, nSteps, T, D]),
      });
      const lat = (await latents.getData()) as Float32Array;

      for (const [s, e] of windows(T, k === 0 ? FIRST_WINDOW : WINDOW)) {
        const a = Math.max(0, s - CONTEXT);
        const b = Math.min(T, e + CONTEXT);
        const n = b - a;
        const z = new Float32Array(D * n);
        for (let f = 0; f < n; f++) for (let dd = 0; dd < D; dd++) z[dd * n + f] = lat[(a + f) * D + dd];
        const { audio } = await this.decoder.run({ z: f32(z, [1, D, n]) });
        out.push(((await audio.getData()) as Float32Array).slice((s - a) * hop, (e - a) * hop));
      }
      if (pause) out.push(new Float32Array(Math.round(pause * TURKISH_RATE)));
    }
    return concat(out);
  }
}
