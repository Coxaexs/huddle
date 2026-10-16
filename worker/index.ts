/**
 * Cloudflare Worker entry point.
 *
 * vinext handles every HTTP request except the realtime upgrade: a 101 response
 * has immutable headers, and the framework's response pipeline wants to add
 * Vary to whatever it gets back, so the socket is answered here instead.
 */
import handler from "vinext/server/app-router-entry";
import { currentUser } from "../lib/auth";
import { hub, roomHub } from "../lib/hub-client";
import { allDisabledFeatures, disabledFeatureFor, featureFlags, SIDE_FEATURES } from "../lib/features";
import { withSecurityHeaders } from "../lib/security-headers";
import { SPEECH_HOST } from "../lib/speech";

export { HuddleHub } from "../lib/hub";
export { DiscordGateway } from "../lib/discord/gateway";

const DEFAULT_BASE_PATH = "/hangout";

interface WorkerEnv {
  ASSETS?: Fetcher;
  DISCORD_GATEWAY?: DurableObjectNamespace;
  BOT_TOKEN?: string;
  RECORDER_SERVICE_TOKEN?: string;
  FEATURE_RECORD_SESSIONS?: string;
  FEATURES_DISABLED?: string;
  DB?: D1Database;
  BASE_PATH?: string;
  LANDING_DOMAINS?: string;
  /** Set to a truthy value to send the recommended Content-Security-Policy. */
  HUDDLE_CSP?: string;
  /** An exact Content-Security-Policy to send instead of the recommended one. */
  HUDDLE_CSP_POLICY?: string;
  /** PatientDesk key: Alania text-to-speech and Duyu live captions. */
  SPEECH_API_KEY?: string;
}

/** One live-caption stream lasts at most this long; the client reconnects. */
const STT_SESSION_MS = 20 * 60_000;

export default {
  /**
   * Every response — pages, API routes, uploads, the bot surface — leaves
   * through here so the security headers in `lib/security-headers.ts` are
   * applied in exactly one place. WebSocket upgrades pass through untouched.
   */
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    const started = Date.now();
    let response: Response;
    try {
      response = await handleRequest(request, env, ctx);
    } catch (error) {
      logRequest(request, 500, started, error);
      response = Response.json({ error: "Something went wrong." }, { status: 500 });
      return withSecurityHeaders(request, response, {
        csp: env?.HUDDLE_CSP,
        cspPolicy: env?.HUDDLE_CSP_POLICY,
      });
    }
    if (response.status >= 500) logRequest(request, response.status, started);
    return withSecurityHeaders(request, response, {
      csp: env?.HUDDLE_CSP,
      cspPolicy: env?.HUDDLE_CSP_POLICY,
    });
  },
};

/**
 * One JSON line per server error, so `wrangler tail`, `docker logs` or any log
 * shipper can filter and count them. Query strings are left out: they can carry
 * invite codes and tokens.
 */
function logRequest(request: Request, status: number, started: number, error?: unknown) {
  const url = new URL(request.url);
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      method: request.method,
      path: url.pathname,
      status,
      ms: Date.now() - started,
      ray: request.headers.get("cf-ray") ?? undefined,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error === undefined
            ? undefined
            : String(error),
    }),
  );
}

