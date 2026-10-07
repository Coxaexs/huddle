/**
 * English: Paradee-8M (sahilmahendrakar/Paradee-8M-v1.0, Apache-2.0), a
 * Kokoro-82M distillation with Kokoro's af_heart voice. Output is 24 kHz.
 *
 * Paradee takes Kokoro phoneme ids. Text goes through Kokoro's own browser
 * frontend (kokoro.js/src/phonemize.js, Apache-2.0: number/currency
 * normalisation, then eSpeak NG via the `phonemizer` package) and then
 * Paradee's web/misaki.js, which respells eSpeak phonemes the way misaki (the
 * G2P Paradee was trained on) writes them. Without that last step Paradee
 * mumbles (Whisper WER 31% instead of ~2%).
 */
import { phonemize as espeak } from "phonemizer";
import { cachedBytes, concat, i64, ort, session } from "./runtime";

const MODEL = "https://huggingface.co/sahilmahendrakar/Paradee-8M-v1.0/resolve/f662642d44c03c17588e4176469c54d462c0b623/";

export const ENGLISH_RATE = 24000;
const MAX_TOKENS = 510; // 512 with the pad token at each end
const SENTENCE_PAUSE = 0.18;

// ---------- kokoro.js/src/phonemize.js ----------

function split(text: string, regex: RegExp) {
  const result: Array<{ match: boolean; text: string }> = [];
  let prev = 0;
  for (const match of text.matchAll(regex)) {
    const full = match[0];
    const index = match.index ?? 0;
    if (prev < index) result.push({ match: false, text: text.slice(prev, index) });
    if (full.length > 0) result.push({ match: true, text: full });
    prev = index + full.length;
  }
  if (prev < text.length) result.push({ match: false, text: text.slice(prev) });
  return result;
}

