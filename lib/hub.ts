/**
 * The Huddle hub: one Durable Object that every browser holds a WebSocket to.
 *
 * It owns the things that have to be the same for everyone at the same moment —
 * who is online, who is sitting in which voice room, the WebRTC signalling
 * between them, and the shared music player position that makes the seek bar
 * mean the same thing on every screen.
 *
 * Nothing here touches D1: durable data stays in the database, this object only
 * holds live state (plus the player, which is checkpointed so a hibernation or
 * restart does not silently stop the music).
 */

import { DurableObject } from "cloudflare:workers";
import { collectDueEventNotices, nextEventAlarm } from "./events";
import { can, Permission } from "./permissions";
import { initialSpeakAllowed, resolveSeatMute } from "./stage";
import { sendPushNotifications } from "./push";
import {
  emptyPlayer,
  playbackPosition,
  type ClientEvent,
  type PlayerAction,
  type PlayerState,
  type RecordingState,
  type ServerEvent,
  type Track,
  type VoiceParticipant,
} from "./protocol";

interface Attachment {
  connectionId: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  channelId: string | null;
  voiceChannelId: string | null;
  /** Hub-clock ms this seat was taken; null whenever voiceChannelId is null. */
  voiceJoinedAt: number | null;
  muted: boolean;
  deafened: boolean;
  important?: boolean;
  /** Stage rooms: this seat is asking for the floor. */
  handRaised?: boolean;
  /**
   * Stage rooms: this seat may be heard. Absent means "not yet decided", which
   * for a stage is the same as no: the floor is granted, never assumed.
   */
  speakAllowed?: boolean;
  /** MediaStream ids so receivers can tell a camera from a screen share. */
  cameraStreamId: string | null;
  screenStreamId: string | null;
  bot: boolean;
  recorder: boolean;
  /** Connected but appearing offline: left out of every presence list. */
  invisible?: boolean;
}

/** How long after the last track ends before the bot leaves the room. */
const IDLE_LEAVE_MS = 60_000;

/**
 * Ceiling on the hub's channel-kind cache.
 *
 * Sized for "every voice channel anyone is likely to touch in one wake of the
 * object", not for the whole database: the cache is only meant to spare the hot
 * path a query, and clearing it costs at most one extra read per channel.
 */
const CHANNEL_CACHE_LIMIT = 500;

