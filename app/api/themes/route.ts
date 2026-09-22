import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export interface StoredCustomThemeRow {
  id: string;
  name: string;
  description: string;
  base_theme: "cozy" | "legacy" | "light";
  colors: string;
  corners: number;
  backdrop: string;
  custom_css: string;
  created_by: string;
  creator_name: string;
  creator_username: string;
  is_public: number;
  stars: number;
  created_at: string;
  updated_at: string;
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ themes: [] });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("query")?.trim().toLowerCase() || "";

  try {
    let rows: StoredCustomThemeRow[] = [];
    if (q) {
      const searchPattern = `%${q}%`;
      const result = await db
        .prepare(
          `SELECT * FROM custom_themes
            WHERE is_public = 1
              AND (LOWER(name) LIKE ?1 OR LOWER(description) LIKE ?1 OR LOWER(creator_name) LIKE ?1)
            ORDER BY created_at DESC
            LIMIT 50`,
        )
        .bind(searchPattern)
        .all<StoredCustomThemeRow>();
      rows = result.results || [];
    } else {
      const result = await db
        .prepare(
          `SELECT * FROM custom_themes
            WHERE is_public = 1
            ORDER BY created_at DESC
            LIMIT 50`,
        )
        .all<StoredCustomThemeRow>();
      rows = result.results || [];
    }

    const themes = rows.map((r) => {
      let colors = {};
      try {
        colors = JSON.parse(r.colors);
      } catch {
        colors = {};
      }
      return {
        id: r.id,
        name: r.name,
        description: r.description || "",
        baseTheme: r.base_theme || "cozy",
        colors,
        corners: r.corners ?? 16,
        backdrop: r.backdrop || "plain",
        customCss: r.custom_css || "",
        author: {
          id: r.created_by,
          displayName: r.creator_name || "Community Member",
          username: r.creator_username || "user",
        },
        isPublic: Boolean(r.is_public),
        stars: r.stars || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    return Response.json({ themes });
  } catch (error) {
    console.error("Failed to load custom themes:", error);
    return Response.json({ themes: [] });
  }
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Database not connected" },
      { status: 503 },
    );
  }

  const user = await currentUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    theme?: {
      id?: string;
      name?: string;
      description?: string;
      baseTheme?: string;
      colors?: Record<string, string>;
      corners?: number;
      backdrop?: string;
      customCss?: string;
      isPublic?: boolean;
    };
  };

  const theme = body.theme;
  if (!theme || !theme.name || typeof theme.name !== "string") {
    return Response.json({ error: "Theme name is required" }, { status: 400 });
  }

  const id = (theme.id && typeof theme.id === "string" && theme.id.trim())
    ? theme.id.trim().slice(0, 64)
    : `theme_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const name = theme.name.trim().slice(0, 60);
  const description = (theme.description || "").trim().slice(0, 240);
  const baseTheme = ["cozy", "legacy", "light"].includes(theme.baseTheme || "")
    ? theme.baseTheme!
    : "cozy";
  const colors = JSON.stringify(theme.colors || {});
  const corners = Math.min(28, Math.max(4, Number(theme.corners) || 16));
  const backdrop = (theme.backdrop || "plain").slice(0, 30);
  const customCss = (theme.customCss || "").slice(0, 30000);
  const isPublic = theme.isPublic !== false ? 1 : 0;
  const now = new Date().toISOString();

  // Check if theme exists and user has permission to update
  const existing = await db
    .prepare("SELECT created_by FROM custom_themes WHERE id = ?")
    .bind(id)
    .first<{ created_by: string }>();

  if (existing && existing.created_by !== user.id && !user.is_admin) {
    return Response.json(
      { error: "You cannot edit a theme created by another member" },
      { status: 403 },
    );
  }

  if (existing) {
    await db
      .prepare(
        `UPDATE custom_themes
            SET name = ?, description = ?, base_theme = ?, colors = ?, corners = ?,
                backdrop = ?, custom_css = ?, is_public = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(
        name,
        description,
        baseTheme,
        colors,
        corners,
        backdrop,
        customCss,
        isPublic,
        now,
        id,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO custom_themes (
          id, name, description, base_theme, colors, corners,
          backdrop, custom_css, created_by, creator_name, creator_username,
          is_public, stars, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(
        id,
        name,
        description,
        baseTheme,
        colors,
        corners,
        backdrop,
        customCss,
        user.id,
        user.display_name,
        user.username,
        isPublic,
        now,
        now,
      )
      .run();
  }

  return Response.json({
    theme: {
      id,
      name,
      description,
      baseTheme,
      colors: theme.colors || {},
      corners,
      backdrop,
      customCss,
      author: {
        id: user.id,
        displayName: user.display_name,
        username: user.username,
      },
      isPublic: Boolean(isPublic),
      stars: 0,
      createdAt: now,
      updatedAt: now,
    },
  });
}

export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database not connected" }, { status: 503 });
  }

  const user = await currentUser(request);
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Theme ID is required" }, { status: 400 });
  }

  const existing = await db
    .prepare("SELECT created_by FROM custom_themes WHERE id = ?")
    .bind(id)
    .first<{ created_by: string }>();

  if (!existing) {
    return Response.json({ error: "Theme not found" }, { status: 404 });
  }

  if (existing.created_by !== user.id && !user.is_admin) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  await db.prepare("DELETE FROM custom_themes WHERE id = ?").bind(id).run();
  return Response.json({ ok: true, id });
}
