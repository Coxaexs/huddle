/**
 * Application commands and interactions.
 *
 * A bot registers commands over REST, Hoffle stores them, and the web client
 * offers them in its own slash menu alongside the built-in ones. When someone
 * runs one, Hoffle mints an interaction, pushes INTERACTION_CREATE down that
 * bot's gateway socket and waits for the bot to answer on the callback route.
 *
 * The timing model is Discord's, because libraries depend on it: three seconds
 * to acknowledge (or the bot is considered dead) and fifteen minutes to edit
 * the response afterwards through the webhook routes.
 */
import type { RestContext } from "./rest";
import {
  discordError,
  ErrorCode,
  createMessage,
  parseMessageBody,
  resolveChannel,
} from "./rest";
import { dispatchToBots } from "./dispatch";
import { bindings, type StoredMessage } from "../storage";
import { publishMessage, publishMessageEvent } from "../hub-client";
import { channelWithGuild, loadUser } from "./guild-data";
import {
  serializeMessage,
  serializeMember,
  serializeUser,
  transientSnowflake,
  type HoffleChannelRow,
} from "./serialize";
import { nativeFor, snowflakeFor } from "./snowflake";
import { InteractionType, InteractionResponseType, MessageFlags } from "./protocol";
import { snapshotBeforeEdit } from "../message-edits";
import { botPayload, mergeBotPayload, publishBotEdit } from "./bot-messages";

/** Discord's window: acknowledge within 3s, edit for 15 minutes after. */
const INTERACTION_TTL_MS = 15 * 60 * 1000;

const json = (data: unknown, status = 200) => Response.json(data, { status });

interface CommandRow {
  id: string;
  bot_id: string;
  server_id: string | null;
  name: string;
  description: string;
  type: number;
  options: string;
  default_member_permissions: string | null;
  dm_permission: number;
  created_at: string;
  updated_at: string;
}

async function serializeCommand(
  row: CommandRow,
  applicationId: string,
): Promise<Record<string, unknown>> {
  return {
    id: await snowflakeFor("command", row.id, row.created_at),
    type: row.type,
    application_id: applicationId,
    guild_id: row.server_id
      ? await snowflakeFor("guild", row.server_id)
      : undefined,
    name: row.name,
    name_localizations: null,
    description: row.description,
    description_localizations: null,
    options: safeParse(row.options, []),
    default_member_permissions: row.default_member_permissions,
    dm_permission: Boolean(row.dm_permission),
    default_permission: true,
    nsfw: false,
    version: await snowflakeFor("command", `${row.id}:version`, row.updated_at),
  };
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// /applications/{id}/commands
// ---------------------------------------------------------------------------

export async function handleCommandRoutes(
  context: RestContext,
  segments: string[],
): Promise<Response> {
  const { db, bot, request } = context;
  const applicationId = await snowflakeFor("application", `bot:${bot.id}`);

  // Both /applications/{id}/commands and
  // /applications/{id}/guilds/{gid}/commands land here.
  let index = 1;
  let guildNative: string | null = null;
  if (segments[index] === "guilds") {
    const guildSnowflake = segments[index + 1];
    guildNative = guildSnowflake ? await nativeFor("guild", guildSnowflake) : null;
    if (!guildNative) {
      return discordError(404, ErrorCode.UnknownGuild, "Unknown Guild");
    }
    index += 2;
  }

  if (segments[index] !== "commands") {
    return discordError(404, ErrorCode.GeneralError, "404: Not Found");
  }
  const commandId = segments[index + 1];

  // Server-scoped bots may only ever register against their own server, and a
  // global registration from one is stored as a registration on that server.
  const scope = guildNative ?? bot.serverId ?? null;

  if (!commandId) {
    if (request.method === "GET") {
      const rows = await db
        .prepare(
          `SELECT * FROM discord_commands WHERE bot_id = ?
             AND (server_id IS ? OR ? IS NULL)`,
        )
        .bind(bot.id, scope, scope)
        .all<CommandRow>();
      return json(
        await Promise.all(
          (rows.results || []).map((row) => serializeCommand(row, applicationId)),
        ),
      );
    }

    if (request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const row = await upsertCommand(context, scope, body);
      if (row instanceof Response) return row;
      return json(await serializeCommand(row, applicationId), 201);
    }

    // PUT replaces the whole set. Libraries use it on every boot, so commands
    // that vanished from the bot's source must vanish here too.
    if (request.method === "PUT") {
      const body = (await request.json().catch(() => [])) as Record<string, unknown>[];
      if (!Array.isArray(body)) {
        return discordError(400, ErrorCode.InvalidFormBody, "Expected an array");
      }
      await db
        .prepare("DELETE FROM discord_commands WHERE bot_id = ? AND server_id IS ?")
        .bind(bot.id, scope)
        .run();
      const created: CommandRow[] = [];
      for (const entry of body) {
        const row = await upsertCommand(context, scope, entry);
        if (row instanceof Response) return row;
        created.push(row);
      }
      return json(
        await Promise.all(created.map((row) => serializeCommand(row, applicationId))),
      );
    }
  }

  if (commandId) {
    const nativeId = await nativeFor("command", commandId);
    if (!nativeId) {
      return discordError(404, ErrorCode.GeneralError, "Unknown application command");
    }

    if (request.method === "DELETE") {
      await db
        .prepare("DELETE FROM discord_commands WHERE id = ? AND bot_id = ?")
        .bind(nativeId, bot.id)
        .run();
      return new Response(null, { status: 204 });
    }

    const existing = await db
      .prepare("SELECT * FROM discord_commands WHERE id = ? AND bot_id = ?")
      .bind(nativeId, bot.id)
      .first<CommandRow>();
    if (!existing) {
      return discordError(404, ErrorCode.GeneralError, "Unknown application command");
    }

    if (request.method === "PATCH") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const merged = { ...existing, ...body };
      const row = await upsertCommand(context, existing.server_id, {
        name: merged.name,
        description: merged.description,
        options: (body.options ?? safeParse(existing.options, [])) as unknown,
        type: merged.type,
      });
      if (row instanceof Response) return row;
      return json(await serializeCommand(row, applicationId));
    }

    return json(await serializeCommand(existing, applicationId));
  }

  return discordError(404, ErrorCode.GeneralError, "404: Not Found");
}

