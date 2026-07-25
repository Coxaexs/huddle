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
import {
  emptyPlayer,
  playbackPosition,
  type ClientEvent,
  type PlayerAction,
  type PlayerState,
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
  muted: boolean;
  deafened: boolean;
}

/** How long after the last track ends before the bot leaves the room. */
const IDLE_LEAVE_MS = 60_000;

export class HuddleHub extends DurableObject {
  private players = new Map<string, PlayerState>();
  /** People muted for everyone, by user id. */
  private forcedMutes = new Set<string>();
  private loaded: Promise<void> | null = null;

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
      })();
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
      for (const { attachment } of this.sockets()) {
        if (attachment.userId === body.userId && attachment.voiceChannelId) {
          this.broadcastVoice(attachment.voiceChannelId);
        }
      }
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
      muted: false,
      deafened: false,
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
    };
    socket.send(JSON.stringify(ready));
    this.broadcastPresence();

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

      case "voice-join": {
        const previous = attachment.voiceChannelId;
        attachment.voiceChannelId = event.channelId;
        attachment.muted = false;
        attachment.deafened = false;
        socket.serializeAttachment(attachment);
        if (previous && previous !== event.channelId) {
          this.broadcastVoice(previous);
        }
        this.broadcastVoice(event.channelId);
        return;
      }

      case "voice-leave": {
        const previous = attachment.voiceChannelId;
        attachment.voiceChannelId = null;
        socket.serializeAttachment(attachment);
        if (previous) this.broadcastVoice(previous);
        return;
      }

      case "voice-state": {
        if (typeof event.muted === "boolean") attachment.muted = event.muted;
        if (typeof event.deafened === "boolean") {
          attachment.deafened = event.deafened;
        }
        socket.serializeAttachment(attachment);
        if (attachment.voiceChannelId) {
          this.broadcastVoice(attachment.voiceChannelId);
        }
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

      case "player": {
        await this.applyPlayerAction(event.channelId, event.action);
        return;
      }
    }
  }

  async webSocketClose(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as Attachment | null;
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

  private onlineUserIds(): string[] {
    return [...new Set(this.sockets().map((entry) => entry.attachment.userId))];
  }

  private participantsIn(channelId: string): VoiceParticipant[] {
    const participants: VoiceParticipant[] = this.sockets()
      .filter((entry) => entry.attachment.voiceChannelId === channelId)
      .map(({ attachment }) => ({
        connectionId: attachment.connectionId,
        id: attachment.userId,
        username: attachment.username,
        displayName: attachment.displayName,
        avatar: attachment.avatar,
        avatarUrl: attachment.avatarUrl,
        color: attachment.color,
        muted: attachment.muted || this.forcedMutes.has(attachment.userId),
        deafened: attachment.deafened,
        serverMuted: this.forcedMutes.has(attachment.userId),
      }));

    // The music bot shows up as a member of the room whenever it is playing
    // there, exactly like it does in Discord.
    const player = this.players.get(channelId);
    if (player?.track) {
      participants.push({
        connectionId: `bot:${channelId}`,
        id: "bot:music",
        username: "musicbot",
        displayName: "Music + Watch",
        avatar: "♫",
        color: "#a99af5",
        muted: false,
        deafened: false,
        bot: true,
      });
    }
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
      await this.ctx.storage.setAlarm(Date.now() + Math.max(1000, remaining + 1500));
      return;
    }
    if (!state.track) {
      await this.ctx.storage.setAlarm(Date.now() + IDLE_LEAVE_MS);
    }
  }

  async alarm(): Promise<void> {
    await this.load();
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
  }
}
