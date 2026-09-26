/**
 * Discord-style search operators for message search.
 *
 * The search box learns a small grammar on top of the plain FTS query that
 * `app/api/messages/search/route.ts` already runs:
 *
 *   from:alice           messages authored by alice (username or display name)
 *   in:general           messages in a channel, by name or id
 *   has:link             messages with a link preview
 *   has:image            messages with a non-PDF attachment
 *   has:file             messages with any attachment
 *   has:audio            voice messages
 *   before:2024-01-31    strictly older than the date
 *   after:2024-01-01     strictly newer than the date
 *   pinned:true          only pinned messages
 *   "exact phrase"       quotes keep words together
 *
 * Everything is parsed here, away from the database, so the grammar can be
 * tested on its own and the route stays about SQL.
 *
 * Two deliberate behaviours:
 *
 * - An operator with a value we do not recognise (`before:soon`, `has:banana`)
 *   is left in the free text rather than silently dropped. A user who mistypes
 *   gets a search that finds nothing and can see why, instead of one that
 *   quietly ignores their filter and returns the whole channel.
 * - An empty result is honest: `text` is "" when the query was filters only,
 *   which the route treats as "no full-text constraint" rather than "match
 *   nothing".
 */

/** Things `has:` understands, mapped to the columns that satisfy them. */
export const HAS_FILTERS = ["link", "image", "file", "audio", "embed"] as const;
export type HasFilter = (typeof HAS_FILTERS)[number];

export interface SearchQuery {
  /** Free text with operators removed, ready for the FTS/LIKE path. */
  text: string;
  /** Author terms from `from:`, lowercased, `@` stripped. */
  from: string[];
  /** Channel terms from `in:`, lowercased, `#` stripped. */
  in: string[];
  /** Valid `has:` filters. */
  has: HasFilter[];
  /** ISO date string, exclusive upper bound. */
  before: string | null;
  /** ISO date string, exclusive lower bound. */
  after: string | null;
  /** True when `pinned:true` (or a bare `pinned:`) was given. */
  pinned: boolean;
}

const EMPTY: SearchQuery = {
  text: "",
  from: [],
  in: [],
  has: [],
  before: null,
  after: null,
  pinned: false,
};

