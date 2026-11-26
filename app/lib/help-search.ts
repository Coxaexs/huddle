import { Marked, type Token } from "marked";
import { HELP_CHAPTERS_BY_LANG, helpHref, makeSlugger, type HelpChapter, type HelpLang } from "./help";

/**
 * Search over the user manual, for the "Ask the guide" box on /help and in the
 * app's Help dialog. Each chapter is cut into its `##` and `###` sections, and
 * a question is matched against them with BM25: plain word statistics, no
 * embeddings, so it runs anywhere and costs nothing. The best sections are the
 * context the AI answers from, and also the fallback when the AI is not there.
 *
 * Words are folded (case, accents, Turkish dotless i) and cut to their first
 * five letters. That crude stem works well for Turkish, where one word grows
 * many suffixes (sunucu, sunucuya, sunucunun), and well enough for English.
 */

export interface HelpChunk {
  lang: HelpLang;
  chapterSlug: string;
  chapterTitle: string;
  chapterIcon: string;
  /** The section's own heading; the chapter title for text before the first heading. */
  section: string;
  /** Link to the chapter, with the section's anchor. */
  href: string;
  /** Markdown with images and clips taken out. */
  text: string;
}

export interface HelpHit extends HelpChunk {
  score: number;
}

const STEM = 5;

const STOP_WORDS = new Set(
  [
    // English
    "the", "and", "for", "how", "can", "do", "does", "did", "what", "is", "are", "was", "to", "an", "in", "on",
    "of", "my", "you", "your", "it", "its", "with", "where", "why", "when", "which", "this", "that", "be", "from",
    "or", "not", "at", "as", "me", "there", "get", "if", "so", "by", "we", "our", "i", "a", "about", "into",
    "hoffle", "please", "want", "need", "way", "use", "using",
    // Turkish (folded)
    "ve", "bir", "bu", "su", "nasil", "ne", "mi", "mu", "nerede", "icin", "ile", "da", "de", "ben", "sen",
    "var", "yok", "nedir", "neden", "hangi", "gibi", "ama", "cok", "daha", "kadar", "olarak", "olan", "ya",
    "veya", "ki", "o", "her", "nereden", "nereye", "yapilir", "yaparim", "yapabilirim", "istiyorum", "olur",
    "oluyor", "musun", "misin", "acaba", "lutfen", "beni", "bana", "benim",
  ],
);

/** Lowercase, no accents, Turkish ı as i. */
export function foldText(text: string, lang: HelpLang = "en"): string {
  return text
    .toLocaleLowerCase(lang)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i");
}

export function helpTerms(text: string, lang: HelpLang = "en"): string[] {
  const terms: string[] = [];
  for (const word of foldText(text, lang).split(/[^\p{L}\p{N}]+/u)) {
    if (!word || STOP_WORDS.has(word)) continue;
    // Single letters carry nothing, except a lone digit such as "2" in "2nd screen".
    if (word.length < 2 && !/\d/.test(word)) continue;
    terms.push(word.slice(0, STEM));
  }
  return terms;
}

