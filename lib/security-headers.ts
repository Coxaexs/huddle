/**
 * Security response headers for every response Hoffle returns.
 *
 * Applied centrally from `worker/index.ts`, which is the single entry point for
 * app pages, API routes, uploaded assets and the Discord-compatible bot
 * surface — so a route added later is covered without anyone remembering to opt
 * in. The pure helpers live here so they can be unit tested without workerd.
 *
 * Two tiers:
 *
 * 1. Baseline headers, always on. Each one is safe for this app: it does not
 *    block the WebRTC, WebSocket, blob-worker or media behaviour the client
 *    relies on.
 * 2. A Content-Security-Policy, opt-in via `HUDDLE_CSP`. A wrong CSP silently
 *    breaks voice, uploads or themes for self-hosters, and there is no browser
 *    in this repo's test suite to catch that, so it is left off until an
 *    operator turns it on and checks their own instance. `RECOMMENDED_CSP`
 *    below is the policy to start from.
 */

/** Env key that turns the CSP on. Any non-empty value enables it. */
export const CSP_ENV_KEY = "HUDDLE_CSP";

/**
 * Starting point for a CSP that fits Hoffle's feature set:
 *
 * - `'unsafe-inline'` on styles: themes and the theme editor inject CSS, and
 *   React sets inline `style` attributes throughout.
 * - `blob:` on script and worker: the dice renderer, RNNoise worklet and
 *   recorder run from blob URLs.
 * - `'wasm-unsafe-eval'`: the MediaPipe selfie-segmentation wasm build.
 * - `ws:`/`wss:` on connect: the realtime hub and LiveKit signalling.
 * - `https:` on img/frame/media: link previews, GIFs, embeds and pasted images.
 */
export const RECOMMENDED_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' ws: wss: https:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * Headers safe to send unconditionally.
 *
 * Deliberately absent:
 * - `Cross-Origin-Opener-Policy`, which isolates the browsing context group and
 *   can break popups the composer opens for external links.
 * - `Cross-Origin-Embedder-Policy: require-corp`, which would break the
 *   third-party embeds (YouTube/GIF) that link previews rely on.
 */
const BASELINE_HEADERS: ReadonlyArray<readonly [string, string]> = [
  // Stop browsers guessing a Content-Type we did not intend. Matters most for
  // R2-backed uploads, where a mislabelled file executed as HTML would be an XSS.
  ["x-content-type-options", "nosniff"],
  // Nobody should frame Hoffle. Clickjacking a chat client can leak a click on
  // a destructive action.
  ["x-frame-options", "SAMEORIGIN"],
  // Keep invite tokens and BASE_PATH out of the Referer sent to third-party
  // hosts reached via link previews.
  ["referrer-policy", "strict-origin-when-cross-origin"],
  // The client needs camera/mic/screen for voice, so those stay allowed for
  // same-origin only; everything else is denied outright.
  [
    "permissions-policy",
    [
      "camera=(self)",
      "microphone=(self)",
      "display-capture=(self)",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "serial=()",
    ].join(", "),
  ],
];

export interface SecurityHeaderOptions {
  /** `HUDDLE_CSP`: enables `RECOMMENDED_CSP`. Parsed like `lib/features.ts`. */
  csp?: string | null;
  /** `HUDDLE_CSP_POLICY`: an exact policy string, replacing the bundled one. */
  cspPolicy?: string | null;
}

/** Matches the off-values `featureFlags` accepts, so env parsing stays uniform. */
function isEnabled(value: string | null | undefined): boolean {
  if (value == null) return false;
  return !["0", "false", "off", "no", ""].includes(value.trim().toLowerCase());
}

/** Decides whether a CSP should be sent, and which one. */
function resolveCsp(options: SecurityHeaderOptions): string | null {
  const explicit = options.cspPolicy?.trim();
  if (explicit) return explicit;
  return isEnabled(options.csp) ? RECOMMENDED_CSP : null;
}


/**
 * Returns the headers that should be present on a response.
 *
 * `secure` gates HSTS: sending it over plain HTTP is meaningless and would pin a
 * self-hoster's browser to a scheme they are not serving.
 */
export function securityHeaders(
  options: SecurityHeaderOptions = {},
  secure = false,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of BASELINE_HEADERS) headers[name] = value;

  if (secure) {
    // One year. Only meaningful (and only sent) over HTTPS.
    headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  }

  const policy = resolveCsp(options);
  if (policy) headers["content-security-policy"] = policy;

  return headers;
}

/** True when the original request reached us over HTTPS, directly or via a proxy. */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim().toLowerCase() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Copies `response` with the security headers added.
 *
 * Two cases pass through untouched:
 *
 * - Protocol upgrades (101). Their headers are immutable per the Fetch spec, so
 *   rebuilding the response throws.
 * - Anything that already set one of these headers, so a route with a stricter
 *   policy of its own (the untrusted-image proxy sends `default-src 'none';
 *   sandbox`) is never loosened by this wrapper.
 */
export function withSecurityHeaders(
  request: Request,
  response: Response,
  options: SecurityHeaderOptions = {},
): Response {
  if (response.status === 101 || response.webSocket) return response;

  const headers = new Headers(response.headers);
  let changed = false;
  for (const [name, value] of Object.entries(
    securityHeaders(options, isSecureRequest(request)),
  )) {
    if (headers.has(name)) continue;
    headers.set(name, value);
    changed = true;
  }

  if (!changed) return response;

  // 204/304 must not carry a body; `new Response(null, …)` is how the Fetch API
  // expresses that without tripping the null-body status check.
  const body =
    response.status === 204 || response.status === 304 ? null : response.body;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