async function upsertCommand(
  context: RestContext,
  scope: string | null,
  body: Record<string, unknown>,
): Promise<CommandRow | Response> {
  const name = String(body.name || "").trim().toLowerCase();
  // Discord's own constraint, and Hoffle's slash menu assumes it too.
  if (!/^[\w-]{1,32}$/.test(name)) {
    return discordError(400, ErrorCode.InvalidFormBody, "Invalid command name", {
      name: { _errors: [{ code: "STRING_TYPE_REGEX", message: "Invalid name" }] },
    });
  }

  const now = new Date().toISOString();
  const existing = await context.db
    .prepare(
      "SELECT * FROM discord_commands WHERE bot_id = ? AND server_id IS ? AND name = ?",
    )
    .bind(context.bot.id, scope, name)
    .first<CommandRow>();

  const row: CommandRow = {
    id: existing?.id || crypto.randomUUID(),
    bot_id: context.bot.id,
    server_id: scope,
    name,
    description: String(body.description || "").slice(0, 100),
    type: Number(body.type ?? 1),
    options: JSON.stringify(Array.isArray(body.options) ? body.options : []),
    default_member_permissions:
      body.default_member_permissions === undefined ||
      body.default_member_permissions === null
        ? null
        : String(body.default_member_permissions),
    dm_permission: body.dm_permission === false ? 0 : 1,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  await context.db
    .prepare(
      `INSERT INTO discord_commands
         (id, bot_id, server_id, name, description, type, options,
          default_member_permissions, dm_permission, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(bot_id, server_id, name) DO UPDATE SET
         description = excluded.description,
         type = excluded.type,
         options = excluded.options,
         default_member_permissions = excluded.default_member_permissions,
         dm_permission = excluded.dm_permission,
         updated_at = excluded.updated_at`,
    )
    .bind(
      row.id,
      row.bot_id,
      row.server_id,
      row.name,
      row.description,
      row.type,
      row.options,
      row.default_member_permissions,
      row.dm_permission,
      row.created_at,
      row.updated_at,
    )
    .run();

  return row;
}

// ---------------------------------------------------------------------------
// Interaction callbacks
// ---------------------------------------------------------------------------

interface InteractionRow {
  id: string;
  token: string;
  bot_id: string;
  server_id: string | null;
  channel_id: string;
  user_id: string;
  command_name: string;
  type: number;
  state: string;
  response_message_id: string | null;
  created_at: string;
  expires_at: string;
}

export async function handleInteractionRoutes(
  context: RestContext,
  head: string,
  segments: string[],
): Promise<Response> {
  if (head === "interactions") {
    const [, token, action] = segments;
    if (action !== "callback") {
      return discordError(404, ErrorCode.GeneralError, "404: Not Found");
    }
    return interactionCallback(context, token);
  }

  // /webhooks/{applicationId}/{token}[/messages/@original]
  const [, token, ...rest] = segments;
  if (!token) return discordError(404, ErrorCode.GeneralError, "404: Not Found");

  if (rest[0] === "messages") {
    return interactionMessage(context, token, rest[1]);
  }
  // A followup message: a second, independent message in the same channel.
  return interactionFollowup(context, token);
}

async function loadInteraction(
  db: D1Database,
  token: string,
): Promise<InteractionRow | null> {
  const row = await db
    .prepare("SELECT * FROM discord_interactions WHERE token = ?")
    .bind(token)
    .first<InteractionRow>();
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) return null;
  return row;
}

