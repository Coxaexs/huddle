/**
 * The Discord ↔ Hoffle bridge.
 *
 * Two discord.js clients: one on Discord with the shared bridge bot, one on
 * Hoffle's Discord-compatible gateway as the "Discord Bridge" bot. Hoffle
 * holds the settings (which Hoffle server is linked to which Discord server,
 * which channels pair up, what crosses over); this process polls them and
 * reports back what it sees on Discord.
 *
 * Messages go out through webhooks on both sides, so every person keeps their
 * own name and picture. A local SQLite store remembers which message is which,
 * so edits, deletes, replies and reactions follow, even after a restart, and
 * whatever was said while the bridge was down is carried over when it is back.
 */
import { createServer } from "node:http";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  PermissionFlagsBits,
} from "discord.js";
import {
  avatarForDiscord,
  contentHash,
  discordToHoffle,
  discordUploadLimit,
  formatBytes,
  hoffleToDiscord,
  reactionForDiscord,
  reactionForHoffle,
  replyQuote,
  splitText,
  webhookName,
} from "./convert.js";
import { VOICE_EFFECTS } from "./voice/dsp.js";
import { VoiceBridge } from "./voice/voice.js";

export const VERSION = "2.0.0";

/** Discord message types worth carrying: normal, reply, slash command and context menu answers. */
const RELAYABLE_TYPES = new Set([0, 19, 20, 23]);
/** Hoffle keeps member uploads under 40 MB; stay a little under. */
const HOFFLE_FILE_MAX = 38 * 1024 * 1024;
/** Per channel, what the bot needs on Discord, and what each permission is for. */
const NEEDED_IN_CHANNEL = [
  "ViewChannel",
  "SendMessages",
  "ReadMessageHistory",
  "ManageWebhooks",
  "AddReactions",
  "AttachFiles",
  "EmbedLinks",
];
const NEEDED_FOR_THREADS = ["CreatePublicThreads", "SendMessagesInThreads"];
/** Voice channels also carry the call. */
const NEEDED_FOR_VOICE = ["Connect", "Speak"];
const WATCHDOG_MS = 3 * 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function describe(error) {
  if (!error) return "unknown error";
  const raw = error.rawError?.message || error.message || String(error);
  return String(raw).slice(0, 200);
}

function log(...parts) {
  console.log(new Date().toISOString(), ...parts);
}

export class Bridge {
  /**
   * @param {ReturnType<import("./config.js").loadConfig>} cfg
   * @param {import("./store.js").Store} store
   */
  constructor(cfg, store) {
    this.cfg = cfg;
    this.store = store;
    this.startedAt = new Date().toISOString();
    this.discord = null;
    this.hoffle = null;
    this.discordReady = false;
    this.hoffleReady = false;
    this.discordError = null;
    this.hoffleError = null;
    this.discordUserId = null;
    this.hoffleUserId = null;
    this.app = null;
    /** serverId → bridge from Hoffle's config */
    this.bridges = new Map();
    this.byDiscordChannel = new Map();
    this.byHoffleChannel = new Map();
    this.byGuild = new Map();
    this.configJson = "";
    this.hoffleWebhookIds = store.webhookIds("hoffle");
    this.discordWebhookIds = store.webhookIds("discord");
    /** Hoffle thread snowflake → { parent, anchor, name } | null */
    this.hoffleThreads = new Map();
    /** serverId → { lastRelayAt, lastError, relayed } */
    this.activity = new Map();
    this.queues = new Map();
    this.throttle = new Map();
    this.nickCache = new Map();
    /** Hoffle user snowflake → linked Discord user id. */
    this.linkedDiscord = new Map();
    this.timers = [];
    this.statusSoon = null;
    this.voice = new VoiceBridge(this, log);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start() {
    log(`Hoffle Discord bridge ${VERSION}`);
    if (!this.cfg.hoffleToken) throw new Error("Set HOFFLE_BOT_TOKEN (Hoffle's BOT_TOKEN) or HOFFLE_ENV_FILE.");
    if (!this.cfg.discordToken) {
      this.discordError = "DISCORD_BOT_TOKEN is not set";
      log("No DISCORD_BOT_TOKEN: running without Discord, Settings will say so.");
    }
    if (!/^https:\/\//.test(this.cfg.publicUrl)) {
      log(`HOFFLE_PUBLIC_URL is ${this.cfg.publicUrl}: Discord cannot load pictures or files from there; set it to the public https address.`);
    }
    this.startHealth();
    await this.refreshConfig().catch((error) => log("First config read failed:", describe(error)));
    this.every(this.cfg.configEveryMs, () => this.refreshConfig());
    this.every(this.cfg.statusEveryMs, () => this.reportStatus());
    this.every(6 * 3600_000, () => this.store.prune());
    void this.superviseHoffle();
    if (this.cfg.discordToken) void this.superviseDiscord();
  }

  every(ms, task) {
    this.timers.push(
      setInterval(() => {
        Promise.resolve()
          .then(task)
          .catch((error) => log("Background task failed:", describe(error)));
      }, ms),
    );
  }

  async stop() {
    this.stopping = true;
    for (const timer of this.timers) clearInterval(timer);
    this.voice.stop();
    this.health?.close();
    await Promise.allSettled([this.discord?.destroy(), this.hoffle?.destroy()]);
    this.store.close();
  }

  /**
   * Keeps one client logged in: a failed login is retried with backoff, and a
   * client that has not been ready for three minutes is replaced (discord.js
   * reconnects by itself, this is the backstop for when it gives up).
   */
  async supervise(label, makeClient, token, onClient) {
    let delay = 5000;
    while (!this.stopping) {
      const client = makeClient();
      onClient(client);
      try {
        await client.login(token);
        delay = 5000;
        // Watch it until it has been not-ready for too long.
        let notReadySince = null;
        while (!this.stopping) {
          await sleep(15_000);
          if (client.isReady() && (label === "discord" ? this.discordReady : this.hoffleReady)) {
            notReadySince = null;
            continue;
          }
          notReadySince ??= Date.now();
          if (Date.now() - notReadySince > WATCHDOG_MS) {
            log(`${label}: not ready for ${WATCHDOG_MS / 60000} minutes, starting over`);
            break;
          }
        }
      } catch (error) {
        const message = describe(error);
        if (label === "discord") this.discordError = message;
        else this.hoffleError = message;
        log(`${label}: login failed: ${message}`);
        // A rejected token will not start working in five seconds.
        if (error?.code === "TokenInvalid" || /token/i.test(message)) delay = Math.max(delay, 300_000);
      }
      await client.destroy().catch(() => undefined);
      if (label === "discord") this.discordReady = false;
      else this.hoffleReady = false;
      this.scheduleStatus();
      if (this.stopping) return;
      await sleep(delay);
      delay = Math.min(delay * 2, 300_000);
    }
  }

  superviseDiscord() {
    return this.supervise(
      "discord",
      () =>
        new Client({
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildMessageTyping,
            GatewayIntentBits.GuildWebhooks,
            GatewayIntentBits.GuildVoiceStates,
          ],
          partials: [Partials.Message, Partials.Channel, Partials.Reaction],
          allowedMentions: { parse: [] },
        }),
      this.cfg.discordToken,
      (client) => this.wireDiscord(client),
    );
  }

