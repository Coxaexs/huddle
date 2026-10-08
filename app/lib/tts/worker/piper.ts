/**
 * The male English voice: Piper "hfc_male" (medium), a VITS model from
 * rhasspy/piper-voices (model MIT; the Hi-Fi-CAPTAIN recordings it was
 * trained on are CC BY-NC-SA 4.0). About 60 MB, and the cheapest voice here
 * to run: roughly 0.1 s of one core per second of speech. Output is 22.05 kHz.
 *
 * Input is eSpeak NG phonemes (the same frontend as the female voice, so
 * numbers and money are read out the same way), each followed by Piper's pad
 * id, between its start and end ids.
 */
import { kokoroPhonemes } from "./english";
import { cachedBytes, concat, i64, ort, session } from "./runtime";

const VOICE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/en/en_US/hfc_male/medium/en_US-hfc_male-medium";
const MAX_IDS = 1000;
const SENTENCE_PAUSE = 0.18;

interface PiperConfig {
  audio: { sample_rate: number };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  phoneme_id_map: Record<string, number[]>;
}

type Session = Awaited<ReturnType<typeof session>>;

export class MaleEnglishVoice {
  private constructor(
    private readonly model: Session,
    private readonly config: PiperConfig,
  ) {}

  get sampleRate() {
    return this.config.audio.sample_rate;
  }

  static async load(): Promise<MaleEnglishVoice> {
    const [model, config] = await Promise.all([
      cachedBytes(`${VOICE}.onnx`).then(session),
      cachedBytes(`${VOICE}.onnx.json`).then((bytes) => JSON.parse(new TextDecoder().decode(bytes)) as PiperConfig),
    ]);
    return new MaleEnglishVoice(model, config);
  }

  private ids(phonemes: string): number[] {
    const map = this.config.phoneme_id_map;
    const pad = map._;
    const ids = [...map["^"], ...pad];
    for (const ch of phonemes) {
      const id = map[ch];
      if (id) ids.push(...id, ...pad);
    }
    ids.push(...map.$);
    return ids.slice(0, MAX_IDS);
  }

  async synthesize(text: string, { speed = 1 } = {}): Promise<Float32Array> {
    const sentences = text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter((s) => /\p{L}|\d/u.test(s));
    const { noise_scale, length_scale, noise_w } = this.config.inference;
    const out: Float32Array[] = [];
    for (const sentence of sentences) {
      const ids = this.ids(await kokoroPhonemes(sentence));
      if (ids.length <= 4) continue;
      const result = await this.model.run({
        input: i64(ids),
        input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
        // length_scale is time per phoneme, so a faster voice is a smaller one.
        scales: new ort.Tensor("float32", new Float32Array([noise_scale, length_scale / speed, noise_w]), [3]),
      });
      out.push((await result.output.getData()) as Float32Array);
      out.push(new Float32Array(Math.round(SENTENCE_PAUSE * this.sampleRate)));
    }
    return concat(out);
  }
}
