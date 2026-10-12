/** One text run from pdf.js; `eol` is true when the run ends a line. */
export interface TextRun {
  str: string;
  eol: boolean;
}

/** The part of a single text run covered by a match. */
export interface MatchSegment {
  item: number;
  start: number;
  end: number;
}

const isSpace = (character: string) => /\s/.test(character);

export function normalizeNeedle(query: string) {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Finds every occurrence of `needle` (already normalized) in a page's text.
 * Whitespace runs collapse to one space and a line end counts as a space, so a
 * phrase that wraps onto the next line still matches. Each match comes back as
 * the pieces of text runs it covers, which is what the highlighter needs.
 */
export function findMatches(runs: TextRun[], needle: string): MatchSegment[][] {
  if (!needle) return [];
  let text = "";
  const itemOf: number[] = [];
  const charOf: number[] = [];

  const push = (character: string, item: number, index: number) => {
    text += character;
    itemOf.push(item);
    charOf.push(index);
  };
  const separate = () => {
    if (text && text[text.length - 1] !== " ") push(" ", -1, -1);
  };

  runs.forEach((run, item) => {
    for (let index = 0; index < run.str.length; index += 1) {
      const character = run.str[index];
      if (isSpace(character)) {
        if (text && text[text.length - 1] !== " ") push(" ", item, index);
        continue;
      }
      for (const lowered of character.toLocaleLowerCase()) push(lowered, item, index);
    }
    if (run.eol) separate();
  });

  const matches: MatchSegment[][] = [];
  let at = text.indexOf(needle);
  while (at !== -1) {
    const segments: MatchSegment[] = [];
    for (let position = at; position < at + needle.length; position += 1) {
      const item = itemOf[position];
      if (item < 0) continue;
      const last = segments[segments.length - 1];
      if (last && last.item === item) last.end = charOf[position] + 1;
      else segments.push({ item, start: charOf[position], end: charOf[position] + 1 });
    }
    if (segments.length) matches.push(segments);
    at = text.indexOf(needle, at + needle.length);
  }
  return matches;
}
