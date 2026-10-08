/**
 * The male English voice: KittenTTS nano 0.8 int8 (KittenML, Apache-2.0),
 * voice "Bruno" (expr-voice-3-m). A 25 MB StyleTTS-style model, ~10x faster
 * than realtime on one core. Output is 24 kHz.
 *
 * Input is eSpeak NG phonemes (with stress and punctuation), split into words
 * and punctuation marks joined by spaces, then mapped through KittenTTS's
 * TextCleaner symbol table (kittentts_legacy/onnx_model.py).
 */
import { kokoroPhonemes } from "./english";
import { cachedBytes, concat, f32, i64, ort, session } from "./runtime";

const MODEL = "https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8/resolve/84781d74e29ee25217551556398b42f80593a813/";
const VOICE = "expr-voice-3-m.npy";
/** KittenTTS's speed prior for this voice: it speaks a little fast otherwise. */
const SPEED_PRIOR = 0.8;
const STYLE_DIM = 256;

export const KITTEN_RATE = 24000;
const MAX_TOKENS = 400;
const SENTENCE_PAUSE = 0.18;
// The model trails off with a tail of noise; KittenTTS cuts it the same way.
const TAIL_SAMPLES = 5000;

const SYMBOLS = [
  "$",
  ...';:,.!?¡¿—…"«»“” ',
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  ..."ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ",
];
const SYMBOL_IDS = new Map<string, number>();
SYMBOLS.forEach((symbol, i) => SYMBOL_IDS.set(symbol, i));

/**
 * One voice's style table (400 rows of 256 floats) out of voices.npz. The
 * archive is stored, not deflated, so the .npy is read straight out of it.
 */
function readVoice(npz: ArrayBuffer, name: string): Float32Array {
  const view = new DataView(npz);
  const bytes = new Uint8Array(npz);
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    let size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const entry = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const data = offset + 30 + nameLength + extraLength;
    // numpy writes Zip64 entries: the real size is in the 0x0001 extra field.
    for (let x = offset + 30 + nameLength; size === 0xffffffff && x + 4 <= data; ) {
      const id = view.getUint16(x, true);
      const length = view.getUint16(x + 2, true);
      if (id === 0x0001) size = Number(view.getBigUint64(x + 4, true));
      x += 4 + length;
    }
    if (entry === name) {
      if (method !== 0) throw new Error(`voices.npz: ${name} is compressed`);
      // .npy v1: magic(6) version(2) header length(2) header, then little-endian float32 data.
      const headerLength = view.getUint16(data + 8, true);
      const header = new TextDecoder().decode(bytes.subarray(data + 10, data + 10 + headerLength));
      if (!header.includes("'<f4'")) throw new Error(`voices.npz: ${name} is not float32`);
      const start = data + 10 + headerLength;
      return new Float32Array(npz.slice(start, data + size));
    }
    offset = data + size;
  }
  throw new Error(`voices.npz has no ${name}`);
}

function tokens(phonemes: string): number[] {
  const spaced = (phonemes.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu) ?? []).join(" ");
  const ids = [0];
  for (const ch of spaced) {
    const id = SYMBOL_IDS.get(ch);
    if (id !== undefined) ids.push(id);
  }
  ids.push(10, 0);
  return ids;
}

type Session = Awaited<ReturnType<typeof session>>;

export class MaleEnglishVoice {
  private constructor(
    private readonly model: Session,
    private readonly styles: Float32Array,
  ) {}

  static async load(): Promise<MaleEnglishVoice> {
    const [model, voices] = await Promise.all([
      cachedBytes(MODEL + "kitten_tts_nano_v0_8.onnx").then(session),
      cachedBytes(MODEL + "voices.npz"),
    ]);
    return new MaleEnglishVoice(model, readVoice(voices, VOICE));
  }

  async synthesize(text: string, { speed = 1 } = {}): Promise<Float32Array> {
    const sentences = text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter((s) => /\p{L}|\d/u.test(s));
    const rows = this.styles.length / STYLE_DIM;
    const out: Float32Array[] = [];
    for (const sentence of sentences) {
      const ids = tokens(await kokoroPhonemes(sentence)).slice(0, MAX_TOKENS);
      if (ids.length <= 3) continue;
      // KittenTTS picks the style row by the length of the text being spoken.
      const row = Math.min(sentence.length, rows - 1);
      const result = await this.model.run({
        input_ids: i64(ids),
        style: f32(this.styles.slice(row * STYLE_DIM, (row + 1) * STYLE_DIM), [1, STYLE_DIM]),
        speed: new ort.Tensor("float32", new Float32Array([speed * SPEED_PRIOR]), [1]),
      });
      const wave = (await result.waveform.getData()) as Float32Array;
      out.push(wave.subarray(0, Math.max(0, wave.length - TAIL_SAMPLES)));
      out.push(new Float32Array(Math.round(SENTENCE_PAUSE * KITTEN_RATE)));
    }
    return concat(out);
  }
}