  superviseHoffle() {
    const api = `${this.cfg.hoffleUrl}${this.cfg.basePath}/api`;
    return this.supervise(
      "hoffle",
      () =>
        new Client({
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildMessageTyping,
          ],
          rest: { api, cdn: `${api}/cdn` },
        }),
      this.cfg.hoffleToken,
      (client) => this.wireHoffle(client),
    );
  }

  wireDiscord(client) {
    // Voice connections belong to the client that made them.
    if (this.discord && this.discord !== client) this.voice.stop();
    this.discord = client;
    client.on(Events.ClientReady, async () => {
      this.discordReady = true;
      this.discordError = null;
      this.discordUserId = client.user.id;
      log(`discord: ready as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
      // Now Discord's channel types are known: which pairs carry a call.
      this.voice.configure([...this.bridges.values()]);
      try {
        const app = await client.application.fetch();
        this.app = { id: app.id, name: client.user.username, avatarUrl: client.user.displayAvatarURL({ size: 128 }) };
        await this.registerCommands(app.id);
      } catch (error) {
        log("discord: could not register /hoffle:", describe(error));
      }
      this.scheduleStatus();
      void this.catchUp("discord");
    });
    client.on(Events.ShardDisconnect, () => {
      this.discordReady = false;
      this.scheduleStatus();
    });
    client.on(Events.ShardReconnecting, () => {
      this.discordReady = false;
    });
    client.on(Events.ShardResume, () => {
      this.discordReady = true;
      this.scheduleStatus();
      void this.catchUp("discord");
    });
    client.on(Events.Error, (error) => log("discord: error:", describe(error)));
    client.on(Events.MessageCreate, (message) => this.fromDiscord(message.channel, () => this.relayDiscordMessage(message)));
    client.on(Events.MessageUpdate, (_old, message) =>
      this.fromDiscord(message.channel, () => this.onDiscordEdit(message)),
    );
    client.on(Events.MessageDelete, (message) =>
      this.fromDiscord(message.channel, () => this.onDiscordDelete(message.id)),
    );
    client.on(Events.MessageBulkDelete, (messages, channel) =>
      this.fromDiscord(channel, async () => {
        for (const id of messages.keys()) await this.onDiscordDelete(id);
      }),
    );
    client.on(Events.TypingStart, (typing) => void this.onDiscordTyping(typing).catch(() => undefined));
    client.on(Events.VoiceStateUpdate, (before, after) => this.voice.onVoiceState(before, after));
    client.on(Events.InteractionCreate, (interaction) =>
      void this.onInteraction(interaction).catch((error) => log("discord: command failed:", describe(error))),
    );
    client.on("raw", (packet) => {
      if (packet?.t?.startsWith?.("MESSAGE_REACTION_")) {
        const channel = client.channels.cache.get(packet.d?.channel_id);
        this.fromDiscord(channel ?? { id: packet.d?.channel_id }, () => this.onDiscordReaction(packet.t, packet.d));
      }
    });
    for (const event of [
      Events.GuildCreate,
      Events.GuildDelete,
      Events.ChannelCreate,
      Events.ChannelDelete,
      Events.ChannelUpdate,
      Events.GuildRoleUpdate,
      Events.GuildMemberUpdate,
      Events.GuildUpdate,
    ]) {
      client.on(event, () => this.scheduleStatus());
    }
  }

  wireHoffle(client) {
    this.hoffle = client;
    client.on(Events.ClientReady, () => {
      this.hoffleReady = true;
      this.hoffleError = null;
      this.hoffleUserId = client.user.id;
      log(`hoffle: ready as ${client.user.username}`);
      this.scheduleStatus();
      void this.catchUp("hoffle");
    });
    client.on(Events.ShardDisconnect, () => {
      this.hoffleReady = false;
      this.scheduleStatus();
    });
    client.on(Events.ShardReconnecting, () => {
      this.hoffleReady = false;
    });
    client.on(Events.ShardResume, () => {
      this.hoffleReady = true;
      void this.catchUp("hoffle");
    });
    client.on(Events.Error, (error) => log("hoffle: error:", describe(error)));
    client.on("raw", (packet) => {
      const d = packet?.d;
      if (!d) return;
      switch (packet.t) {
        case "MESSAGE_CREATE":
          this.fromHoffle(d.channel_id, () => this.relayHoffleMessage(d));
          break;
        case "MESSAGE_UPDATE":
          this.fromHoffle(d.channel_id, () => this.onHoffleEdit(d));
          break;
        case "MESSAGE_DELETE":
          this.fromHoffle(d.channel_id, () => this.onHoffleDelete(d.id));
          break;
        case "MESSAGE_DELETE_BULK":
          this.fromHoffle(d.channel_id, async () => {
            for (const id of d.ids || []) await this.onHoffleDelete(id);
          });
          break;
        case "MESSAGE_REACTION_ADD":
        case "MESSAGE_REACTION_REMOVE":
          this.fromHoffle(d.channel_id, () => this.onHoffleReaction(packet.t, d));
          break;
        case "TYPING_START":
          void this.onHoffleTyping(d).catch(() => undefined);
          break;
        default:
      }
    });
  }

  // -------------------------------------------------------------------------
  // Config and status
  // -------------------------------------------------------------------------

  async hoffleApi(method, action, body) {
    const response = await fetch(`${this.cfg.hoffleUrl}${this.cfg.basePath}/api/discord-bridge/${action}`, {
      method,
      headers: { Authorization: `Bot ${this.cfg.hoffleToken}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error || `Hoffle answered ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async refreshConfig() {
    const config = await this.hoffleApi("GET", "config");
    // Linked accounts: Hoffle person (snowflake) → their Discord account.
    this.linkedDiscord = new Map((config.accounts || []).map((a) => [a.hoffleUserId, a.discordUserId]));
    const json = JSON.stringify(config.bridges || []);
    if (json === this.configJson) return;
    this.configJson = json;
    this.applyConfig(config.bridges || []);
  }

  applyConfig(bridges) {
    const previous = new Set(this.byDiscordChannel.keys());
    this.bridges = new Map();
    this.byDiscordChannel = new Map();
    this.byHoffleChannel = new Map();
    this.byGuild = new Map();
    for (const bridge of bridges) {
      this.bridges.set(bridge.serverId, bridge);
      this.byGuild.set(bridge.discordGuildId, bridge);
      for (const channel of bridge.channels) {
        const entry = { bridge, channel };
        this.byDiscordChannel.set(channel.discordChannelId, entry);
        this.byHoffleChannel.set(channel.hoffleChannelSnowflake, entry);
      }
    }
    const pairs = [...this.byDiscordChannel.keys()];
    const added = pairs.filter((id) => !previous.has(id));
    log(`config: ${bridges.length} bridge(s), ${pairs.length} channel pair(s)${added.length ? `, ${added.length} new` : ""}`);
    this.voice.configure(bridges);
    // A newly paired channel starts from now, not from its whole history.
    for (const id of added) {
      const entry = this.byDiscordChannel.get(id);
      void this.startCursors(entry).catch(() => undefined);
    }
  }

  async startCursors(entry) {
    const { discordChannelId, hoffleChannelSnowflake } = entry.channel;
    if (!this.store.cursor("discord", discordChannelId) && this.discordReady) {
      const latest = await this.discord.rest.get(`/channels/${discordChannelId}/messages`, {
        query: new URLSearchParams({ limit: "1" }),
      });
      if (latest?.[0]) this.store.advance("discord", discordChannelId, latest[0].id);
    }
    if (!this.store.cursor("hoffle", hoffleChannelSnowflake) && this.hoffleReady) {
      const latest = await this.hoffle.rest.get(`/channels/${hoffleChannelSnowflake}/messages`, {
        query: new URLSearchParams({ limit: "1" }),
      });
      if (latest?.[0]) this.store.advance("hoffle", hoffleChannelSnowflake, latest[0].id);
    }
  }

  scheduleStatus() {
    if (this.statusSoon) return;
    this.statusSoon = setTimeout(() => {
      this.statusSoon = null;
      void this.reportStatus().catch(() => undefined);
    }, 2000);
  }

  missingIn(permissions, needed) {
    if (!permissions) return needed;
    return needed.filter((name) => !permissions.has(PermissionFlagsBits[name]));
  }

  buildStatus() {
    const guilds = [];
    if (this.discord && this.discordReady) {
      for (const guild of this.discord.guilds.cache.values()) {
        const me = guild.members.me;
        const bridge = this.byGuild.get(guild.id);
        const needed = bridge?.settings?.threads ? [...NEEDED_IN_CHANNEL, ...NEEDED_FOR_THREADS] : NEEDED_IN_CHANNEL;
        const channels = [];
        for (const channel of guild.channels.cache.values()) {
          const voice = channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
          if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement && !voice) continue;
          const permissions = me ? channel.permissionsFor(me) : null;
          // Channels the bot cannot even see are not offered.
          if (permissions && !permissions.has(PermissionFlagsBits.ViewChannel)) continue;
          channels.push({
            id: channel.id,
            name: channel.name,
            type: channel.type,
            parent: channel.parent?.name ?? null,
            position: (channel.parent?.rawPosition ?? -1) * 1000 + channel.rawPosition,
            missing: this.missingIn(permissions, voice ? [...NEEDED_IN_CHANNEL, ...NEEDED_FOR_VOICE] : needed),
          });
        }
        const guildMissing = me ? this.missingIn(me.permissions, NEEDED_IN_CHANNEL) : [];
        guilds.push({
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL({ extension: "png", size: 64 }),
          missing: guildMissing,
          channels,
        });
      }
    }
    const bridges = {};
    for (const [serverId, value] of this.activity) bridges[serverId] = value;
    return {
      version: VERSION,
      startedAt: this.startedAt,
      app: this.app,
      discord: { connected: this.discordReady, error: this.discordReady ? null : this.discordError },
      hoffle: { connected: this.hoffleReady, error: this.hoffleReady ? null : this.hoffleError },
      guilds,
      bridges,
    };
  }

  async reportStatus() {
    await this.hoffleApi("POST", "status", this.buildStatus());
  }

  noteRelay(serverId) {
    const entry = this.activity.get(serverId) || { relayed: 0 };
    entry.relayed = (entry.relayed || 0) + 1;
    entry.lastRelayAt = new Date().toISOString();
    entry.lastError = null;
    this.activity.set(serverId, entry);
  }

  noteError(serverId, error) {
    const message = describe(error);
    log(`relay failed (${serverId}): ${message}`);
    const entry = this.activity.get(serverId) || { relayed: 0 };
    entry.lastError = message;
    this.activity.set(serverId, entry);
    this.scheduleStatus();
  }

  startHealth() {
    if (!this.cfg.healthPort) return;
    this.health = createServer((request, response) => {
      const body = JSON.stringify({
        ok: this.hoffleReady && (this.discordReady || !this.cfg.discordToken),
        version: VERSION,
        discord: this.discordReady,
        hoffle: this.hoffleReady,
        bridges: this.bridges.size,
        pairs: this.byDiscordChannel.size,
        voice: this.voice.status(),
        startedAt: this.startedAt,
      });
      response.writeHead(request.url === "/healthz" ? 200 : 404, { "Content-Type": "application/json" });
      response.end(body);
    });
    this.health.on("error", (error) => log("health server:", describe(error)));
    this.health.listen(this.cfg.healthPort, "127.0.0.1");
  }

  // -------------------------------------------------------------------------
  // Queues: events for one channel are handled in order
  // -------------------------------------------------------------------------

  enqueue(key, task) {
    const previous = this.queues.get(key) || Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.catch((error) => log(`task failed (${key}):`, describe(error)));
    this.queues.set(key, settled);
    void settled.finally(() => {
      if (this.queues.get(key) === settled) this.queues.delete(key);
    });
    return settled;
  }

  /** Discord events, keyed by the parent channel so a thread queues with it. */
  fromDiscord(channel, task) {
    const id = channel?.isThread?.() ? channel.parentId : channel?.id;
    if (!id) return;
    void this.enqueue(`d:${id}`, task);
  }

  fromHoffle(channelId, task) {
    if (!channelId) return;
    const parent = this.hoffleThreads.get(channelId)?.parent || channelId;
    void this.enqueue(`h:${parent}`, task);
  }

  // -------------------------------------------------------------------------
  // Targets and webhooks
  // -------------------------------------------------------------------------

  discordTarget(channel) {
    if (!channel) return null;
    const direct = this.byDiscordChannel.get(channel.id);
    if (direct) return { ...direct, discordThreadId: null };
    if (channel.isThread?.() && channel.parentId) {
      const parent = this.byDiscordChannel.get(channel.parentId);
      if (parent?.bridge.settings.threads) return { ...parent, discordThreadId: channel.id };
    }
    return null;
  }

  async hoffleTarget(channelId) {
    const direct = this.byHoffleChannel.get(channelId);
    if (direct) return { ...direct, hoffleThreadId: null };
    let info = this.hoffleThreads.get(channelId);
    if (info === undefined && this.hoffleReady) {
      try {
        const channel = await this.hoffle.rest.get(`/channels/${channelId}`);
        info =
          channel?.type === 11 || channel?.type === 12
            ? { parent: channel.parent_id, anchor: channel.hoffle_anchor_message_id || null, name: channel.name }
            : null;
      } catch {
        info = null;
      }
      this.hoffleThreads.set(channelId, info);
    }
    if (!info) return null;
    const parent = this.byHoffleChannel.get(info.parent);
    if (!parent?.bridge.settings.threads) return null;
    return { ...parent, hoffleThreadId: channelId };
  }

  async hoffleWebhook(channelId, { fresh = false } = {}) {
    if (!fresh) {
      const known = this.store.webhook("hoffle", channelId);
      if (known) return known;
    }
    const created = await this.hoffle.rest.post(`/channels/${channelId}/webhooks`, { body: { name: "Discord" } });
    this.store.putWebhook("hoffle", channelId, created.id, created.token);
    this.hoffleWebhookIds.add(created.id);
    return { id: created.id, token: created.token };
  }

  /** The bridge's webhook in a Discord channel, or null when it may not make one. */
  async discordWebhook(channelId, { fresh = false } = {}) {
    if (!fresh) {
      const known = this.store.webhook("discord", channelId);
      if (known) return known;
    }
    const channel = await this.discord.channels.fetch(channelId).catch(() => null);
    if (!channel || !("createWebhook" in channel)) return null;
    const me = channel.guild?.members.me;
    if (me && !channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageWebhooks)) return null;
    let hook = null;
    try {
      const existing = await channel.fetchWebhooks();
      hook = existing.find((w) => w.owner?.id === this.discordUserId && w.token) ?? null;
    } catch {
      hook = null;
    }
    if (!hook) {
      const options = { name: "Hoffle", reason: "Hoffle bridge: posts Hoffle messages with each person's name" };
      try {
        hook = await channel.createWebhook({ ...options, avatar: `${this.cfg.publicUrl}${this.cfg.basePath}/icon-192.png` });
      } catch {
        hook = await channel.createWebhook(options);
      }
    }
    this.store.putWebhook("discord", channelId, hook.id, hook.token);
    this.discordWebhookIds.add(hook.id);
    return { id: hook.id, token: hook.token };
  }

  /** Local address for a Hoffle file (dispatches may carry the public origin). */
  hoffleLocalUrl(url) {
    try {
      const parsed = new URL(url, this.cfg.hoffleUrl);
      return `${this.cfg.hoffleUrl}${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  }

  hofflePublicUrl(url) {
    try {
      const parsed = new URL(url, this.cfg.publicUrl);
      return `${this.cfg.publicUrl}${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  }

  // -------------------------------------------------------------------------
  // Discord → Hoffle
  // -------------------------------------------------------------------------

  isDiscordEcho(message) {
    if (message.webhookId && this.discordWebhookIds.has(message.webhookId)) return true;
    return Boolean(message.author && message.author.id === this.discordUserId);
  }

  discordNames(guild) {
    return {
      user: (id) => {
        const member = guild?.members.cache.get(id);
        const user = this.discord?.users.cache.get(id);
        return member?.displayName || user?.displayName || user?.username;
      },
      role: (id) => guild?.roles.cache.get(id)?.name,
      channel: (id) => {
        const mapped = this.byDiscordChannel.get(id);
        if (mapped) return mapped.channel.name;
        return guild?.channels.cache.get(id)?.name;
      },
    };
  }

  async relayDiscordMessage(message, { catchUp = false } = {}) {
    if (!message?.guildId) return;
    if (message.partial) message = await message.fetch().catch(() => null);
    if (!message) return;
    const target = this.discordTarget(message.channel);
    if (!target) return;
    this.store.advance("discord", message.channelId, message.id);
    if (this.isDiscordEcho(message)) return;
    if (!RELAYABLE_TYPES.has(message.type)) return;
    if (this.store.byDiscord(message.id)) return;
    if (catchUp && Date.now() - message.createdTimestamp > this.cfg.catchUpHours * 3600_000) return;
    if (!this.hoffleReady) return;
    try {
      await this.sendToHoffle(message, target);
      this.noteRelay(target.bridge.serverId);
    } catch (error) {
      this.noteError(target.bridge.serverId, error);
    }
  }

  async discordFiles(message, settings) {
    const files = [];
    const links = [];
    const take = async (name, url, size, contentType) => {
      if (!settings.files || size > HOFFLE_FILE_MAX) {
        links.push(`📎 [${name}](${url})${size ? ` (${formatBytes(size)})` : ""}`);
        return;
      }
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(String(response.status));
        files.push({ name, data: Buffer.from(await response.arrayBuffer()), contentType });
      } catch {
        links.push(`📎 [${name}](${url})`);
      }
    };
    for (const attachment of message.attachments.values()) {
      await take(attachment.name || "file", attachment.url, attachment.size, attachment.contentType || undefined);
    }
    for (const sticker of message.stickers.values()) {
      // Lottie stickers are animations Hoffle cannot play; name them instead.
      if (sticker.format === 3) links.push(`[sticker: ${sticker.name}]`);
      else await take(`${sticker.name}.${sticker.format === 4 ? "gif" : "png"}`, sticker.url, 0, undefined);
    }
    return { files, links };
  }

  async sendToHoffle(message, target) {
    const { bridge, channel } = target;
    const settings = bridge.settings;
    const guild = message.guild;
    const names = this.discordNames(guild);
    const parts = [discordToHoffle(message.content, names)];

    for (const snapshot of message.messageSnapshots?.values?.() ?? []) {
      const text = discordToHoffle(snapshot.content || "", names);
      parts.push(`↪ *Forwarded*${text ? `\n${text.split("\n").map((line) => `> ${line}`).join("\n")}` : ""}`);
      for (const attachment of snapshot.attachments?.values?.() ?? []) parts.push(attachment.url);
    }
    if (message.poll) {
      const answers = message.poll.answers?.map?.((answer) => `• ${answer.text ?? ""}`) ?? [];
      parts.push(`📊 **${message.poll.question?.text ?? "Poll"}**\n${answers.join("\n")}`);
    }

    let replyTo = null;
    if (message.reference?.messageId && message.type === 19) {
      const mapped = this.store.byDiscord(message.reference.messageId);
      if (mapped) replyTo = mapped.hoffle_id;
      else {
        const original = await message.fetchReference().catch(() => null);
        if (original) {
          parts.unshift(
            replyQuote(original.member?.displayName || original.author?.displayName, discordToHoffle(original.content, names)),
          );
        }
      }
    }

    const { files, links } = await this.discordFiles(message, settings);
    parts.push(...links);
    const embeds = message.embeds
      .filter((embed) => !embed.data.type || embed.data.type === "rich")
      .map((embed) => embed.toJSON())
      .slice(0, 10);
    const text = parts.filter(Boolean).join("\n").trim();
    if (!text && !files.length && !embeds.length) return;

    let threadId = null;
    if (target.discordThreadId) threadId = await this.ensureHoffleThread(target, message.channel);

    const author = message.member?.displayName || message.author.displayName || message.author.username;
    const avatar = (message.member ?? message.author).displayAvatarURL({ extension: "png", size: 128 });
    const chunks = splitText(text);
    const ids = [];
    let hook = await this.hoffleWebhook(channel.hoffleChannelSnowflake);
    for (let index = 0; index < chunks.length; index += 1) {
      const first = index === 0;
      const last = index === chunks.length - 1;
      const body = {
        content: chunks[index],
        username: author.slice(0, 80),
        avatar_url: avatar,
        hoffle_source_url: message.url,
        // Hoffle stores it as the writer's own message when their accounts are linked.
        hoffle_discord_user_id: message.author.id,
        ...(first && replyTo ? { message_reference: { message_id: replyTo } } : {}),
        ...(last && embeds.length ? { embeds } : {}),
      };
      const query = new URLSearchParams({ wait: "true" });
      if (threadId) query.set("thread_id", threadId);
      const send = (h) =>
        this.hoffle.rest.post(`/webhooks/${h.id}/${h.token}`, {
          body,
          files: first ? files : undefined,
          query,
          auth: false,
        });
      let result;
      try {
        result = await send(hook);
      } catch (error) {
        // Someone deleted the webhook in Hoffle's settings: make a new one.
        if (error?.code !== 10015 && error?.status !== 404) throw error;
        hook = await this.hoffleWebhook(channel.hoffleChannelSnowflake, { fresh: true });
        result = await send(hook);
      }
      ids.push(result.id);
    }
    this.store.putMessage({
      discordId: message.id,
      hoffleId: ids[0],
      extraHoffle: ids.slice(1),
      discordChannel: message.channelId,
      hoffleChannel: threadId || channel.hoffleChannelSnowflake,
      serverId: bridge.serverId,
      origin: "discord",
      viaWebhook: hook.id,
      hash: contentHash(message.content, embeds),
    });
    this.store.advance("hoffle", threadId || channel.hoffleChannelSnowflake, ids[ids.length - 1]);
  }

  async ensureHoffleThread(target, discordThread) {
    const known = this.store.threadByDiscord(discordThread.id);
    if (known) {
      this.hoffleThreads.set(known.hoffle_thread, { parent: target.channel.hoffleChannelSnowflake, anchor: null, name: discordThread.name });
      return known.hoffle_thread;
    }
    const parent = target.channel.hoffleChannelSnowflake;
    // A thread started from a message has that message's id on Discord.
    let anchor = this.store.byDiscord(discordThread.id)?.hoffle_id ?? null;
    if (!anchor) {
      const hook = await this.hoffleWebhook(parent);
      const starter = await this.hoffle.rest.post(`/webhooks/${hook.id}/${hook.token}`, {
        body: { content: `🧵 **${discordThread.name}**`, username: "Discord", hoffle_source_url: discordThread.url },
        query: new URLSearchParams({ wait: "true" }),
        auth: false,
      });
      anchor = starter.id;
    }
    let thread;
    try {
      thread = await this.hoffle.rest.post(`/channels/${parent}/messages/${anchor}/threads`, {
        body: { name: discordThread.name.slice(0, 100) },
      });
    } catch (error) {
      if (error?.code !== 160004) throw error;
      // Someone already opened a thread on it in Hoffle: use that one.
      const active = await this.hoffle.rest.get(`/guilds/${target.bridge.guildSnowflake}/threads/active`);
      thread = (active?.threads || []).find((t) => t.hoffle_anchor_message_id === anchor);
      if (!thread) throw error;
    }
    this.store.putThread(discordThread.id, thread.id, target.bridge.serverId);
    this.hoffleThreads.set(thread.id, { parent, anchor, name: thread.name });
    return thread.id;
  }

  async onDiscordEdit(message) {
    if (message.partial) message = await message.fetch().catch(() => null);
    if (!message) return;
    const mapped = this.store.byDiscord(message.id);
    if (!mapped || mapped.origin !== "discord") return;
    const bridge = this.bridges.get(mapped.server_id);
    if (!bridge?.settings.edits || !this.hoffleReady) return;
    const embeds = message.embeds
      .filter((embed) => !embed.data.type || embed.data.type === "rich")
      .map((embed) => embed.toJSON())
      .slice(0, 10);
    const hash = contentHash(message.content, embeds);
    // Discord sends an edit when a link preview loads; nothing changed for Hoffle.
    if (hash === mapped.hash) return;
    const hook = this.store.webhookById("hoffle", mapped.via_webhook);
    if (!hook) return;
    const content = splitText(discordToHoffle(message.content, this.discordNames(message.guild)))[0];
    try {
      await this.hoffle.rest.patch(`/webhooks/${hook.id}/${hook.token}/messages/${mapped.hoffle_id}`, {
        body: { content, embeds },
        auth: false,
      });
      this.store.setHash(message.id, hash);
      this.noteRelay(mapped.server_id);
    } catch (error) {
      this.noteError(mapped.server_id, error);
    }
  }

  async onDiscordDelete(id) {
    const mapped = this.store.byDiscord(id);
    if (!mapped) return;
    const bridge = this.bridges.get(mapped.server_id);
    // Forget first, so the delete coming back from Hoffle finds nothing.
    this.store.forget(id);
    if (!bridge || !this.hoffleReady) return;
    try {
      if (mapped.origin === "discord") {
        // Someone deleted their own Discord message (or a Discord moderator did).
        if (!bridge.settings.edits) return;
        const hook = this.store.webhookById("hoffle", mapped.via_webhook);
        if (!hook) return;
        for (const messageId of [mapped.hoffle_id, ...JSON.parse(mapped.extra_hoffle || "[]")]) {
          await this.hoffle.rest
            .delete(`/webhooks/${hook.id}/${hook.token}/messages/${messageId}`, { auth: false })
            .catch((error) => {
              if (error?.code !== 10008) throw error;
            });
        }
      } else if (bridge.settings.mirrorDeletes) {
        // A Discord moderator removed the copy of a Hoffle message: remove the
        // original, and any other pieces of it on Discord.
        await this.hoffle.rest.delete(`/channels/${mapped.hoffle_channel}/messages/${mapped.hoffle_id}`).catch((error) => {
          if (error?.code !== 10008) throw error;
        });
        const hook = mapped.via_webhook ? this.store.webhookById("discord", mapped.via_webhook) : null;
        for (const messageId of JSON.parse(mapped.extra_discord || "[]")) {
          await (hook
            ? this.discord.rest.delete(`/webhooks/${hook.id}/${hook.token}/messages/${messageId}`, {
                query: this.discordThreadQuery(mapped, hook),
                auth: false,
              })
            : this.discord.rest.delete(`/channels/${mapped.discord_channel}/messages/${messageId}`)
          ).catch(() => undefined);
        }
      }
    } catch (error) {
      this.noteError(mapped.server_id, error);
    }
  }

  async onDiscordReaction(type, d) {
    if (!d?.message_id || d.user_id === this.discordUserId) return;
    const mapped = this.store.byDiscord(d.message_id);
    if (!mapped) return;
    const bridge = this.bridges.get(mapped.server_id);
    if (!bridge?.settings.reactions || !this.hoffleReady) return;
    const base = `/channels/${mapped.hoffle_channel}/messages/${mapped.hoffle_id}/reactions`;
    const keyOf = (emoji) => (emoji?.id ? `:${emoji.name}:` : emoji?.name);
    const remove = async (emoji, userId) => {
      const path = reactionForHoffle(emoji);
      if (!path) return;
      await this.hoffle.rest.delete(`${base}/${encodeURIComponent(path)}/@me`, {
        query: new URLSearchParams({ on_behalf_of: `discord:${userId}` }),
      });
    };
    try {
      if (type === "MESSAGE_REACTION_ADD") {
        const path = reactionForHoffle(d.emoji);
        if (!path) return;
        const user = d.member?.user;
        const name = d.member?.nick || user?.global_name || user?.username || this.store.reactorName("discord", d.user_id) || "Discord user";
        const avatar = d.member?.avatar
          ? `https://cdn.discordapp.com/guilds/${d.guild_id}/users/${d.user_id}/avatars/${d.member.avatar}.png?size=64`
          : user?.avatar
            ? `https://cdn.discordapp.com/avatars/${d.user_id}/${user.avatar}.png?size=64`
            : "";
        this.store.addReactor("discord", d.message_id, keyOf(d.emoji), d.user_id, name);
        const query = new URLSearchParams({ on_behalf_of: `discord:${d.user_id}`, name });
        if (avatar) query.set("avatar_url", avatar);
        await this.hoffle.rest.put(`${base}/${encodeURIComponent(path)}/@me`, { query });
      } else if (type === "MESSAGE_REACTION_REMOVE") {
        this.store.dropReactor("discord", d.message_id, keyOf(d.emoji), d.user_id);
        await remove(d.emoji, d.user_id);
      } else if (type === "MESSAGE_REACTION_REMOVE_ALL" || type === "MESSAGE_REACTION_REMOVE_EMOJI") {
        const only = type === "MESSAGE_REACTION_REMOVE_EMOJI" ? keyOf(d.emoji) : null;
        for (const row of this.store.reactorsOf("discord", d.message_id)) {
          if (only && row.emoji !== only) continue;
          // Stored as :name: for a server emoji; Hoffle only needs the name back.
          const custom = /^:.+:$/.test(row.emoji);
          await remove(custom ? { id: "0", name: row.emoji.slice(1, -1) } : { id: null, name: row.emoji }, row.user_id);
        }
        this.store.dropReactorsOf("discord", d.message_id, only);
      }
    } catch (error) {
      this.noteError(mapped.server_id, error);
    }
  }

  async onDiscordTyping(typing) {
    if (typing.user?.bot || !this.hoffleReady) return;
    const target = this.discordTarget(typing.channel);
    if (!target?.bridge.settings.typing) return;
    const key = `dt:${typing.channel.id}:${typing.user.id}`;
    if ((this.throttle.get(key) ?? 0) > Date.now() - 6000) return;
    this.throttle.set(key, Date.now());
    if (this.throttle.size > 5000) this.throttle.clear();
    const channelId = target.discordThreadId
      ? this.store.threadByDiscord(target.discordThreadId)?.hoffle_thread
      : target.channel.hoffleChannelSnowflake;
    if (!channelId) return;
    const name = typing.member?.displayName || typing.user.displayName || typing.user.username || "Someone";
    await this.hoffle.rest.post(`/channels/${channelId}/typing`, {
      query: new URLSearchParams({ on_behalf_of: `discord:${typing.user.id}`, name }),
    });
  }

  // -------------------------------------------------------------------------
  // Hoffle → Discord
  // -------------------------------------------------------------------------

  isHoffleEcho(d) {
    if (d.webhook_id && this.hoffleWebhookIds.has(d.webhook_id)) return true;
    return Boolean(d.author?.id && d.author.id === this.hoffleUserId);
  }

  async relayHoffleMessage(d, { catchUp = false } = {}) {
    const target = await this.hoffleTarget(d.channel_id);
    if (!target) return;
    this.store.advance("hoffle", d.channel_id, d.id);
    if (this.isHoffleEcho(d)) return;
    if (this.store.byHoffle(d.id)) return;
    if (catchUp && Date.now() - Date.parse(d.timestamp) > this.cfg.catchUpHours * 3600_000) return;
    if (!this.discordReady) return;
    try {
      await this.sendToDiscord(d, target);
      this.noteRelay(target.bridge.serverId);
    } catch (error) {
      this.noteError(target.bridge.serverId, error);
    }
  }

  /** A Hoffle person's name in that server (their nickname when they set one). */
  async hoffleName(d, bridge) {
    const author = d.author || {};
    if (author.bot || !author.id) return author.global_name || author.username || "Hoffle";
    const key = `${bridge.serverId}:${author.id}`;
    const cached = this.nickCache.get(key);
    if (cached && cached.at > Date.now() - 600_000) return cached.name;
    let name = author.global_name || author.username || "Hoffle user";
    try {
      const member = await this.hoffle.rest.get(`/guilds/${bridge.guildSnowflake}/members/${author.id}`);
      if (member?.nick) name = member.nick;
    } catch {
      // Not a member any more, or the lookup failed: the account name will do.
    }
    this.nickCache.set(key, { name, at: Date.now() });
    if (this.nickCache.size > 5000) this.nickCache.clear();
    return name;
  }

  /** The Discord member a Hoffle person linked their account to, in this server. */
  async linkedMember(guild, hoffleUserId) {
    const discordId = hoffleUserId ? this.linkedDiscord.get(hoffleUserId) : null;
    if (!discordId || !guild) return null;
    return guild.members.cache.get(discordId) ?? (await guild.members.fetch(discordId).catch(() => null));
  }

  guildEmoji(guild) {
    return (name) => {
      const emoji = guild?.emojis.cache.find((e) => e.name === name && e.available !== false);
      return emoji ? { id: emoji.id, name: emoji.name, animated: emoji.animated } : undefined;
    };
  }

  async sendToDiscord(d, target) {
    const { bridge, channel } = target;
    const settings = bridge.settings;
    const guild = this.discord.guilds.cache.get(bridge.discordGuildId);
    if (!guild) throw new Error("The bot is not in the linked Discord server");
    const findEmoji = this.guildEmoji(guild);
    const parts = [
      hoffleToDiscord(d.content, {
        emoji: (name) => {
          const found = findEmoji(name);
          return found ? `<${found.animated ? "a" : ""}:${found.name}:${found.id}>` : undefined;
        },
      }),
    ];

    if (d.hoffle?.audio_url) parts.push(`🎤 [Voice message](<${this.hofflePublicUrl(d.hoffle.audio_url)}>)`);
    if (d.hoffle?.link && !parts.join("\n").includes(d.hoffle.link)) parts.push(d.hoffle.link);

    // Discord's webhooks cannot reply, so a reply carries a quote of what it answers.
    const reference = d.message_reference?.message_id;
    if (reference) {
      const mapped = this.store.byHoffle(reference);
      let original = null;
      try {
        original = await this.hoffle.rest.get(`/channels/${d.channel_id}/messages/${reference}`);
      } catch {
        original = null;
      }
      const link = mapped ? `https://discord.com/channels/${guild.id}/${mapped.discord_channel}/${mapped.discord_id}` : null;
      if (original || link) {
        parts.unshift(replyQuote(original?.author?.global_name || original?.author?.username, original?.content, link));
      }
    }

    const files = [];
    const limit = discordUploadLimit(guild.premiumTier);
    let total = 0;
    for (const attachment of d.attachments || []) {
      const publicUrl = this.hofflePublicUrl(attachment.url);
      if (!settings.files) {
        parts.push(publicUrl);
        continue;
      }
      try {
        const response = await fetch(this.hoffleLocalUrl(attachment.url), { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(String(response.status));
        const data = Buffer.from(await response.arrayBuffer());
        if (total + data.length > limit || files.length >= 10) {
          parts.push(`📎 [${attachment.filename}](<${publicUrl}>) (${formatBytes(data.length)})`);
          continue;
        }
        total += data.length;
        files.push({ name: attachment.filename, data, contentType: attachment.content_type || undefined });
      } catch {
        parts.push(`📎 [${attachment.filename}](<${publicUrl}>)`);
      }
    }

    const embeds = (d.embeds || [])
      .filter((embed) => !embed.type || embed.type === "rich")
      .map((embed) => cleanEmbed(embed))
      .filter(Boolean)
      .slice(0, 10);
    const text = parts.filter(Boolean).join("\n").trim();
    if (!text && !files.length && !embeds.length) return;

    let threadId = null;
    if (target.hoffleThreadId) threadId = await this.ensureDiscordThread(target, target.hoffleThreadId);

    const linked = await this.linkedMember(guild, d.author?.id);
    const name = webhookName(linked?.displayName || (await this.hoffleName(d, bridge)));
    const avatar = linked?.displayAvatarURL({ extension: "png", size: 128 }) || avatarForDiscord(d.author, this.cfg.publicUrl);
    let hook = await this.discordWebhook(channel.discordChannelId).catch(() => null);
    const chunks = splitText(text);
    const ids = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const first = index === 0;
      const last = index === chunks.length - 1;
      if (hook) {
        const body = {
          content: chunks[index],
          username: name,
          ...(avatar ? { avatar_url: avatar } : {}),
          allowed_mentions: { parse: [] },
          ...(last && embeds.length ? { embeds } : {}),
        };
        const query = new URLSearchParams({ wait: "true" });
        if (threadId) query.set("thread_id", threadId);
        const send = (h, b) =>
          this.discord.rest.post(`/webhooks/${h.id}/${h.token}`, { body: b, files: first ? files : undefined, query, auth: false });
        let result;
        try {
          result = await send(hook, body);
        } catch (error) {
          if (error?.code === 10015) {
            // The webhook was deleted on Discord: make a new one and try again.
            hook = await this.discordWebhook(channel.discordChannelId, { fresh: true });
            result = await send(hook, body);
          } else if (error?.code === 50035 && /username/i.test(JSON.stringify(error.rawError || {}))) {
            result = await send(hook, { ...body, username: "Hoffle user" });
          } else {
            throw error;
          }
        }
        ids.push(result.id);
      } else {
        // No Manage Webhooks on Discord: post as the bot, name in bold.
        const result = await this.discord.rest.post(`/channels/${threadId || channel.discordChannelId}/messages`, {
          body: {
            content: `**${name}**: ${chunks[index]}`.slice(0, 2000),
            allowed_mentions: { parse: [] },
            ...(last && embeds.length ? { embeds } : {}),
          },
          files: first ? files : undefined,
        });
        ids.push(result.id);
      }
    }
    this.store.putMessage({
      discordId: ids[0],
      hoffleId: d.id,
      extraDiscord: ids.slice(1),
      discordChannel: threadId || channel.discordChannelId,
      hoffleChannel: d.channel_id,
      serverId: bridge.serverId,
      origin: "hoffle",
      viaWebhook: hook?.id ?? null,
      hash: contentHash(d.content, d.embeds),
    });
    this.store.advance("discord", threadId || channel.discordChannelId, ids[ids.length - 1]);
  }

  async ensureDiscordThread(target, hoffleThreadId) {
    const known = this.store.threadByHoffle(hoffleThreadId);
    if (known) return known.discord_thread;
    const info = this.hoffleThreads.get(hoffleThreadId) || {};
    const parent = target.channel.discordChannelId;
    const name = (info.name || "Thread").slice(0, 100);
    const starter = info.anchor ? this.store.byHoffle(info.anchor) : null;
    let thread;
    if (starter && starter.discord_channel === parent) {
      try {
        thread = await this.discord.rest.post(`/channels/${parent}/messages/${starter.discord_id}/threads`, {
          body: { name, auto_archive_duration: 1440 },
        });
      } catch (error) {
        // Already a thread on that message: Discord gives it the message's id.
        if (error?.code !== 160004) throw error;
        thread = { id: starter.discord_id };
      }
    } else {
      thread = await this.discord.rest.post(`/channels/${parent}/threads`, {
        body: { name, type: 11, auto_archive_duration: 1440 },
      });
    }
    this.store.putThread(thread.id, hoffleThreadId, target.bridge.serverId);
    return thread.id;
  }

  /** The thread_id query a Discord webhook call needs for a message in a thread. */
  discordThreadQuery(mapped, hook) {
    const query = new URLSearchParams();
    if (hook && mapped.discord_channel !== hook.channel) query.set("thread_id", mapped.discord_channel);
    return query;
  }

  async onHoffleEdit(d) {
    const mapped = this.store.byHoffle(d.id);
    if (!mapped || mapped.origin !== "hoffle") return;
    const bridge = this.bridges.get(mapped.server_id);
    if (!bridge?.settings.edits || !this.discordReady) return;
    const hash = contentHash(d.content, d.embeds);
    if (hash === mapped.hash) return;
    const guild = this.discord.guilds.cache.get(bridge.discordGuildId);
    const findEmoji = this.guildEmoji(guild);
    const content = splitText(
      hoffleToDiscord(d.content, {
        emoji: (name) => {
          const found = findEmoji(name);
          return found ? `<${found.animated ? "a" : ""}:${found.name}:${found.id}>` : undefined;
        },
      }) || "​",
    )[0];
    const embeds = (d.embeds || []).filter((e) => !e.type || e.type === "rich").map(cleanEmbed).filter(Boolean).slice(0, 10);
    try {
      if (mapped.via_webhook) {
        const hook = this.store.webhookById("discord", mapped.via_webhook);
        if (!hook) return;
        await this.discord.rest.patch(`/webhooks/${hook.id}/${hook.token}/messages/${mapped.discord_id}`, {
          body: { content, embeds, allowed_mentions: { parse: [] } },
          query: this.discordThreadQuery(mapped, hook),
          auth: false,
        });
      } else {
        const linked = await this.linkedMember(guild, d.author?.id);
        const name = webhookName(linked?.displayName || (await this.hoffleName(d, bridge)));
        await this.discord.rest.patch(`/channels/${mapped.discord_channel}/messages/${mapped.discord_id}`, {
          body: { content: `**${name}**: ${content}`.slice(0, 2000), allowed_mentions: { parse: [] } },
        });
      }
      this.store.setHash(mapped.discord_id, hash);
      this.noteRelay(mapped.server_id);
    } catch (error) {
      this.noteError(mapped.server_id, error);
    }
  }

  async onHoffleDelete(id) {
    const mapped = this.store.byHoffle(id);
    if (!mapped) return;
    const bridge = this.bridges.get(mapped.server_id);
    this.store.forget(mapped.discord_id);
    if (!bridge?.settings.edits || !this.discordReady) return;
    try {
      if (mapped.origin === "hoffle") {
        const ids = [mapped.discord_id, ...JSON.parse(mapped.extra_discord || "[]")];
        const hook = mapped.via_webhook ? this.store.webhookById("discord", mapped.via_webhook) : null;
        for (const messageId of ids) {
          if (hook) {
            await this.discord.rest.delete(`/webhooks/${hook.id}/${hook.token}/messages/${messageId}`, {
              query: this.discordThreadQuery(mapped, hook),
              auth: false,
            });
          } else {
            await this.discord.rest.delete(`/channels/${mapped.discord_channel}/messages/${messageId}`);
          }
        }
      } else if (bridge.settings.mirrorDeletes) {
        // A Hoffle moderator removed the copy of a Discord person's message.
        await this.discord.rest.delete(`/channels/${mapped.discord_channel}/messages/${mapped.discord_id}`);
      }
    } catch (error) {
      if (error?.code !== 10008) this.noteError(mapped.server_id, error);
    }
  }

  async onHoffleReaction(type, d) {
    // A Discord person's reaction carried over never comes back here; skip any
    // other bridge's people too.
    if (d.hoffle_reactor?.startsWith?.("ext:")) return;
    const mapped = this.store.byHoffle(d.message_id);
    if (!mapped) return;
    const bridge = this.bridges.get(mapped.server_id);
    if (!bridge?.settings.reactions || !this.discordReady) return;
    const key = d.emoji?.name;
    if (!key) return;
    const reactor = d.hoffle_reactor || d.user_id;
    const guild = this.discord.guilds.cache.get(bridge.discordGuildId);
    const path = reactionForDiscord(key, this.guildEmoji(guild));
    try {
      if (type === "MESSAGE_REACTION_ADD") {
        const first = this.store.addReactor("hoffle", d.message_id, key, reactor);
        if (first && path) {
          await this.discord.rest.put(
            `/channels/${mapped.discord_channel}/messages/${mapped.discord_id}/reactions/${encodeURIComponent(path)}/@me`,
          );
        }
      } else {
        const left = this.store.dropReactor("hoffle", d.message_id, key, reactor);
        if (left === 0 && path) {
          await this.discord.rest.delete(
            `/channels/${mapped.discord_channel}/messages/${mapped.discord_id}/reactions/${encodeURIComponent(path)}/@me`,
          );
        }
      }
    } catch (error) {
      if (error?.code !== 10014) this.noteError(mapped.server_id, error);
    }
  }

  async onHoffleTyping(d) {
    if (!this.discordReady || !d?.channel_id || d.user_id === this.hoffleUserId) return;
    const target = await this.hoffleTarget(d.channel_id);
    if (!target?.bridge.settings.typing) return;
    const channelId = target.hoffleThreadId
      ? this.store.threadByHoffle(target.hoffleThreadId)?.discord_thread
      : target.channel.discordChannelId;
    if (!channelId) return;
    const key = `ht:${channelId}`;
    if ((this.throttle.get(key) ?? 0) > Date.now() - 8000) return;
    this.throttle.set(key, Date.now());
    await this.discord.rest.post(`/channels/${channelId}/typing`);
  }

  // -------------------------------------------------------------------------
  // Catching up after downtime
  // -------------------------------------------------------------------------

  async catchUp(side) {
    // Give the other side a moment if it is coming up at the same time.
    await sleep(3000);
    if (side === "discord" ? !this.discordReady : !this.hoffleReady) return;
    let carried = 0;
    for (const entry of this.byDiscordChannel.values()) {
      const { discordChannelId, hoffleChannelSnowflake } = entry.channel;
      try {
        if (side === "discord") {
          const cursor = this.store.cursor("discord", discordChannelId);
          const channel = await this.discord.channels.fetch(discordChannelId).catch(() => null);
          if (!channel?.messages) continue;
          if (!cursor) {
            const latest = await channel.messages.fetch({ limit: 1 });
            if (latest.first()) this.store.advance("discord", discordChannelId, latest.first().id);
            continue;
          }
          const missed = await channel.messages.fetch({ after: cursor, limit: 100 });
          const ordered = [...missed.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
          await this.enqueue(`d:${discordChannelId}`, async () => {
            for (const message of ordered) {
              const before = this.store.byDiscord(message.id);
              await this.relayDiscordMessage(message, { catchUp: true });
              if (!before && this.store.byDiscord(message.id)) carried += 1;
            }
          });
        } else {
          const cursor = this.store.cursor("hoffle", hoffleChannelSnowflake);
          if (!cursor) {
            const latest = await this.hoffle.rest.get(`/channels/${hoffleChannelSnowflake}/messages`, {
              query: new URLSearchParams({ limit: "1" }),
            });
            if (latest?.[0]) this.store.advance("hoffle", hoffleChannelSnowflake, latest[0].id);
            continue;
          }
          const missed = await this.hoffle.rest.get(`/channels/${hoffleChannelSnowflake}/messages`, {
            query: new URLSearchParams({ after: cursor, limit: "100" }),
          });
          const ordered = [...(missed || [])].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
          await this.enqueue(`h:${hoffleChannelSnowflake}`, async () => {
            for (const d of ordered) {
              const before = this.store.byHoffle(d.id);
              await this.relayHoffleMessage(d, { catchUp: true });
              if (!before && this.store.byHoffle(d.id)) carried += 1;
            }
          });
        }
      } catch (error) {
        this.noteError(entry.bridge.serverId, error);
      }
    }
    if (carried) log(`${side}: carried over ${carried} message(s) sent while the bridge was away`);
  }

  // -------------------------------------------------------------------------
  // /hoffle on Discord
  // -------------------------------------------------------------------------

  async registerCommands(appId) {
    await this.discord.rest.put(`/applications/${appId}/commands`, {
      body: [
        {
          name: "hoffle",
          description: "Mirror this Discord server with a Hoffle server",
          type: 1,
          // Only people who can manage the server see or run it.
          default_member_permissions: String(PermissionFlagsBits.ManageGuild),
          contexts: [0],
          integration_types: [0],
          options: [
            {
              type: 1,
              name: "link",
              description: "Link this server using the code from Hoffle",
              options: [
                {
                  type: 3,
                  name: "code",
                  description: "From Hoffle: Server Settings → Integrations → Discord Bridge",
                  required: true,
                  min_length: 8,
                  max_length: 12,
                },
              ],
            },
            { type: 1, name: "status", description: "Which Hoffle server and channels this server mirrors" },
            { type: 1, name: "unlink", description: "Stop mirroring this server with Hoffle" },
          ],
        },
        {
          name: "hoffle-account",
          description: "Link your Discord account to your Hoffle account",
          type: 1,
          // Anyone, in a server or in a DM with the bot.
          contexts: [0, 1],
          integration_types: [0],
          options: [
            {
              type: 1,
              name: "link",
              description: "Link using the code from Hoffle",
              options: [
                {
                  type: 3,
                  name: "code",
                  description: "From Hoffle: Settings → Edit Profiles → Connections",
                  required: true,
                  min_length: 8,
                  max_length: 12,
                },
              ],
            },
            { type: 1, name: "status", description: "Which Hoffle account yours is linked to" },
            { type: 1, name: "unlink", description: "Unlink your Discord and Hoffle accounts" },
          ],
        },
        {
          name: "hoffle-voice",
          description: "Change how your voice sounds to people on Hoffle",
          type: 1,
          contexts: [0, 1],
          integration_types: [0],
          options: [
            {
              type: 3,
              name: "effect",
              description: "Leave it out to see which one you have",
              required: false,
              choices: VOICE_EFFECTS.map((effect) => ({
                name: `${effect.label}: ${effect.hint}`.slice(0, 100),
                value: effect.id,
              })),
            },
          ],
        },
      ],
    });
  }

  async onVoiceCommand(interaction) {
    const chosen = interaction.options.getString("effect");
    const label = (id) => VOICE_EFFECTS.find((effect) => effect.id === id)?.label ?? "Normal";
    if (chosen) {
      this.store.setVoiceEffect(interaction.user.id, chosen);
      this.voice.setEffect(interaction.user.id, chosen);
    }
    const current = this.store.voiceEffect(interaction.user.id);
    await interaction.reply({
      content: chosen
        ? `🎙️ On Hoffle you now sound: **${label(current)}**. It changes only what people on Hoffle hear; Discord hears you as always.`
        : `🎙️ On Hoffle you sound: **${label(current)}**. Pick another with \`/hoffle-voice effect:\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  async onAccountCommand(interaction) {
    const ephemeral = { flags: MessageFlags.Ephemeral };
    await interaction.deferReply(ephemeral);
    const sub = interaction.options.getSubcommand();
    const discord = { id: interaction.user.id, name: interaction.user.globalName || interaction.user.username };
    try {
      if (sub === "link") {
        const result = await this.hoffleApi("POST", "account-link", {
          code: interaction.options.getString("code", true),
          discord,
        });
        await this.refreshConfig().catch(() => undefined);
        await interaction.editReply(
          `✅ Linked with **${result.displayName}** (@${result.username}) on Hoffle.\nWhat you write in bridged channels now shows as you on both sides.`,
        );
      } else if (sub === "unlink") {
        const result = await this.hoffleApi("POST", "account-unlink", { discordUserId: discord.id });
        await this.refreshConfig().catch(() => undefined);
        await interaction.editReply(result.unlinked ? "Unlinked." : "Your Discord account wasn't linked to Hoffle.");
      } else {
        const result = await this.hoffleApi("POST", "account-status", { discordUserId: discord.id });
        await interaction.editReply(
          result.linked
            ? `Linked with **${result.displayName}** (@${result.username}) on Hoffle.`
            : "Not linked. In Hoffle open Settings → Edit Profiles → Connections, make a code, then run `/hoffle-account link` with it.",
        );
      }
    } catch (error) {
      await interaction.editReply(`❌ ${describe(error)}`);
    }
  }

  async onInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "hoffle-account") {
      await this.onAccountCommand(interaction);
      return;
    }
    if (interaction.commandName === "hoffle-voice") {
      await this.onVoiceCommand(interaction);
      return;
    }
    if (interaction.commandName !== "hoffle") return;
    const ephemeral = { flags: MessageFlags.Ephemeral };
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Run this inside the Discord server you want to mirror.", ...ephemeral });
      return;
    }
    // Discord hides the command from others, but server owners can change that.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Only people with **Manage Server** can do this.", ...ephemeral });
      return;
    }
    await interaction.deferReply(ephemeral);
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const user = { id: interaction.user.id, name: interaction.member?.displayName || interaction.user.username };

    if (sub === "link") {
      try {
        const result = await this.hoffleApi("POST", "link", {
          code: interaction.options.getString("code", true),
          guild: { id: interaction.guildId, name: guild?.name || "Discord server", icon: guild?.iconURL({ extension: "png", size: 64 }) ?? null },
          user,
        });
        await this.refreshConfig().catch(() => undefined);
        this.scheduleStatus();
        await interaction.editReply(
          `✅ Linked with **${result.serverName}** on Hoffle.\nNow pick which channels to mirror, back in Hoffle: Server Settings → Integrations → Discord Bridge.`,
        );
      } catch (error) {
        await interaction.editReply(`❌ ${describe(error)}`);
      }
      return;
    }

    if (sub === "unlink") {
      try {
        const result = await this.hoffleApi("POST", "unlink", { guildId: interaction.guildId, user });
        await this.refreshConfig().catch(() => undefined);
        await interaction.editReply(
          result.unlinked ? "Unlinked. Messages no longer cross between this server and Hoffle." : "This server wasn't linked to Hoffle.",
        );
      } catch (error) {
        await interaction.editReply(`❌ ${describe(error)}`);
      }
      return;
    }

    const bridge = this.byGuild.get(interaction.guildId);
    if (!bridge) {
      await interaction.editReply(
        "Not linked to Hoffle yet. In Hoffle open Server Settings → Integrations → Discord Bridge, press **Set up**, then run `/hoffle link` here with the code it shows.",
      );
      return;
    }
    const lines = bridge.channels.map((c) => `<#${c.discordChannelId}> ⇄ **#${c.name}**`);
    const activity = this.activity.get(bridge.serverId);
    await interaction.editReply(
      [
        `Linked with **${bridge.serverName}** on Hoffle${this.hoffleReady ? "" : " (Hoffle is reconnecting…)"}.`,
        lines.length ? lines.join("\n") : "No channels paired yet: pick them in Hoffle.",
        activity?.lastRelayAt ? `Last message carried <t:${Math.floor(Date.parse(activity.lastRelayAt) / 1000)}:R>.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

/** Only the embed fields Discord accepts, with string colours made numbers. */
export function cleanEmbed(embed) {
  if (!embed || typeof embed !== "object") return null;
  const out = {};
  for (const key of ["title", "description", "url", "timestamp"]) {
    if (typeof embed[key] === "string" && embed[key]) out[key] = embed[key];
  }
  if (out.url && !/^https?:\/\//.test(out.url)) delete out.url;
  if (typeof embed.color === "number") out.color = embed.color;
  else if (typeof embed.color === "string" && /^#?[0-9a-f]{6}$/i.test(embed.color)) out.color = parseInt(embed.color.replace("#", ""), 16);
  for (const key of ["author", "footer"]) {
    const value = embed[key];
    if (value && typeof value === "object" && (value.name || value.text)) {
      out[key] = { ...(value.name ? { name: String(value.name) } : {}), ...(value.text ? { text: String(value.text) } : {}) };
      const icon = value.icon_url;
      if (typeof icon === "string" && /^https:\/\//.test(icon)) out[key].icon_url = icon;
    }
  }
  for (const key of ["image", "thumbnail"]) {
    const url = embed[key]?.url;
    if (typeof url === "string" && /^https:\/\//.test(url)) out[key] = { url };
  }
  if (Array.isArray(embed.fields)) {
    out.fields = embed.fields
      .filter((f) => f && f.name && f.value)
      .slice(0, 25)
      .map((f) => ({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: Boolean(f.inline) }));
  }
  return Object.keys(out).length ? out : null;
}
