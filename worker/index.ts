/**
 * Cloudflare Worker entry point.
 *
 * vinext handles every HTTP request except the realtime upgrade: a 101 response
 * has immutable headers, and the framework's response pipeline wants to add
 * Vary to whatever it gets back, so the socket is answered here instead.
 */
import handler from "vinext/server/app-router-entry";
import { currentUser } from "../lib/auth";
import { hub } from "../lib/hub-client";
import { featureFlags } from "../lib/features";

export { HuddleHub } from "../lib/hub";
export { DiscordGateway } from "../lib/discord/gateway";

const DEFAULT_BASE_PATH = "/hangout";

interface WorkerEnv {
  ASSETS?: Fetcher;
  DISCORD_GATEWAY?: DurableObjectNamespace;
  BOT_TOKEN?: string;
  RECORDER_SERVICE_TOKEN?: string;
  FEATURE_RECORD_SESSIONS?: string;
  BASE_PATH?: string;
  LANDING_DOMAINS?: string;
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
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

      const stub = hub();
      if (!stub) {
        return new Response("Realtime is not configured.", { status: 503 });
      }

      const target = new URL("https://huddle.hub/socket");
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
      if (isMusicBot || isRecorder) target.searchParams.set("bot", "1");
      if (isRecorder) target.searchParams.set("recorder", "1");

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
  },
};