async function interactionChannel(
  context: RestContext,
  row: InteractionRow,
): Promise<{ channel: HoffleChannelRow; guildSnowflake: string | null } | Response> {
  const channelSnowflake = await snowflakeFor("channel", row.channel_id);
  const resolved = await resolveChannel(context, channelSnowflake);
  if (resolved instanceof Response) return resolved;
  return { channel: resolved.channel, guildSnowflake: resolved.guildSnowflake };
}

async function interactionCallback(
  context: RestContext,
  token: string | undefined,
): Promise<Response> {
  if (!token) return discordError(404, ErrorCode.UnknownInteraction, "Unknown interaction");

  const row = await loadInteraction(context.db, token);
  // The token is the bot's capability to answer, but only for its own
  // interactions; another bot that learned it gets nothing.
  if (!row || row.bot_id !== context.bot.id) {
    return discordError(404, ErrorCode.UnknownInteraction, "Unknown interaction");
  }
  if (row.state !== "pending") {
    // Discord's code for "this interaction was already acknowledged", which
    // libraries surface as InteractionAlreadyReplied rather than a crash.
    return discordError(400, 40060, "Interaction has already been acknowledged");
  }

  const body = (await parseMessageBody(context.request)) as {
    type?: number;
    data?: Record<string, unknown>;
  };

  const located = await interactionChannel(context, row);
  if (located instanceof Response) return located;

  // discord.py (2.5+) always asks for `?with_response=1` and reads the
  // interaction back from the body: the response message id is how it binds a
  // View's buttons to the message they sit on. A bare 204 makes it raise.
  const withResponse = context.url.searchParams.has("with_response");
  const answer = async (
    type: number,
    options: {
      message?: StoredMessage | null;
      loading?: boolean;
      ephemeral?: boolean;
    } = {},
  ): Promise<Response> => {
    if (!withResponse) return new Response(null, { status: 204 });
    const message = options.message
      ? await serializeMessage(options.message, {
          channelSnowflake: await snowflakeFor("channel", located.channel.id, located.channel.created_at),
          guildSnowflake: located.guildSnowflake,
          origin: context.origin,
          basePath: context.basePath,
        })
      : null;
    return json({
      interaction: {
        id: row.id,
        type: row.type,
        activity_instance_id: null,
        response_message_id: message ? message.id : null,
        response_message_loading: Boolean(options.loading),
        response_message_ephemeral: Boolean(options.ephemeral),
      },
      resource: message ? { type, message } : { type },
    });
  };

  const isComponent = row.type === InteractionType.MessageComponent;

  switch (body.type) {
    case InteractionResponseType.Pong:
      return json({ type: InteractionResponseType.Pong });

    case InteractionResponseType.DeferredChannelMessageWithSource:
    case InteractionResponseType.DeferredUpdateMessage: {
      // "Thinking…": the bot has 15 minutes to edit this into a real answer.
      // A deferred *update* keeps pointing at the message the button is on,
      // so the later edit of @original changes that message in place.
      const keepSource =
        body.type === InteractionResponseType.DeferredUpdateMessage && isComponent;
      const ephemeralDefer = (Number(body.data?.flags) & MessageFlags.Ephemeral) !== 0;
      await context.db
        .prepare(
          `UPDATE discord_interactions SET state = ?,
             response_message_id = CASE WHEN ? THEN response_message_id ELSE NULL END
           WHERE token = ?`,
        )
        .bind(ephemeralDefer ? "deferred_ephemeral" : "deferred", keepSource ? 1 : 0, token)
        .run();
      return answer(body.type, {
        loading: body.type === InteractionResponseType.DeferredChannelMessageWithSource,
        ephemeral:
          (Number(body.data?.flags) & MessageFlags.Ephemeral) !== 0,
      });
    }

    case InteractionResponseType.UpdateMessage:
      if (isComponent && row.response_message_id) {
        const updated = await updateSourceMessage(
          context,
          row,
          located.channel,
          row.response_message_id,
          body.data || {},
        );
        await context.db
          .prepare("UPDATE discord_interactions SET state = 'replied' WHERE token = ?")
          .bind(token)
          .run();
        return answer(body.type, { message: updated });
      }
    // An update on a slash command has no message to update: Discord treats
    // it as a new reply, and so does this.
    // falls through
    case InteractionResponseType.ChannelMessageWithSource: {
      const data = body.data || {};
      const ephemeral = (Number(data.flags) & MessageFlags.Ephemeral) !== 0;

      const message = await postInteractionMessage(context, row, located.channel, data, {
        ephemeral,
      });
      if (message instanceof Response) return message;

      await context.db
        .prepare(
          "UPDATE discord_interactions SET state = 'replied', response_message_id = ? WHERE token = ?",
        )
        .bind(message.id, token)
        .run();
      return answer(InteractionResponseType.ChannelMessageWithSource, {
        message,
        ephemeral,
      });
    }

    case InteractionResponseType.ApplicationCommandAutocompleteResult:
      // Autocomplete round-trips through the web client, which does not have a
      // live-suggestion UI for bot commands yet. Accepted so bots do not error.
      return new Response(null, { status: 204 });

    case InteractionResponseType.Modal:
      return discordError(
        400,
        ErrorCode.GeneralError,
        "Modals are not supported: Hoffle has no modal surface",
      );

    default:
      return discordError(400, ErrorCode.InvalidFormBody, "Unknown callback type");
  }
}