async function handleRequest(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  {
    const url = new URL(request.url);
    const basePath = (env?.BASE_PATH ?? DEFAULT_BASE_PATH).replace(/\/+$/, "");
    const effectiveBasePath = basePath || DEFAULT_BASE_PATH;
    const realtimePaths = new Set([
      `${effectiveBasePath}/api/realtime`,
      "/api/realtime",
    ]);

    // Built assets are emitted without the basePath, so a request for
    // /hangout/assets/x.js or /assets/x.js matches here.
    if (
      env?.ASSETS &&
      (url.pathname.startsWith(`${effectiveBasePath}/assets/`) ||
        url.pathname.startsWith("/assets/"))
    ) {
      const target = new URL(request.url);
      if (url.pathname.startsWith(`${effectiveBasePath}/assets/`)) {
        target.pathname = url.pathname.slice(effectiveBasePath.length);
      }
      return env.ASSETS.fetch(new Request(target, request));
    }

    if (realtimePaths.has(url.pathname)) {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected a WebSocket upgrade.", { status: 426 });
      }

      // Browsers use their session cookie. The server-side music publisher has
      // a separate bearer token and a fixed identity it cannot override.
      const authorization = request.headers.get("authorization");
      const isMusicBot = Boolean(
        env.BOT_TOKEN && authorization === `Bearer ${env.BOT_TOKEN}`,
      );
      // The recorder participant is refused entirely while the feature is off,
      // so a stale recorder-service cannot connect or record anything.
      const isRecorder = Boolean(
        featureFlags(env).recordSessions &&
          env.RECORDER_SERVICE_TOKEN &&
          authorization === `Bearer ${env.RECORDER_SERVICE_TOKEN}`,
      );
      const user = isMusicBot || isRecorder ? null : await currentUser(request);
      if (!isMusicBot && !isRecorder && !user) {
        return new Response("Unauthorized", { status: 401 });
      }

      const roomParam = url.searchParams.get("room")?.trim().slice(0, 64) || "";
      const stub = roomParam ? roomHub(roomParam) : hub();
      if (!stub) {
        return new Response("Realtime is not configured.", { status: 503 });
      }

      const target = new URL("https://huddle.hub/socket");
      if (roomParam) target.searchParams.set("room", roomParam);
      target.searchParams.set(
        "userId",
        isRecorder ? "bot:recorder" : isMusicBot ? "bot:music" : user!.id,
      );
      target.searchParams.set(
        "username",
        isRecorder ? "recorder" : isMusicBot ? "musicbot" : user!.username,
      );
      target.searchParams.set(
        "displayName",
        isRecorder
          ? "D&D Session Recorder"
          : isMusicBot
            ? "Music + Watch"
            : user!.display_name,
      );
      target.searchParams.set("avatar", isRecorder ? "REC" : isMusicBot ? "♫" : user!.avatar);
      if (!isMusicBot && !isRecorder && user!.avatar_url) {
        target.searchParams.set("avatarUrl", user!.avatar_url);
      }
      target.searchParams.set(
        "color",
        isRecorder ? "#e14d4d" : isMusicBot ? "#a99af5" : user!.color,
      );
      for (const name of ["resume", "ticket"]) {
        const value = url.searchParams.get(name);
        if (value) target.searchParams.set(name, value.slice(0, 200));
      }
      if (isMusicBot || isRecorder) target.searchParams.set("bot", "1");
      if (isRecorder) target.searchParams.set("recorder", "1");
      if (!isMusicBot && !isRecorder && user!.status === "invisible") {
        target.searchParams.set("invisible", "1");
      }

      return stub.fetch(target.toString(), {
        headers: { upgrade: "websocket" },
      });
    }

    // ---- Discord-compatible bot surface ----
    // Bots reach these with their own base URL configured, so both the
    // basePath-prefixed and bare forms have to resolve.
    const discordPath = url.pathname.startsWith(`${effectiveBasePath}/api/`)
      ? url.pathname.slice(effectiveBasePath.length)
      : url.pathname.startsWith("/api/")
        ? url.pathname
        : null;

    // A side feature switched off (FEATURES_DISABLED or from /admin) answers
    // here, before any of its code runs. Core chat routes are never in that list.
    const switchedOff =
      discordPath && /^\/api\/[a-z]/.test(discordPath)
        ? disabledFeatureFor(discordPath, await allDisabledFeatures(env))
        : null;
    if (switchedOff) {
      return Response.json(
        { error: `${SIDE_FEATURES[switchedOff]} is turned off right now.`, feature: switchedOff },
        { status: 503, headers: { "Retry-After": "3600" } },
      );
    }

    if (discordPath === "/api/gateway") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected a WebSocket upgrade.", { status: 426 });
      }
      const namespace = env.DISCORD_GATEWAY;
      if (!namespace) {
        return new Response("The bot gateway is not configured.", { status: 503 });
      }
      // IDENTIFY carries the token, so the upgrade itself is unauthenticated —
      // exactly as on Discord, where an un-identified socket can do nothing but
      // sit through its heartbeat interval and get closed.
      const stub = namespace.get(namespace.idFromName("discord-gateway"));
      const target = new URL("https://hoffle.gateway/socket");
      for (const [key, value] of url.searchParams) {
        target.searchParams.set(key, value);
      }
      // READY carries resume_gateway_url, and the Durable Object cannot know
      // the public origin a bot reached us on, so it is passed down here.
      target.searchParams.set(
        "resumeUrl",
        `${url.origin.replace(/^http/, "ws")}${effectiveBasePath}/api/gateway`,
      );
      return stub.fetch(target.toString(), {
        headers: { upgrade: "websocket" },
      });
    }

    if (discordPath === "/api/stt/stream") {
      return proxySpeechStream(request, env);
    }

    const discordRest = discordPath?.match(/^\/api\/v(\d+)(\/.*)?$/);
    // v1 is Hoffle's own simpler bot API and stays where it is.
    if (discordRest && discordRest[1] !== "1") {
      const { handleDiscordRest } = await import("../lib/discord/rest");
      const segments = (discordRest[2] || "")
        .split("/")
        .filter(Boolean)
        .map((segment) => decodeURIComponent(segment));
      return handleDiscordRest(request, discordRest[1], segments, effectiveBasePath);
    }

    if (discordPath?.startsWith("/api/cdn/")) {
      const { handleCdn } = await import("../lib/discord/cdn");
      return handleCdn(request, discordPath.slice("/api/cdn".length), effectiveBasePath);
    }

    if (!url.pathname.startsWith(effectiveBasePath)) {
      const target = new URL(request.url);
      const rawHost = request.headers.get("host") || url.host;
      const host = rawHost.split(":")[0].toLowerCase();
      const configuredLandingDomains = (env?.LANDING_DOMAINS || "hoffle.online,www.hoffle.online")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const isLanding = configuredLandingDomains.includes(host);
      if (url.pathname === "/" && isLanding) {
        target.pathname = `${effectiveBasePath}/landing`;
      } else {
        const sub = url.pathname.startsWith("/") ? url.pathname : `/${url.pathname}`;
        target.pathname = `${effectiveBasePath}${sub}`;
      }
      return handler.fetch(new Request(target, request), env as never, ctx as never);
    }

    return handler.fetch(request, env as never, ctx as never);
  }
}

