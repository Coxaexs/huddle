/**
 * Turkish or English for /say (never /tts, where the sender always picks).
 * Turkish letters settle it; otherwise the commonest short words of each
 * language are counted. A tie is null: the sender is asked instead.
 */
import type { TtsLanguage } from "./client";

const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

const TURKISH_WORDS = new Set([
  "ve", "bir", "bu", "da", "de", "ne", "mi", "mı", "mu", "mü", "ben", "sen", "o", "biz", "siz", "onlar",
  "için", "ile", "gibi", "ama", "çok", "var", "yok", "evet", "hayır", "tamam", "merhaba", "selam",
  "nasıl", "neden", "niye", "nerede", "kim", "şimdi", "sonra", "önce", "daha", "en", "her", "hiç",
  "abi", "kanka", "lan", "ya", "yani", "işte", "bence", "olur", "oldu", "değil", "geliyorum", "gel",
  "hadi", "haydi", "iyi", "kötü", "güzel", "zar", "at", "bak", "bi", "şu", "naber", "nasılsın",
]);

const ENGLISH_WORDS = new Set([
  "the", "and", "a", "an", "is", "are", "was", "were", "i", "you", "he", "she", "it", "we", "they",
  "to", "of", "in", "on", "for", "with", "this", "that", "what", "why", "how", "where", "who",
  "yes", "no", "not", "do", "does", "did", "have", "has", "can", "will", "just", "my", "your",
  "hello", "hi", "hey", "ok", "okay", "lol", "please", "thanks", "roll", "attack", "go", "be",
]);

export function detectLanguage(text: string): TtsLanguage | null {
  if (TURKISH_LETTERS.test(text)) return "tr";
  let tr = 0;
  let en = 0;
  for (const word of text.toLocaleLowerCase("tr").match(/\p{L}+/gu) ?? []) {
    if (TURKISH_WORDS.has(word)) tr++;
    if (ENGLISH_WORDS.has(word)) en++;
  }
  if (tr === en) return null;
  return tr > en ? "tr" : "en";
}
