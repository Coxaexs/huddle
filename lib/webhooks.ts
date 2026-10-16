/**
 * Incoming webhooks: a secret URL per channel that anything outside Hoffle
 * (GitHub, CI, an uptime checker, a cron script) can POST to, and the message
 * shows up in that channel as a bot post.
 *
 * The URL takes Discord's execute-webhook body, so tools that already speak
 * Discord work by swapping the host. `/github` and `/slack` suffixes take those
 * services' own payloads, as Discord's do.
 *
 * Cost: one insert and one broadcast per call, the same as a bot message. No
 * mentions are expanded and no pushes are sent, and each webhook is held to
 * WEBHOOK_RATE_LIMIT, so a chatty integration cannot load the server.
 */
import { dispatchMessage } from "./discord/dispatch";
import { publishMessage } from "./hub-client";
import { checkMemoryRateLimit } from "./rate-limit";
import type { StoredMessage } from "./storage";
import { postableChannelKindsSql } from "./channel-kinds";

/** Discord's own budget for one webhook. */
export const WEBHOOK_RATE_LIMIT = { action: "webhook", limit: 30, windowSeconds: 60 };
export const MAX_WEBHOOKS_PER_SERVER = 15;
const CONTENT_LIMIT = 2000;
const MAX_EMBEDS = 10;
const MAX_PAYLOAD = 8000;

export interface WebhookRow {
  id: string;
  server_id: string;
  channel_id: string;
  name: string;
  avatar: string;
  token: string;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  uses: number;
}

export interface PublicWebhook {
  id: string;
  channelId: string;
  name: string;
  avatar: string;
  /** Path under the base path; the client adds its origin. */
  path: string;
  createdAt: string;
  lastUsedAt: string | null;
  uses: number;
}

/** 32 random bytes, URL-safe: the whole credential, so it must be unguessable. */
export function newWebhookToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Numeric ids, so Discord libraries that parse the id as a snowflake accept the URL. */
function newWebhookId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const random = bytes.reduce((n, b) => n * 256 + b, 0) % 4_194_304;
  return String(BigInt(Date.now() - 1_420_070_400_000) * 4_194_304n + BigInt(random));
}

export function webhookPath(row: Pick<WebhookRow, "id" | "token">): string {
  return `/api/webhooks/${row.id}/${row.token}`;
}

export function publicWebhook(row: WebhookRow): PublicWebhook {
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    avatar: row.avatar,
    path: webhookPath(row),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    uses: row.uses,
  };
}

export function cleanWebhookName(raw: unknown): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function cleanWebhookAvatar(raw: unknown): string {
  const value = String(raw ?? "").trim();
  return value ? [...value].slice(0, 2).join("") : "🪝";
}

export async function listWebhooks(db: D1Database, serverId: string): Promise<WebhookRow[]> {
  const rows = await db
    .prepare("SELECT * FROM channel_webhooks WHERE server_id = ? ORDER BY created_at")
    .bind(serverId)
    .all<WebhookRow>();
  return rows.results || [];
}

export async function getWebhook(db: D1Database, id: string): Promise<WebhookRow | null> {
  return db.prepare("SELECT * FROM channel_webhooks WHERE id = ?").bind(id).first<WebhookRow>();
}

/** A text channel of this server a webhook may post into, or null. */
export async function webhookChannel(
  db: D1Database,
  serverId: string,
  channelId: string,
): Promise<{ id: string; name: string } | null> {
  return db
    .prepare(
      `SELECT id, name FROM channels WHERE id = ? AND server_id = ? AND kind IN (${postableChannelKindsSql()}) AND kind != 'dm'`,
    )
    .bind(channelId, serverId)
    .first<{ id: string; name: string }>();
}

