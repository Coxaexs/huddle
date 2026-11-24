import { recordAudit } from "@/lib/audit";
import { currentUser, unauthorized } from "@/lib/auth";
import {
  fetchDiscordExpressions,
  isAllowedDiscordAssetUrl,
  sanitizeExpressionName,
} from "@/lib/discord-import";
import { publishStructureChange } from "@/lib/hub-client";
import { canAny, Permission } from "@/lib/permissions";
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_EMOJIS_PER_IMPORT = 50;
const MAX_STICKERS_PER_IMPORT = 30;

function uniqueExpressionName(base: string, used: Set<string>): string {
  const clean = sanitizeExpressionName(base);
  if (!used.has(clean)) {
    used.add(clean);
    return clean;
  }
  for (let i = 2; i < 100; i++) {
    const suffix = `_${i}`;
    const candidate = `${clean.slice(0, 32 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const fallback = `${clean.slice(0, 24)}_${crypto.randomUUID().slice(0, 6)}`;
  used.add(fallback);
  return fallback;
}

async function downloadDiscordAsset(url: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  if (!isAllowedDiscordAssetUrl(url)) return null;
  const res = await fetch(url, { redirect: "error" }).catch(() => null);
  if (!res || !res.ok) return null;
  const contentType = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
  if (!contentType.startsWith("image/")) return null;
  const lengthHeader = Number(res.headers.get("content-length") || 0);
  if (lengthHeader > MAX_ASSET_BYTES) return null;
  const bytes = await res.arrayBuffer().catch(() => null);
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_ASSET_BYTES) return null;
  return { bytes, contentType };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  const uploads = bindings().UPLOADS;
  if (!db || !uploads) {
    return Response.json({ error: "Storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (
    !(await canAny(
      db,
      user.id,
      serverId,
      Permission.MANAGE_EMOJIS,
      Permission.MANAGE_CHANNELS,
      Permission.MANAGE_SERVER,
    ))
  ) {
    return Response.json(
      { error: "You need Manage Emojis or Manage Server permission." },
      { status: 403 },
    );
  }

  const rl = await checkRateLimit({
    db,
    action: "discord-import-assets",
    key: user.id,
    limit: 10,
    windowSeconds: 3600,
  });
  if (!rl.allowed) return new RateLimitError(rl.retryAfter).response();

  const body = (await request.json().catch(() => ({}))) as {
    guildId?: string;
    botToken?: string;
    includeEmojis?: boolean;
    includeStickers?: boolean;
    maxEmojis?: number;
    maxStickers?: number;
  };

  const guildId = String(body.guildId || "").trim();
  const botToken = String(body.botToken || "").trim();
  const includeEmojis = body.includeEmojis !== false;
  const includeStickers = body.includeStickers !== false;
  const capEmojis = Math.max(1, Math.min(MAX_EMOJIS_PER_IMPORT, Number(body.maxEmojis) || MAX_EMOJIS_PER_IMPORT));
  const capStickers = Math.max(1, Math.min(MAX_STICKERS_PER_IMPORT, Number(body.maxStickers) || MAX_STICKERS_PER_IMPORT));

  const fetched = await fetchDiscordExpressions(guildId, botToken);
  if (!fetched.ok) {
    return Response.json({ error: fetched.error }, { status: fetched.status });
  }

  const [existingEmojiRows, existingStickerRows] = await Promise.all([
    db.prepare("SELECT name FROM emojis WHERE server_id = ?").bind(serverId).all<{ name: string }>(),
    db.prepare("SELECT name FROM stickers WHERE server_id = ?").bind(serverId).all<{ name: string }>(),
  ]);

  const usedEmojis = new Set((existingEmojiRows.results || []).map((r) => r.name.toLowerCase()));
  const usedStickers = new Set((existingStickerRows.results || []).map((r) => r.name.toLowerCase()));

  let importedEmojis = 0;
  let importedStickers = 0;
  let skippedDuplicates = 0;
  let failed = 0;
  const now = new Date().toISOString();

  if (includeEmojis) {
    for (const emoji of fetched.emojis.slice(0, capEmojis)) {
      const normalized = sanitizeExpressionName(emoji.name, "emoji");
      if (usedEmojis.has(normalized)) {
        skippedDuplicates += 1;
        continue;
      }
      const downloaded = await downloadDiscordAsset(emoji.url);
      if (!downloaded) {
        failed += 1;
        continue;
      }
      const finalName = uniqueExpressionName(normalized, usedEmojis);
      const id = crypto.randomUUID();
      const key = `emojis/${serverId}/${id}.${emoji.ext}`;
      await uploads.put(key, downloaded.bytes, {
        httpMetadata: { contentType: downloaded.contentType },
      });
      await db
        .prepare(
          "INSERT INTO emojis (id, server_id, name, key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id, serverId, finalName, key, user.id, now)
        .run();
      importedEmojis += 1;
    }
  }

  if (includeStickers) {
    for (const sticker of fetched.stickers.slice(0, capStickers)) {
      const normalized = sanitizeExpressionName(sticker.name, "sticker");
      if (usedStickers.has(normalized)) {
        skippedDuplicates += 1;
        continue;
      }
      const downloaded = await downloadDiscordAsset(sticker.url);
      if (!downloaded) {
        failed += 1;
        continue;
      }
      const finalName = uniqueExpressionName(normalized, usedStickers);
      const id = crypto.randomUUID();
      const key = `stickers/${serverId}/${id}.${sticker.ext}`;
      await uploads.put(key, downloaded.bytes, {
        httpMetadata: { contentType: downloaded.contentType },
      });
      await db
        .prepare(
          "INSERT INTO stickers (id, server_id, name, key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id, serverId, finalName, key, user.id, now)
        .run();
      importedStickers += 1;
    }
  }

  await publishStructureChange(serverId);
  await recordAudit(db, {
    serverId,
    actor: user,
    action: "server.import_assets",
    targetName: `discord:${guildId}`,
    detail: `${importedEmojis} emojis, ${importedStickers} stickers`,
  });

  return Response.json({
    importedEmojis,
    importedStickers,
    skippedDuplicates,
    skippedLottie: fetched.skippedLottie,
    failed,
  });
}
