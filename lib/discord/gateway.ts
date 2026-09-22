/**
 * The Discord-compatible gateway: a Durable Object that speaks Discord's v10
 * WebSocket protocol so off-the-shelf bot libraries can connect to Hoffle.
 *
 * This is a real implementation of the handshake, not a simplified stream:
 * HELLO with a jittered heartbeat interval, IDENTIFY with token and intent
 * validation, per-session sequence numbers, HEARTBEAT/HEARTBEAT_ACK, RESUME
 * with event replay, and the fatal close codes that stop a misconfigured bot
 * from reconnecting forever. Clients are strict about all of it — discord.js
 * will not emit a single event until READY and GUILD_CREATE have both landed
 * in the right order, and discord.py hard-fails without zlib-stream framing.
 *
 * Events arrive from the rest of Hoffle as already-serialized Discord payloads
 * (POST /dispatch) because serialization needs D1 joins that belong in the
 * request that caused the event, not in the fan-out path.
 */
import { DurableObject } from "cloudflare:workers";
import { ensureSchema } from "../schema";
import {
  GatewayOpcode,
  GatewayCloseCode,
  GatewayIntent,
  SUPPORTED_API_VERSIONS,
  ALL_INTENTS,
  intentAllows,
} from "./protocol";
import { ZlibStreamEncoder } from "./zlib-stream";
import { authenticateBot, type BotIdentity } from "../bot-auth";
import { botServers, loadGuild } from "./guild-data";
import { serializeBotUser } from "./serialize";
import { snowflakeFor } from "./snowflake";

/** Discord's own value. Clients derive their timeout from whatever we send. */
const HEARTBEAT_INTERVAL_MS = 41_250;

/** How long an identified session may go silent before we call it dead. */
const HEARTBEAT_GRACE = 2.5;

/** Events kept per session for RESUME replay. */
const REPLAY_BUFFER = 150;

interface Session {
  sessionId: string;
  /** Native Hoffle bot id, or the master-token sentinel. */
  botId: string;
  botName: string;
  botAvatar: string;
  botKind: string;
  botServerId: string | null;
  botIsMaster: boolean;
  intents: number;
  sequence: number;
  identified: boolean;
  compress: boolean;
  zlibStarted: boolean;
  lastHeartbeatAt: number;
  helloAt: number;
  /** Public gateway URL, which only the worker edge knows. */
  resumeUrl: string;
}

interface DispatchRequest {
  event: string;
  data: unknown;
  /** Native server id the event belongs to, for access filtering. */
  serverId?: string | null;
  isDm?: boolean;
  /** When set, only this bot's sessions receive it (interactions). */
  targetBotId?: string | null;
  /** Bot id to exclude, so a bot never receives the echo of its own post. */
  excludeBotId?: string | null;
}

