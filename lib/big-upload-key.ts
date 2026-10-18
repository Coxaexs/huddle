/**
 * Big temporary uploads (up to 2 GB, for people an admin picked) live in their
 * own bucket and are deleted 12 hours after they were sent. Their key carries
 * the expiry, `tmp<unix seconds>-<uuid>--<name>`, so a message renders the
 * countdown without asking the server. Shared by the client and the server.
 */

export const BIG_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const BIG_UPLOAD_LIFETIME_MS = 12 * 60 * 60 * 1000;
/**
 * Each part goes up as its own request: Cloudflare refuses a body over 100 MB
 * and nginx over 45 MB (client_max_body_size for /hangout/). R2 wants every
 * part but the last to be the same size.
 */
export const BIG_UPLOAD_PART_BYTES = 32 * 1024 * 1024;
/** Files above this take the big-upload path (the normal upload limit). */
export const NORMAL_UPLOAD_MAX_BYTES = 40 * 1024 * 1024;
/** Pictures are capped lower; bigger photos are scaled down before upload. */
export const IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

const KEY_PATTERN = /^tmp(\d{9,11})-[0-9a-f-]{36}--./;

export function bigUploadKey(expiresAt: number, uuid: string, name: string): string {
  return `tmp${Math.floor(expiresAt / 1000)}-${uuid}--${name}`;
}

export function isBigUploadKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** When a big upload is deleted (ms since epoch), or null for a normal key. */
export function bigUploadExpiry(key: string): number | null {
  const match = KEY_PATTERN.exec(key);
  return match ? Number(match[1]) * 1000 : null;
}

/** The same, read from an upload URL like `/hangout/api/uploads/<key>`. */
export function bigUploadExpiryFromUrl(url: string): number | null {
  const encoded = url.split("/api/uploads/")[1];
  if (!encoded) return null;
  try {
    return bigUploadExpiry(decodeURIComponent(encoded.split(/[?#]/)[0]));
  } catch {
    return null;
  }
}

/** "deleted in 11 h", "deleted in 40 min", or "expired". */
export function describeBigUploadExpiry(expiresAt: number, now = Date.now()): string {
  const left = expiresAt - now;
  if (left <= 0) return "expired";
  const minutes = Math.ceil(left / 60_000);
  if (minutes < 60) return `deleted in ${minutes} min`;
  return `deleted in ${Math.round(minutes / 60)} h`;
}