export async function createWebhook(
  db: D1Database,
  input: { serverId: string; channelId: string; name: string; avatar: string; createdBy: string },
): Promise<WebhookRow> {
  const row: WebhookRow = {
    id: newWebhookId(),
    server_id: input.serverId,
    channel_id: input.channelId,
    name: input.name,
    avatar: input.avatar,
    token: newWebhookToken(),
    created_by: input.createdBy,
    created_at: new Date().toISOString(),
    last_used_at: null,
    uses: 0,
  };
  await db
    .prepare(
      `INSERT INTO channel_webhooks (id, server_id, channel_id, name, avatar, token, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.server_id, row.channel_id, row.name, row.avatar, row.token, row.created_by, row.created_at)
    .run();
  return row;
}

/** Same-length comparison that does not stop at the first different byte. */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface ExecuteBody {
  content?: unknown;
  username?: unknown;
  embeds?: unknown;
  thread_id?: unknown;
}

interface Embed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  author?: { name?: string; url?: string; icon_url?: string };
  footer?: { text?: string; icon_url?: string };
  thumbnail?: { url?: string };
  image?: { url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const out = String(value).slice(0, max);
  return out.trim() ? out : undefined;
}

function webUrl(value: unknown): string | undefined {
  const raw = text(value, 2000);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function colorValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(0xffffff, Math.floor(value)));
  if (typeof value === "string") {
    const hex = value.replace(/^#/, "");
    if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex, 16);
    if (/^\d+$/.test(value)) return colorValue(Number(value));
  }
  return undefined;
}

/** Discord's embed shape with only the fields Hoffle renders, each capped. */
export function cleanEmbeds(raw: unknown): Embed[] {
  if (!Array.isArray(raw)) return [];
  const out: Embed[] = [];
  for (const item of raw.slice(0, MAX_EMBEDS)) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, Record<string, unknown> & unknown>;
    const embed: Embed = {};
    embed.title = text(e.title, 256);
    embed.description = text(e.description, 4096);
    embed.url = webUrl(e.url);
    embed.color = colorValue(e.color);
    if (typeof e.timestamp === "string" && !Number.isNaN(Date.parse(e.timestamp))) embed.timestamp = e.timestamp;
    const author = e.author as Record<string, unknown> | undefined;
    if (author && typeof author === "object" && text(author.name, 256)) {
      embed.author = { name: text(author.name, 256), url: webUrl(author.url), icon_url: webUrl(author.icon_url) };
    }
    const footer = e.footer as Record<string, unknown> | undefined;
    if (footer && typeof footer === "object" && text(footer.text, 2048)) {
      embed.footer = { text: text(footer.text, 2048), icon_url: webUrl(footer.icon_url) };
    }
    const thumb = webUrl((e.thumbnail as Record<string, unknown> | undefined)?.url);
    if (thumb) embed.thumbnail = { url: thumb };
    const image = webUrl((e.image as Record<string, unknown> | undefined)?.url);
    if (image) embed.image = { url: image };
    if (Array.isArray(e.fields)) {
      const fields = (e.fields as unknown[])
        .slice(0, 25)
        .map((f) => f as Record<string, unknown>)
        .filter((f) => f && text(f.name, 256) && text(f.value, 1024))
        .map((f) => ({ name: text(f.name, 256)!, value: text(f.value, 1024)!, inline: f.inline === true }));
      if (fields.length) embed.fields = fields;
    }
    for (const key of Object.keys(embed) as Array<keyof Embed>) {
      if (embed[key] === undefined) delete embed[key];
    }
    if (Object.keys(embed).length) out.push(embed);
  }
  return out;
}

/** Slack's incoming-webhook body: `text`, plus `attachments` as embeds. */
export function slackToExecute(body: Record<string, unknown>): ExecuteBody {
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const embeds = attachments.map((raw) => {
    const a = (raw || {}) as Record<string, unknown>;
    const color = typeof a.color === "string" ? ({ good: "#2eb67d", warning: "#ecb22e", danger: "#e01e5a" } as Record<string, string>)[a.color] || a.color : undefined;
    return {
      title: a.title,
      url: a.title_link,
      description: a.text ?? a.fallback ?? a.pretext,
      color,
      author: a.author_name ? { name: a.author_name, url: a.author_link } : undefined,
      footer: a.footer ? { text: a.footer } : undefined,
      image: a.image_url ? { url: a.image_url } : undefined,
      thumbnail: a.thumb_url ? { url: a.thumb_url } : undefined,
      fields: Array.isArray(a.fields)
        ? (a.fields as Array<Record<string, unknown>>).map((f) => ({ name: f.title, value: f.value, inline: f.short === true }))
        : undefined,
    };
  });
  return { content: body.text, username: body.username, embeds };
}

const GITHUB_COLORS = { open: 0x2da44e, closed: 0xcf222e, merged: 0x8250df, neutral: 0x6e7781, release: 0x0969da };

/**
 * A GitHub webhook delivery (the `X-GitHub-Event` header plus its JSON) as an
 * embed. Returns null for events not worth a message, which still answer 204
 * so GitHub marks the delivery as fine.
 */
export function githubToExecute(event: string, raw: Record<string, unknown>): ExecuteBody | null {
  const p = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const repo: string = p.repository?.full_name || "repository";
  const sender = p.sender?.login
    ? { name: String(p.sender.login), url: p.sender.html_url, icon_url: p.sender.avatar_url }
    : undefined;
  const one = (embed: Record<string, unknown>): ExecuteBody => ({ username: "GitHub", embeds: [{ author: sender, ...embed }] });

  switch (event) {
    case "ping":
      return one({ title: `[${repo}] Webhook connected`, description: p.zen, color: GITHUB_COLORS.neutral });
    case "push": {
      const commits: Array<Record<string, any>> = Array.isArray(p.commits) ? p.commits : []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!commits.length) return null;
      const branch = String(p.ref || "").replace(/^refs\/heads\//, "");
      const lines = commits.slice(0, 5).map((c) => {
        const first = String(c.message || "").split("\n")[0].slice(0, 80);
        // Hoffle's message text has no [text](url) links; the title links to the compare view.
        return `\`${String(c.id || "").slice(0, 7)}\` ${first} — ${c.author?.username || c.author?.name || ""}`;
      });
      if (commits.length > 5) lines.push(`…and ${commits.length - 5} more`);
      return one({
        title: `[${repo}:${branch}] ${commits.length} new commit${commits.length === 1 ? "" : "s"}`,
        url: p.compare,
        description: lines.join("\n"),
        color: GITHUB_COLORS.release,
      });
    }
    case "pull_request": {
      const pr = p.pull_request || {};
      const action = pr.merged && p.action === "closed" ? "merged" : p.action;
      if (!["opened", "closed", "merged", "reopened", "ready_for_review"].includes(action)) return null;
      return one({
        title: `[${repo}] Pull request ${action.replace(/_/g, " ")}: #${pr.number} ${pr.title || ""}`,
        url: pr.html_url,
        description: action === "opened" ? String(pr.body || "").slice(0, 500) || undefined : undefined,
        color: action === "merged" ? GITHUB_COLORS.merged : action === "closed" ? GITHUB_COLORS.closed : GITHUB_COLORS.open,
      });
    }
    case "issues": {
      const issue = p.issue || {};
      if (!["opened", "closed", "reopened"].includes(p.action)) return null;
      return one({
        title: `[${repo}] Issue ${p.action}: #${issue.number} ${issue.title || ""}`,
        url: issue.html_url,
        description: p.action === "opened" ? String(issue.body || "").slice(0, 500) || undefined : undefined,
        color: p.action === "closed" ? GITHUB_COLORS.closed : GITHUB_COLORS.open,
      });
    }
    case "issue_comment": {
      if (p.action !== "created") return null;
      return one({
        title: `[${repo}] New comment on #${p.issue?.number} ${p.issue?.title || ""}`,
        url: p.comment?.html_url,
        description: String(p.comment?.body || "").slice(0, 500),
        color: GITHUB_COLORS.neutral,
      });
    }
    case "release": {
      if (p.action !== "published") return null;
      return one({
        title: `[${repo}] New release: ${p.release?.name || p.release?.tag_name}`,
        url: p.release?.html_url,
        description: String(p.release?.body || "").slice(0, 800) || undefined,
        color: GITHUB_COLORS.release,
      });
    }
    case "star":
      if (p.action !== "created") return null;
      return one({ title: `[${repo}] New star (${p.repository?.stargazers_count ?? "?"} total)`, url: p.repository?.html_url, color: 0xe3b341 });
    case "workflow_run": {
      const run = p.workflow_run || {};
      // Only the end of a run, and only what someone should look at.
      if (p.action !== "completed" || !["failure", "timed_out"].includes(run.conclusion)) return null;
      return one({
        title: `[${repo}] ${run.name || "Workflow"} failed on ${run.head_branch}`,
        url: run.html_url,
        description: String(run.head_commit?.message || "").split("\n")[0].slice(0, 200) || undefined,
        color: GITHUB_COLORS.closed,
      });
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

function discordJson(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers });
}

