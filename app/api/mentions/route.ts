import { currentUser, unauthorized } from "@/lib/auth";
import { publicMessage, type PublicMessage } from "@/app/api/messages/route";
import { ensureSchema } from "@/lib/schema";
import { bindings, type StoredMessage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** How many mentions the inbox shows at once. */
const PAGE = 50;

export interface MentionEntry {
  message: PublicMessage;
  channelName: string;
  channelKind: string;
  serverId: string | null;
  serverName: string | null;
  /** True once the user has read the channel past this mention. */
  read: boolean;
}

/**
 * The mentions inbox: recent messages that named the signed-in user (directly,
 * through a role, or via @everyone/@here), newest first. Only channels the user
 * can still reach are included. `?before=<iso>` pages further back.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ mentions: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const before = new URL(request.url).searchParams.get("before") || "9999";
  const rows = await db
    .prepare(
      `SELECT m.*, c.name AS mn_channel_name, c.kind AS mn_channel_kind,
              c.server_id AS mn_server_id, s.name AS mn_server_name,
              CASE WHEN r.read_at IS NOT NULL AND r.read_at >= mn.created_at
                   THEN 1 ELSE 0 END AS mn_read
         FROM mentions mn
         JOIN messages m ON m.id = mn.message_id
         JOIN channels c ON c.id = mn.channel_id
         LEFT JOIN servers s ON s.id = c.server_id
         LEFT JOIN channel_reads r ON r.channel_id = mn.channel_id AND r.user_id = ?1
        WHERE mn.user_id = ?1
          AND mn.created_at < ?2
          AND m.deleted_at IS NULL
          AND (c.kind = 'dm' OR EXISTS (
                SELECT 1 FROM server_members sm
                 WHERE sm.server_id = c.server_id AND sm.user_id = ?1))
        ORDER BY mn.created_at DESC
        LIMIT ${PAGE}`,
    )
    .bind(user.id, before)
    .all<
      StoredMessage & {
        mn_channel_name: string;
        mn_channel_kind: string;
        mn_server_id: string | null;
        mn_server_name: string | null;
        mn_read: number;
      }
    >();

  const mentions: MentionEntry[] = (rows.results || []).map((row) => ({
    message: publicMessage(row),
    channelName: row.mn_channel_name,
    channelKind: row.mn_channel_kind,
    serverId: row.mn_channel_kind === "dm" ? null : row.mn_server_id,
    serverName: row.mn_channel_kind === "dm" ? null : row.mn_server_name,
    read: row.mn_read === 1,
  }));
  return Response.json({ mentions, hasMore: mentions.length === PAGE });
}
