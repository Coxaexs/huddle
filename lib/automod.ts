/**
 * Server automod: rules that decide whether a message may be posted.
 *
 * The decision is made by a pure function (`evaluateMessage`) so the awkward
 * parts — word boundaries, URL allow-lists, caps ratios — can be tested without
 * a database or a request. `app/api/messages/route.ts` loads the rules and acts
 * on the verdict.
 *
 * Scope is deliberately narrow and local:
 *
 * - A rule either blocks the message or blocks it and times the author out.
 *   There is no "delete it quietly" mode, because silently dropping a member's
 *   message is indistinguishable from a bug to everyone involved.
 * - Members who can moderate are never subject to automod. Otherwise the first
 *   thing an admin does after enabling a keyword rule is lock themselves out.
 * - DMs are out of scope entirely. A server's rules must not reach into a
 *   private conversation between two people.
 */

export const AUTOMOD_KINDS = [
  "keyword",
  "mention_limit",
  "link",
  "caps",
  "repeat",
] as const;
export type AutomodKind = (typeof AUTOMOD_KINDS)[number];

export const AUTOMOD_ACTIONS = ["block", "timeout"] as const;
export type AutomodAction = (typeof AUTOMOD_ACTIONS)[number];

export type AutomodConfig =
  | { kind: "keyword"; words: string[]; regex: boolean }
  | { kind: "mention_limit"; max: number }
  | { kind: "link"; allow: string[] }
  | { kind: "caps"; minLetters: number; percent: number }
  | { kind: "repeat"; maxRepeats: number };

export interface AutomodRule {
  id: string;
  serverId: string;
  kind: AutomodKind;
  action: AutomodAction;
  timeoutMinutes: number;
  config: AutomodConfig;
}

/** A row of the `automod_rules` table, as SQLite returns it. */
export interface StoredAutomodRule {
  id: string;
  server_id: string;
  kind: string;
  enabled: number;
  action: string;
  timeout_minutes: number;
  config: string;
}

/**
 * Defaults for each rule kind.
 *
 * `mention_limit` and `repeat` get a working default because their natural
 * configuration is a single number. `keyword` deliberately does not: a rule
 * with no words can never match, so shipping one would only mislead an operator
 * into thinking their server was protected.
 */
const DEFAULTS = {
  mention_limit: { max: 5 },
  link: { allow: [] as string[] },
  caps: { minLetters: 12, percent: 70 },
  repeat: { maxRepeats: 3 },
} as const;

/** How far back the repeat rule looks for identical messages. */
export const REPEAT_WINDOW_MS = 10 * 60_000;

/** Longest a keyword may be, and how many a single rule may hold. */
const MAX_KEYWORD_LENGTH = 120;
const MAX_KEYWORDS = 200;

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, MAX_KEYWORD_LENGTH))
    .filter(Boolean)
    .slice(0, limit);
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

/**
 * Builds a usable rule from a database row, or null when the row is disabled or
 * cannot be turned into something that could ever match.
 */
export function toAutomodRule(row: StoredAutomodRule): AutomodRule | null {
  if (!row.enabled) return null;
  if (!(AUTOMOD_KINDS as readonly string[]).includes(row.kind)) return null;

  const kind = row.kind as AutomodKind;
  const action: AutomodAction = (AUTOMOD_ACTIONS as readonly string[]).includes(row.action)
    ? (row.action as AutomodAction)
    : "block";
  // A timeout action with no duration would be an immediate, silent un-timeout.
  const timeoutMinutes =
    action === "timeout" ? positiveInt(row.timeout_minutes, 10, 60 * 24 * 7) : 0;
  const raw = parseJson(row.config);

  let config: AutomodConfig;
  switch (kind) {
    case "keyword": {
      const words = stringList(raw.words, MAX_KEYWORDS);
      if (!words.length) return null;
      config = { kind, words, regex: raw.regex === true };
      break;
    }
    case "mention_limit":
      config = { kind, max: positiveInt(raw.max, DEFAULTS.mention_limit.max, 100) };
      break;
    case "link":
      config = { kind, allow: stringList(raw.allow, MAX_KEYWORDS) };
      break;
    case "caps":
      config = {
        kind,
        minLetters: positiveInt(raw.minLetters, DEFAULTS.caps.minLetters, 1000),
        // A percentage above 100 could never fire, which is never intended.
        percent: Math.min(positiveInt(raw.percent, DEFAULTS.caps.percent, 100), 100),
      };
      break;
    case "repeat":
      config = { kind, maxRepeats: positiveInt(raw.maxRepeats, DEFAULTS.repeat.maxRepeats, 50) };
      break;
  }

  return {
    id: row.id,
    serverId: row.server_id,
    kind,
    action,
    timeoutMinutes,
    config,
  };
}