export function webhookError(status: number, code: number, message: string): Response {
  return discordJson(status, { message, code });
}

/**
 * Posts one webhook message. `id`/`token` come from the URL, `body` is already
 * translated to Discord's shape. Answers like Discord: 204, or the message
 * when `wait=true`.
 */
export async function executeWebhook(
  db: D1Database,
  id: string,
  token: string,
  body: ExecuteBody,
  options: { wait?: boolean; threadId?: string | null; origin?: string; basePath?: string } = {},
): Promise<Response> {
  const hook = await getWebhook(db, id);
  if (!hook || !tokensMatch(hook.token, token)) return webhookError(404, 10015, "Unknown Webhook");

  const limited = checkMemoryRateLimit(WEBHOOK_RATE_LIMIT, hook.id);
  if (!limited.allowed) {
    return discordJson(
      429,
      { message: "You are being rate limited.", retry_after: limited.retryAfter, global: false },
      { "retry-after": String(limited.retryAfter) },
    );
  }

  const content = (text(body.content, CONTENT_LIMIT) || "").trim();
  const embeds = cleanEmbeds(body.embeds);
  if (!content && !embeds.length) return webhookError(400, 50006, "Cannot send an empty message");

  const channel = await webhookChannel(db, hook.server_id, hook.channel_id);
  if (!channel) return webhookError(404, 10003, "Unknown Channel");

  const threadParam = options.threadId || text(body.thread_id, 64) || null;
  let threadId: string | null = null;
  if (threadParam) {
    const root = await db
      .prepare("SELECT 1 FROM messages WHERE id = ? AND channel_id = ? AND thread_id IS NULL AND deleted_at IS NULL")
      .bind(threadParam, channel.id)
      .first();
    if (!root) return webhookError(400, 10003, "Unknown thread");
    threadId = threadParam;
  }

  const payload = JSON.stringify({ embeds, components: [], webhookId: hook.id });
  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channel.name,
    channel_id: channel.id,
    user_id: null,
    author: (text(body.username, 80) || hook.name).trim(),
    avatar: hook.avatar,
    color: "#b8a6ff",
    content,
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    link: null,
    action_label: null,
    audio_url: null,
    kind: null,
    payload: payload.length <= MAX_PAYLOAD ? payload : JSON.stringify({ embeds: embeds.slice(0, 1), components: [], webhookId: hook.id }).slice(0, MAX_PAYLOAD),
    reply_to: null,
    thread_id: threadId,
  };

  await db.batch([
    db
      .prepare(
        `INSERT INTO messages
           (id, channel, channel_id, user_id, author, avatar, color, content,
            attachment_key, is_bot, created_at, payload, reply_to, thread_id)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?, NULL, ?)`,
      )
      .bind(stored.id, stored.channel, stored.channel_id, stored.author, stored.avatar, stored.color, stored.content, stored.created_at, stored.payload, stored.thread_id),
    db
      .prepare("UPDATE channel_webhooks SET uses = uses + 1, last_used_at = ? WHERE id = ?")
      .bind(stored.created_at, hook.id),
  ]);

  const { publicMessage } = await import("../app/api/messages/route");
  await publishMessage(channel.id, publicMessage(stored));
  await dispatchMessage("MESSAGE_CREATE", stored, { origin: options.origin, basePath: options.basePath }).catch(() => undefined);

  if (!options.wait) return new Response(null, { status: 204 });
  return discordJson(200, {
    id: stored.id,
    type: 0,
    channel_id: channel.id,
    content: stored.content,
    embeds,
    timestamp: stored.created_at,
    webhook_id: hook.id,
    author: { id: hook.id, username: stored.author, avatar: null, bot: true },
  });
}

