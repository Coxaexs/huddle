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
import { discordError, ErrorCode, createMessage, resolveChannel } from "./rest";
import { dispatchToBots } from "./dispatch";
import { bindings, type StoredMessage } from "../storage";
import { publishMessage, publishMessageEvent } from "../hub-client";
import { channelWithGuild, loadUser } from "./guild-data";
import {
  serializeMember,
  serializeUser,
  transientSnowflake,
  type HoffleChannelRow,
} from "./serialize";
import { nativeFor, snowflakeFor } from "./snowflake";
import { InteractionType, InteractionResponseType, MessageFlags } from "./protocol";

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
  if (!row) {
    return discordError(404, ErrorCode.UnknownInteraction, "Unknown interaction");
  }
  if (row.state !== "pending") {
    // Discord's code for "this interaction was already acknowledged", which
    // libraries surface as InteractionAlreadyReplied rather than a crash.
    return discordError(400, 40060, "Interaction has already been acknowledged");
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    type?: number;
    data?: Record<string, unknown>;
  };

  const located = await interactionChannel(context, row);
  if (located instanceof Response) return located;

  switch (body.type) {
    case InteractionResponseType.Pong:
      return json({ type: InteractionResponseType.Pong });

    case InteractionResponseType.DeferredChannelMessageWithSource:
    case InteractionResponseType.DeferredUpdateMessage: {
      // "Thinking…": the bot has 15 minutes to edit this into a real answer.
      await context.db
        .prepare("UPDATE discord_interactions SET state = 'deferred' WHERE token = ?")
        .bind(token)
        .run();
      return new Response(null, { status: 204 });
    }

    case InteractionResponseType.ChannelMessageWithSource:
    case InteractionResponseType.UpdateMessage: {
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
      return new Response(null, { status: 204 });
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
    payload:
      embeds.length || components.length
        ? JSON.stringify({ embeds, components }).slice(0, 8000)
        : null,
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

/** GET/PATCH/DELETE /webhooks/{app}/{token}/messages/@original. */
async function interactionMessage(
  context: RestContext,
  token: string,
  messageRef: string | undefined,
): Promise<Response> {
  const row = await loadInteraction(context.db, token);
  if (!row) {
    return discordError(404, ErrorCode.UnknownInteraction, "Unknown interaction");
  }

  const located = await interactionChannel(context, row);
  if (located instanceof Response) return located;

  const targetId =
    messageRef === "@original" || !messageRef
      ? row.response_message_id
      : await nativeFor("message", messageRef);

  if (context.request.method === "PATCH") {
    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;

    // A deferred interaction has no message yet: the first edit creates it,
    // which is exactly how "thinking… then answer" behaves on Discord.
    if (!targetId) {
      const created = await postInteractionMessage(
        context,
        row,
        located.channel,
        body,
        { ephemeral: false },
      );
      if (created instanceof Response) return created;
      await context.db
        .prepare(
          "UPDATE discord_interactions SET state = 'replied', response_message_id = ? WHERE token = ?",
        )
        .bind(created.id, token)
        .run();
      return json({ id: await snowflakeFor("message", created.id, created.created_at) });
    }

    const content = body.content === undefined ? null : String(body.content);
    const payload = body.embeds || body.components
      ? JSON.stringify({
          embeds: Array.isArray(body.embeds) ? body.embeds : [],
          components: Array.isArray(body.components) ? body.components : [],
        })
      : null;
    const now = new Date().toISOString();
    await context.db
      .prepare(
        `UPDATE messages SET content = COALESCE(?, content),
           payload = COALESCE(?, payload), edited_at = ? WHERE id = ?`,
      )
      .bind(content, payload, now, targetId)
      .run();
    await publishMessageEvent(located.channel.id, {
      t: "message-edited",
      messageId: targetId,
      content: content ?? "",
      editedAt: now,
    });
    return json({ id: await snowflakeFor("message", targetId) });
  }

  if (context.request.method === "DELETE") {
    if (targetId) {
      await context.db
        .prepare("UPDATE messages SET deleted_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), targetId)
        .run();
      await publishMessageEvent(located.channel.id, {
        t: "message-deleted",
        messageId: targetId,
      });
    }
    return new Response(null, { status: 204 });
  }

  if (!targetId) {
    return discordError(404, ErrorCode.UnknownMessage, "Unknown Message");
  }
  return json({ id: await snowflakeFor("message", targetId) });
}

/** POST /webhooks/{app}/{token} — a followup message. */
async function interactionFollowup(
  context: RestContext,
  token: string,
): Promise<Response> {
  const row = await loadInteraction(context.db, token);
  if (!row) {
    return discordError(404, ErrorCode.UnknownInteraction, "Unknown interaction");
  }
  const located = await interactionChannel(context, row);
  if (located instanceof Response) return located;

  const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
  return createMessage(context, located.channel, located.guildSnowflake, body);
}

// ---------------------------------------------------------------------------
// Creating an interaction from the Hoffle side
// ---------------------------------------------------------------------------

export interface RunCommandInput {
  /** Native ids, as the web client knows them. */
  channelId: string;
  userId: string;
  commandName: string;
  /** Raw option values by name, from the command line the user typed. */
  options?: Array<{ name: string; value: string | number | boolean; type?: number }>;
  type?: number;
  /** For a button press: the custom_id the bot gave the component. */
  customId?: string;
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

  const command = await db
    .prepare(
      `SELECT * FROM discord_commands
       WHERE name = ? AND (server_id IS ? OR server_id IS NULL)
       ORDER BY server_id IS NULL LIMIT 1`,
    )
    .bind(input.commandName.toLowerCase(), serverId)
    .first<CommandRow>();
  if (!command) return { status: "unknown" };

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
          state, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(
      interactionId,
      token,
      command.bot_id,
      serverId,
      input.channelId,
      input.userId,
      command.name,
      input.type ?? InteractionType.ApplicationCommand,
      new Date(now).toISOString(),
      new Date(now + INTERACTION_TTL_MS).toISOString(),
    )
    .run();

  const [channelSnowflake, commandSnowflake, applicationId] = await Promise.all([
    snowflakeFor("channel", input.channelId, located.channel.created_at),
    snowflakeFor("command", command.id, command.created_at),
    snowflakeFor("application", `bot:${command.bot_id}`),
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
      data:
        input.type === InteractionType.MessageComponent
          ? { custom_id: input.customId, component_type: 2 }
          : {
              id: commandSnowflake,
              name: command.name,
              type: command.type,
              options: input.options ?? [],
              resolved: {},
            },
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
      entitlements: [],
      authorizing_integration_owners: {},
      context: guildSnowflake ? 0 : 1,
    },
    { serverId: serverId ?? undefined, targetBotId: command.bot_id },
  );

  return { status: delivered > 0 ? "dispatched" : "offline" };
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
