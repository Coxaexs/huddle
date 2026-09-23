/**
 * Server-side checks for the images people put on their profile. Other
 * members' browsers load these, so an outside URL is never stored as-is: it is
 * routed through the signed image proxy, which fetches it from Huddle's side
 * and keeps viewers' IP addresses away from whoever runs that host.
 */

import { imageProxyKey, isSafePublicUrl, signImageUrl, verifyImageSignature } from "./unfurl";
import { isSafeProfileImage } from "./users";

/** A proxy URL for an outside image, matching what the proxy route verifies. */
export async function proxiedImageUrl(db: D1Database, imageUrl: string): Promise<string> {
  return signImageUrl(await imageProxyKey(db), imageUrl);
}

export type ProfileImageResult = { ok: true; url: string | null } | { ok: false; error: string };

/**
 * Normalises an avatar, banner or album-art value from a profile save.
 * Accepts empty (cleared), a local upload, an already-signed proxy URL, a
 * public http(s) image (rewritten through the proxy), or — where
 * `allowGradient` — a plain colour gradient.
 */
export async function normalizeProfileImage(
  db: D1Database,
  value: unknown,
  label: string,
  allowGradient = false,
): Promise<ProfileImageResult> {
  if (value === null || value === undefined || value === "") return { ok: true, url: null };
  if (typeof value !== "string") return { ok: false, error: `${label} must be a URL.` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, url: null };
  if (trimmed.length > 2000) return { ok: false, error: `${label} URL is too long.` };

  if (trimmed.startsWith("/hangout/api/unfurl/image?")) {
    const params = new URLSearchParams(trimmed.slice(trimmed.indexOf("?") + 1));
    const target = params.get("url") || "";
    const key = await imageProxyKey(db);
    if (target && (await verifyImageSignature(key, target, params.get("sig") || ""))) {
      return { ok: true, url: await proxiedImageUrl(db, target) };
    }
    return { ok: false, error: `${label} link is not valid.` };
  }
  if (isSafeProfileImage(trimmed, allowGradient)) return { ok: true, url: trimmed };

  const external = isSafePublicUrl(trimmed);
  if (!external) {
    return {
      ok: false,
      error: `${label} must be an uploaded image or a public http(s) image link.`,
    };
  }
  return { ok: true, url: await proxiedImageUrl(db, external.toString()) };
}

/**
 * One-time upgrade: profiles saved before images were proxied may hold raw
 * outside URLs. Rewrite them through the proxy (or drop what can't be) so
 * nothing already stored keeps leaking viewers' addresses.
 */
export async function migrateProfileImages(db: D1Database): Promise<void> {
  const done = await db
    .prepare("SELECT value FROM meta WHERE key = 'profile_images_proxied'")
    .first<{ value: string }>();
  if (done) return;

  const rows = await db
    .prepare(
      `SELECT id, avatar_url, banner_url, spotify_activity FROM users
        WHERE avatar_url IS NOT NULL OR banner_url IS NOT NULL OR spotify_activity IS NOT NULL`,
    )
    .all<{
      id: string;
      avatar_url: string | null;
      banner_url: string | null;
      spotify_activity: string | null;
    }>();

  const updates: D1PreparedStatement[] = [];
  for (const row of rows.results || []) {
    const avatar = await normalizeProfileImage(db, row.avatar_url, "Avatar");
    const banner = await normalizeProfileImage(db, row.banner_url, "Banner", true);
    let spotify = row.spotify_activity;
    if (spotify) {
      try {
        const parsed = JSON.parse(spotify) as { albumArt?: string };
        if (parsed && parsed.albumArt) {
          const art = await normalizeProfileImage(db, parsed.albumArt, "Album art");
          spotify = JSON.stringify({ ...parsed, albumArt: art.ok && art.url ? art.url : undefined });
        }
      } catch {
        spotify = null;
      }
    }
    const avatarUrl = avatar.ok ? avatar.url : null;
    const bannerUrl = banner.ok ? banner.url : null;
    if (
      avatarUrl !== row.avatar_url ||
      bannerUrl !== row.banner_url ||
      spotify !== row.spotify_activity
    ) {
      updates.push(
        db
          .prepare("UPDATE users SET avatar_url = ?, banner_url = ?, spotify_activity = ? WHERE id = ?")
          .bind(avatarUrl, bannerUrl, spotify, row.id),
      );
    }
  }
  if (updates.length) await db.batch(updates);
  await db
    .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('profile_images_proxied', ?)")
    .bind(new Date().toISOString())
    .run();
}
