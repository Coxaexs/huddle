import { currentUser, unauthorized } from "@/lib/auth";
import { enforceAutomod } from "@/lib/automod";
import {
  dispatchMessageById,
  dispatchMessageDelete,
} from "@/lib/discord/dispatch";
import { publishMessageEvent } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { channelAudience, isDmMember } from "@/lib/dms";
import { snapshotBeforeEdit } from "@/lib/message-edits";
import { postSystemMessage } from "@/lib/system-messages";

export const dynamic = "force-dynamic";

interface MessageRow {
  id: string;
  channel_id: string | null;
  user_id: string | null;
  is_bot: number;
  pinned_at: string | null;
}

async function loadMessage(
  db: D1Database,
  id: string,
): Promise<MessageRow | null> {
  return db
    .prepare(
      "SELECT id, channel_id, user_id, is_bot, pinned_at FROM messages WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .first<MessageRow>();
}

/** Delete a message: your own always, anyone's if you own this Huddle. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  const message = await loadMessage(db, id);
  if (!message) {
    return Response.json({ error: "That message is gone." }, { status: 404 });
  }

  const mine = message.user_id === user.id;
  // Bot messages belong to the channel rather than a person, so anyone can
  // clear them. Otherwise you need your own message or MODERATE in the server
  // this message's channel belongs to.
  let mayModerate = Boolean(user.is_admin);
  if (!mine && !message.is_bot && !mayModerate && message.channel_id) {
    const channel = await db
      .prepare("SELECT server_id FROM channels WHERE id = ?")
      .bind(message.channel_id)
      .first<{ server_id: string }>();
    if (channel) {
      mayModerate = await can(db, user.id, channel.server_id, Permission.MODERATE);
    }
  }
  if (!mine && !message.is_bot && !mayModerate) {
    return Response.json(
      { error: "You can only delete your own messages." },
      { status: 403 },
    );
  }

  await db
    .prepare("UPDATE messages SET deleted_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();

  if (message.channel_id) {
    await publishMessageEvent(
      message.channel_id,
      { t: "message-deleted", id },
      await channelAudience(db, message.channel_id),
    );
    void dispatchMessageDelete(id, message.channel_id);
  }
  return Response.json({ ok: true });
}

/** Pin or unpin. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  const message = await loadMessage(db, id);
  if (!message) {
    return Response.json({ error: "That message is gone." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    pinned?: boolean;
    content?: string;
  };

  // Editing the text is a separate operation from pinning, and only the author
  // can do it.
  if (typeof body.content === "string") {
    if (message.user_id !== user.id) {
      return Response.json(
        { error: "You can only edit your own messages." },
        { status: 403 },
      );
    }
    const content = body.content.trim();
    if (!content) {
      return Response.json({ error: "A message cannot be empty." }, { status: 400 });
    }
    // Edits go through automod too, or any blocked word could be posted by
    // sending something harmless and editing it a second later.
    if (message.channel_id) {
      const channel = await db
        .prepare("SELECT server_id, kind FROM channels WHERE id = ?")
        .bind(message.channel_id)
        .first<{ server_id: string | null; kind: string }>();
      const serverId = channel?.kind !== "dm" ? channel?.server_id : null;
      if (serverId) {
        const refused = await enforceAutomod(db, {
          serverId,
          channelId: message.channel_id,
          userId: user.id,
          text: content,
          checkRepeat: false,
          mayModerate: () => can(db, user.id, serverId, Permission.MODERATE),
        });
        if (refused) return refused;
      }
    }
    const editedAt = new Date().toISOString();
    await db.batch([
      snapshotBeforeEdit(db, id, content, editedAt),
      db
        .prepare("UPDATE messages SET content = ?, edited_at = ? WHERE id = ?")
        .bind(content, editedAt, id),
    ]);
    if (message.channel_id) {
      await publishMessageEvent(
        message.channel_id,
        { t: "message-edited", id, content, editedAt },
        await channelAudience(db, message.channel_id),
      );
      void dispatchMessageById("MESSAGE_UPDATE", id, {
        origin: new URL(request.url).origin,
      });
    }
    return Response.json({ ok: true, content, editedAt });
  }

  // Pinning changes the channel for everyone: in a server it takes
  // MANAGE_MESSAGES, as on Discord; in a DM, either participant may pin.
  if (message.channel_id) {
    const channel = await db
      .prepare("SELECT server_id, kind FROM channels WHERE id = ?")
      .bind(message.channel_id)
      .first<{ server_id: string | null; kind: string }>();
    const allowed =
      channel?.kind === "dm"
        ? await isDmMember(db, message.channel_id, user.id)
        : Boolean(
            channel?.server_id &&
              (await can(db, user.id, channel.server_id, Permission.MANAGE_MESSAGES)),
          );
    if (!allowed) {
      return Response.json(
        { error: "You need Manage Messages to pin in this channel." },
        { status: 403 },
      );
    }
  }

  const pinned = body.pinned ?? !message.pinned_at;

  await db
    .prepare("UPDATE messages SET pinned_at = ?, pinned_by = ? WHERE id = ?")
    .bind(pinned ? new Date().toISOString() : null, pinned ? user.id : null, id)
    .run();

  if (message.channel_id) {
    await publishMessageEvent(
      message.channel_id,
      { t: "message-pinned", id, pinned },
      await channelAudience(db, message.channel_id),
    );
    // Only a fresh pin is announced, not re-pinning or unpinning.
    if (pinned && !message.pinned_at) {
      await postSystemMessage(
        db,
        message.channel_id,
        user,
        "system-pin",
        `${user.display_name} pinned a message to this channel.`,
        { messageId: id },
      );
    }
  }
  return Response.json({ ok: true, pinned });
}
