import { currentUser, unauthorized } from "@/lib/auth";
import { channelAudience } from "@/lib/dms";
import { messageHistory } from "@/lib/message-edits";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** A message's earlier versions, for the "(edited)" popover. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ versions: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  const message = await db
    .prepare(
      "SELECT channel_id, content, edited_at FROM messages WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .first<{ channel_id: string | null; content: string; edited_at: string | null }>();
  if (!message) {
    return Response.json({ error: "That message is gone." }, { status: 404 });
  }
  // Same rule as reading the channel: DMs only for their participants.
  if (message.channel_id) {
    const audience = await channelAudience(db, message.channel_id);
    if (audience && !audience.includes(user.id)) return unauthorized();
  }

  return Response.json({
    versions: await messageHistory(db, id),
    current: { content: message.content, at: message.edited_at },
  });
}
