/**
 * A Discord-shaped CDN in front of Hoffle's uploads.
 *
 * Clients build image URLs themselves — `cdn.discordapp.com/avatars/{id}/
 * {hash}.png` — from the id and hash in a payload, so serving avatars means
 * answering that URL shape. A bot points its library at this host with
 * `new Client({ rest: { cdn: 'http://host/hangout/api/cdn' } })`.
 *
 * The hash in the path is ignored on purpose: it exists to bust client caches
 * when an image changes, while the id is what actually identifies the row.
 */
import { bindings } from "../storage";
import { ensureSchema } from "../schema";
import { nativeFor } from "./snowflake";

export async function handleCdn(
  _request: Request,
  path: string,
  basePath: string,
): Promise<Response> {
  const segments = path.split("/").filter(Boolean);
  const [kind, id] = segments;

  // Discord's default avatars, which clients fall back to for a null hash.
  if (kind === "embed" && segments[1] === "avatars") {
    return new Response(null, {
      status: 302,
      headers: { location: `${basePath}/default-avatar.png` },
    });
  }

  const db = bindings().DB;
  if (!db || !id) return new Response("Not found", { status: 404 });
  await ensureSchema(db);

  let source: string | null = null;

  if (kind === "avatars") {
    const userId = await nativeFor("user", id);
    if (userId) {
      const row = await db
        .prepare("SELECT avatar_url FROM users WHERE id = ?")
        .bind(userId)
        .first<{ avatar_url: string | null }>();
      source = row?.avatar_url ?? null;
    }
  } else if (kind === "banners") {
    const userId = await nativeFor("user", id);
    if (userId) {
      const row = await db
        .prepare("SELECT banner_url FROM users WHERE id = ?")
        .bind(userId)
        .first<{ banner_url: string | null }>();
      source = row?.banner_url ?? null;
    }
  } else if (kind === "icons") {
    const serverId = await nativeFor("guild", id);
    if (serverId) {
      const row = await db
        .prepare("SELECT icon_url FROM servers WHERE id = ?")
        .bind(serverId)
        .first<{ icon_url: string | null }>();
      source = row?.icon_url ?? null;
    }
  }

  if (!source) return new Response("Not found", { status: 404 });

  return new Response(null, {
    status: 302,
    headers: { location: source, "cache-control": "public, max-age=300" },
  });
}
