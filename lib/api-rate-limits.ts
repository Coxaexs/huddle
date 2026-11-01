/**
 * One rate limit gate for every `/api/*` request, run by the worker before any
 * route code. Route handlers keep their own finer limits (logins, messages,
 * uploads, AI); this adds a ceiling for everything else, so a script on an
 * open-signup account cannot hammer the routes that cost real work: YouTube
 * downloads, link previews, GIF and message search, server imports.
 *
 * Who is counted:
 * - a browser session, by its session cookie;
 * - a bot, by its Authorization header (bots get their own, larger budget);
 * - anyone else, by IP.
 * Every caller that came in through a proxy also counts towards a per-IP
 * backstop, so making up fresh cookies does not buy fresh budgets.
 *
 * Requests with no client address at all came straight to this process from
 * the same machine (the music helper, the Discord bridge, the recorder) and
 * are not limited here; they never pass through Cloudflare or nginx.
 *
 * Budgets sit well above what real use reaches: the busiest real minute seen
 * on chat.hoffle.online was about 360 API calls from one client while it walked
 * through every screen, and single routes peak around 100 a minute.
 */
import { SESSION_COOKIE, LEGACY_SESSION_COOKIE } from "./auth";
import { checkMemoryRateLimit, type RateLimitRule } from "./rate-limit";

