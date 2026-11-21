/**
 * Two notification choices kept on the account (users.notify_prefs, JSON):
 * quiet hours, during which nothing pops up or is pushed to a phone, and
 * keywords, words that notify like a mention when someone says them.
 *
 * Shared by the server (which pushes) and the client (which pops desktop
 * notifications), so both agree. Anything unknown in a stored value falls
 * back to the default: no quiet hours, no keywords.
 */

export interface QuietHours {
  on: boolean;
  /** Local "HH:MM" the quiet period starts and ends. It may cross midnight. */
  from: string;
  to: string;
  /** IANA time zone the two times are in, as the browser that saved them reported it. */
  tz: string;
}

export interface NotifyPrefs {
  quiet: QuietHours;
  keywords: string[];
}

export const MAX_KEYWORDS = 20;
export const MAX_KEYWORD_LENGTH = 32;
/** Shorter words would match half of what anyone types. */
export const MIN_KEYWORD_LENGTH = 2;

export function defaultNotifyPrefs(): NotifyPrefs {
  return { quiet: { on: false, from: "23:00", to: "08:00", tz: "UTC" }, keywords: [] };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Trimmed, lower-cased, de-duplicated, and capped. */
export function cleanKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const word = entry.trim().toLowerCase().replace(/\s+/g, " ").slice(0, MAX_KEYWORD_LENGTH);
    if (word.length < MIN_KEYWORD_LENGTH) continue;
    seen.add(word);
    if (seen.size >= MAX_KEYWORDS) break;
  }
  return [...seen];
}

/** Accepts the stored JSON string, a parsed value, or nothing. */
export function normalizeNotifyPrefs(raw: unknown): NotifyPrefs {
  const base = defaultNotifyPrefs();
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return base;
    }
  }
  if (!value || typeof value !== "object") return base;
  const input = value as { quiet?: Partial<QuietHours>; keywords?: unknown };
  const quiet = input.quiet && typeof input.quiet === "object" ? input.quiet : {};
  return {
    quiet: {
      on: quiet.on === true,
      from: typeof quiet.from === "string" && TIME.test(quiet.from) ? quiet.from : base.quiet.from,
      to: typeof quiet.to === "string" && TIME.test(quiet.to) ? quiet.to : base.quiet.to,
      tz: validZone(quiet.tz) ? quiet.tz : base.quiet.tz,
    },
    keywords: cleanKeywords(input.keywords),
  };
}

/** Nothing switched on: stored as NULL. */
export function isDefaultNotifyPrefs(prefs: NotifyPrefs): boolean {
  return !prefs.quiet.on && !prefs.keywords.length;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Minutes past midnight right now in that time zone. */
function localMinutes(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value || 0);
  return part("hour") * 60 + part("minute");
}

/**
 * Whether `now` falls inside the quiet period. The start is inside and the end
 * is not; equal times mean the whole day.
 */
export function inQuietHours(prefs: NotifyPrefs, now: Date = new Date()): boolean {
  const { quiet } = prefs;
  if (!quiet.on) return false;
  const from = minutes(quiet.from);
  const to = minutes(quiet.to);
  if (from === to) return true;
  let at: number;
  try {
    at = localMinutes(now, quiet.tz);
  } catch {
    return false;
  }
  return from < to ? at >= from && at < to : at >= from || at < to;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * The first keyword that appears in `text` as a whole word (or phrase),
 * ignoring case, or null. "cat" matches "my cat!" but not "category".
 */
export function keywordHit(prefs: NotifyPrefs, text: string): string | null {
  if (!prefs.keywords.length || !text) return null;
  const haystack = text.toLowerCase();
  for (const word of prefs.keywords) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(word, from);
      if (at < 0) break;
      const before = at > 0 ? haystack[at - 1] : "";
      const after = haystack[at + word.length] || "";
      if (!(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after))) return word;
      from = at + 1;
    }
  }
  return null;
}
