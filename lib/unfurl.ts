/**
 * Link previews: fetch a page server-side and pull its Open Graph / Twitter
 * card tags. Huddle runs on a home machine, so the fetcher refuses anything
 * that could reach the local network — private IPs, localhost-style names,
 * odd ports — and re-checks every redirect hop, including what each hostname
 * resolves to (via DNS-over-HTTPS), so a public name pointing at 127.0.0.1
 * does not slip through.
 */

export interface LinkPreview {
  url: string;
  siteName: string;
  title: string;
  /** Who made it — the channel for a YouTube video. */
  author?: string;
  authorUrl?: string;
  description?: string;
  image?: string;
  /** Large image card (summary_large_image / og:image with no twitter card). */
  largeImage?: boolean;
  themeColor?: string;
}

const USER_AGENT = "Mozilla/5.0 (compatible; HuddleBot/1.0; link previews)";
/** Big pages (YouTube is ~1.6 MB) put their tags deep; stop at </head>. */
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 6000;

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".arpa",
  ".intranet",
  ".corp",
];

function privateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateIpv6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1") return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateIpv4(mapped[1]);
  if (value.startsWith("::ffff:")) return true;
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(value);
}

/** Syntactic check on a URL: scheme, port and hostname shape. */
export function isSafePublicUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || !host.includes(".")) return null;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  // IP literals: the URL parser already normalises 0x7f.1 and friends.
  if (host.startsWith("[")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && privateIpv4(host)) return null;
  return url;
}

/** Resolves a hostname over DNS-over-HTTPS and rejects private answers. */
async function resolvesPublic(host: string): Promise<boolean> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !privateIpv4(host);
  const lookups = await Promise.all(
    (["A", "AAAA"] as const).map(async (type) => {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(3000),
        },
      );
      if (!response.ok) throw new Error("dns");
      const data = (await response.json()) as {
        Answer?: Array<{ type: number; data: string }>;
      };
      return data.Answer || [];
    }),
  ).catch(() => null);
  if (!lookups) return false;
  const addresses = lookups
    .flat()
    .filter((answer) => answer.type === 1 || answer.type === 28);
  if (!addresses.length) return false;
  return addresses.every((answer) =>
    answer.type === 1 ? !privateIpv4(answer.data) : !privateIpv6(answer.data),
  );
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[lower] ?? whole;
  });
}