/**
 * Edits the message a button sits on, for UpdateMessage responses and edits
 * of @original after a deferred update. Not an "edit" in the history sense:
 * a counter ticking up on every click should not grow an edit log.
 *
 * Ephemeral messages were never stored, so for them the change goes straight
 * to the one person who can see the message.
 */
async function updateSourceMessage(
  context: RestContext,
  row: InteractionRow,
  channel: HoffleChannelRow,
  messageId: string,
  data: Record<string, unknown>,
): Promise<StoredMessage> {
  const content = data.content === undefined || data.content === null
    ? undefined
    : String(data.content).slice(0, 4000);
  const existing = await context.db
    .prepare("SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL")
    .bind(messageId)
    .first<StoredMessage>();

  if (!existing) {
    // Only the runner's tabs know this message's current buttons, so send
    // just what the bot changed and let the client merge it in; `edit(embed=…)`
    // must not wipe the buttons it left alone.
    const changes: Record<string, unknown> = {};
    if (data.embeds !== undefined) changes.embeds = Array.isArray(data.embeds) ? data.embeds : [];
    if (data.components !== undefined) {
      changes.components = Array.isArray(data.components) ? data.components : [];
    }
    const payload = mergeBotPayload(null, data, context.bot.id);
    await publishBotEdit(
      channel.id,
      {
        id: messageId,
        content,
        payload: Object.keys(changes).length ? JSON.stringify(changes) : undefined,
      },
      [row.user_id],
    );
    return {
      ...ephemeralShell(context, channel, messageId),
      content: content ?? "",
      payload,
    };
  }

  const payload = mergeBotPayload(existing.payload, data, context.bot.id);
  await context.db
    .prepare("UPDATE messages SET content = COALESCE(?, content), payload = ? WHERE id = ?")
    .bind(content ?? null, payload, messageId)
    .run();
  await publishBotEdit(channel.id, {
    id: messageId,
    content: content ?? existing.content,
    editedAt: existing.edited_at ?? null,
    payload,
  });
  return { ...existing, content: content ?? existing.content, payload };
}

