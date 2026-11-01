/**
 * One socket into Hoffle's realtime hub, as the bridge.
 *
 * With a Discord person (`discord`), it is that person's seat: it sits in one
 * voice room and mirrors their mute and deafen. Without, it is the bridge's
 * monitor: it sits nowhere and only watches who is in the bridged rooms.
 *
 * Hoffle decides who a seat is (a linked person sits as themselves); this side
 * only names the Discord account. Reconnects resume the same seat, so a blip
 * doesn't make anyone leave and rejoin.
 */
import { EventEmitter } from "node:events";
import WebSocket from "ws";

const PING_MS = 25_000;

export class HubSeat extends EventEmitter {
  /**
   * @param {{ hoffleUrl: string, basePath: string, hoffleToken: string }} cfg
   * @param {{ discord?: { id: string, name: string, avatarUrl?: string | null }, channelId?: string, label: string }} who
   */
  constructor(cfg, who) {
    super();
    this.cfg = cfg;
    this.who = who;
    this.socket = null;
    this.closed = false;
    this.connectionId = null;
    this.resumeTicket = null;
    this.userId = null;
    this.state = { muted: false, deafened: false };
    this.retry = 1000;
    this.pinger = null;
    /** channelId → participants, for the rooms this socket can see. */
    this.rooms = new Map();
  }

  url() {
    const base = `${this.cfg.hoffleUrl}${this.cfg.basePath}/api/realtime`.replace(/^http/, "ws");
    const params = new URLSearchParams();
    if (this.who.discord) {
      params.set("discordUser", this.who.discord.id);
      params.set("name", this.who.discord.name);
      if (this.who.discord.avatarUrl) params.set("avatarUrl", this.who.discord.avatarUrl);
    }
    // Hoffle sets who this is; the ticket proves the seat was ours.
    if (this.connectionId && this.resumeTicket) {
      params.set("resume", this.connectionId);
      params.set("ticket", this.resumeTicket);
    }
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  }

  open() {
    if (this.closed) return;
    const socket = new WebSocket(this.url(), {
      headers: { Authorization: `Bearer ${this.cfg.hoffleToken}` },
      handshakeTimeout: 15_000,
    });
    this.socket = socket;
    socket.on("open", () => {
      this.retry = 1000;
      clearInterval(this.pinger);
      this.pinger = setInterval(() => this.send({ t: "ping" }), PING_MS);
    });
    socket.on("message", (data) => {
      let event;
      try {
        event = JSON.parse(String(data));
      } catch {
        return;
      }
      this.onEvent(event);
    });
    socket.on("error", (error) => this.emit("problem", error));
    socket.on("close", (code) => {
      clearInterval(this.pinger);
      if (this.socket !== socket) return;
      this.socket = null;
      this.emit("down", code);
      if (this.closed) return;
      // 4000: this connection was resumed elsewhere; anything else, try again.
      setTimeout(() => this.open(), this.retry);
      this.retry = Math.min(this.retry * 2, 30_000);
    });
  }

  onEvent(event) {
    switch (event.t) {
      case "ready": {
        this.connectionId = event.connectionId;
        this.resumeTicket = event.resumeTicket;
        this.rooms = new Map(Object.entries(event.voice || {}));
        // Who this seat is, as the hub put it (linked people sit as themselves).
        for (const people of this.rooms.values()) {
          const me = people.find((person) => person.connectionId === this.connectionId);
          if (me) this.userId = me.id;
        }
        if (this.who.channelId) this.join();
        this.emit("ready");
        this.emit("rooms");
        break;
      }
      case "voice": {
        if (event.participants?.length) this.rooms.set(event.channelId, event.participants);
        else this.rooms.delete(event.channelId);
        const me = (event.participants || []).find((person) => person.connectionId === this.connectionId);
        if (me) {
          this.userId = me.id;
          this.emit("seat", me);
        }
        this.emit("rooms", event.channelId);
        break;
      }
      case "voice-evicted":
      case "voice-move":
        // A moderator took this person out (or tried to move them): they stay
        // out until they rejoin the Discord channel.
        if (this.who.channelId) this.emit("evicted", event.reason || (event.t === "voice-move" ? "moderator" : "unknown"));
        break;
      default:
        break;
    }
  }

  join() {
    this.send({
      t: "voice-join",
      channelId: this.who.channelId,
      sfu: true,
      muted: this.state.muted,
      deafened: this.state.deafened,
    });
  }

  /** Mirrors the person's Discord mute and deafen onto the seat. */
  setState(next) {
    if (next.muted === this.state.muted && next.deafened === this.state.deafened) return;
    this.state = { muted: Boolean(next.muted), deafened: Boolean(next.deafened) };
    this.send({ t: "voice-state", muted: this.state.muted, deafened: this.state.deafened });
  }

  /** This seat as the hub lists it in its room, or null. */
  seat() {
    const people = this.rooms.get(this.who.channelId) || [];
    return people.find((person) => person.connectionId === this.connectionId) || null;
  }

  send(event) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(event));
    return true;
  }

  close() {
    this.closed = true;
    clearInterval(this.pinger);
    if (this.who.channelId) this.send({ t: "voice-leave" });
    const socket = this.socket;
    this.socket = null;
    if (socket) setTimeout(() => socket.close(1000), 50).unref?.();
  }
}