function cleanMarkdown(raw: string): string {
  return raw
    .replace(/^::video\s+[\w-]+\s*(?:\|\s*(.+))?$/gm, (_line, caption?: string) => (caption ? `(Clip: ${caption.trim()})` : ""))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function headingText(tokens: Token[] | undefined): string {
  return (tokens || [])
    .map((token) => {
      if ("tokens" in token && token.tokens) return headingText(token.tokens);
      return "text" in token ? token.text : "";
    })
    .join("");
}

/**
 * A chapter cut at its `##` and `###` headings. Anchors are made in the same
 * order as renderHelp makes them (leading `#` title dropped, every heading
 * counted), so the links land on the right heading.
 */
export function helpChunks(chapter: HelpChapter, lang: HelpLang): HelpChunk[] {
  const tokens = new Marked({ gfm: true }).lexer(chapter.source);
  const first = tokens.findIndex((token) => token.type !== "space");
  if (first >= 0 && tokens[first].type === "heading" && (tokens[first] as { depth: number }).depth === 1) {
    tokens.splice(first, 1);
  }
  const slug = makeSlugger(lang);
  const base = helpHref(chapter, lang);
  const chunks: HelpChunk[] = [];
  let current: { section: string; href: string; parts: string[] } = { section: chapter.title, href: base, parts: [] };
  /** The `##` a `###` sits under, so "Settings › Volume" reads right. */
  let parent = "";
  const flush = () => {
    const text = cleanMarkdown(current.parts.join(""));
    if (text) {
      chunks.push({
        lang,
        chapterSlug: chapter.slug,
        chapterTitle: chapter.title,
        chapterIcon: chapter.icon,
        section: current.section,
        href: current.href,
        text,
      });
    }
  };
  for (const token of tokens) {
    if (token.type === "heading") {
      const text = headingText(token.tokens);
      const id = slug(text);
      if (token.depth === 2 || token.depth === 3) {
        flush();
        if (token.depth === 2) parent = text;
        const section = token.depth === 3 && parent ? `${parent} › ${text}` : text;
        current = { section, href: `${base}#${id}`, parts: [] };
        continue;
      }
    }
    current.parts.push(token.raw);
  }
  flush();
  return chunks;
}

interface Index {
  chunks: HelpChunk[];
  /** Term counts per chunk. */
  terms: Map<string, number>[];
  lengths: number[];
  avgLength: number;
  /** In how many chunks each term appears. */
  df: Map<string, number>;
}

const indexes = new Map<HelpLang, Index>();

/** Weight of the section heading and chapter title against the body text. */
const SECTION_BOOST = 3;
const CHAPTER_BOOST = 2;

function buildIndex(lang: HelpLang): Index {
  const chunks = HELP_CHAPTERS_BY_LANG[lang].flatMap((chapter) => helpChunks(chapter, lang));
  const terms: Map<string, number>[] = [];
  const lengths: number[] = [];
  const df = new Map<string, number>();
  for (const chunk of chunks) {
    const counts = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const term of helpTerms(text, lang)) counts.set(term, (counts.get(term) ?? 0) + weight);
    };
    add(chunk.text, 1);
    add(chunk.section, SECTION_BOOST);
    add(chunk.chapterTitle, CHAPTER_BOOST);
    let length = 0;
    for (const [term, count] of counts) {
      length += count;
      df.set(term, (df.get(term) ?? 0) + 1);
    }
    terms.push(counts);
    lengths.push(length);
  }
  const avgLength = lengths.reduce((sum, length) => sum + length, 0) / Math.max(1, lengths.length);
  return { chunks, terms, lengths, avgLength, df };
}

function indexFor(lang: HelpLang): Index {
  let index = indexes.get(lang);
  if (!index) {
    index = buildIndex(lang);
    indexes.set(lang, index);
  }
  return index;
}

const K1 = 1.2;
const B = 0.75;

/** The sections that best match `query`, best first. */
export function searchHelp(query: string, lang: HelpLang, limit = 5): HelpHit[] {
  const index = indexFor(lang);
  const queryTerms = [...new Set(helpTerms(query, lang))];
  if (!queryTerms.length) return [];
  const n = index.chunks.length;
  const hits: HelpHit[] = [];
  for (let i = 0; i < n; i++) {
    const counts = index.terms[i];
    let score = 0;
    let matched = 0;
    for (const term of queryTerms) {
      const tf = counts.get(term);
      if (!tf) continue;
      matched++;
      const df = index.df.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * index.lengths[i]) / index.avgLength)));
    }
    // Sections that match more of the question's words beat ones that repeat one word a lot.
    if (score > 0) hits.push({ ...index.chunks[i], score: score * (1 + matched / queryTerms.length) });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** Every chapter in one line each, so the AI can point at the right one when no section fits. */
export function helpContents(lang: HelpLang): string {
  return HELP_CHAPTERS_BY_LANG[lang]
    .map((chapter) => `- ${chapter.title} (${helpHref(chapter, lang)}): ${chapter.description}`)
    .join("\n");
}
