/**
 * Server Logs plugin: streams message edits, message deletes, member joins,
 * and member leaves into a dedicated log channel as rich color-coded embeds.
 */

import { getCommunityBotConfig, postCommunityBotMessage } from "./store";

export type ServerLogEvent =
  | {
      kind: "message_delete";
      channelName: string;
      author: string;
      content: string;
      deletedBy: string;
    }
  | {
      kind: "message_edit";
      channelName: string;
      author: string;
      before: string;
      after: string;
    }
  | {
      kind: "member_join";
      username: string;
      displayName: string;
    }
  | {
      kind: "member_leave";
      username: string;
      displayName: string;
    };

export async function emitServerLog(
  db: D1Database,
  serverId: string,
  event: ServerLogEvent,
): Promise<void> {
  const config = await getCommunityBotConfig(db, serverId);
  const lg = config.plugins.logs;
  if (!config.enabled || !lg.enabled || !lg.channelId) return;

  if (event.kind === "message_delete") {
    if (!lg.logMessageDelete) return;
    await postCommunityBotMessage(
      db,
      serverId,
      lg.channelId,
      {
        content: "",
        embeds: [
          {
            title: `🗑️ Message Deleted in #${event.channelName}`,
            description: event.content ? event.content.slice(0, 1000) : "*[Empty / Attachment]*",
            color: "#ef4444",
            fields: [
              { name: "Author", value: event.author, inline: true },
              { name: "Deleted by", value: event.deletedBy, inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      },
      config,
    );
    return;
  }

  if (event.kind === "message_edit") {
    if (!lg.logMessageEdit) return;
    await postCommunityBotMessage(
      db,
      serverId,
      lg.channelId,
      {
        content: "",
        embeds: [
          {
            title: `✏️ Message Edited in #${event.channelName}`,
            color: "#f59e0b",
            fields: [
              { name: "Author", value: event.author, inline: false },
              { name: "Before", value: (event.before || "*[Empty]*").slice(0, 500), inline: false },
              { name: "After", value: (event.after || "*[Empty]*").slice(0, 500), inline: false },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      },
      config,
    );
    return;
  }

  if (event.kind === "member_join") {
    if (!lg.logMemberJoin) return;
    await postCommunityBotMessage(
      db,
      serverId,
      lg.channelId,
      {
        content: "",
        embeds: [
          {
            title: "📥 Member Joined",
            description: `**${event.displayName}** (@${event.username}) joined the server.`,
            color: "#22c55e",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      config,
    );
    return;
  }

  if (event.kind === "member_leave") {
    if (!lg.logMemberLeave) return;
    await postCommunityBotMessage(
      db,
      serverId,
      lg.channelId,
      {
        content: "",
        embeds: [
          {
            title: "📤 Member Left",
            description: `**${event.displayName}** (@${event.username}) left the server.`,
            color: "#64748b",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      config,
    );
  }
}