export interface AutomodContext {
  /** The message body being evaluated. */
  text: string;
  /** Distinct people mentioned, plus one each for @everyone and @here. */
  mentionCount: number;
  /**
   * The author's most recent messages in this channel, oldest first, excluding
   * the one being posted. Used only by the `repeat` rule.
   */
  recentMessages?: string[];
}

export interface AutomodViolation {
  ruleId: string;
  kind: AutomodKind;
  action: AutomodAction;
  /** Minutes to time the author out; 0 unless the action is `timeout`. */
  timeoutMinutes: number;
  /** Shown to the author, so it must say what tripped and stay non-judgemental. */
  reason: string;
}

/** Matches `http(s)://…` and bare `www.` hosts, which is what people paste. */
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>()]+/gi;

export function extractUrls(text: string): string[] {
  return text.match(URL_PATTERN) ?? [];
}

/** Lowercased host of a URL, or null when it cannot be read as one. */
function hostOf(url: string): string | null {
  try {
    return new URL(url.startsWith("www.") ? `https://${url}` : url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Fraction of cased letters that are uppercase.
 *
 * Only cased letters count: digits, spaces and punctuation are not evidence of
 * shouting, and a sentence ending in "!!!" is not more shouty than one ending
 * in ".". Returns 0 for text with no cased letters at all.
 */
export function capsRatio(text: string): number {
  const cased = text.match(/\p{L}/gu)?.filter((letter) => letter.toLowerCase() !== letter.toUpperCase());
  if (!cased || !cased.length) return 0;
  const upper = cased.filter((letter) => letter === letter.toUpperCase()).length;
  return upper / cased.length;
}

/**
 * Escapes a literal keyword so it can be embedded in a RegExp.
 *
 * Keyword rules are plain text by default, and an operator who types `c++` or
 * `(nsfw)` means those characters literally.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `text` contains `phrase` as a whole word.
 *
 * The boundaries matter: a rule for `ass` must not fire on `class`, and one for
 * `porn` must not fire on `pomegranate`.
 */
export function containsKeyword(text: string, phrase: string, regex = false): boolean {
  const pattern = regex ? phrase : escapeRegExp(phrase);
  try {
    // JavaScript's `\b` only knows ASCII, so "şerefsiz" or "café" got no
    // boundary at all; letters and digits of any script count here. A phrase
    // starting or ending with punctuation falls back to a substring test for
    // that side.
    const left = /^[\p{L}\p{N}_]/u.test(phrase) ? "(?<![\\p{L}\\p{N}_])" : "";
    const right = /[\p{L}\p{N}_]$/u.test(phrase) ? "(?![\\p{L}\\p{N}_])" : "";
    return new RegExp(`${left}(?:${pattern})${right}`, "iu").test(text);
  } catch {
    // An invalid operator-supplied regex must not break message posting.
    return false;
  }
}

/** The verdict for one rule, or null when the rule is satisfied. */
function checkRule(rule: AutomodRule, context: AutomodContext): AutomodViolation | null {
  // Bound to a local so the discriminant survives into the callbacks below;
  // `rule.config` loses its narrowing across a closure boundary.
  const config = rule.config;
  const reason = (detail: string) => ({
    ruleId: rule.id,
    kind: rule.kind,
    action: rule.action,
    timeoutMinutes: rule.timeoutMinutes,
    reason: detail,
  });

  switch (config.kind) {
    case "keyword": {
      const hit = config.words.find((word) =>
        containsKeyword(context.text, word, config.regex),
      );
      // The matched word is not repeated back: quoting a blocked word can itself
      // be the thing a person wanted to say.
      return hit ? reason("That message contains a word this server blocks.") : null;
    }

    case "mention_limit": {
      if (context.mentionCount <= config.max) return null;
      const max = config.max;
      return reason(
        `That message mentions more than ${max} ${max === 1 ? "person" : "people"}.`,
      );
    }

    case "link": {
      const allowed = config.allow.map((entry) => entry.toLowerCase());
      for (const url of extractUrls(context.text)) {
        const host = hostOf(url);
        if (!host) continue;
        // An allow-list entry matches the host or any subdomain of it, so
        // `example.com` covers `cdn.example.com` without a second entry.
        const ok = allowed.some(
          (entry) => host === entry || host.endsWith(`.${entry}`),
        );
        if (!ok) return reason("That message contains a link this server does not allow.");
      }
      return null;
    }

    case "caps": {
      const letters = context.text.match(/\p{L}/gu)?.length ?? 0;
      // Short messages are exempt: "LOL" is not a wall of caps.
      if (letters < config.minLetters) return null;
      if (capsRatio(context.text) * 100 <= config.percent) return null;
      return reason("That message is mostly capital letters.");
    }

    case "repeat": {
      const previous = context.recentMessages ?? [];
      const normalised = context.text.trim().toLowerCase();
      if (!normalised) return null;
      // Counts the current message as one occurrence, so `maxRepeats: 3` means
      // three identical posts including this one.
      const same = previous.filter((m) => m.trim().toLowerCase() === normalised).length + 1;
      if (same <= config.maxRepeats) return null;
      return reason("That message has been posted several times already.");
    }
  }
}

/**
 * Runs every rule and returns the first violation, or null when the message is
 * allowed.
 *
 * First match wins rather than the strictest, because the rules were written in
 * a deliberate order and the earliest one is the most specific explanation for
 * why the message was refused.
 */
export function evaluateMessage(
  rules: AutomodRule[],
  context: AutomodContext,
): AutomodViolation | null {
  for (const rule of rules) {
    const violation = checkRule(rule, context);
    if (violation) return violation;
  }
  return null;
}


/**
 * The author's most recent message bodies in a channel, oldest first.
 *
 * Only read when a `repeat` rule is enabled, so the common case pays no extra
 * query. Deleted messages are excluded: a moderator removing spam should not
 * leave it counting toward the repeat limit.
 */
export async function recentMessageBodies(
  db: D1Database,
  channelId: string,
  userId: string,
  limit = 10,
  now: number = Date.now(),
): Promise<string[]> {
  // Only the last few minutes count: saying "gm" every morning is not spam,
  // but without a window the third "gm" of the week was refused.
  const since = new Date(now - REPEAT_WINDOW_MS).toISOString();
  const rows = await db
    .prepare(
      `SELECT content FROM messages
        WHERE channel_id = ? AND user_id = ? AND deleted_at IS NULL AND created_at > ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .bind(channelId, userId, since, limit)
    .all<{ content: string }>();

  // The query walks newest-first for the index; the rule wants oldest-first.
  return (rows.results || []).map((row) => row.content).reverse();
}

/**
 * Loads a server's enabled rules, in creation order.
 *
 * Order is preserved rather than sorted by severity because
 * `evaluateMessage` reports the first match, so the operator's own ordering is
 * what decides which reason a member is shown.
 */
export async function loadAutomodRules(
  db: D1Database,
  serverId: string | null | undefined,
): Promise<AutomodRule[]> {
  if (!serverId) return [];
  const rows = await db
    .prepare(
      `SELECT id, server_id, kind, enabled, action, timeout_minutes, config
         FROM automod_rules
        WHERE server_id = ?
        ORDER BY created_at ASC`,
    )
    .bind(serverId)
    .all<StoredAutomodRule>();

  return (rows.results || [])
    .map(toAutomodRule)
    .filter((parsed): parsed is AutomodRule => parsed !== null);
}

/**
 * Writes the timeout a rule asked for.
 *
 * Deliberately the same column the manual moderation flow uses, so an automod
 * timeout is visible and liftable in the UI exactly like a moderator's, with no
 * second notion of "muted" for the rest of the app to learn about.
 *
 * Returns the ISO end time, or null when the rule only blocks.
 */
export async function applyAutomodTimeout(
  db: D1Database,
  serverId: string,
  userId: string,
  minutes: number,
  now: number = Date.now(),
): Promise<string | null> {
  if (minutes <= 0) return null;
  const until = new Date(now + minutes * 60_000).toISOString();
  await db
    .prepare(
      "UPDATE server_members SET timeout_until = ? WHERE server_id = ? AND user_id = ?",
    )
    .bind(until, serverId, userId)
    .run();
  return until;
}

/**
 * Rule kinds that still apply to bot-flagged posts. `asBot` is set by the
 * browser (music and D&D replies are posted from the client), so it cannot be
 * a free pass; but bot replies legitimately repeat themselves and carry links.
 */
const BOT_POST_KINDS: readonly AutomodKind[] = ["keyword", "mention_limit"];

/**
 * Runs a server's rules against text a member is about to put in a channel —
 * a new message, an edit, a poll, an /ask question — and applies a timeout
 * rule's timeout. Returns the 403 to send, or null when the text may go out.
 *
 * Every write path calls this one function, so a rule cannot be dodged by
 * posting the word through a different door (editing a clean message into a
 * blocked one was the easy one).
 */
export async function enforceAutomod(
  db: D1Database,
  options: {
    serverId: string | null | undefined;
    channelId: string | null | undefined;
    userId: string;
    text: string;
    mentionCount?: number;
    /** Edits and polls are not "posting again", so the repeat rule skips them. */
    checkRepeat?: boolean;
    asBot?: boolean;
    /** Whether the author may moderate; checked lazily when omitted. */
    mayModerate?: () => Promise<boolean>;
  },
): Promise<Response | null> {
  if (!options.serverId || !options.text.trim()) return null;
  let rules = await loadAutomodRules(db, options.serverId);
  if (options.asBot) rules = rules.filter((rule) => BOT_POST_KINDS.includes(rule.kind));
  if (options.checkRepeat === false) rules = rules.filter((rule) => rule.kind !== "repeat");
  if (!rules.length) return null;
  // Checked after loading rules so servers without automod pay nothing extra.
  if (options.mayModerate && (await options.mayModerate())) return null;

  const history =
    rules.some((rule) => rule.kind === "repeat") && options.channelId
      ? await recentMessageBodies(db, options.channelId, options.userId)
      : [];
  const violation = evaluateMessage(rules, {
    text: options.text,
    mentionCount: options.mentionCount ?? 0,
    recentMessages: history,
  });
  if (!violation) return null;
  const timeoutUntil =
    violation.action === "timeout" && !options.asBot
      ? await applyAutomodTimeout(db, options.serverId, options.userId, violation.timeoutMinutes)
      : null;
  return automodResponse(violation, timeoutUntil);
}

/**
 * The 403 a blocked message gets.
 *
 * `retryAt` is included for a timeout so the composer can show the same
 * countdown the manual timeout flow does, rather than a bare error.
 */
export function automodResponse(violation: AutomodViolation, retryAt: string | null): Response {
  return Response.json(
    {
      error: violation.reason,
      automod: { ruleId: violation.ruleId, kind: violation.kind },
      ...(retryAt ? { timeoutUntil: retryAt } : {}),
    },
    { status: 403 },
  );
}

