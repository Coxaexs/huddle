/**
 * Memory for the image proxy (/api/unfurl/image), shared by every request in
 * this worker.
 *
 * Inline chat images go through the proxy unsigned, so any signed-in account
 * can ask it for any public image. The per-person limit means little when
 * guest accounts are free, so outside fetches also share one budget for the
 * whole instance. A small cache keeps that budget for new images: a picture
 * a hundred people look at is fetched once, and asking for the same URL over
 * and over cannot hammer the site behind it.
 */

/** Total size the cache may hold. */
export const IMAGE_CACHE_BYTES = 48 * 1024 * 1024;
/** Larger images are served but not kept. */
export const IMAGE_CACHE_MAX_ENTRY = 8 * 1024 * 1024;
export const IMAGE_CACHE_TTL_MS = 30 * 60_000;
/** Outside fetches for unsigned URLs, for everyone together, per minute. */
export const UPSTREAM_FETCHES_PER_MINUTE = 600;
export const UPSTREAM_BYTES_PER_MINUTE = 300 * 1024 * 1024;

interface Cached {
  body: Uint8Array<ArrayBuffer>;
  type: string;
  at: number;
}

/** In insertion order, which doubles as least-recently-used first. */
const entries = new Map<string, Cached>();
let cachedBytes = 0;
let windowStart = 0;
let windowFetches = 0;
let windowBytes = 0;

export function cachedImage(url: string, now = Date.now()): Cached | null {
  const entry = entries.get(url);
  if (!entry) return null;
  entries.delete(url);
  if (now - entry.at > IMAGE_CACHE_TTL_MS) {
    cachedBytes -= entry.body.byteLength;
    return null;
  }
  entries.set(url, entry);
  return entry;
}

export function storeImage(url: string, body: Uint8Array<ArrayBuffer>, type: string, now = Date.now()): void {
  if (body.byteLength > IMAGE_CACHE_MAX_ENTRY) return;
  const previous = entries.get(url);
  if (previous) {
    entries.delete(url);
    cachedBytes -= previous.body.byteLength;
  }
  entries.set(url, { body, type, at: now });
  cachedBytes += body.byteLength;
  for (const [key, entry] of entries) {
    if (cachedBytes <= IMAGE_CACHE_BYTES) break;
    entries.delete(key);
    cachedBytes -= entry.body.byteLength;
  }
}

function roll(now: number): void {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    windowFetches = 0;
    windowBytes = 0;
  }
}

/** Claims one outside fetch from this minute's budget; false when it is spent. */
export function takeUpstreamFetch(now = Date.now()): boolean {
  roll(now);
  if (windowFetches >= UPSTREAM_FETCHES_PER_MINUTE || windowBytes >= UPSTREAM_BYTES_PER_MINUTE) return false;
  windowFetches += 1;
  return true;
}

export function chargeUpstreamBytes(bytes: number, now = Date.now()): void {
  roll(now);
  windowBytes += bytes;
}

/** For tests. */
export function resetImageProxyCache(): void {
  entries.clear();
  cachedBytes = 0;
  windowStart = 0;
  windowFetches = 0;
  windowBytes = 0;
}