export class DiscordGateway extends DurableObject {
  /**
   * Replay buffers are deliberately in-memory only. A resume after this object
   * hibernates answers INVALID_SESSION instead, which every client handles by
   * re-identifying — correct, if slightly more expensive than a real resume.
   */
  private replay = new Map<string, Array<{ s: number; payload: string }>>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/socket") {
      return this.handleUpgrade(request, url);
    }

    if (url.pathname === "/dispatch" && request.method === "POST") {
      const body = (await request.json()) as DispatchRequest;
      const delivered = this.dispatch(body);
      return Response.json({ ok: true, delivered });
    }

    if (url.pathname === "/sessions") {
      return Response.json({ count: this.ctx.getWebSockets().length });
    }

    return new Response("Not found", { status: 404 });
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  private handleUpgrade(request: Request, url: URL): Response {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    // Discord rejects an unsupported version before the handshake even starts,
    // and clients surface that as a clear error instead of a silent hang.
    const version = url.searchParams.get("v") || "10";
    if (!SUPPORTED_API_VERSIONS.has(version)) {
      return new Response("Unsupported gateway version", { status: 400 });
    }
    // ETF is Erlang's term format. Only discord.js with an optional package
    // ever asks for it, and refusing is better than sending JSON it cannot read.
    const encoding = url.searchParams.get("encoding") || "json";
    if (encoding !== "json") {
      return new Response("Only json encoding is supported", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, socket] = Object.values(pair);
    this.ctx.acceptWebSocket(socket);

    const session: Session = {
      sessionId: crypto.randomUUID().replace(/-/g, ""),
      botId: "",
      botName: "",
      botAvatar: "",
      botKind: "",
      botServerId: null,
      botIsMaster: false,
      intents: 0,
      sequence: 0,
      identified: false,
      compress: url.searchParams.get("compress") === "zlib-stream",
      zlibStarted: false,
      lastHeartbeatAt: Date.now(),
      helloAt: Date.now(),
      resumeUrl: url.searchParams.get("resumeUrl") || "",
    };
    socket.serializeAttachment(session);

    // sendRaw re-persists the attachment if this is the frame that emits the
    // zlib header, so the flag is never lost between the two calls.
    this.send(socket, session, {
      op: GatewayOpcode.Hello,
      d: {
        heartbeat_interval: HEARTBEAT_INTERVAL_MS,
        // Discord still sends this legacy field and some clients log it.
        _trace: ["hoffle-gateway"],
      },
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const session = socket.deserializeAttachment() as Session | null;
    if (!session) {
      socket.close(GatewayCloseCode.UnknownError, "No session");
      return;
    }

    let frame: { op?: number; d?: unknown; s?: number; t?: string };
    try {
      frame = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      socket.close(GatewayCloseCode.DecodeError, "Invalid JSON");
      return;
    }

    switch (frame.op) {
      case GatewayOpcode.Heartbeat:
        session.lastHeartbeatAt = Date.now();
        socket.serializeAttachment(session);
        this.send(socket, session, { op: GatewayOpcode.HeartbeatAck, d: null });
        return;

      case GatewayOpcode.Identify:
        await this.handleIdentify(socket, session, frame.d as Record<string, unknown>);
        return;

      case GatewayOpcode.Resume:
        await this.handleResume(socket, session, frame.d as Record<string, unknown>);
        return;

      case GatewayOpcode.RequestGuildMembers:
        await this.handleRequestMembers(
          socket,
          session,
          frame.d as Record<string, unknown>,
        );
        return;

      case GatewayOpcode.PresenceUpdate:
        // A bot setting its own presence. Hoffle has nowhere to show it, so it
        // is accepted silently rather than closed as an unknown opcode.
        return;

      case GatewayOpcode.VoiceStateUpdate:
        // Voice needs UDP, which Workers cannot open. Accepting and doing
        // nothing leaves the bot's join attempt to time out on its own, which
        // is what its own error handling already expects.
        return;

      default:
        socket.close(GatewayCloseCode.UnknownOpcode, "Unknown opcode");
    }
  }

  webSocketClose(socket: WebSocket) {
    const session = socket.deserializeAttachment() as Session | null;
    if (session) this.replay.delete(session.sessionId);
  }

  webSocketError(socket: WebSocket) {
    const session = socket.deserializeAttachment() as Session | null;
    if (session) this.replay.delete(session.sessionId);
  }

  // -------------------------------------------------------------------------
  // IDENTIFY / RESUME
  // -------------------------------------------------------------------------

  private async handleIdentify(
    socket: WebSocket,
    session: Session,
    data: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (session.identified) {
      socket.close(GatewayCloseCode.AlreadyAuthenticated, "Already identified");
      return;
    }

    const rawToken = typeof data?.token === "string" ? data.token : "";
    // Libraries differ: discord.js sends the bare token, discord.py prefixes
    // "Bot ". Both are normal and neither should be an authentication failure.
    const token = rawToken.replace(/^Bot\s+/i, "").trim();
    if (!token) {
      socket.close(GatewayCloseCode.AuthenticationFailed, "No token");
      return;
    }

    const bot = await this.authenticate(token);
    if (!bot) {
      socket.close(GatewayCloseCode.AuthenticationFailed, "Invalid token");
      return;
    }

    const intents = Number(data?.intents ?? 0);
    if (!Number.isInteger(intents) || intents < 0) {
      socket.close(GatewayCloseCode.InvalidIntents, "Invalid intents");
      return;
    }
    if ((intents & ~ALL_INTENTS) !== 0) {
      socket.close(GatewayCloseCode.InvalidIntents, "Unknown intent bits");
      return;
    }

    // Sharding: a self-hosted Hoffle is one shard by definition, so anything
    // other than shard 0 of 1 is a configuration mistake worth naming.
    const shard = Array.isArray(data?.shard) ? (data.shard as number[]) : [0, 1];
    if (shard[1] !== 1 || shard[0] !== 0) {
      socket.close(GatewayCloseCode.InvalidShard, "This gateway is a single shard");
      return;
    }

    session.identified = true;
    session.botId = bot.id;
    session.botName = bot.name;
    session.botAvatar = bot.avatar;
    session.botKind = bot.kind;
    session.botServerId = bot.serverId;
    session.botIsMaster = bot.isMaster;
    session.intents = intents;
    session.lastHeartbeatAt = Date.now();
    socket.serializeAttachment(session);

    await this.sendReady(socket, session, bot);
  }

  private async handleResume(
    socket: WebSocket,
    session: Session,
    data: Record<string, unknown> | undefined,
  ): Promise<void> {
    const sessionId = typeof data?.session_id === "string" ? data.session_id : "";
    const since = Number(data?.seq ?? 0);
    const buffered = this.replay.get(sessionId);

    if (!buffered) {
      // `d: false` means "this session is gone, identify again". Sending true
      // would have the client retry a resume that can never succeed.
      this.send(socket, session, { op: GatewayOpcode.InvalidSession, d: false });
      return;
    }

    const rawToken = typeof data?.token === "string" ? data.token : "";
    const bot = await this.authenticate(rawToken.replace(/^Bot\s+/i, "").trim());
    if (!bot) {
      socket.close(GatewayCloseCode.AuthenticationFailed, "Invalid token");
      return;
    }

    session.sessionId = sessionId;
    session.identified = true;
    session.botId = bot.id;
    session.botName = bot.name;
    session.botAvatar = bot.avatar;
    session.botServerId = bot.serverId;
    session.botIsMaster = bot.isMaster;
    session.lastHeartbeatAt = Date.now();

    for (const entry of buffered) {
      if (entry.s <= since) continue;
      session.sequence = entry.s;
      this.sendRaw(socket, session, entry.payload);
    }
    socket.serializeAttachment(session);

    this.sendDispatch(socket, session, "RESUMED", {});
  }

  private async authenticate(token: string): Promise<BotIdentity | null> {
    if (!token) return null;
    const db = (this.env as { DB?: D1Database }).DB;
    if (db) await ensureSchema(db);
    // Reuses the REST authenticator so a token means exactly one thing across
    // both surfaces, including the enabled flag and server scoping.
    return authenticateBot(
      new Request("https://hoffle.internal/gateway", {
        headers: { Authorization: `Bot ${token}` },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // READY and the initial guild burst
  // -------------------------------------------------------------------------

  private async sendReady(
    socket: WebSocket,
    session: Session,
    bot: BotIdentity,
  ): Promise<void> {
    const db = (this.env as { DB?: D1Database }).DB;
    const user = await serializeBotUser(bot);
    const applicationId = await snowflakeFor("application", `bot:${bot.id}`);

    const servers = db ? await botServers(db, bot) : [];
    const guildStubs = await Promise.all(
      servers.map(async (server) => ({
        id: await snowflakeFor("guild", server.id, server.created_at),
        // Discord sends every guild unavailable in READY and fills them in with
        // GUILD_CREATE next. Clients count these to know when startup is done.
        unavailable: true,
      })),
    );

    this.sendDispatch(socket, session, "READY", {
      v: 10,
      user,
      guilds: guildStubs,
      session_id: session.sessionId,
      resume_gateway_url: session.resumeUrl,
      shard: [0, 1],
      application: {
        id: applicationId,
        flags: 0,
      },
      relationships: [],
      private_channels: [],
      presences: [],
      geo_ordered_rtc_regions: [],
      session_type: "normal",
      auth_session_id_hash: "",
      _trace: ["hoffle-gateway"],
    });

    if (!db) return;

    // GUILD_CREATE is what actually populates a client's cache. It must follow
    // READY, never precede it, or discord.js discards the guild entirely.
    const wantsMembers = (session.intents & GatewayIntent.GuildMembers) !== 0;
    const wantsPresences = (session.intents & GatewayIntent.GuildPresences) !== 0;

    for (const server of servers) {
      const guild = await loadGuild(db, server, {
        includeMembers: wantsMembers,
        includePresences: wantsPresences,
      });
      this.sendDispatch(socket, session, "GUILD_CREATE", guild);
    }
  }

  private async handleRequestMembers(
    socket: WebSocket,
    session: Session,
    data: Record<string, unknown> | undefined,
  ): Promise<void> {
    const db = (this.env as { DB?: D1Database }).DB;
    if (!db || !session.identified) return;

    const guildId = typeof data?.guild_id === "string" ? data.guild_id : "";
    if (!guildId) return;

    const bot = this.botFrom(session);
    const servers = await botServers(db, bot);
    const target = await Promise.all(
      servers.map(async (server) => ({
        server,
        snowflake: await snowflakeFor("guild", server.id, server.created_at),
      })),
    );
    const match = target.find((entry) => entry.snowflake === guildId);
    if (!match) return;

    const guild = await loadGuild(db, match.server, { includeMembers: true });
    const members = (guild.members as Record<string, unknown>[]) || [];

    // Chunks are capped at 1000 members by the protocol; clients reassemble
    // them using chunk_index and chunk_count.
    const size = 1000;
    const chunkCount = Math.max(1, Math.ceil(members.length / size));
    for (let index = 0; index < chunkCount; index++) {
      this.sendDispatch(socket, session, "GUILD_MEMBERS_CHUNK", {
        guild_id: guildId,
        members: members.slice(index * size, (index + 1) * size),
        chunk_index: index,
        chunk_count: chunkCount,
        not_found: [],
        presences: [],
        nonce: data?.nonce,
      });
    }
  }

  private botFrom(session: Session): BotIdentity {
    return {
      id: session.botId,
      name: session.botName,
      avatar: session.botAvatar,
      serverId: session.botServerId,
      isMaster: session.botIsMaster,
      kind: session.botKind,
    };
  }

  // -------------------------------------------------------------------------
  // Fan-out
  // -------------------------------------------------------------------------

  private dispatch(request: DispatchRequest): number {
    const now = Date.now();
    let delivered = 0;

    for (const socket of this.ctx.getWebSockets()) {
      const session = socket.deserializeAttachment() as Session | null;
      if (!session?.identified) continue;

      // A client that stopped heartbeating is gone; 4009 tells it to resume.
      if (now - session.lastHeartbeatAt > HEARTBEAT_INTERVAL_MS * HEARTBEAT_GRACE) {
        try {
          socket.close(GatewayCloseCode.SessionTimedOut, "Heartbeat timeout");
        } catch {
          // Already closing.
        }
        continue;
      }

      if (request.targetBotId && session.botId !== request.targetBotId) continue;
      if (request.excludeBotId && session.botId === request.excludeBotId) continue;

      // Server scoping: a bot added to one server never sees another's traffic.
      if (
        request.serverId &&
        !session.botIsMaster &&
        session.botServerId &&
        session.botServerId !== request.serverId
      ) {
        continue;
      }
      // A DM is only ever visible to the master token; per-server bots are not
      // participants in anyone's direct messages.
      if (request.isDm && !session.botIsMaster) continue;

      if (!intentAllows(request.event, session.intents, request.isDm)) continue;

      // MESSAGE_CONTENT is privileged on Discord: without it, clients still get
      // the event but with content blanked. Mirroring that keeps bots that
      // forget the intent behaving the way their author will have seen.
      let data = request.data;
      if (
        (request.event === "MESSAGE_CREATE" || request.event === "MESSAGE_UPDATE") &&
        (session.intents & GatewayIntent.MessageContent) === 0 &&
        !request.isDm
      ) {
        data = redactContent(data);
      }

      this.sendDispatch(socket, session, request.event, data);
      socket.serializeAttachment(session);
      delivered += 1;
    }

    return delivered;
  }

  // -------------------------------------------------------------------------
  // Framing
  // -------------------------------------------------------------------------

  private sendDispatch(
    socket: WebSocket,
    session: Session,
    event: string,
    data: unknown,
  ): void {
    session.sequence += 1;
    const payload = JSON.stringify({
      op: GatewayOpcode.Dispatch,
      d: data,
      s: session.sequence,
      t: event,
    });

    const buffer = this.replay.get(session.sessionId) || [];
    buffer.push({ s: session.sequence, payload });
    if (buffer.length > REPLAY_BUFFER) buffer.splice(0, buffer.length - REPLAY_BUFFER);
    this.replay.set(session.sessionId, buffer);

    this.sendRaw(socket, session, payload);
    socket.serializeAttachment(session);
  }

  private send(socket: WebSocket, session: Session, frame: unknown): void {
    this.sendRaw(socket, session, JSON.stringify(frame));
  }

  private sendRaw(socket: WebSocket, session: Session, payload: string): void {
    try {
      if (session.compress) {
        // The zlib header goes out once per connection; the flag rides on the
        // attachment so hibernation cannot desync the client's inflater.
        const encoder = new ZlibStreamEncoder(session.zlibStarted);
        const framed = encoder.encode(payload);
        socket.send(framed);
        if (!session.zlibStarted && encoder.started) {
          // Persisted here rather than by the caller: a second copy of the
          // zlib header mid-stream is read as a stored block with a bad
          // length, and the client's inflate context never recovers.
          session.zlibStarted = true;
          socket.serializeAttachment(session);
        }
      } else {
        socket.send(payload);
      }
    } catch {
      // The socket closed underneath us; the close handler does the cleanup.
    }
  }
}

/** Blanks the fields Discord withholds without the MESSAGE_CONTENT intent. */
function redactContent(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  return {
    ...(data as Record<string, unknown>),
    content: "",
    embeds: [],
    attachments: [],
    components: [],
  };
}
