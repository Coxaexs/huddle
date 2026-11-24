/**
 * Shared public directory query helper for GET /api/discover and SSR /discover.
 * Only lists servers where `is_public = 1` and `raid_mode = 0`, stripping unsafe
 * external image links via `isSafeProfileImage`.
 */

import { DM_SERVER_ID, ensureSchema } from "./schema";
import { isDiscoverCategory, type DiscoverCategory } from "./server-templates";
import { isSafeProfileImage } from "./users";

export interface PublicDiscoverServer {
  id: string;
  name: string;
  icon: string;
  color: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  description: string;
  discoverCategory: DiscoverCategory;
  memberCount: number;
  vanityCode: string | null;
  webPublic: boolean;
  joinUrl: string;
}

export interface DiscoverQueryOptions {
  q?: string | null;
  category?: string | null;
  sort?: string | null;
  limit?: number;
  appUrl?: string;
}

export async function queryPublicDirectory(
  db: D1Database,
  opts: DiscoverQueryOptions = {},
): Promise<PublicDiscoverServer[]> {
  await ensureSchema(db);
  const appBase = (opts.appUrl || "https://chat.hoffle.online").replace(/\/+$/, "");
  const q = (opts.q || "").trim().toLowerCase();
  const categoryFilter =
    opts.category && opts.category !== "all" && isDiscoverCategory(opts.category)
      ? opts.category
      : null;
  const sort = opts.sort === "newest" ? "newest" : "members";
  const cap = Math.max(1, Math.min(100, opts.limit ?? 60));

  const orderSql =
    sort === "newest"
      ? "s.created_at DESC, member_count DESC"
      : "member_count DESC, s.position ASC, s.created_at ASC";

  const rows = await db
    .prepare(
      `SELECT s.id, s.name, s.icon, s.color, s.icon_url, s.banner_url, s.description,
              s.discover_category, s.vanity_code, s.web_public, s.created_at,
              (SELECT COUNT(*) FROM server_members m WHERE m.server_id = s.id) AS member_count
         FROM servers s
        WHERE s.id != ?1 AND s.is_public = 1 AND COALESCE(s.raid_mode, 0) = 0
        ORDER BY ${orderSql}`,
    )
    .bind(DM_SERVER_ID)
    .all<{
      id: string;
      name: string;
      icon: string;
      color: string;
      icon_url: string | null;
      banner_url: string | null;
      description: string | null;
      discover_category: string | null;
      vanity_code: string | null;
      web_public: number | null;
      member_count: number;
    }>();

  const items: PublicDiscoverServer[] = [];
  for (const row of rows.results || []) {
    const discoverCategory: DiscoverCategory = isDiscoverCategory(row.discover_category)
      ? row.discover_category
      : "community";
    if (categoryFilter && discoverCategory !== categoryFilter) continue;

    const description = row.description || "";
    if (
      q &&
      !row.name.toLowerCase().includes(q) &&
      !description.toLowerCase().includes(q)
    ) {
      continue;
    }

    const vanityCode = row.vanity_code || null;
    items.push({
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      iconUrl: isSafeProfileImage(row.icon_url) ? (row.icon_url ?? null) : null,
      bannerUrl: isSafeProfileImage(row.banner_url, true) ? (row.banner_url ?? null) : null,
      description,
      discoverCategory,
      memberCount: Number(row.member_count) || 0,
      vanityCode,
      webPublic: Boolean(row.web_public),
      joinUrl: vanityCode
        ? `${appBase}/i/${encodeURIComponent(vanityCode)}`
        : `${appBase}/?discover=${encodeURIComponent(row.id)}`,
    });
    if (items.length >= cap) break;
  }

  return items;
}