function clean(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const text = decodeEntities(value).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Pulls preview fields out of a page's HTML. Returns null when there is nothing to show. */
export function parsePreview(html: string, pageUrl: string): LinkPreview | null {
  const head = html.slice(0, MAX_HTML_BYTES);
  const meta: Record<string, string> = {};
  for (const tag of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const attr of tag[0].matchAll(
      /([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g,
    )) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? "";
    }
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = attrs.content;
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  const title = clean(meta["og:title"] || meta["twitter:title"] || titleTag, 200);
  const description = clean(
    meta["og:description"] || meta["twitter:description"] || meta.description,
    350,
  );
  if (!title && !description) return null;

  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return null;
  }
  let image: string | undefined;
  const rawImage =
    meta["og:image:secure_url"] ||
    meta["og:image"] ||
    meta["og:image:url"] ||
    meta["twitter:image"] ||
    meta["twitter:image:src"];
  if (rawImage) {
    try {
      const resolved = new URL(decodeEntities(rawImage.trim()), base);
      if (resolved.protocol === "https:" || resolved.protocol === "http:") {
        image = resolved.toString().slice(0, 1000);
      }
    } catch {
      image = undefined;
    }
  }
  const card = (meta["twitter:card"] || "").toLowerCase();
  const themeColor = /^#[0-9a-f]{3,8}$/i.test(meta["theme-color"] || "")
    ? meta["theme-color"]
    : undefined;

  return {
    url: pageUrl,
    siteName: clean(meta["og:site_name"], 80) || base.hostname.replace(/^www\./, ""),
    title: title || base.hostname,
    description,
    image,
    largeImage: Boolean(image) && (card === "summary_large_image" || card === "player" || !card),
    themeColor,
  };
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  const probe = new TextDecoder("utf-8", { fatal: false });
  let tail = "";
  let total = 0;
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
    // Everything a preview needs lives in <head>.
    tail = (tail + probe.decode(value, { stream: true })).slice(-4096);
    if (/<\/head\s*>/i.test(tail)) break;
  }
  void reader.cancel().catch(() => undefined);
  const merged = new Uint8Array(Math.min(total, MAX_HTML_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, merged.length - offset);
    merged.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= merged.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/**
 * Fetches a public URL, following redirects by hand so every hop gets the
 * same checks (shape + DNS). Returns null for anything unsafe or not OK.
 */
export async function safeFetch(raw: string, accept: string): Promise<Response | null> {
  let current = isSafePublicUrl(raw);
  for (let hop = 0; current && hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await resolvesPublic(current.hostname.toLowerCase()))) return null;
    const response = await fetch(current.toString(), {
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept, "accept-language": "en" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      void response.body?.cancel().catch(() => undefined);
      if (!location) return null;
      current = isSafePublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return null;
    }
    return response;
  }
  return null;
}

/** YouTube video id for watch / youtu.be / shorts / embed / live links. */
export function youtubeId(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else {
        const match = url.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
        id = match?.[2] || null;
      }
    }
    return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** YouTube's oEmbed gives the real title and channel without scraping. */
async function youtubePreview(url: string, videoId: string): Promise<LinkPreview | null> {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`,
    { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  ).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json().catch(() => null)) as {
    title?: string;
    author_name?: string;
    author_url?: string;
  } | null;
  if (!data?.title) return null;
  const authorUrl =
    data.author_url && /^https:\/\/(www\.)?youtube\.com\//.test(data.author_url)
      ? data.author_url
      : undefined;
  return {
    url,
    siteName: "YouTube",
    title: clean(data.title, 200) || "YouTube video",
    author: clean(data.author_name, 100),
    authorUrl,
    image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    largeImage: true,
    themeColor: "#ff0033",
  };
}

/** Fetches `raw` (following safe redirects only) and returns its preview. */
export async function fetchPreview(raw: string): Promise<LinkPreview | null> {
  const videoId = youtubeId(raw);
  if (videoId) {
    const youtube = await youtubePreview(raw, videoId);
    if (youtube) return youtube;
  }
  const response = await safeFetch(raw, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5");
  if (!response) return null;
  const type = response.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml/i.test(type)) {
    void response.body?.cancel().catch(() => undefined);
    return null;
  }
  return parsePreview(await readCapped(response), response.url || raw);
}

/** Raster formats the image proxy will pass through (never SVG: it can script). */
export const PROXY_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

async function hmac(key: string, value: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  return [...new Uint8Array(signature).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Signs an image URL so the proxy only serves images Huddle itself linked.
 * `!'()*` are escaped too, so the result is safe inside an unquoted CSS url().
 */
export async function signImageUrl(key: string, imageUrl: string): Promise<string> {
  const encoded = encodeURIComponent(imageUrl).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `/hangout/api/unfurl/image?url=${encoded}&sig=${await hmac(key, imageUrl)}`;
}

export async function verifyImageSignature(
  key: string,
  imageUrl: string,
  signature: string,
): Promise<boolean> {
  const expected = await hmac(key, imageUrl);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

let proxyKeyCache: Promise<string> | null = null;

/**
 * Secret for signing proxied image URLs: made once, kept in the `meta` table
 * so signed links survive restarts.
 */
export function imageProxyKey(db: D1Database): Promise<string> {
  if (!proxyKeyCache) {
    proxyKeyCache = (async () => {
      const fresh = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      await db
        .prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('image_proxy_key', ?)")
        .bind(fresh)
        .run();
      const row = await db
        .prepare("SELECT value FROM meta WHERE key = 'image_proxy_key'")
        .first<{ value: string }>();
      if (!row?.value) throw new Error("No image proxy key");
      return row.value;
    })().catch((error) => {
      proxyKeyCache = null;
      throw error;
    });
  }
  return proxyKeyCache;
}