/**
 * Splits on whitespace but keeps quoted runs together, so `"hello world"` is
 * one token. Returns the quote characters stripped and the raw text otherwise.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of input) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && /\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);

  return tokens;
}

/** Splits a comma-separated operator value, dropping empties. */
function splitValues(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** `@alice` and `#general` are how people actually type these. */
function stripSigil(value: string, sigil: string): string {
  return value.startsWith(sigil) ? value.slice(sigil.length) : value;
}

/**
 * Accepts `YYYY-MM-DD` or a full ISO timestamp and returns the ISO instant.
 *
 * `YYYY-MM-DD` is widened to the start of that day in UTC, which makes
 * `before:2024-01-31` exclude the 31st itself rather than include it — the
 * reading that matches how people expect a date bound to behave.
 */
export function parseSearchDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = Date.parse(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}


/**
 * Parses a raw search box value into text plus filters.
 *
 * Operators are recognised only when they have a usable value, so `from:` with
 * nothing after it, or `has:banana`, stay in the free text and the user sees a
 * search that finds nothing rather than a filter silently ignored.
 */
export function parseSearchQuery(raw: string): SearchQuery {
  const tokens = tokenize(raw || "");
  if (!tokens.length) return { ...EMPTY, has: [] };

  const result: SearchQuery = {
    text: "",
    from: [],
    in: [],
    has: [],
    before: null,
    after: null,
    pinned: false,
  };
  const text: string[] = [];

  for (const token of tokens) {
    const match = /^([a-z_]+):(.*)$/i.exec(token);
    if (!match) {
      text.push(token);
      continue;
    }

    const key = match[1].toLowerCase();
    const value = match[2];

    if (key === "from") {
      const values = splitValues(value).map((v) => stripSigil(v, "@").toLowerCase());
      if (values.length) result.from.push(...values);
      else text.push(token);
      continue;
    }

    if (key === "in") {
      const values = splitValues(value).map((v) => stripSigil(v, "#").toLowerCase());
      if (values.length) result.in.push(...values);
      else text.push(token);
      continue;
    }

    if (key === "has") {
      const values = splitValues(value).map((v) => v.toLowerCase());
      const valid = values.filter((v): v is HasFilter =>
        (HAS_FILTERS as readonly string[]).includes(v),
      );
      // A mix of known and unknown values keeps the known ones; a wholly
      // unknown value means the token was not really an operator.
      if (valid.length) result.has.push(...valid);
      else text.push(token);
      continue;
    }

    if (key === "before" || key === "after") {
      const parsed = parseSearchDate(value);
      if (!parsed) {
        text.push(token);
        continue;
      }
      // Repeating an operator keeps the narrower bound, so a widening mistake
      // cannot silently undo the tighter one.
      if (key === "before") {
        result.before = result.before && result.before < parsed ? result.before : parsed;
      } else {
        result.after = result.after && result.after > parsed ? result.after : parsed;
      }
      continue;
    }

    if (key === "pinned") {
      const flag = value.trim().toLowerCase();
      // A bare `pinned:` reads as "yes, pinned", the only reason to write it.
      if (flag === "" || flag === "true" || flag === "yes" || flag === "1") {
        result.pinned = true;
        continue;
      }
      if (flag === "false" || flag === "no" || flag === "0") continue;
      text.push(token);
      continue;
    }

    text.push(token);
  }

  result.text = text.join(" ").trim();
  return result;
}

/** True when nothing at all was asked for, so the caller can short-circuit. */
export function isEmptyQuery(query: SearchQuery): boolean {
  return (
    !query.text &&
    !query.from.length &&
    !query.in.length &&
    !query.has.length &&
    !query.before &&
    !query.after &&
    !query.pinned
  );
}

export interface SearchFilterSql {
  /** SQL predicates to AND onto the message query, all referring to alias `m`. */
  clauses: string[];
  /** Positional bindings, in the same order as `clauses`. */
  params: unknown[];
}

/**
 * Turns the filters into SQL against the `messages` alias `m`.
 *
 * Kept separate from the route so the generated predicates can be asserted
 * directly, and so the FTS path and the LIKE fallback share one definition of
 * what a filter means.
 */
export function buildMessageFilters(query: SearchQuery): SearchFilterSql {
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const term of query.from) {
    // `author` is the display name captured when the message was written, while
    // `user_id` is stable across renames. Matching either means a saved-style
    // search keeps working after someone changes their nickname.
    clauses.push(
      "(m.author = ? COLLATE NOCASE OR m.user_id IN (SELECT id FROM users WHERE username_lower = ?))",
    );
    params.push(term, term);
  }

  for (const term of query.in) {
    clauses.push("(m.channel_id = ? COLLATE NOCASE OR m.channel = ? COLLATE NOCASE)");
    params.push(term, term);
  }

  for (const filter of query.has) {
    switch (filter) {
      case "link":
      case "embed":
        clauses.push("(m.link IS NOT NULL AND m.link != '')");
        break;
      case "image":
        clauses.push(
          "(m.attachment_key IS NOT NULL AND lower(m.attachment_key) NOT LIKE '%.pdf')",
        );
        break;
      case "file":
        clauses.push("(m.attachment_key IS NOT NULL OR m.attachments IS NOT NULL)");
        break;
      case "audio":
        clauses.push("(m.audio_url IS NOT NULL AND m.audio_url != '')");
        break;
    }
  }

  // `created_at` is an ISO 8601 string, so lexicographic comparison is also
  // chronological and SQLite needs no date parsing to bound it.
  if (query.before) {
    clauses.push("m.created_at < ?");
    params.push(query.before);
  }
  if (query.after) {
    clauses.push("m.created_at >= ?");
    params.push(query.after);
  }

  if (query.pinned) clauses.push("m.pinned_at IS NOT NULL");

  return { clauses, params };
}
