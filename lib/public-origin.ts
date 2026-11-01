/**
 * The origin a client actually used to reach us.
 *
 * Behind Cloudflare and nginx the worker sees plain `http://` even when the
 * client spoke https, so `new URL(request.url).origin` is wrong for anything a
 * client will take literally: the gateway URL a Discord library connects to,
 * attachment links a bot downloads. Handing a bot `ws://` there makes
 * Cloudflare answer the upgrade with a 301, which a WebSocket cannot follow,
 * and the bot never comes online.
 *
 * Cloudflare's `CF-Visitor` survives nginx untouched, so it wins; nginx's own
 * `X-Forwarded-Proto` is next. Either can only ever upgrade http to https, so a
 * spoofed header gains nothing.
 */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  if (url.protocol === "https:") return url.origin;
  if (forwardedHttps(request)) return `https://${url.host}`;
  return url.origin;
}

function forwardedHttps(request: Request): boolean {
  const visitor = request.headers.get("cf-visitor");
  if (visitor && /"scheme"\s*:\s*"https"/i.test(visitor)) return true;
  const proto = request.headers.get("x-forwarded-proto");
  return Boolean(proto && proto.split(",")[0].trim().toLowerCase() === "https");
}

/** The same origin with the WebSocket scheme. */
export function publicWsOrigin(request: Request): string {
  return publicOrigin(request).replace(/^http/, "ws");
}