/** Discord's webhook object, for tools that GET the URL to check it works. */
export async function describeWebhook(db: D1Database, id: string, token: string): Promise<Response> {
  const hook = await getWebhook(db, id);
  if (!hook || !tokensMatch(hook.token, token)) return webhookError(404, 10015, "Unknown Webhook");
  return discordJson(200, {
    id: hook.id,
    type: 1,
    guild_id: hook.server_id,
    channel_id: hook.channel_id,
    name: hook.name,
    avatar: null,
    token: hook.token,
    application_id: null,
  });
}

/** Reads the request body as JSON, or Discord's multipart `payload_json`, or a form. */
export async function readWebhookBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData().catch(() => null);
    if (!form) return {};
    const json = form.get("payload_json") ?? form.get("payload");
    if (typeof json === "string") {
      try {
        return JSON.parse(json) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    const content = form.get("content");
    return typeof content === "string" ? { content } : {};
  }
  const raw = await request.text().catch(() => "");
  if (raw.length > 64_000) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The whole public endpoint: `/webhooks/{id}/{token}[/github|/slack]`, from
 * either the plain route or the versioned Discord surface.
 */
export async function handleWebhookRequest(
  db: D1Database,
  request: Request,
  segments: string[],
  options: { origin?: string; basePath?: string } = {},
): Promise<Response> {
  const [id, token, flavor] = segments;
  if (!id || !token) return webhookError(404, 10015, "Unknown Webhook");
  if (request.method === "GET") return describeWebhook(db, id, token);
  if (request.method !== "POST") return webhookError(405, 0, "405: Method Not Allowed");

  const url = new URL(request.url);
  const wait = url.searchParams.get("wait") === "true";
  const threadId = url.searchParams.get("thread_id");
  const raw = await readWebhookBody(request);
  let body: ExecuteBody | null;
  if (flavor === "github") {
    body = githubToExecute(request.headers.get("x-github-event") || "", raw);
    if (!body) {
      // Still check the URL, so a wrong one fails loudly in GitHub's log.
      const hook = await getWebhook(db, id);
      if (!hook || !tokensMatch(hook.token, token)) return webhookError(404, 10015, "Unknown Webhook");
      return new Response(null, { status: 204 });
    }
  } else if (flavor === "slack") {
    body = slackToExecute(raw);
  } else if (flavor) {
    return webhookError(404, 0, "404: Not Found");
  } else {
    body = raw as ExecuteBody;
  }
  return executeWebhook(db, id, token, body, { wait, threadId, ...options });
}
