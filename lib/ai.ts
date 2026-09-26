/**
 * `/ask`: a small chat assistant backed by Gemini's free tier.
 *
 * Everything here is shaped by two budgets. Tokens: the model is a Flash-Lite
 * one, answers are capped, history is only the last few turns of the AI's own
 * thread, and each turn is truncated. Free-tier quota: Gemini's built-in Google
 * Search grounding has no free quota, so web results come from DuckDuckGo's
 * HTML page instead (no key) and are only fetched when the question looks like
 * it needs something current.
 */

/** Per-user limits, plus one instance-wide cap that keeps a free key under its daily quota. */
export const AI_LIMITS = {
  perMinute: 3,
  perHour: 60,
  /** Kept well under Flash-Lite's free daily quota. */
  perDayDefault: 200,
} as const;

/** Tried in order; the next one is used when a model is gone or out of quota. */
export const DEFAULT_AI_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];

export const AI_AUTHOR = "Huddle AI";
export const AI_AVATAR = "✦";
export const AI_COLOR = "#8b7cf6";
export const AI_KIND = "ai";

const MAX_QUESTION = 1000;
const MAX_OUTPUT_TOKENS = 600;
/** Earlier turns sent as context, counting both sides. */
const HISTORY_TURNS = 6;
const HISTORY_TURN_CHARS = 500;
const WEB_RESULTS = 4;
const WEB_SNIPPET_CHARS = 220;

export interface AiTurn {
  role: "user" | "model";
  text: string;
}

export interface AiSource {
  title: string;
  url: string;
}

export interface AiPayload {
  question: string;
  sources?: AiSource[];
  model?: string;
}

/**
 * Whether a question is worth a web search. Plain knowledge, code and writing
 * questions are answered from the model alone, which saves the search and the
 * ~300 prompt tokens its results cost. `web:` forces a search, `noweb:` skips it.
 */
export function wantsWeb(question: string): boolean {
  const q = question.trim().toLowerCase();
  if (/^(no-?web|offline)\s*:/.test(q)) return false;
  if (/^(web|search|google)\s*:/.test(q)) return true;
  return /\b(today|tonight|now|current(ly)?|latest|newest|recent(ly)?|news|this (week|month|year|season)|yesterday|tomorrow|price[sd]?|costs?|weather|forecast|scores?|won|winners?|results?|released?|releases|update[sd]?|patch|version|schedule|stock|exchange rate|20[2-3]\d|look ?up|website|who is|what happened|is .* (dead|alive|out))\b/.test(
    q,
  );
}

/** Drops a leading `web:` / `noweb:` so the model sees only the question. */
export function stripWebPrefix(question: string): string {
  return question.replace(/^\s*(no-?web|offline|web|search|google)\s*:\s*/i, "").trim();
}

export function cleanQuestion(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, MAX_QUESTION) : "";
}