export class HuddleHub extends DurableObject {
  private players = new Map<string, PlayerState>();
  /** People muted for everyone, by user id. */
  private forcedMutes = new Set<string>();
  /** One public active/finalizing recording snapshot per voice channel. */
  private recordings = new Map<string, RecordingState>();
  private loaded: Promise<void> | null = null;
  private readonly db: D1Database | null;
  /**
   * channelId -> kind and owning server, for voice rooms only.
   *
   * Read on every voice-join and every stage mute decision, which is far too
   * hot for a query each time. A channel's kind never changes, so a cache entry
   * cannot go stale in a way that matters. Only successful lookups are stored
   * and the map is capped, so a client inventing channel ids cannot grow it
   * without bound.
   */
  private readonly channelCache = new Map<string, { kind: string; serverId: string }>();

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.db = (env as { DB?: D1Database } | null)?.DB ?? null;
    // Answer the client keepalive ping in the runtime itself, so an idle tab's
    // ping never wakes this object from hibernation to run JS. The pong carries
    // no serverNow on purpose — the client only takes the clock from real
    // events, and ignores a missing one — so a static reply is safe.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        JSON.stringify({ t: "ping" }),
        JSON.stringify({ t: "pong" }),
      ),
    );
  }

  private async load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        const stored =
          await this.ctx.storage.get<Record<string, PlayerState>>("players");
        for (const [channelId, state] of Object.entries(stored || {})) {
          this.players.set(channelId, state);
        }
        const mutes = await this.ctx.storage.get<string[]>("forcedMutes");
        for (const userId of mutes || []) this.forcedMutes.add(userId);
        const recordings =
          await this.ctx.storage.get<Record<string, RecordingState>>("recordings");
        for (const [channelId, state] of Object.entries(recordings || {})) {
          this.recordings.set(channelId, state);
        }
      })().catch((error) => {
        // A failed read must not poison the object for its whole lifetime:
        // drop the cached promise so the next request retries from scratch.
        this.loaded = null;
        throw error;
      });
    }
    return this.loaded;
  }

  private async persistPlayers(): Promise<void> {
    await this.ctx.storage.put(
      "players",
      Object.fromEntries(this.players.entries()),
    );
  }

  // ---------------------------------------------------------------- routing

  async fetch(request: Request): Promise<Response> {
    await this.load();
    const url = new URL(request.url);

    if (url.pathname === "/socket") {
      return this.handleSocket(request, url);
    }
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const body = (await request.json()) as {
        channelId: string;
        message: unknown;
        /** User ids allowed to see it; absent means everyone (DMs use this). */
        audience?: string[] | null;
      };
      this.broadcast(
        {
          t: "message",
          channelId: body.channelId,
          message: body.message,
          serverNow: Date.now(),
        },
        { audience: body.audience },
      );
      return Response.json({ ok: true });
    }
    if (url.pathname === "/event" && request.method === "POST") {
      const body = (await request.json()) as {
        channelId: string;
        event: Record<string, unknown>;
        audience?: string[] | null;
      };
      this.broadcast(
        {
          ...(body.event as object),
          channelId: body.channelId,
          serverNow: Date.now(),
        } as ServerEvent,
        { audience: body.audience },
      );
      return Response.json({ ok: true });
    }
    if (url.pathname === "/recording" && request.method === "POST") {
      const body = (await request.json()) as {
        channelId: string;
        state: RecordingState | null;
      };
      if (!body.channelId) return new Response("Bad request", { status: 400 });
      if (body.state) this.recordings.set(body.channelId, body.state);
      else this.recordings.delete(body.channelId);
      await this.ctx.storage.put(
        "recordings",
        Object.fromEntries(this.recordings.entries()),
      );
      this.broadcast({
        t: "recording-state",
        channelId: body.channelId,
        state: body.state,
        serverNow: Date.now(),
      });
      return Response.json({ ok: true });
    }
    if (url.pathname === "/force-mute" && request.method === "POST") {
      const body = (await request.json()) as {
        userId: string;
        muted: boolean;
      };
      if (body.muted) this.forcedMutes.add(body.userId);
      else this.forcedMutes.delete(body.userId);
      await this.ctx.storage.put("forcedMutes", [...this.forcedMutes]);

      this.broadcast({
        t: "force-mute",
        userId: body.userId,
        muted: body.muted,
        serverNow: Date.now(),
      });
      // Refresh whichever room they are sitting in.
      for (const { socket, attachment } of this.sockets()) {
        if (attachment.userId === body.userId && attachment.voiceChannelId) {
          if (body.muted) {
            attachment.important = false;
            socket.serializeAttachment(attachment);
          }
          this.broadcastVoice(attachment.voiceChannelId);
        }
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === "/move-voice" && request.method === "POST") {
      const body = (await request.json()) as {
        userId: string;
        channelId: string;
      };
      // Only tabs of that account currently sitting in a voice room get moved;
      // the client does the real join so WebRTC renegotiates for the new room.
      let moved = false;
      for (const { socket, attachment } of this.sockets()) {
        if (attachment.bot) continue;
        if (attachment.userId !== body.userId) continue;
        if (!attachment.voiceChannelId) continue;
        if (attachment.voiceChannelId === body.channelId) continue;
        try {
          socket.send(
            JSON.stringify({
              t: "voice-move",
              channelId: body.channelId,
              serverNow: Date.now(),
            } satisfies ServerEvent),
          );
          moved = true;
        } catch {
          // A socket going away will simply not be moved.
        }
      }
      return Response.json({ ok: true, moved });
    }
    if (url.pathname === "/events-changed" && request.method === "POST") {
      await this.runEvents();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/voice-evict" && request.method === "POST") {
      // Moderation (a timeout): drop this user from any of these voice rooms.
      const body = (await request.json()) as { userId: string; channelIds: string[] };
      const rooms = new Set(body.channelIds);
      const emptied = new Set<string>();
      for (const { socket, attachment } of this.sockets()) {
        if (attachment.userId !== body.userId || !attachment.voiceChannelId) continue;
        if (!rooms.has(attachment.voiceChannelId)) continue;
        const room = attachment.voiceChannelId;
        socket.serializeAttachment({
          ...attachment,
          voiceChannelId: null,
          voiceJoinedAt: null,
          cameraStreamId: null,
          screenStreamId: null,
        });
        emptied.add(room);
        try {
          socket.send(
            JSON.stringify({ t: "voice-evicted", channelId: room, serverNow: Date.now() } satisfies ServerEvent),
          );
        } catch {
          // Already going away.
        }
      }
      for (const room of emptied) this.broadcastVoice(room);
      return Response.json({ ok: true, evicted: emptied.size });
    }
    if (url.pathname === "/presence-status" && request.method === "POST") {
      const body = (await request.json()) as { userId: string; invisible: boolean };
      for (const { socket, attachment } of this.sockets()) {
        if (attachment.userId !== body.userId || attachment.bot) continue;
        socket.serializeAttachment({ ...attachment, invisible: body.invisible });
      }
      this.broadcastPresence();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/structure" && request.method === "POST") {
      this.broadcast({ t: "structure", serverNow: Date.now() });
      return Response.json({ ok: true });
    }
    if (url.pathname === "/state") {
      return Response.json({
        online: this.onlineUserIds(),
        voice: this.voiceRooms(),
        players: Object.fromEntries(this.players.entries()),
        recordings: Object.fromEntries(this.recordings.entries()),
        serverNow: Date.now(),
      });
    }
    if (url.pathname === "/player" && request.method === "POST") {
      const body = (await request.json()) as {
        channelId: string;
        action: PlayerAction;
      };
      const state = await this.applyPlayerAction(body.channelId, body.action);
      return Response.json({ state, serverNow: Date.now() });
    }
    if (url.pathname === "/player" && request.method === "GET") {
      const channelId = url.searchParams.get("channelId") || "";
      return Response.json({
        state: this.players.get(channelId) || emptyPlayer(channelId),
        serverNow: Date.now(),
      });
    }
    return new Response("Not found", { status: 404 });
  }

  private handleSocket(request: Request, url: URL): Response {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }

    const attachment: Attachment = {
      connectionId: crypto.randomUUID(),
      userId: url.searchParams.get("userId") || "",
      username: url.searchParams.get("username") || "",
      displayName: url.searchParams.get("displayName") || "",
      avatar: url.searchParams.get("avatar") || "H",
      avatarUrl: url.searchParams.get("avatarUrl") || null,
      color: url.searchParams.get("color") || "#ffd67c",
      channelId: null,
      voiceChannelId: null,
      voiceJoinedAt: null,
      muted: false,
      deafened: false,
      cameraStreamId: null,
      screenStreamId: null,
      bot: url.searchParams.get("bot") === "1",
      recorder: url.searchParams.get("recorder") === "1",
      invisible: url.searchParams.get("invisible") === "1",
    };
    if (!attachment.userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const pair = new WebSocketPair();
    const [client, socket] = Object.values(pair);
    // Hibernation-aware: workerd can evict this object between messages and
    // still deliver events, so identity lives on the socket itself.
    this.ctx.acceptWebSocket(socket);
    socket.serializeAttachment(attachment);

    const ready: ServerEvent = {
      t: "ready",
      connectionId: attachment.connectionId,
      serverNow: Date.now(),
      online: this.onlineUserIds(),
      voice: this.voiceRooms(),
      players: Object.fromEntries(this.players.entries()),
      forcedMutes: [...this.forcedMutes],
      recordings: Object.fromEntries(this.recordings.entries()),
    };
    socket.send(JSON.stringify(ready));
    this.broadcastPresence();
    this.markSeen(attachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ------------------------------------------------------------- websockets

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    await this.load();
    if (typeof raw !== "string") return;

    let event: ClientEvent;
    try {
      event = JSON.parse(raw) as ClientEvent;
    } catch {
      return;
    }

    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (!attachment) return;

    switch (event.t) {
      case "ping":
        socket.send(JSON.stringify({ t: "pong", serverNow: Date.now() }));
        return;

      case "subscribe":
        attachment.channelId = event.channelId;
        socket.serializeAttachment(attachment);
        return;

      case "typing":
        // Fire-and-forget: everyone else in the channel sees it for a moment.
        this.broadcast(
          {
            t: "typing",
            channelId: event.channelId,
            userId: attachment.userId,
            displayName: attachment.displayName,
            serverNow: Date.now(),
          },
          { skipConnectionId: attachment.connectionId },
        );
        return;

      case "voice-join": {
        const previous = attachment.voiceChannelId;

        // One person occupies one seat: a second tab joining takes over, and
        // the others are dropped so nobody appears in the room twice.
        const evicted = new Set<string>();
        if (!attachment.bot) {
          for (const entry of this.sockets()) {
            const other = entry.attachment;
            if (other.bot) continue;
            if (other.userId !== attachment.userId) continue;
            if (other.connectionId === attachment.connectionId) continue;
            if (!other.voiceChannelId) continue;

            const room = other.voiceChannelId;
            other.voiceChannelId = null;
            other.voiceJoinedAt = null;
            other.cameraStreamId = null;
            other.screenStreamId = null;
            entry.socket.serializeAttachment(other);
            evicted.add(room);
            try {
              entry.socket.send(
                JSON.stringify({
                  t: "voice-evicted",
                  channelId: room,
                  serverNow: Date.now(),
                }),
              );
            } catch {
              // A socket going away is already leaving the room.
            }
          }
        }

        attachment.important = false;
        attachment.voiceChannelId = event.channelId;
        // A re-announce of the same room (a reconnect on the same socket) keeps
        // the clock running; only a genuinely new seat starts it over.
        if (previous !== event.channelId || attachment.voiceJoinedAt == null) {
          attachment.voiceJoinedAt = Date.now();
        }
        // A stage seat arrives in the audience. This is decided here, from the
        // database, rather than taken from the client: the client also mutes
        // itself on join, but a modified one simply would not, and then it would
        // be heard by the whole room.
        const info = await this.channelInfo(event.channelId);
        if (info.kind === "stage") {
          attachment.speakAllowed = await this.seatMaySpeak(info.serverId, attachment.userId);
        } else {
          // Not a stage, so the floor is not something anyone has to be granted.
          attachment.speakAllowed = true;
        }
        attachment.handRaised = false;
        attachment.muted = resolveSeatMute({
          kind: info.kind,
          speakAllowed: attachment.speakAllowed,
          requestedMuted: false,
        });
        attachment.deafened = false;
        attachment.cameraStreamId = null;
        attachment.screenStreamId = null;
        socket.serializeAttachment(attachment);

        if (previous && previous !== event.channelId) {
          this.broadcastVoice(previous);
        }
        for (const room of evicted) {
          if (room !== event.channelId && room !== previous) {
            this.broadcastVoice(room);
          }
        }
        this.broadcastVoice(event.channelId);
        return;
      }

      case "voice-leave": {
        attachment.important = false;
        const previous = attachment.voiceChannelId;
        attachment.voiceChannelId = null;
        attachment.voiceJoinedAt = null;
        attachment.cameraStreamId = null;
        attachment.screenStreamId = null;
        socket.serializeAttachment(attachment);
        if (previous) this.broadcastVoice(previous);
        return;
      }

      case "voice-state": {
        if (typeof event.important === "boolean" && attachment.voiceChannelId) {
          attachment.important = event.important;
        }
        if (typeof event.muted === "boolean") {
          // A stage seat cannot unmute itself out of the audience. Without this
          // check the auto-mute on join is cosmetic: a client could skip
          // straight to `muted: false` and be heard.
          if (event.muted === false && (await this.seatIsSilenced(attachment))) {
            attachment.muted = true;
          } else {
            attachment.muted = event.muted;
          }
        }
        if (typeof event.deafened === "boolean") {
          attachment.deafened = event.deafened;
        }
        if (typeof event.handRaised === "boolean") {
          attachment.handRaised = event.handRaised;
          // A hand raised while unmuted makes no sense: being heard is what the
          // hand was asking for, so taking the floor lowers it.
          if (!attachment.muted && !attachment.deafened) attachment.handRaised = false;
        }
        if (attachment.muted || attachment.deafened || this.forcedMutes.has(attachment.userId)) {
          attachment.important = false;
        }
        if (event.cameraStreamId !== undefined) {
          attachment.cameraStreamId = event.cameraStreamId;
        }
        if (event.screenStreamId !== undefined) {
          attachment.screenStreamId = event.screenStreamId;
        }
        socket.serializeAttachment(attachment);
        if (attachment.voiceChannelId) {
          this.broadcastVoice(attachment.voiceChannelId);
        }
        return;
      }

      case "stage-speaker": {
        // Addresses one seat rather than one person: the same account can be in
        // the audience on one device and on stage on another.
        const target = this.seatFor(event.connectionId);
        if (!target) return;
        const room = target.attachment.voiceChannelId;
        // Both must be in the same room, or a moderator elsewhere could reach
        // into a stage they are not watching.
        if (!room || room !== attachment.voiceChannelId) return;

        const info = await this.channelInfo(room);
        if (info.kind !== "stage") return;
        if (!(await this.seatMayPromote(info.serverId, attachment.userId))) return;

        target.attachment.speakAllowed = event.allowed;
        // Being brought up answers the raised hand.
        if (event.allowed) target.attachment.handRaised = false;
        if (!event.allowed) {
          // Taking the floor away silences the seat now rather than waiting for
          // it to co-operate, and clears the hand it was holding up.
          target.attachment.muted = true;
          target.attachment.handRaised = false;
        }
        target.socket.serializeAttachment(target.attachment);
        this.broadcastVoice(room);
        return;
      }

      case "signal": {
        // Straight relay between two tabs in the same voice room.
        const target = this.socketFor(event.to);
        target?.send(
          JSON.stringify({
            t: "signal",
            from: attachment.connectionId,
            data: event.data,
            serverNow: Date.now(),
          } satisfies ServerEvent),
        );
        return;
      }

      case "dm-call": {
        let reached = false;
        for (const entry of this.sockets()) {
          const other = entry.attachment;
          if (other.userId === event.targetUserId) {
            reached = true;
            try {
              entry.socket.send(
                JSON.stringify({
                  t: "dm-call",
                  channelId: event.channelId,
                  fromUserId: attachment.userId,
                  fromDisplayName: attachment.displayName,
                  fromAvatar: attachment.avatar,
                  fromAvatarUrl: attachment.avatarUrl,
                  action: event.action,
                  isVideo: event.isVideo,
                  serverNow: Date.now(),
                } satisfies ServerEvent),
              );
            } catch {
              // Socket already disconnected
            }
          }
        }
        // Nobody has the app open: ring their phone instead.
        if (!reached && event.action === "call" && this.db) {
          this.ctx.waitUntil(
            sendPushNotifications(this.db, [event.targetUserId], {
              title: `${attachment.displayName} is calling`,
              body: event.isVideo ? "Incoming video call on Hoffle" : "Incoming call on Hoffle",
              tag: `call-${event.channelId}`,
              urgent: true,
            }).catch(() => undefined),
          );
        }
        return;
      }

      case "player": {
        await this.applyPlayerAction(event.channelId, event.action);
        return;
      }
    }
  }

  async webSocketClose(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (attachment) this.markSeen(attachment);
    if (attachment?.voiceChannelId) {
      // The socket is still listed until it actually closes, so announce the
      // room on the next tick of the event loop.
      const channelId = attachment.voiceChannelId;
      queueMicrotask(() => {
        this.broadcastVoice(channelId);
        this.broadcastPresence();
      });
    } else {
      queueMicrotask(() => this.broadcastPresence());
    }
  }

  async webSocketError(socket: WebSocket) {
    await this.webSocketClose(socket);
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Records "last seen" when a person connects or disconnects. Skipped while
   * invisible, so the timestamp can't reveal someone who is hiding.
   */
  private markSeen(attachment: Attachment): void {
    if (!this.db || attachment.bot || attachment.invisible) return;
    this.ctx.waitUntil(
      this.db
        .prepare("UPDATE users SET last_seen_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), attachment.userId)
        .run()
        .then(() => undefined, () => undefined),
    );
  }

  private sockets(): Array<{ socket: WebSocket; attachment: Attachment }> {
    const out: Array<{ socket: WebSocket; attachment: Attachment }> = [];
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const attachment = socket.deserializeAttachment() as Attachment | null;
      if (attachment) out.push({ socket, attachment });
    }
    return out;
  }

  private socketFor(connectionId: string): WebSocket | null {
    for (const { socket, attachment } of this.sockets()) {
      if (attachment.connectionId === connectionId) return socket;
    }
    return null;
  }

  /** The socket and its attachment for a connection, or null once it has gone. */
  private seatFor(
    connectionId: string,
  ): { socket: WebSocket; attachment: Attachment } | null {
    for (const entry of this.sockets()) {
      if (entry.attachment.connectionId === connectionId) return entry;
    }
    return null;
  }

  /**
   * A voice channel's kind and owning server.
   *
   * Anything unknown answers "text", which is the safe default: it is not a
   * stage, so no seat is muted on the strength of a channel id that does not
   * exist.
   */
  private async channelInfo(channelId: string): Promise<{ kind: string; serverId: string }> {
    const cached = this.channelCache.get(channelId);
    if (cached) return cached;
    if (!this.db) return { kind: "text", serverId: "" };

    const row = await this.db
      .prepare("SELECT kind, server_id FROM channels WHERE id = ?")
      .bind(channelId)
      .first<{ kind: string; server_id: string }>()
      .catch(() => null);
    if (!row) return { kind: "text", serverId: "" };

    // Clear rather than evict: this map is tiny and a wholesale reset is easier
    // to reason about than an LRU that only ever runs under attack.
    if (this.channelCache.size >= CHANNEL_CACHE_LIMIT) this.channelCache.clear();
    const info = { kind: row.kind, serverId: row.server_id };
    this.channelCache.set(channelId, info);
    return info;
  }

  /** Whether this member holds SPEAK in that server. */
  private async seatMaySpeak(serverId: string, userId: string): Promise<boolean> {
    if (!this.db || !serverId) return false;
    // A permission lookup that fails is treated as "no": refusing the floor is
    // recoverable by a moderator, being heard is not.
    return can(this.db, userId, serverId, Permission.SPEAK).catch(() => false);
  }

  /** Whether this seat is in a stage and not allowed to be heard. */
  private async seatIsSilenced(attachment: Attachment): Promise<boolean> {
    if (!attachment.voiceChannelId) return false;
    const info = await this.channelInfo(attachment.voiceChannelId);
    if (info.kind !== "stage") return false;
    return attachment.speakAllowed !== true;
  }

  /**
   * Whether this member may move people between the audience and the stage.
   *
   * MUTE_MEMBERS rather than SPEAK: a stage host is a moderator of the room, and
   * someone who merely has the floor should not be able to hand it out.
   */
  private async seatMayPromote(serverId: string, userId: string): Promise<boolean> {
    if (!this.db || !serverId) return false;
    return can(this.db, userId, serverId, Permission.MUTE_MEMBERS).catch(() => false);
  }

  private onlineUserIds(): string[] {
    return [
      ...new Set(
        this.sockets()
          .filter((entry) => !entry.attachment.invisible)
          .map((entry) => entry.attachment.userId),
      ),
    ];
  }

  private participantsIn(channelId: string): VoiceParticipant[] {
    const participants: VoiceParticipant[] = this.sockets()
      .filter((entry) => entry.attachment.voiceChannelId === channelId)
      .map(({ socket, attachment }) => {
        // A socket that entered voice before this field existed gets seeded
        // once here, so its timer starts now instead of reading as zero.
        if (attachment.voiceJoinedAt == null) {
          attachment.voiceJoinedAt = Date.now();
          socket.serializeAttachment(attachment);
        }
        return {
          connectionId: attachment.connectionId,
          id: attachment.userId,
          username: attachment.username,
          displayName: attachment.displayName,
          avatar: attachment.avatar,
          avatarUrl: attachment.avatarUrl,
          color: attachment.color,
          joinedAt: attachment.voiceJoinedAt,
          muted: attachment.muted || this.forcedMutes.has(attachment.userId),
          deafened: attachment.deafened,
          serverMuted: this.forcedMutes.has(attachment.userId),
          important: Boolean(attachment.important) && !attachment.muted && !attachment.deafened && !this.forcedMutes.has(attachment.userId),
          cameraStreamId: attachment.cameraStreamId,
          screenStreamId: attachment.screenStreamId,
          bot: attachment.bot || undefined,
          recorder: attachment.recorder || undefined,
        };
      });
    return participants;
  }

  private voiceRooms(): Record<string, VoiceParticipant[]> {
    const rooms: Record<string, VoiceParticipant[]> = {};
    for (const { attachment } of this.sockets()) {
      if (attachment.voiceChannelId && !rooms[attachment.voiceChannelId]) {
        rooms[attachment.voiceChannelId] = this.participantsIn(
          attachment.voiceChannelId,
        );
      }
    }
    for (const [channelId, player] of this.players.entries()) {
      if (player.track && !rooms[channelId]) {
        rooms[channelId] = this.participantsIn(channelId);
      }
    }
    return rooms;
  }

  private broadcast(
    event: ServerEvent,
    options?: { skipConnectionId?: string; audience?: string[] | null },
  ): void {
    const payload = JSON.stringify(event);
    const audience = options?.audience?.length
      ? new Set(options.audience)
      : null;
    for (const { socket, attachment } of this.sockets()) {
      if (
        options?.skipConnectionId &&
        attachment.connectionId === options.skipConnectionId
      ) {
        continue;
      }
      // DM traffic reaches only the two people in the conversation.
      if (audience && !audience.has(attachment.userId)) continue;
      try {
        socket.send(payload);
      } catch {
        // A socket that fails here is already going away.
      }
    }
  }

  private broadcastPresence(): void {
    this.broadcast({
      t: "presence",
      online: this.onlineUserIds(),
      serverNow: Date.now(),
    });
  }

  private broadcastVoice(channelId: string): void {
    this.broadcast({
      t: "voice",
      channelId,
      participants: this.participantsIn(channelId),
      serverNow: Date.now(),
    });
  }

  private broadcastPlayer(state: PlayerState): void {
    this.broadcast({ t: "player", state, serverNow: Date.now() });
  }

  // ----------------------------------------------------------------- player

  private player(channelId: string): PlayerState {
    let state = this.players.get(channelId);
    if (!state) {
      state = emptyPlayer(channelId);
      this.players.set(channelId, state);
    }
    return state;
  }

  /**
   * Applies a player command and re-anchors the position clock. Every mutation
   * ends with a broadcast so every listener re-syncs from the same numbers.
   */
  async applyPlayerAction(
    channelId: string,
    action: PlayerAction,
  ): Promise<PlayerState> {
    await this.load();
    const state = this.player(channelId);
    const now = Date.now();
    const hadTrack = Boolean(state.track);

    /** Freeze the current position before changing anything time-related. */
    const anchor = () => {
      state.positionMs = playbackPosition(state, now);
      state.updatedAt = now;
    };

    switch (action.name) {
      case "play": {
        if (state.track && !action.startNow) {
          state.queue.push(action.track);
          break;
        }
        state.track = action.track;
        state.positionMs = 0;
        state.updatedAt = now;
        state.paused = false;
        break;
      }
      case "playnext":
        if (!state.track) {
          state.track = action.track;
          state.positionMs = 0;
          state.updatedAt = now;
          state.paused = false;
        } else {
          state.queue.unshift(action.track);
        }
        break;
      case "move": {
        const from = Math.max(0, Math.min(state.queue.length - 1, action.from));
        const to = Math.max(0, Math.min(state.queue.length - 1, action.to));
        const [moved] = state.queue.splice(from, 1);
        if (moved) state.queue.splice(to, 0, moved);
        break;
      }
      case "skipto": {
        // Everything before the chosen track is dropped, like Discord does.
        const index = Math.max(0, Math.min(state.queue.length - 1, action.index));
        state.queue.splice(0, index);
        this.advance(state, now);
        break;
      }
      case "removedupes": {
        const seen = new Set<string>();
        state.queue = state.queue.filter((track) => {
          const key = `${track.title}|${track.artist}`.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        break;
      }
      case "enqueueMany": {
        const tracks = action.tracks.slice(0, 500);
        if (!tracks.length) break;
        if (action.startNow || !state.track) {
          if (action.startNow) {
            if (state.track) {
              state.history = [state.track, ...(state.history || [])].slice(0, 25);
            }
            state.queue = [];
          }
          state.track = tracks[0];
          state.positionMs = 0;
          state.updatedAt = now;
          state.paused = false;
          state.queue.push(...tracks.slice(1));
        } else {
          state.queue.push(...tracks);
        }
        break;
      }
      case "mixAdvance":
        // Ignore a late marker once someone has already skipped ahead.
        if (state.track?.id !== action.fromTrackId || !state.queue.length) break;
        this.advance(state, now);
        state.positionMs = Math.max(0, Math.round(action.positionMs));
        break;
      case "resolve": {
        const { id: _id, ...patch } = action.track;
        if (state.track?.id === action.trackId) {
          const wasPending = !state.track.audioUrl;
          state.track = { ...state.track, ...patch };
          // A placeholder starts from the top once its audio exists.
          if (wasPending && state.track.audioUrl) {
            state.positionMs = 0;
            state.updatedAt = now;
          }
        } else {
          const index = state.queue.findIndex((t) => t.id === action.trackId);
          if (index >= 0) state.queue[index] = { ...state.queue[index], ...patch };
        }
        break;
      }
      case "enqueue":
        if (!state.track) {
          state.track = action.track;
          state.positionMs = 0;
          state.updatedAt = now;
          state.paused = false;
        } else {
          state.queue.push(action.track);
        }
        break;
      case "pause":
        if (!state.paused) anchor();
        state.paused = true;
        break;
      case "resume":
        if (state.paused) {
          state.updatedAt = now;
          state.paused = false;
        }
        break;
      case "toggle":
        if (state.paused) {
          state.updatedAt = now;
          state.paused = false;
        } else {
          anchor();
          state.paused = true;
        }
        break;
      case "seek":
        state.positionMs = Math.max(0, Math.round(action.positionMs));
        state.updatedAt = now;
        break;
      case "volume":
        state.volume = Math.max(0, Math.min(100, Math.round(action.volume)));
        break;
      case "loop":
        state.loop = action.mode;
        break;
      case "shuffle":
        for (let i = state.queue.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
        }
        break;
      case "clear":
        state.queue = [];
        break;
      case "remove":
        if (action.index >= 0 && action.index < state.queue.length) {
          state.queue.splice(action.index, 1);
        }
        break;
      case "stop":
        state.track = null;
        state.queue = [];
        state.positionMs = 0;
        state.updatedAt = now;
        state.paused = false;
        break;
      case "skip":
        this.advance(state, now);
        break;
      case "ended":
        // Ignore a stale "ended" from a client that was still on the old track.
        if (state.track && state.track.id !== action.trackId) break;
        if (state.loop === "track" && state.track) {
          state.positionMs = 0;
          state.updatedAt = now;
        } else {
          this.advance(state, now);
        }
        break;
    }

    await this.persistPlayers();
    this.broadcastPlayer(state);
    // The bot joins and leaves the voice room as playback starts and stops.
    if (hadTrack !== Boolean(state.track)) this.broadcastVoice(channelId);
    await this.scheduleTrackEnd(state);
    return state;
  }

  private advance(state: PlayerState, now: number): void {
    const finished = state.track;
    if (finished) {
      state.history = [finished, ...(state.history || [])].slice(0, 25);
    }
    const next = state.queue.shift() || null;
    if (!next && state.loop === "queue" && finished) {
      state.track = finished;
      state.positionMs = 0;
      state.updatedAt = now;
      return;
    }
    state.track = next;
    state.positionMs = 0;
    state.updatedAt = now;
    state.paused = false;
  }

  /**
   * Server-side end-of-track: clients report `ended`, but a room where every
   * listener closed their laptop should still move on (and let the bot leave).
   */
  private async scheduleTrackEnd(state: PlayerState): Promise<void> {
    const durationMs = state.track?.duration ? state.track.duration * 1000 : 0;
    if (state.track && durationMs && !state.paused) {
      const remaining = durationMs - playbackPosition(state);
      await this.armAlarm(Date.now() + Math.max(1000, remaining + 1500));
      return;
    }
    if (!state.track) {
      await this.armAlarm(Date.now() + IDLE_LEAVE_MS);
    }
  }

  /**
   * One Durable Object has one alarm, shared by the music player and event
   * reminders. Only ever move it earlier; alarm() re-arms whatever is still due
   * later, and both jobs tolerate an early wake-up.
   */
  private async armAlarm(at: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || at < current || current < Date.now()) {
      await this.ctx.storage.setAlarm(at);
    }
  }

  /** Sends due event reminders and schedules the next one. */
  private async runEvents(): Promise<void> {
    if (!this.db) return;
    const notices = await collectDueEventNotices(this.db).catch(() => []);
    for (const notice of notices) {
      await sendPushNotifications(this.db, notice.userIds, {
        title: notice.title,
        body: notice.body,
        url: notice.url,
        tag: notice.tag,
      }).catch(() => undefined);
    }
    if (notices.length) this.broadcast({ t: "structure", serverNow: Date.now() });
    const next = await nextEventAlarm(this.db).catch(() => null);
    if (next !== null) await this.armAlarm(Math.max(next, Date.now() + 1000));
  }

  async alarm(): Promise<void> {
    await this.load();
    await this.runEvents();
    const now = Date.now();
    for (const state of this.players.values()) {
      if (!state.track || state.paused) continue;
      const durationMs = state.track.duration ? state.track.duration * 1000 : 0;
      if (!durationMs) continue;
      if (playbackPosition(state, now) >= durationMs) {
        await this.applyPlayerAction(state.channelId, {
          name: "ended",
          trackId: state.track.id,
        });
      }
    }
    // An early wake (an event reminder) must not lose a track still playing.
    for (const state of this.players.values()) {
      if (!state.track || state.paused || !state.track.duration) continue;
      const remaining = state.track.duration * 1000 - playbackPosition(state);
      if (remaining > 0) await this.armAlarm(Date.now() + remaining + 1500);
    }
  }
}