/**
 * Live captions through Duyu. The browser streams 16-bit PCM here and gets
 * Duyu's JSON events back; this socket only relays both ways, so the API key
 * never reaches the browser (Duyu's own browser tokens need a signing secret
 * we do not have).
 */
async function proxySpeechStream(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade.", { status: 426 });
  }
  if (!(await currentUser(request))) return new Response("Unauthorized", { status: 401 });
  const key = env.SPEECH_API_KEY?.trim();
  if (!key) return new Response("Speech-to-text is not configured.", { status: 503 });

  const upstream = await fetch(
    `https://${SPEECH_HOST}/v1/audio/stream?key=${encodeURIComponent(key)}`,
    { headers: { upgrade: "websocket" } },
  ).catch(() => null);
  const remote = upstream?.webSocket;
  if (!remote) return new Response("The speech service is unavailable.", { status: 502 });
  remote.accept();

  const [client, socket] = Object.values(new WebSocketPair());
  socket.accept();
  let open = true;
  const closeBoth = (code = 1000, reason = "") => {
    if (!open) return;
    open = false;
    clearTimeout(timer);
    for (const end of [socket, remote]) {
      try {
        end.close(code, reason);
      } catch {
        // Already closed.
      }
    }
  };
  const timer = setTimeout(() => closeBoth(4000, "session limit"), STT_SESSION_MS);
  // Binary frames can arrive as Blobs, which send() would stringify; turning
  // them back into bytes is async, so a chain keeps the audio in order.
  let outgoing: Promise<void> = Promise.resolve();
  socket.addEventListener("message", (event) => {
    const data = event.data as string | ArrayBuffer | Blob;
    outgoing = outgoing.then(async () => {
      try {
        remote.send(data instanceof Blob ? await data.arrayBuffer() : data);
      } catch {
        closeBoth(1011, "upstream gone");
      }
    });
  });
  remote.addEventListener("message", (event) => {
    try {
      socket.send(event.data);
    } catch {
      closeBoth();
    }
  });
  // 1005/1006 are reserved and cannot be sent on; pass a plain close instead.
  const relayClose = (event: CloseEvent) =>
    closeBoth(event.code >= 3000 || event.code === 1000 || event.code === 1011 ? event.code : 1000, event.reason);
  socket.addEventListener("close", relayClose);
  remote.addEventListener("close", relayClose);
  socket.addEventListener("error", () => closeBoth(1011));
  remote.addEventListener("error", () => closeBoth(1011));

  return new Response(null, { status: 101, webSocket: client });
}