function decodeEntities(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** DuckDuckGo wraps result links in a redirect; the real URL is in `uddg`. */
function unwrapDuckLink(href: string): string | null {
  try {
    const url = new URL(href.replace(/&amp;/g, "&"), "https://duckduckgo.com");
    const target = url.searchParams.get("uddg") || url.href;
    const parsed = new URL(target);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    // Sponsored results point back at duckduckgo.com/y.js.
    if (parsed.hostname.endsWith("duckduckgo.com")) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export interface WebResult extends AiSource {
  snippet: string;
}

/** Parses DuckDuckGo's HTML results page. Exported for tests. */
export function parseDuckResults(html: string, limit = WEB_RESULTS): WebResult[] {
  const results: WebResult[] = [];
  const blocks = html.split(/<div class="result results_links/).slice(1);
  for (const block of blocks) {
    const link = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const url = unwrapDuckLink(link[1]);
    if (!url) continue;
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    results.push({
      url,
      title: decodeEntities(link[2]).slice(0, 120),
      snippet: snippet ? decodeEntities(snippet[1]).slice(0, WEB_SNIPPET_CHARS) : "",
    });
    if (results.length >= limit) break;
  }
  return results;
}

/** Top web results, or none when the search is slow or blocked; never throws. */
export async function webSearch(query: string): Promise<WebResult[]> {
  try {
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.slice(0, 300))}`,
      {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; HuddleAI/1.0)",
          accept: "text/html",
        },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) return [];
    return parseDuckResults(await response.text());
  } catch {
    return [];
  }
}

export function systemPrompt(now = new Date()): string {
  return [
    `You are ${AI_AUTHOR}, an assistant inside a group chat app. Today is ${now.toISOString().slice(0, 10)}.`,
    "Answer directly and briefly: usually under 120 words, longer only when asked or when code needs it.",
    "Use light Markdown. No preamble, no restating the question.",
    "When web results are given, rely on them for recent facts and cite them inline as [1], [2].",
    "If you are unsure or the results do not say, say so.",
  ].join(" ");
}

/** Keeps the tail of a conversation, each turn trimmed, alternating roles as Gemini wants. */
export function trimHistory(turns: AiTurn[]): AiTurn[] {
  const merged: AiTurn[] = [];
  for (const turn of turns) {
    // Old [1]-style citations point at results this request does not carry.
    const text = turn.text.replace(/\s?\[\d+\]/g, "").trim().slice(0, HISTORY_TURN_CHARS);
    if (!text) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.text = `${last.text}\n${text}`.slice(0, HISTORY_TURN_CHARS * 2);
    else merged.push({ role: turn.role, text });
  }
  const tail = merged.slice(-HISTORY_TURNS);
  // The request must start with a user turn.
  while (tail.length && tail[0].role !== "user") tail.shift();
  return tail;
}

export function buildUserTurn(question: string, results: WebResult[]): string {
  if (!results.length) return question;
  const lines = results.map(
    (result, index) => `[${index + 1}] ${result.title} (${result.url}): ${result.snippet}`,
  );
  return `Web results:\n${lines.join("\n")}\n\nQuestion: ${question}`;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export function modelList(configured: string | undefined): string[] {
  const models = (configured || "")
    .split(",")
    .map((model) => model.trim().replace(/^models\//, ""))
    .filter(Boolean);
  return models.length ? models : DEFAULT_AI_MODELS;
}

/** One Gemini call, falling through the model list on "gone" or "out of quota". */
export async function askGemini(options: {
  apiKey: string;
  models: string[];
  history: AiTurn[];
  question: string;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; model: string }> {
  const doFetch = options.fetchImpl ?? fetch;
  const contents = [...options.history, { role: "user" as const, text: options.question }].map(
    (turn) => ({ role: turn.role, parts: [{ text: turn.text }] }),
  );
  let lastError = "The AI did not answer.";
  let quota = false;
  for (const model of options.models) {
    let response: Response;
    try {
      response = await doFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt() }] },
            contents,
            generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.6 },
          }),
          signal: AbortSignal.timeout(25000),
        },
      );
    } catch {
      lastError = "The AI took too long to answer.";
      continue;
    }
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    if (!response.ok) {
      lastError = data.error?.message || `Gemini returned ${response.status}.`;
      if (response.status === 429) quota = true;
      // Gone, renamed, overloaded or out of quota: another model may still work.
      if ([404, 429, 500, 503].includes(response.status)) continue;
      throw new AiError(lastError);
    }
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .filter((part) => !part.thought && part.text)
      .map((part) => part.text)
      .join("")
      .trim();
    if (text) return { text, model };
    lastError =
      candidate?.finishReason === "SAFETY"
        ? "The AI would not answer that."
        : "The AI returned an empty answer.";
    throw new AiError(lastError);
  }
  throw new AiError(
    quota ? "The AI has used up its free quota for now. Try again later." : lastError,
    quota ? 429 : 502,
  );
}

export interface AiQuotaResult {
  allowed: boolean;
  /** Shown to the asker when refused. */
  message?: string;
  retryAfter?: number;
  /** Row to delete if the answer then fails, so a failure costs nothing. */
  refund?: () => Promise<void>;
  remaining?: { minute: number; hour: number };
}

function waitText(seconds: number): string {
  return seconds < 90 ? `${seconds}s` : `${Math.ceil(seconds / 60)} min`;
}

/**
 * Rolling-window limits for /ask: per user per minute and per hour, plus one
 * daily budget for the whole server. Counts come from a log of answers rather
 * than clock-aligned buckets, so "3 a minute" means 3 in any 60 seconds.
 * The request is recorded up front (two quick asks can't both squeeze into
 * the last slot) and refunded if the answer fails.
 */
export async function checkAiQuota(
  db: D1Database,
  userId: string,
  options: { perMinute: number; perHour: number; perDay: number; now?: number },
): Promise<AiQuotaResult> {
  const now = options.now ?? Date.now();
  const minuteAgo = now - 60_000;
  const hourAgo = now - 3_600_000;
  const dayAgo = now - 86_400_000;

  // Old rows are never needed again; trimming here keeps the table tiny.
  await db.prepare("DELETE FROM ai_usage WHERE at < ?").bind(dayAgo).run();

  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM ai_usage WHERE user_id = ?1 AND at > ?2) AS minute,
         (SELECT MIN(at) FROM ai_usage WHERE user_id = ?1 AND at > ?2) AS minute_oldest,
         (SELECT COUNT(*) FROM ai_usage WHERE user_id = ?1 AND at > ?3) AS hour,
         (SELECT MIN(at) FROM ai_usage WHERE user_id = ?1 AND at > ?3) AS hour_oldest,
         (SELECT COUNT(*) FROM ai_usage WHERE at > ?4) AS day,
         (SELECT MIN(at) FROM ai_usage WHERE at > ?4) AS day_oldest`,
    )
    .bind(userId, minuteAgo, hourAgo, dayAgo)
    .first<{
      minute: number;
      minute_oldest: number | null;
      hour: number;
      hour_oldest: number | null;
      day: number;
      day_oldest: number | null;
    }>();
  const c = counts ?? { minute: 0, minute_oldest: null, hour: 0, hour_oldest: null, day: 0, day_oldest: null };
  // Seconds until the oldest counted ask leaves its window.
  const until = (oldest: number | null, span: number) =>
    Math.max(1, Math.ceil(((oldest ?? now) + span - now) / 1000));

  if (c.minute >= options.perMinute) {
    const retryAfter = until(c.minute_oldest, 60_000);
    return {
      allowed: false,
      retryAfter,
      message: `You can ask ${options.perMinute} questions a minute. Try again in ${waitText(retryAfter)}.`,
    };
  }
  if (c.hour >= options.perHour) {
    const retryAfter = until(c.hour_oldest, 3_600_000);
    return {
      allowed: false,
      retryAfter,
      message: `You've asked ${options.perHour} questions this hour. Try again in ${waitText(retryAfter)}.`,
    };
  }
  if (c.day >= options.perDay) {
    const retryAfter = until(c.day_oldest, 86_400_000);
    return {
      allowed: false,
      retryAfter,
      message: `The AI has reached today's free limit for this server. Try again in ${waitText(retryAfter)}.`,
    };
  }

  await db.prepare("INSERT INTO ai_usage (user_id, at) VALUES (?, ?)").bind(userId, now).run();
  return {
    allowed: true,
    remaining: { minute: options.perMinute - c.minute - 1, hour: options.perHour - c.hour - 1 },
    refund: async () => {
      await db
        .prepare("DELETE FROM ai_usage WHERE rowid = (SELECT rowid FROM ai_usage WHERE user_id = ? AND at = ? LIMIT 1)")
        .bind(userId, now)
        .run();
    },
  };
}