/** Budgets shared by every route, per caller unless noted. */
export const API_BUDGETS = {
  /** A signed-in browser, all ordinary API calls. */
  session: { action: "api-session", limit: 900, windowSeconds: 60 },
  /** Someone with no session: landing pages, invite previews, sign-in. */
  anonymous: { action: "api-anon", limit: 300, windowSeconds: 60 },
  /** A Discord-style or Hoffle bot, by token. About Discord's own 50 a second. */
  bot: { action: "api-bot", limit: 3000, windowSeconds: 60 },
  /** Images, previews and video segments: many at once while scrolling. */
  media: { action: "api-media", limit: 3000, windowSeconds: 60 },
  /** Everything from one address, whatever cookies or tokens it sends. */
  ip: { action: "api-ip", limit: 4000, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

interface RouteLimit {
  /** Matched against the path from `/api` on, e.g. `/api/youtube/download`. */
  pattern: RegExp;
  /** Methods it applies to; empty means all. */
  methods: readonly string[];
  rules: readonly RateLimitRule[];
}

const WRITE = ["POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Routes that do real work per call, each with its own budget on top of the
 * shared one. Numbers are far above normal use; they only stop scripts.
 */
export const ROUTE_LIMITS: readonly RouteLimit[] = [
  // The server downloads the whole video to its own disk.
  {
    pattern: /^\/api\/youtube\/download$/,
    methods: ["POST"],
    rules: [
      { action: "yt-download", limit: 10, windowSeconds: 3600 },
      { action: "yt-download-day", limit: 40, windowSeconds: 86400 },
    ],
  },
  { pattern: /^\/api\/youtube\/search$/, methods: [], rules: [{ action: "yt-search", limit: 60, windowSeconds: 60 }] },
  // Each preview makes the server fetch someone else's page.
  { pattern: /^\/api\/unfurl$/, methods: [], rules: [{ action: "unfurl", limit: 120, windowSeconds: 60 }] },
  { pattern: /^\/api\/gifs$/, methods: [], rules: [{ action: "gifs", limit: 120, windowSeconds: 60 }] },
  { pattern: /^\/api\/messages\/search$/, methods: [], rules: [{ action: "message-search", limit: 60, windowSeconds: 60 }] },
  { pattern: /^\/api\/users\/search$/, methods: [], rules: [{ action: "user-search", limit: 60, windowSeconds: 60 }] },
  { pattern: /^\/api\/invites\/resolve$/, methods: [], rules: [{ action: "invite-resolve", limit: 60, windowSeconds: 60 }] },
  { pattern: /^\/api\/servers\/[^/]+\/import$/, methods: ["POST"], rules: [{ action: "server-import", limit: 5, windowSeconds: 3600 }] },
  { pattern: /^\/api\/reports$/, methods: ["POST"], rules: [{ action: "report", limit: 30, windowSeconds: 3600 }] },
  { pattern: /^\/api\/requests$/, methods: ["POST"], rules: [{ action: "idea", limit: 10, windowSeconds: 3600 }] },
  { pattern: /^\/api\/invites$/, methods: ["POST"], rules: [{ action: "invite-create", limit: 30, windowSeconds: 3600 }] },
  { pattern: /^\/api\/dms\/groups$/, methods: ["POST"], rules: [{ action: "group-dm", limit: 20, windowSeconds: 3600 }] },
  // Custom emoji, stickers, sounds and themes take space and reach every member.
  { pattern: /^\/api\/emojis$/, methods: WRITE, rules: [{ action: "emoji-write", limit: 120, windowSeconds: 3600 }] },
  { pattern: /^\/api\/stickers(\/packs)?$/, methods: WRITE, rules: [{ action: "sticker-write", limit: 120, windowSeconds: 3600 }] },
  { pattern: /^\/api\/sounds$/, methods: WRITE, rules: [{ action: "sound-write", limit: 120, windowSeconds: 3600 }] },
  { pattern: /^\/api\/themes$/, methods: WRITE, rules: [{ action: "theme-write", limit: 60, windowSeconds: 3600 }] },
  // Every reaction and edit is broadcast to everyone in the channel.
  { pattern: /^\/api\/messages\/[^/]+\/reactions$/, methods: WRITE, rules: [{ action: "reaction", limit: 40, windowSeconds: 10 }] },
  { pattern: /^\/api\/messages\/[^/]+$/, methods: ["PATCH"], rules: [{ action: "message-edit", limit: 30, windowSeconds: 60 }] },
  { pattern: /^\/api\/polls$/, methods: ["POST"], rules: [{ action: "poll-create", limit: 20, windowSeconds: 600 }] },
  { pattern: /^\/api\/polls\/vote$/, methods: WRITE, rules: [{ action: "poll-vote", limit: 60, windowSeconds: 60 }] },
  { pattern: /^\/api\/events$/, methods: ["POST"], rules: [{ action: "event-create", limit: 30, windowSeconds: 3600 }] },
  { pattern: /^\/api\/tts\/speak$/, methods: ["POST"], rules: [{ action: "tts", limit: 30, windowSeconds: 60 }] },
  { pattern: /^\/api\/music\/command$/, methods: ["POST"], rules: [{ action: "music-command", limit: 60, windowSeconds: 60 }] },
  { pattern: /^\/api\/commands(\/component)?$/, methods: ["POST"], rules: [{ action: "command", limit: 60, windowSeconds: 60 }] },
  { pattern: /^\/api\/widgets\/press$/, methods: ["POST"], rules: [{ action: "widget-press", limit: 60, windowSeconds: 60 }] },
  // Adding a game server makes this server poll someone else's.
  { pattern: /^\/api\/game-servers$/, methods: ["POST"], rules: [{ action: "game-server-add", limit: 20, windowSeconds: 3600 }] },
  { pattern: /^\/api\/push\/ntfy$/, methods: ["POST"], rules: [{ action: "ntfy", limit: 20, windowSeconds: 3600 }] },
  { pattern: /^\/api\/servers\/membership$/, methods: WRITE, rules: [{ action: "server-join", limit: 60, windowSeconds: 3600 }] },
];

/** Paths that serve files and images, counted in the `media` budget instead. */
const MEDIA_PATHS = [
  /^\/api\/uploads\/[^/]+$/,
  /^\/api\/unfurl\/image$/,
  /^\/api\/media\/cover$/,
  /^\/api\/cdn\//,
  /^\/api\/watch\/jellyfin\//,
  /^\/api\/youtube\/stream\//,
  /^\/api\/recordings\/file\//,
];

/** Long-lived sockets are limited where they are opened, not per message. */
const SKIPPED_PATHS = new Set(["/api/realtime", "/api/gateway", "/api/stt/stream"]);

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/** Short stable label for a secret, so session tokens never sit in the map. */
async function fingerprint(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The address a proxy reported, or null for a call made on this machine. */
function proxiedIp(request: Request): string | null {
  const direct = request.headers.get("cf-connecting-ip")?.trim();
  if (direct) return direct;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || null;
}

type Caller = { key: string; kind: "session" | "bot" | "anonymous" };

async function callerFor(request: Request, ip: string): Promise<Caller> {
  const cookies = request.headers.get("cookie") || "";
  const session = readCookie(cookies, SESSION_COOKIE) || readCookie(cookies, LEGACY_SESSION_COOKIE);
  if (session) return { key: `s:${await fingerprint(session)}`, kind: "session" };
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization) return { key: `b:${await fingerprint(authorization)}`, kind: "bot" };
  return { key: `ip:${ip}`, kind: "anonymous" };
}

function tooMany(retryAfter: number, discordStyle: boolean): Response {
  const headers = { "retry-after": String(retryAfter) };
  if (discordStyle) {
    // discord.js and discord.py read this shape and wait before retrying.
    return Response.json(
      { message: "You are being rate limited.", retry_after: retryAfter, global: false },
      { status: 429, headers: { ...headers, "x-ratelimit-scope": "user" } },
    );
  }
  return Response.json(
    { error: "Slow down a little. Please wait and try again.", retryAfter },
    { status: 429, headers },
  );
}

/**
 * Counts one API call and returns a ready 429 when the caller is over any
 * budget, or null to carry on. `apiPath` is the path from `/api` on, with the
 * base path already removed.
 */
export async function apiRateLimit(
  request: Request,
  apiPath: string,
  now: number = Date.now(),
): Promise<Response | null> {
  if (SKIPPED_PATHS.has(apiPath) || request.method === "OPTIONS") return null;
  const ip = proxiedIp(request);
  if (!ip) return null;

  const caller = await callerFor(request, ip);
  const discordStyle = /^\/api\/v(?!1\/)\d+\//.test(apiPath);
  const isMedia = request.method === "GET" && MEDIA_PATHS.some((pattern) => pattern.test(apiPath));

  const rules: Array<[RateLimitRule, string]> = [[API_BUDGETS.ip, `ip:${ip}`]];
  rules.push([isMedia ? API_BUDGETS.media : API_BUDGETS[caller.kind], caller.key]);
  for (const route of ROUTE_LIMITS) {
    if (!route.pattern.test(apiPath)) continue;
    if (route.methods.length && !route.methods.includes(request.method)) continue;
    for (const rule of route.rules) rules.push([rule, caller.key]);
  }

  let retryAfter = 0;
  for (const [rule, key] of rules) {
    const result = checkMemoryRateLimit(rule, key, now);
    if (!result.allowed) retryAfter = Math.max(retryAfter, result.retryAfter);
  }
  return retryAfter > 0 ? tooMany(retryAfter, discordStyle) : null;
}
