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

      // Identity is resolved from the session cookie here; the browser never
      // gets to claim who it is.
      const user = await currentUser(request);
      if (!user) return new Response("Unauthorized", { status: 401 });

      const stub = hub();
      if (!stub) {
        return new Response("Realtime is not configured.", { status: 503 });
      }

      const target = new URL("https://huddle.hub/socket");
      target.searchParams.set("userId", user.id);
      target.searchParams.set("username", user.username);
      target.searchParams.set("displayName", user.display_name);
      target.searchParams.set("avatar", user.avatar);
      if (user.avatar_url) target.searchParams.set("avatarUrl", user.avatar_url);
      target.searchParams.set("color", user.color);

      return stub.fetch(target.toString(), {
        headers: { upgrade: "websocket" },
      });
    }

    return handler.fetch(request, env as never, ctx as never);
  },
};