function splitNum(match: string): string {
  if (match.includes(".")) return match;
  if (match.includes(":")) {
    const [h, m] = match.split(":").map(Number);
    if (m === 0) return `${h} o'clock`;
    if (m < 10) return `${h} oh ${m}`;
    return `${h} ${m}`;
  }
  const year = parseInt(match.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return match;
  const left = match.slice(0, 2);
  const right = parseInt(match.slice(2, 4), 10);
  const suffix = match.endsWith("s") ? "s" : "";
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${suffix}`;
    if (right < 10) return `${left} oh ${right}${suffix}`;
  }
  return `${left} ${right}${suffix}`;
}

function flipMoney(match: string): string {
  const bill = match[0] === "$" ? "dollar" : "pound";
  if (isNaN(Number(match.slice(1)))) return `${match.slice(1)} ${bill}s`;
  if (!match.includes(".")) {
    const suffix = match.slice(1) === "1" ? "" : "s";
    return `${match.slice(1)} ${bill}${suffix}`;
  }
  const [b, c] = match.slice(1).split(".");
  const d = parseInt(c.padEnd(2, "0"), 10);
  const coins = match[0] === "$" ? (d === 1 ? "cent" : "cents") : d === 1 ? "penny" : "pence";
  return `${b} ${bill}${b === "1" ? "" : "s"} and ${d} ${coins}`;
}

function pointNum(match: string): string {
  const [a, b] = match.split(".");
  return `${a} point ${b.split("").join(" ")}`;
}

function normalizeText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/«/g, "“")
    .replace(/»/g, "”")
    .replace(/[“”]/g, '"')
    .replace(/\(/g, "«")
    .replace(/\)/g, "»")
    .replace(/、/g, ", ")
    .replace(/。/g, ". ")
    .replace(/！/g, "! ")
    .replace(/，/g, ", ")
    .replace(/：/g, ": ")
    .replace(/；/g, "; ")
    .replace(/？/g, "? ")
    .replace(/[^\S \n]/g, " ")
    .replace(/  +/, " ")
    .replace(/(?<=\n) +(?=\n)/g, "")
    .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
    .replace(/\betc\.(?! [A-Z])/gi, "etc")
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, flipMoney)
    .replace(/\d*\.\d+/g, pointNum)
    .replace(/(?<=\d)-(?=\d)/g, " to ")
    .replace(/(?<=\d)S/g, " S")
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, "s")
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, "-"))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")
    .trim();
}

const PUNCTUATION = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCTUATION_PATTERN = new RegExp(
  `(\\s*[${PUNCTUATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]+\\s*)+`,
  "g",
);

async function kokoroPhonemes(text: string): Promise<string> {
  const sections = split(normalizeText(text), PUNCTUATION_PATTERN);
  const ps = (
    await Promise.all(
      sections.map(async ({ match, text: part }) => (match ? part : (await espeak(part, "en-us")).join(" "))),
    )
  ).join("");
  return ps
    .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
    .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
    .replace(/ʲ/g, "j")
    .replace(/r/g, "ɹ")
    .replace(/x/g, "k")
    .replace(/ɬ/g, "l")
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, "z")
    .replace(/(?<=nˈaɪn)ti(?!ː)/g, "di")
    .trim();
}

// ---------- paradee/web/misaki.js ----------

const E2M: Array<[string, string]> = [
  ["ʔˌn̩", "ʔn"], ["ʔn̩", "ʔn"],
  ["aɪ", "I"], ["aʊ", "W"],
  ["dʒ", "ʤ"],
  ["eɪ", "A"], ["e", "A"],
  ["tʃ", "ʧ"],
  ["ɔɪ", "Y"],
  ["ʲo", "jo"], ["ʲə", "jə"], ["ʲ", ""],
  ["ɚ", "əɹ"],
  ["r", "ɹ"],
  ["x", "k"], ["ç", "k"],
  ["ɬ", "l"],
  ["̃", ""],
];

function toMisaki(ps: string): string {
  for (const [a, b] of E2M) ps = ps.split(a).join(b);
  ps = ps.replace(/(\S)̩/gu, "ᵊ$1").replace(/̩/g, "");
  ps = ps.replace(/əl(?=[\s;:,.!?—…"“”()]|$)/gu, "ᵊl");
  ps = ps.replace(/ɐ(?![\s;:,.!?—…"“”()]|$)/gu, "ə");
  ps = ps.split("oʊ").join("O")
    .split("ɜːɹ").join("ɜɹ").split("ɜː").join("ɜɹ")
    .split("ɪə").join("iə")
    .split("ː").join("");
  ps = ps.split("o").join("ɔ");
  return ps.split("ɾ").join("T").split("ʔ").join("t");
}

// ---------- model ----------

type Session = Awaited<ReturnType<typeof session>>;

/** Sentences, then (if one is too long for the model) word groups. */
function phonemePieces(ps: string): string[] {
  if (ps.length <= MAX_TOKENS) return [ps];
  const pieces: string[] = [];
  let current = "";
  for (const word of ps.split(" ")) {
    if (current && current.length + word.length + 1 > MAX_TOKENS) {
      pieces.push(current);
      current = "";
    }
    current = current ? `${current} ${word}` : word.slice(0, MAX_TOKENS);
  }
  if (current) pieces.push(current);
  return pieces;
}

export class EnglishVoice {
  private constructor(
    private readonly model: Session,
    private readonly vocab: Record<string, number>,
  ) {}

  static async load(): Promise<EnglishVoice> {
    const config = JSON.parse(new TextDecoder().decode(await cachedBytes(MODEL + "config.json")));
    const model = await session(await cachedBytes(MODEL + "onnx/paradee_int8.onnx"));
    return new EnglishVoice(model, config.vocab);
  }

  async synthesize(text: string, { speed = 1 } = {}): Promise<Float32Array> {
    const sentences = text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter((s) => /\p{L}|\d/u.test(s));
    const out: Float32Array[] = [];
    for (const sentence of sentences) {
      const ps = toMisaki(await kokoroPhonemes(sentence));
      for (const piece of phonemePieces(ps)) {
        const ids = [0];
        for (const ch of piece) {
          const id = this.vocab[ch];
          if (id !== undefined) ids.push(id);
        }
        ids.push(0);
        if (ids.length <= 2) continue;
        const result = await this.model.run({
          input_ids: i64(ids),
          speed: new ort.Tensor("float32", new Float32Array([speed]), [1]),
        });
        out.push((await result.waveform.getData()) as Float32Array);
      }
      out.push(new Float32Array(Math.round(SENTENCE_PAUSE * ENGLISH_RATE)));
    }
    return concat(out);
  }
}
