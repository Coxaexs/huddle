import { recordAudit } from "@/lib/audit";
import { currentUser, unauthorized } from "@/lib/auth";
import { deterministicArchiveMessageId, parseDiscordArchive } from "@/lib/discord-archive";
import { publishStructureChange } from "@/lib/hub-client";
import { canAny, Permission } from "@/lib/permissions";
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;
const BATCH_SIZE = 50;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await canAny(db, user.id, serverId, Permission.MANAGE_CHANNELS, Permission.MANAGE_SERVER))) {
    return Response.json(
      { error: "You need Manage Channels or Manage Server permission." },
      { status: 403 },
    );
  }

  const rl = await checkRateLimit({
    db,
    action: "discord-import-archive",
    key: user.id,
    limit: 15,
    windowSeconds: 3600,
  });
  if (!rl.allowed) return new RateLimitError(rl.retryAfter).response();

  const rawText = await request.text().catch(() => "");
  if (!rawText || rawText.length > MAX_ARCHIVE_BYTES) {
    return Response.json(
      { error: "Archive payload must be under 5 MB." },
      { status: 413 },
    );
  }

  let body: {
    targetChannelId?: string;
    newChannelName?: string;
    archive?: unknown;
  };
  try {
    body = JSON.parse(rawText) as {
      targetChannelId?: string;
      newChannelName?: string;
      archive?: unknown;
    };
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseDiscordArchive(body.archive ?? body, 500);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid archive format." },
      { status: 400 },
    );
  }

  let channel: { id: string; name: string } | null = null;
  let createdChannel = false;

  if (body.targetChannelId && typeof body.targetChannelId === "string") {
    channel = await db
      .prepare(
        "SELECT id, name FROM channels WHERE id = ? AND server_id = ? AND kind IN ('text', 'announcement')",
      )
      .bind(body.targetChannelId.trim(), serverId)
      .first<{ id: string; name: string }>();
    if (!channel) {
      return Response.json({ error: "Target channel not found in this server." }, { status: 404 });
    }
  } else {
    const cleanName = (body.newChannelName || parsed.channelName || "imported-archive")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "imported-archive";
    const id = crypto.randomUUID();
    const posRow = await db
      .prepare("SELECT COALESCE(MAX(position), -1) AS max_pos FROM channels WHERE server_id = ?")
      .bind(serverId)
      .first<{ max_pos: number }>();
    await db
      .prepare(
        "INSERT INTO channels (id, server_id, name, kind, topic, position, created_at) VALUES (?, ?, ?, 'text', ?, ?, ?)",
      )
      .bind(
        id,
        serverId,
        cleanName,
        "Imported Discord chat history",
        (posRow?.max_pos ?? -1) + 1,
        new Date().toISOString(),
      )
      .run();
    channel = { id, name: cleanName };
    createdChannel = true;
  }

  let imported = 0;
  const preparedRows = await Promise.all(
    parsed.messages.map(async (msg) => ({
      id: await deterministicArchiveMessageId(channel.id, msg.sourceId),
      author: `[Discord] ${msg.author}`.slice(0, 64),
      content: msg.content,
      createdAt: msg.createdAt,
    })),
  );

  for (let i = 0; i < preparedRows.length; i += BATCH_SIZE) {
    const slice = preparedRows.slice(i, i + BATCH_SIZE);
    const results = await db.batch(
      slice.map((row) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO messages
               (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key, is_bot, created_at)
             VALUES (?, ?, ?, NULL, ?, ?, '#5865f2', ?, NULL, 0, ?)`,
          )
          .bind(row.id, channel.name, channel.id, row.author, "D", row.content, row.createdAt),
      ),
    );
    for (const r of results) {
      imported += Number(r.meta?.changes || 0);
    }
  }

  if (createdChannel) {
    await publishStructureChange(serverId);
  }
  await recordAudit(db, {
    serverId,
    actor: user,
    action: "server.import_archive",
    targetName: `#${channel.name}`,
    detail: `${imported} messages imported`,
  });

  return Response.json({
    channelId: channel.id,
    channelName: channel.name,
    imported,
    skippedDuplicates: Math.max(0, parsed.messages.length - imported),
    skippedEmpty: parsed.skipped,
    totalParsed: parsed.messages.length,
  });
}
