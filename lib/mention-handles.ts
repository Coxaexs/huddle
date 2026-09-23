/**
 * Shared rules for @mentions and #channel links, used by the composer's
 * autocomplete, the message renderer and the server's mention resolver.
 *
 * Mentions are plain text tokens (`@name`, `#name`) made of [a-zA-Z0-9._-], so
 * a role or channel whose name has spaces or emoji is written as its handle:
 * "Game Master" → `@Game-Master`, "Chill Lounge 🎧" → `#Chill-Lounge`.
 */

/** The characters a mention token may contain. */
export const HANDLE_CHARS = "a-zA-Z0-9._-";

/** Longest handle a mention token can carry. */
export const MAX_HANDLE_LENGTH = 32;

/** Turns a role or channel name into the token typed after `@` or `#`. */
export function nameToHandle(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_HANDLE_LENGTH);
}

/** Whether `handle` (as typed, any case) refers to `name`. */
export function handleMatchesName(handle: string, name: string): boolean {
  const target = nameToHandle(name).toLowerCase();
  return target !== "" && target === handle.toLowerCase();
}

/**
 * How well a typed query matches any of an option's names; lower is better,
 * null means no match. 0: a name starts with the query. 1: a word inside a
 * name does ("es" → "Sir Escanor"). 2: the query appears anywhere.
 * An empty query (just "@" or "#") matches everything.
 */
export function mentionMatchScore(
  query: string,
  names: Array<string | null | undefined>,
): number | null {
  const q = query.toLowerCase();
  if (!q) return 0;
  let best: number | null = null;
  for (const raw of names) {
    if (!raw) continue;
    const name = raw.toLowerCase();
    let score: number | null = null;
    if (name.startsWith(q) || nameToHandle(name).startsWith(q)) score = 0;
    else if (name.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;
    if (score !== null && (best === null || score < best)) best = score;
  }
  return best;
}

/**
 * The `@query` / `#query` being typed right before the caret, or null.
 * `start` is where the trigger character sits in the text.
 */
export function findTagQuery(
  textBeforeCaret: string,
): { trigger: "@" | "#"; query: string; start: number } | null {
  const match = textBeforeCaret.match(/(?:^|\s)([@#])([^\s@#]{0,32})$/);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length - match[2].length - 1;
  return { trigger: match[1] as "@" | "#", query: match[2], start };
}
