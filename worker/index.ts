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

export { HuddleHub } from "../lib/hub";

const BASE_PATH = "/hangout";
const REALTIME_PATHS = new Set([`${BASE_PATH}/api/realtime`, "/api/realtime"]);

interface WorkerEnv {
  ASSETS?: Fetcher;
  BOT_TOKEN?: string;
  RECORDER_SERVICE_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Built assets are emitted without the basePath, so a request for
    // /hangout/assets/x.js never matches the asset index on its own. Serving
    // them here keeps the app working without a matching nginx alias.
    if (env?.ASSETS && url.pathname.startsWith(`${BASE_PATH}/assets/`)) {
      const target = new URL(request.url);
      target.pathname = url.pathname.slice(BASE_PATH.length);
      return env.ASSETS.fetch(new Request(target, request));
    }

    if (REALTIME_PATHS.has(url.pathname)) {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected a WebSocket upgrade.", { status: 426 });
      }

      // Browsers use their session cookie. The server-side music publisher has
      // a separate bearer token and a fixed identity it cannot override.
      const authorization = request.headers.get("authorization");
      const isMusicBot = Boolean(
        env.BOT_TOKEN && authorization === `Bearer ${env.BOT_TOKEN}`,
      );
      const isRecorder = Boolean(
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

    return handler.fetch(request, env as never, ctx as never);
  },
};
