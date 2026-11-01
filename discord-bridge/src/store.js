/**
 * The bridge's memory: which Discord message is which Hoffle message, the
 * webhooks it posts through, where it got to in each channel, and who reacted.
 * A small SQLite file (node:sqlite, built into Node 22), so a restart picks up
 * edits, deletes and reactions on messages bridged before it.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { snowflakeAfter } from "./convert.js";

/** Mappings older than this are forgotten; edits to them no longer cross. */
const KEEP_DAYS = 90;

export class Store {
  /** @param {string} file path, or ":memory:" */
  constructor(file) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS messages (
        discord_id TEXT PRIMARY KEY,
        hoffle_id TEXT NOT NULL UNIQUE,
        discord_channel TEXT NOT NULL,
        hoffle_channel TEXT NOT NULL,
        server_id TEXT NOT NULL,
        origin TEXT NOT NULL,
        via_webhook TEXT,
        extra_discord TEXT,
        extra_hoffle TEXT,
        hash TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_time ON messages(created_at);
      CREATE TABLE IF NOT EXISTS webhooks (
        side TEXT NOT NULL,
        channel TEXT NOT NULL,
        id TEXT NOT NULL,
        token TEXT NOT NULL,
        PRIMARY KEY (side, channel)
      );
      CREATE TABLE IF NOT EXISTS cursors (
        side TEXT NOT NULL,
        channel TEXT NOT NULL,
        last_id TEXT NOT NULL,
        PRIMARY KEY (side, channel)
      );
      CREATE TABLE IF NOT EXISTS threads (
        discord_thread TEXT PRIMARY KEY,
        hoffle_thread TEXT NOT NULL UNIQUE,
        server_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reactors (
        side TEXT NOT NULL,
        message TEXT NOT NULL,
        emoji TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (side, message, emoji, user_id)
      );
      CREATE TABLE IF NOT EXISTS voice_effects (
        discord_user TEXT PRIMARY KEY,
        effect TEXT NOT NULL
      );
    `);
    this.q = {
      put: this.db.prepare(`INSERT OR REPLACE INTO messages
        (discord_id, hoffle_id, discord_channel, hoffle_channel, server_id, origin, via_webhook, extra_discord, extra_hoffle, hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
      byDiscord: this.db.prepare("SELECT * FROM messages WHERE discord_id = ?"),
      byHoffle: this.db.prepare("SELECT * FROM messages WHERE hoffle_id = ?"),
      setHash: this.db.prepare("UPDATE messages SET hash = ? WHERE discord_id = ?"),
      forget: this.db.prepare("DELETE FROM messages WHERE discord_id = ?"),
      webhook: this.db.prepare("SELECT id, token FROM webhooks WHERE side = ? AND channel = ?"),
      putWebhook: this.db.prepare("INSERT OR REPLACE INTO webhooks (side, channel, id, token) VALUES (?, ?, ?, ?)"),
      dropWebhook: this.db.prepare("DELETE FROM webhooks WHERE side = ? AND channel = ?"),
      webhookIds: this.db.prepare("SELECT id FROM webhooks WHERE side = ?"),
      webhookById: this.db.prepare("SELECT channel, id, token FROM webhooks WHERE side = ? AND id = ?"),
      cursor: this.db.prepare("SELECT last_id FROM cursors WHERE side = ? AND channel = ?"),
      putCursor: this.db.prepare("INSERT OR REPLACE INTO cursors (side, channel, last_id) VALUES (?, ?, ?)"),
      threadByDiscord: this.db.prepare("SELECT * FROM threads WHERE discord_thread = ?"),
      threadByHoffle: this.db.prepare("SELECT * FROM threads WHERE hoffle_thread = ?"),
      putThread: this.db.prepare("INSERT OR REPLACE INTO threads (discord_thread, hoffle_thread, server_id) VALUES (?, ?, ?)"),
      addReactor: this.db.prepare(
        "INSERT OR IGNORE INTO reactors (side, message, emoji, user_id, name, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ),
      dropReactor: this.db.prepare("DELETE FROM reactors WHERE side = ? AND message = ? AND emoji = ? AND user_id = ?"),
      countReactors: this.db.prepare("SELECT COUNT(*) AS n FROM reactors WHERE side = ? AND message = ? AND emoji = ?"),
      reactorsOf: this.db.prepare("SELECT emoji, user_id, name FROM reactors WHERE side = ? AND message = ?"),
      reactorName: this.db.prepare("SELECT name FROM reactors WHERE side = ? AND user_id = ? AND name IS NOT NULL ORDER BY created_at DESC LIMIT 1"),
      voiceEffect: this.db.prepare("SELECT effect FROM voice_effects WHERE discord_user = ?"),
      putVoiceEffect: this.db.prepare("INSERT OR REPLACE INTO voice_effects (discord_user, effect) VALUES (?, ?)"),
      dropVoiceEffect: this.db.prepare("DELETE FROM voice_effects WHERE discord_user = ?"),
      dropReactorsOf: this.db.prepare("DELETE FROM reactors WHERE side = ? AND message = ?"),
      dropReactorsEmoji: this.db.prepare("DELETE FROM reactors WHERE side = ? AND message = ? AND emoji = ?"),
      prune: this.db.prepare("DELETE FROM messages WHERE created_at < ?"),
      pruneReactors: this.db.prepare("DELETE FROM reactors WHERE created_at < ?"),
    };
  }

  /**
   * @param {{ discordId: string, hoffleId: string, discordChannel: string, hoffleChannel: string,
   *   serverId: string, origin: "discord" | "hoffle", viaWebhook?: string | null,
   *   extraDiscord?: string[], extraHoffle?: string[], hash?: string | null }} m
   */
  putMessage(m) {
    this.q.put.run(
      m.discordId,
      m.hoffleId,
      m.discordChannel,
      m.hoffleChannel,
      m.serverId,
      m.origin,
      m.viaWebhook ?? null,
      m.extraDiscord?.length ? JSON.stringify(m.extraDiscord) : null,
      m.extraHoffle?.length ? JSON.stringify(m.extraHoffle) : null,
      m.hash ?? null,
      Date.now(),
    );
  }

  byDiscord(id) {
    return id ? (this.q.byDiscord.get(id) ?? null) : null;
  }

  byHoffle(id) {
    return id ? (this.q.byHoffle.get(id) ?? null) : null;
  }

  setHash(discordId, hash) {
    this.q.setHash.run(hash, discordId);
  }

  forget(discordId) {
    this.q.forget.run(discordId);
  }

  /** @param {"discord" | "hoffle"} side */
  webhook(side, channel) {
    return this.q.webhook.get(side, channel) ?? null;
  }

  putWebhook(side, channel, id, token) {
    this.q.putWebhook.run(side, channel, id, token);
  }

  dropWebhook(side, channel) {
    this.q.dropWebhook.run(side, channel);
  }

  /** A webhook by its id, with the channel it belongs to. */
  webhookById(side, id) {
    return id ? (this.q.webhookById.get(side, id) ?? null) : null;
  }

  /** Every webhook id the bridge posts through on one side (for echo checks). */
  webhookIds(side) {
    return new Set(this.q.webhookIds.all(side).map((row) => row.id));
  }

  cursor(side, channel) {
    return this.q.cursor.get(side, channel)?.last_id ?? null;
  }

  /** Moves a channel's cursor forward only. */
  advance(side, channel, id) {
    if (!id) return;
    const current = this.cursor(side, channel);
    if (snowflakeAfter(id, current)) this.q.putCursor.run(side, channel, id);
  }

  threadByDiscord(id) {
    return this.q.threadByDiscord.get(id) ?? null;
  }

  threadByHoffle(id) {
    return this.q.threadByHoffle.get(id) ?? null;
  }

  putThread(discordThread, hoffleThread, serverId) {
    this.q.putThread.run(discordThread, hoffleThread, serverId);
  }

  /** @returns {boolean} true when this was the first reactor with that emoji */
  addReactor(side, message, emoji, userId, name = null) {
    this.q.addReactor.run(side, message, emoji, userId, name, Date.now());
    return Number(this.q.countReactors.get(side, message, emoji).n) === 1;
  }

  /** @returns {number} reactors with that emoji left */
  dropReactor(side, message, emoji, userId) {
    this.q.dropReactor.run(side, message, emoji, userId);
    return Number(this.q.countReactors.get(side, message, emoji).n);
  }

  reactorsOf(side, message) {
    return this.q.reactorsOf.all(side, message);
  }

  reactorName(side, userId) {
    return this.q.reactorName.get(side, userId)?.name ?? null;
  }

  dropReactorsOf(side, message, emoji = null) {
    if (emoji) this.q.dropReactorsEmoji.run(side, message, emoji);
    else this.q.dropReactorsOf.run(side, message);
  }

  /** The voice effect a Discord person picked with /hoffle-voice ("none" when unset). */
  voiceEffect(discordUser) {
    return this.q.voiceEffect.get(discordUser)?.effect ?? "none";
  }

  setVoiceEffect(discordUser, effect) {
    if (!effect || effect === "none") this.q.dropVoiceEffect.run(discordUser);
    else this.q.putVoiceEffect.run(discordUser, effect);
  }

  prune() {
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
    this.q.prune.run(cutoff);
    this.q.pruneReactors.run(cutoff);
  }

  close() {
    this.db.close();
  }
}