/** Enough of a message for serializing one that only lives in someone's tabs. */
function ephemeralShell(
  context: RestContext,
  channel: HoffleChannelRow,
  messageId: string,
): StoredMessage {
  return {
    id: messageId,
    channel: channel.name,
    channel_id: channel.id,
    user_id: null,
    author: context.bot.name.slice(0, 80),
    avatar: (context.bot.avatar || "🤖").slice(0, 4),
    color: "#b8a6ff",
    content: "",
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    payload: null,
  };
}

/**
 * Writes the bot's answer into the channel.
 *
 * Ephemeral replies are the interesting case: Discord shows them only to the
 * person who ran the command, and Hoffle's message table has no per-viewer
 * visibility. They are delivered over the hub to that one user's tabs and never
 * written to the database, which matches what "only you can see this" means.
 */
async function postInteractionMessage(
  context: RestContext,
  row: InteractionRow,
  channel: HoffleChannelRow,
  data: Record<string, unknown>,
  options: { ephemeral: boolean },
): Promise<StoredMessage | Response> {
  const content = String(data.content || "").trim();
  const embeds = Array.isArray(data.embeds) ? data.embeds : [];
  const components = Array.isArray(data.components) ? data.components : [];

  if (!content && !embeds.length && !components.length) {
    return discordError(
      400,
      ErrorCode.CannotSendEmptyMessage,
      "Cannot send an empty message",
    );
  }

  const runner = await loadUser(context.db, row.user_id);
  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channel.name,
    channel_id: channel.id,
    user_id: null,
    author: context.bot.name.slice(0, 80),
    avatar: (context.bot.avatar || "🤖").slice(0, 4),
    color: "#b8a6ff",
    content: content.slice(0, 4000),
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    payload: botPayload(context.bot.id, embeds, components),
    // Rendering the command above the answer is how Hoffle already shows its
    // built-in bots' replies, so bot answers look native.
    command_text: row.command_name ? `/${row.command_name}` : null,
    command_by: runner?.display_name || runner?.username || null,
  };

  const { publicMessage } = await import("../../app/api/messages/route");

  if (options.ephemeral) {
    await publishMessage(channel.id, publicMessage(stored), [row.user_id]);
    return stored;
  }

  await context.db
    .prepare(
      `INSERT INTO messages
         (id, channel, channel_id, user_id, author, avatar, color, content,
          attachment_key, is_bot, created_at, payload, command_text, command_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?)`,
    )
    .bind(
      stored.id,
      stored.channel,
      stored.channel_id,
      stored.user_id,
      stored.author,
      stored.avatar,
      stored.color,
      stored.content,
      stored.created_at,
      stored.payload,
      stored.command_text,
      stored.command_by,
    )
    .run();

  await publishMessage(channel.id, publicMessage(stored));
  return stored;
}

/** A stored message as the Discord message object libraries expect back. */
async function messageResponse(
  context: RestContext,
  channel: HoffleChannelRow,
  guildSnowflake: string | null,
  message: StoredMessage,
): Promise<Response> {
  return json(
    await serializeMessage(message, {
      channelSnowflake: await snowflakeFor("channel", channel.id, channel.created_at),
      guildSnowflake,
      origin: context.origin,
      basePath: context.basePath,
    }),
  );
}

/** GET/PATCH/DELETE /webhooks/{app}/{token}/messages/@original. */
async function interactionMessage(
  context: RestContext,
  token: string,
  messageRef: string | undefined,
): Promise<Response> {
  const row = await loadInteraction(context.db, token);
  if (!row || row.bot_id !== context.bot.id) {
    return discordError(404, ErrorCode.UnknownInteraction, "Unknown interaction");
  }

  const located = await interactionChannel(context, row);
  if (located instanceof Response) return located;

  const targetId =
    messageRef === "@original" || !messageRef
      ? row.response_message_id
      : await nativeFor("message", messageRef);

  if (context.request.method === "PATCH") {
    const body = (await parseMessageBody(context.request)) as Record<string, unknown>;

    // A deferred interaction has no message yet: the first edit creates it,
    // which is exactly how "thinking… then answer" behaves on Discord.
    if (!targetId) {
      const created = await postInteractionMessage(
        context,
        row,
        located.channel,
        body,
        // `defer(ephemeral=True)` promised the runner a private answer.
        { ephemeral: row.state === "deferred_ephemeral" },
      );
      if (created instanceof Response) return created;
      await context.db
        .prepare(
          "UPDATE discord_interactions SET state = 'replied', response_message_id = ? WHERE token = ?",
        )
        .bind(created.id, token)
        .run();
      return messageResponse(context, located.channel, located.guildSnowflake, created);
    }

    // A button's own message (deferred update, or a later edit of it).
    if (row.type === InteractionType.MessageComponent && targetId === row.response_message_id) {
      const updated = await updateSourceMessage(context, row, located.channel, targetId, body);
      return messageResponse(context, located.channel, located.guildSnowflake, updated);
    }

    const existing = await context.db
      .prepare("SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL")
      .bind(targetId)
      .first<StoredMessage>();
    if (!existing) {
      // An ephemeral reply: it only exists in the runner's tabs.
      const updated = await updateSourceMessage(context, row, located.channel, targetId, body);
      return messageResponse(context, located.channel, located.guildSnowflake, updated);
    }

    const content = body.content === undefined || body.content === null ? null : String(body.content);
    const payload = mergeBotPayload(existing.payload, body, context.bot.id);
    const now = new Date().toISOString();
    await context.db.batch([
      snapshotBeforeEdit(context.db, targetId, content ?? null, now),
      context.db
        .prepare(
          `UPDATE messages SET content = COALESCE(?, content),
             payload = ?, edited_at = ? WHERE id = ?`,
        )
        .bind(content, payload, now, targetId),
    ]);
    await publishBotEdit(located.channel.id, {
      id: targetId,
      content: content ?? existing.content,
      editedAt: now,
      payload,
    });
    const saved = { ...existing, content: content ?? existing.content, payload, edited_at: now };
    return messageResponse(context, located.channel, located.guildSnowflake, saved);
  }

  if (context.request.method === "DELETE") {
    if (targetId) {
      await context.db
        .prepare("UPDATE messages SET deleted_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), targetId)
        .run();
      await publishMessageEvent(located.channel.id, {
        t: "message-deleted",
        id: targetId,
      });
    }
    return new Response(null, { status: 204 });
  }

  if (!targetId) {
    return discordError(404, ErrorCode.UnknownMessage, "Unknown Message");
  }
  const stored = await context.db
    .prepare("SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL")
    .bind(targetId)
    .first<StoredMessage>();
  return messageResponse(
    context,
    located.channel,
    located.guildSnowflake,
    stored || ephemeralShell(context, located.channel, targetId),
  );
}

/** POST /webhooks/{app}/{token} — a followup message. */
async function interactionFollowup(
  context: RestContext,
  token: string,
): Promise<Response> {
  const row = await loadInteraction(context.db, token);
  if (!row || row.bot_id !== context.bot.id) {
    return discordError(404, ErrorCode.UnknownInteraction, "Unknown interaction");
  }
  const located = await interactionChannel(context, row);
  if (located instanceof Response) return located;

  const body = (await parseMessageBody(context.request)) as Record<string, unknown>;

  // After a defer, Discord turns the first followup into the original
  // response: it replaces "thinking…", carries the command header, and keeps
  // the privacy the defer promised.
  const deferred = row.state === "deferred" || row.state === "deferred_ephemeral";
  if (deferred && !row.response_message_id) {
    const message = await postInteractionMessage(context, row, located.channel, body, {
      ephemeral:
        row.state === "deferred_ephemeral" ||
        (Number(body.flags) & MessageFlags.Ephemeral) !== 0,
    });
    if (message instanceof Response) return message;
    await context.db
      .prepare(
        "UPDATE discord_interactions SET state = 'replied', response_message_id = ? WHERE token = ?",
      )
      .bind(message.id, token)
      .run();
    return messageResponse(context, located.channel, located.guildSnowflake, message);
  }

  // `followup.send(ephemeral=True)` is private: it must not become a channel
  // message everyone can read (character sheets, GM notes).
  if ((Number(body.flags) & MessageFlags.Ephemeral) !== 0) {
    const message = await postInteractionMessage(context, row, located.channel, body, {
      ephemeral: true,
    });
    if (message instanceof Response) return message;
    return messageResponse(context, located.channel, located.guildSnowflake, message);
  }
  return createMessage(context, located.channel, located.guildSnowflake, body);
}

// ---------------------------------------------------------------------------
// Creating an interaction from the Hoffle side
// ---------------------------------------------------------------------------

/** A command option as Discord nests them: subcommands carry their own options. */
export interface InteractionOption {
  name: string;
  type?: number;
  value?: string | number | boolean;
  options?: InteractionOption[];
}

export interface RunCommandInput {
  /** Native ids, as the web client knows them. */
  channelId: string;
  userId: string;
  commandName: string;
  /** Raw option values by name, from the command line the user typed. */
  options?: InteractionOption[];
  type?: number;
  /** For a button press: the custom_id the bot gave the component. */
  customId?: string;
  /** For a component: 2 button, 3 string select. */
  componentType?: number;
  /** For a select: the chosen option values. */
  values?: string[];
  /** For a component: the (native) message it sits on. */
  messageId?: string;
  /** For a component: the bot that sent that message. */
  botId?: string;
}

export type RunCommandResult =
  | { status: "unknown" }
  | { status: "offline" }
  | { status: "dispatched" };

/**
 * Dispatches INTERACTION_CREATE to the bot that owns the command.
 *
 * "unknown" lets the caller fall back to Hoffle's own slash commands rather
 * than swallowing the input; "offline" means the command is registered but its
 * bot has no gateway session, which is worth telling the person who typed it.
 */
export async function runBotCommand(
  input: RunCommandInput,
): Promise<RunCommandResult> {
  const db = bindings().DB;
  if (!db || !bindings().DISCORD_GATEWAY) return { status: "unknown" };

  const located = await channelWithGuild(db, input.channelId);
  if (!located) return { status: "unknown" };
  const serverId = located.server?.id ?? null;

  const isComponent = input.type === InteractionType.MessageComponent;
  const command = isComponent
    ? null
    : await db
        .prepare(
          `SELECT * FROM discord_commands
           WHERE name = ? AND (server_id IS ? OR server_id IS NULL)
           ORDER BY server_id IS NULL LIMIT 1`,
        )
        .bind(input.commandName.toLowerCase(), serverId)
        .first<CommandRow>();
  const botId = isComponent ? input.botId : command?.bot_id;
  if (!botId || (isComponent && (!input.messageId || !input.customId))) {
    return { status: "unknown" };
  }

  const user = await loadUser(db, input.userId);
  if (!user) return { status: "unknown" };

  const now = Date.now();
  const interactionId = transientSnowflake();
  // The token is the bot's capability to answer: it must be unguessable, since
  // holding it is what authorises writing into this channel as a reply.
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

  await db
    .prepare(
      `INSERT INTO discord_interactions
         (id, token, bot_id, server_id, channel_id, user_id, command_name, type,
          state, response_message_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    )
    .bind(
      interactionId,
      token,
      botId,
      serverId,
      input.channelId,
      input.userId,
      command?.name ?? "",
      input.type ?? InteractionType.ApplicationCommand,
      // A component's "original response" is the message it sits on, so an
      // UpdateMessage answer edits that message in place.
      isComponent ? input.messageId! : null,
      new Date(now).toISOString(),
      new Date(now + INTERACTION_TTL_MS).toISOString(),
    )
    .run();

  const [channelSnowflake, commandSnowflake, applicationId] = await Promise.all([
    snowflakeFor("channel", input.channelId, located.channel.created_at),
    command ? snowflakeFor("command", command.id, command.created_at) : Promise.resolve(null),
    snowflakeFor("application", `bot:${botId}`),
  ]);
  const guildSnowflake = located.server
    ? await snowflakeFor("guild", located.server.id, located.server.created_at)
    : undefined;

  const roleRows = serverId
    ? await db
        .prepare(
          "SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?",
        )
        .bind(serverId, input.userId)
        .all<{ role_id: string }>()
    : { results: [] as { role_id: string }[] };

  const member = await serializeMember(
    user,
    { roles: (roleRows.results || []).map((r) => r.role_id) },
    { includeUser: false },
  );
  const serializedUser = await serializeUser(user);

  const delivered = await dispatchToBots(
    "INTERACTION_CREATE",
    {
      id: interactionId,
      application_id: applicationId,
      type: input.type ?? InteractionType.ApplicationCommand,
      data: isComponent
        ? {
            custom_id: input.customId,
            component_type: input.componentType ?? 2,
            ...(input.values ? { values: input.values } : {}),
          }
        : {
            id: commandSnowflake,
            name: command!.name,
            type: command!.type,
            options: input.options ?? [],
            resolved: {},
          },
      // Libraries route a press to its View by this message's id.
      message: isComponent
        ? await componentMessage(db, input.messageId!, located.channel, channelSnowflake, guildSnowflake ?? null)
        : undefined,
      guild_id: guildSnowflake,
      channel_id: channelSnowflake,
      channel: { id: channelSnowflake, type: 0, name: located.channel.name },
      member: guildSnowflake ? { ...member, user: serializedUser } : undefined,
      user: guildSnowflake ? undefined : serializedUser,
      token,
      version: 1,
      // Permissions the *bot* has here. Hoffle bots are server-wide, so this is
      // the full set rather than a per-channel computation.
      app_permissions: "8",
      locale: "en-US",
      guild_locale: guildSnowflake ? "en-US" : undefined,
      // Required by discord.py 2.6+, which reads it unguarded while parsing
      // the interaction; without it the bot's whole gateway loop dies.
      attachment_size_limit: 25 * 1024 * 1024,
      entitlements: [],
      authorizing_integration_owners: {},
      context: guildSnowflake ? 0 : 1,
    },
    { serverId: serverId ?? undefined, targetBotId: botId },
  );

  return { status: delivered > 0 ? "dispatched" : "offline" };
}

/** The message a pressed component sits on, serialized for INTERACTION_CREATE. */
async function componentMessage(
  db: D1Database,
  messageId: string,
  channel: HoffleChannelRow,
  channelSnowflake: string,
  guildSnowflake: string | null,
): Promise<Record<string, unknown>> {
  const stored = await db
    .prepare("SELECT * FROM messages WHERE id = ?")
    .bind(messageId)
    .first<StoredMessage>();
  // Ephemeral messages were never stored; the id is all a library needs.
  const message: StoredMessage = stored || {
    id: messageId,
    channel: channel.name,
    channel_id: channel.id,
    user_id: null,
    author: "bot",
    avatar: "🤖",
    color: "#b8a6ff",
    content: "",
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    payload: null,
  };
  const serialized = await serializeMessage(message, { channelSnowflake, guildSnowflake });
  return stored ? serialized : { ...serialized, flags: MessageFlags.Ephemeral };
}

/** The commands a channel's slash menu should offer, for the web client. */
export async function listCommandsForServer(
  db: D1Database,
  serverId: string | null,
): Promise<Array<{ name: string; description: string; options: unknown[]; botId: string }>> {
  // LEFT JOIN, not JOIN: the master BOT_TOKEN has no server_bots row, and its
  // commands would otherwise register successfully and then never be offered.
  const rows = await db
    .prepare(
      `SELECT c.* FROM discord_commands c
       LEFT JOIN server_bots b ON b.id = c.bot_id
       WHERE (c.server_id IS ? OR c.server_id IS NULL)
         AND (b.id IS NULL OR b.enabled = 1)`,
    )
    .bind(serverId)
    .all<CommandRow>();
  return (rows.results || []).map((row) => ({
    name: row.name,
    description: row.description,
    options: safeParse(row.options, [] as unknown[]),
    botId: row.bot_id,
  }));
}
