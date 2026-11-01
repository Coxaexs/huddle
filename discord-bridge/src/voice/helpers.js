/**
 * Voice helpers: extra Discord bots that let Hoffle people show up on Discord
 * one by one.
 *
 * Discord gives a bot one voice connection per server, so the main bot can
 * only ever be one voice there: the whole Hoffle room, mixed. Each helper is
 * another bot account (a token in DISCORD_VOICE_BOT_TOKENS) that sits in the
 * Discord channel for one Hoffle person, under their name and picture in that
 * server, and shows as talking exactly while they do. Hoffle people beyond
 * the helpers on hand are heard through the main bot's mix, as before.
 *
 * A helper only plays sound: the main bot still listens to Discord and still
 * runs the chat. It logs in with no privileged intents, and in a server it
 * needs View Channel, Connect and Speak (Change Nickname to take each
 * person's name). Each helper is added to each Discord server separately;
 * Hoffle's Discord Bridge settings offer the buttons.
 */
import { Client, Events, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import { VoiceConnectionStatus, entersState, joinVoiceChannel } from "@discordjs/voice";
import { helperNick } from "./plan.js";
import { DiscordSpeaker } from "./speaker.js";

const NEEDED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];
/** A helper keeps its last person's name this long after they leave, in case they are straight back. */
const RESET_AFTER_MS = 60_000;
/** Taken out of a channel on Discord: that helper stays out of that server this long. */
const BACK_OFF_MS = 60_000;
const WATCHDOG_MS = 3 * 60_000;
/** Pictures Discord takes for a server profile, and the biggest we send. */
const PICTURE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const PICTURE_MAX = 5 * 1024 * 1024;
/** Discord's own picture hosts (a linked person's Discord avatar). */
const DISCORD_CDN = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
/** The name and picture a helper goes back to when nobody needs it. */
const BLANK = Object.freeze({ nick: null, avatar: null });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function describe(error) {
  return String(error?.rawError?.message || error?.message || error || "unknown error").slice(0, 200);
}

/**
 * Where the bridge may fetch a Hoffle person's picture from, or null.
 *
 * Only Hoffle's own uploads (fetched from Hoffle on this machine) and
 * Discord's CDN: a picture can be any link someone typed, and the bridge must
 * not be talked into fetching addresses inside the network it runs in.
 */
export function pictureSource(url, cfg) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url, `${cfg.publicUrl}/`);
  } catch {
    return null;
  }
  const own = new Set();
  for (const origin of [cfg.publicUrl, cfg.hoffleUrl]) {
    try {
      own.add(new URL(origin).origin);
    } catch {
      // Not a URL: nothing to match.
    }
  }
  if (own.has(parsed.origin)) return `${cfg.hoffleUrl}${parsed.pathname}${parsed.search}`;
  if (parsed.protocol === "https:" && DISCORD_CDN.has(parsed.hostname)) return parsed.href;
  return null;
}

/** What a helper shows on Discord for a Hoffle person. */
export function profileOf(person) {
  return { nick: helperNick(person), avatar: person?.avatarUrl || null };
}

/** A Hoffle seat's mute and deafen, as the helper's own on Discord. */
export function voiceStateOf(person) {
  return { selfMute: Boolean(person?.muted || person?.serverMuted), selfDeaf: Boolean(person?.deafened) };
}

export class VoiceHelpers {
  /**
   * @param {{ voiceBotTokens: string[], publicUrl: string, hoffleUrl: string }} cfg
   * @param {{ log: (...parts: unknown[]) => void, onChange?: () => void }} options
   */
  constructor(cfg, { log, onChange } = {}) {
    this.cfg = cfg;
    this.log = log || (() => undefined);
    this.onChange = onChange || (() => undefined);
    this.list = (cfg.voiceBotTokens || []).map((token, index) => new VoiceHelper(this, index, token));
    this.stopping = false;
    /** Picture URL → data URI, so the same face isn't fetched again and again. */
    this.pictures = new Map();
  }

  get size() {
    return this.list.length;
  }

  start() {
    for (const helper of this.list) void helper.supervise();
  }

  async stop() {
    this.stopping = true;
    await Promise.allSettled(this.list.map((helper) => helper.stop()));
  }

  changed() {
    this.onChange();
  }

  /** Every helper's Discord user id (also while reconnecting): these never get a seat in Hoffle. */
  userIds() {
    return this.list.map((helper) => helper.userId).filter(Boolean);
  }

  byUserId(id) {
    return (id && this.list.find((helper) => helper.userId === id)) || null;
  }

  byKey(key) {
    return this.list.find((helper) => helper.key === key) || null;
  }

  /** The helpers that could sit in this channel for `owner` (a voice link), in order. */
  freeFor(guildId, channelId, owner) {
    return this.list.filter((helper) => helper.canServe(guildId, channelId, owner)).map((helper) => helper.key);
  }

  /** A Hoffle picture as a data URI for Discord, or null (the helper's own picture then). */
  async picture(url) {
    const source = pictureSource(url, this.cfg);
    if (!source) return null;
    if (this.pictures.has(source)) return this.pictures.get(source);
    let uri = null;
    try {
      const response = await fetch(source, { signal: AbortSignal.timeout(10_000), redirect: "error" });
      const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const length = Number(response.headers.get("content-length") || 0);
      if (response.ok && PICTURE_TYPES.has(type) && length <= PICTURE_MAX) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length && bytes.length <= PICTURE_MAX) uri = `data:${type};base64,${bytes.toString("base64")}`;
      } else {
        await response.body?.cancel().catch(() => undefined);
      }
    } catch {
      uri = null;
    }
    if (this.pictures.size >= 32) this.pictures.delete(this.pictures.keys().next().value);
    this.pictures.set(source, uri);
    return uri;
  }

  /** For /healthz. */
  status() {
    return this.list.map((helper) => ({
      key: helper.key,
      name: helper.tag,
      ready: helper.ready,
      error: helper.ready ? null : helper.error,
      servers: helper.ready ? helper.client?.guilds.cache.size ?? 0 : 0,
      inCalls: [...helper.slots.values()].filter((slot) => slot.owner).length,
    }));
  }

  /** For Hoffle's settings: which helpers there are, to offer an invite button for each. */
  report() {
    return this.list
      .filter((helper) => helper.appId)
      .map((helper) => ({ id: helper.appId, name: helper.name, avatarUrl: helper.avatarUrl, connected: helper.ready }));
  }

  /** The helpers (by application id) that are in a Discord server. */
  inGuild(guildId) {
    return this.list.filter((helper) => helper.ready && helper.client?.guilds.cache.has(guildId)).map((helper) => helper.appId);
  }
}

export class VoiceHelper {
  constructor(pool, index, token) {
    this.pool = pool;
    this.index = index;
    /** Also the @discordjs/voice group, so its connections never mix with the main bot's. */
    this.key = `helper-${index + 1}`;
    this.token = token;
    this.client = null;
    this.ready = false;
    this.userId = null;
    this.appId = null;
    this.name = null;
    this.tag = null;
    this.avatarUrl = null;
    this.error = null;
    /** guild id → what this helper is doing there (see slot()). */
    this.slots = new Map();
  }

  get log() {
    return this.pool.log;
  }

  /** Keeps the helper logged in, like the main bot: retried with backoff, replaced when stuck. */
  async supervise() {
    let delay = 5000;
    while (!this.pool.stopping) {
      const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
      this.client = client;
      this.wire(client);
      try {
        await client.login(this.token);
        delay = 5000;
        let notReadySince = null;
        while (!this.pool.stopping && this.client === client) {
          await sleep(15_000);
          if (client.isReady() && this.ready) {
            notReadySince = null;
            continue;
          }
          notReadySince ??= Date.now();
          if (Date.now() - notReadySince > WATCHDOG_MS) {
            this.log(`voice ${this.key}: not ready for ${WATCHDOG_MS / 60000} minutes, starting over`);
            break;
          }
        }
      } catch (error) {
        this.error = describe(error);
        this.log(`voice ${this.key}: login failed: ${this.error}`);
        // A rejected token will not start working in five seconds.
        if (error?.code === "TokenInvalid" || /token/i.test(this.error)) delay = Math.max(delay, 300_000);
      }
      this.ready = false;
      if (this.client === client) this.client = null;
      await client.destroy().catch(() => undefined);
      this.pool.changed();
      if (this.pool.stopping) return;
      await sleep(delay);
      delay = Math.min(delay * 2, 300_000);
    }
  }

  wire(client) {
    client.on(Events.ClientReady, () => {
      if (this.client !== client) return;
      this.ready = true;
      this.error = null;
      this.userId = client.user.id;
      this.appId = client.application?.id || client.user.id;
      this.name = client.user.username;
      this.tag = client.user.tag;
      this.avatarUrl = client.user.displayAvatarURL({ extension: "png", size: 128 });
      this.log(`voice ${this.key}: ready as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
      for (const guild of client.guilds.cache.values()) this.tidy(guild);
      this.pool.changed();
    });
    client.on(Events.ShardDisconnect, () => {
      if (this.client !== client) return;
      this.ready = false;
      this.pool.changed();
    });
    client.on(Events.ShardReconnecting, () => {
      if (this.client === client) this.ready = false;
    });
    client.on(Events.ShardResume, () => {
      if (this.client !== client) return;
      this.ready = true;
      this.pool.changed();
    });
    client.on(Events.GuildCreate, (guild) => {
      this.tidy(guild);
      this.pool.changed();
    });
    client.on(Events.GuildDelete, () => this.pool.changed());
    client.on(Events.Error, (error) => this.log(`voice ${this.key}: error:`, describe(error)));
  }

  async stop() {
    const client = this.client;
    this.client = null;
    this.ready = false;
    for (const slot of this.slots.values()) clearTimeout(slot.resetTimer);
    await client?.destroy().catch(() => undefined);
  }

  /**
   * What the helper is doing in one server:
   *   owner        the voice link it sits in a channel for, or null
   *   wanted       the name and picture it should show there
   *   applied      what it shows there now, as far as we know
   *   backoffUntil not back into this server before then
   */
  slot(guildId) {
    let slot = this.slots.get(guildId);
    if (!slot) {
      slot = {
        owner: null,
        wanted: null,
        applied: { nick: undefined, avatar: undefined },
        writing: false,
        resetTimer: null,
        backoffUntil: 0,
        warned: false,
      };
      this.slots.set(guildId, slot);
    }
    return slot;
  }

  /** On login or joining a server: what it shows there now, and back to its own name if nobody needs it. */
  tidy(guild) {
    const slot = this.slot(guild.id);
    const me = guild.members.me;
    slot.applied = { nick: me?.nickname ?? null, avatar: me?.avatar ? "(earlier)" : null };
    if (!slot.owner) slot.wanted = BLANK;
    void this.writeProfile(guild.id);
  }

  /** Whether this helper can sit in that channel for `owner` now. */
  canServe(guildId, channelId, owner) {
    const slot = this.slots.get(guildId);
    if (slot?.owner) {
      // Busy in this server for another channel; one it already serves it
      // keeps through a gateway blip.
      return slot.owner === owner && Boolean(this.client);
    }
    if (!this.ready || !this.client) return false;
    if (Date.now() < (slot?.backoffUntil ?? 0)) return false;
    const guild = this.client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);
    const me = guild?.members.me;
    if (!channel || !me) return false;
    const permissions = channel.permissionsFor(me);
    return Boolean(permissions && NEEDED.every((flag) => permissions.has(flag)));
  }

  take(guildId, owner, profile) {
    const slot = this.slot(guildId);
    slot.owner = owner;
    clearTimeout(slot.resetTimer);
    slot.resetTimer = null;
    this.setProfile(guildId, profile);
  }

  letGo(guildId, owner) {
    const slot = this.slots.get(guildId);
    if (!slot || slot.owner !== owner) return;
    slot.owner = null;
    clearTimeout(slot.resetTimer);
    slot.resetTimer = setTimeout(() => {
      slot.resetTimer = null;
      if (!slot.owner) this.setProfile(guildId, BLANK);
    }, RESET_AFTER_MS);
    slot.resetTimer.unref?.();
    // Another bridged channel in that server may be waiting for a helper.
    this.pool.changed();
  }

  backOff(guildId) {
    this.slot(guildId).backoffUntil = Date.now() + BACK_OFF_MS;
    setTimeout(() => this.pool.changed(), BACK_OFF_MS + 500).unref?.();
  }

  setProfile(guildId, profile) {
    const slot = this.slot(guildId);
    const wanted = slot.wanted;
    if (wanted && wanted.nick === profile.nick && wanted.avatar === profile.avatar) return;
    slot.wanted = { nick: profile.nick, avatar: profile.avatar };
    void this.writeProfile(guildId);
  }

  /**
   * Brings the helper's name and picture in that server to what is wanted.
   * One write at a time: changes that come in meanwhile fold into the next,
   * so a rate limit never builds a queue of stale names.
   */
  async writeProfile(guildId) {
    const slot = this.slot(guildId);
    if (slot.writing) return;
    slot.writing = true;
    try {
      while (slot.wanted && (slot.wanted.nick !== slot.applied.nick || slot.wanted.avatar !== slot.applied.avatar)) {
        const want = slot.wanted;
        const guild = this.ready ? this.client?.guilds.cache.get(guildId) : null;
        if (!guild) break;
        const body = {};
        if (want.nick !== slot.applied.nick) body.nick = want.nick;
        if (want.avatar !== slot.applied.avatar) body.avatar = want.avatar ? await this.pool.picture(want.avatar) : null;
        try {
          await guild.members.editMe(body);
        } catch (error) {
          // The picture may be what Discord refused: the name alone still helps.
          let refused = error;
          if (body.nick !== undefined && body.avatar !== undefined) {
            refused = await guild.members.editMe({ nick: body.nick }).then(() => null, (again) => again);
          }
          if (refused && !slot.warned) {
            slot.warned = true;
            this.log(`voice ${this.key}: can't change its name or picture in ${guild.name}: ${describe(refused)} (give it Change Nickname)`);
          }
        }
        slot.applied = want;
      }
    } finally {
      slot.writing = false;
    }
  }
}

/**
 * One helper sitting in one Discord voice channel for one Hoffle person: it
 * takes their name and picture there, mirrors their mute and deafen, and
 * plays their sound (its `speaker`) while the voice link routes it here.
 */
export class HelperVoice {
  /**
   * @param {{ helper: VoiceHelper, owner: object, guildId: string, channelId: string,
   *   person: object, log: (...parts: unknown[]) => void, onLost: (voice: HelperVoice) => void }} options
   */
  constructor({ helper, owner, guildId, channelId, person, log, onLost }) {
    this.helper = helper;
    this.owner = owner;
    this.guildId = guildId;
    this.channelId = channelId;
    this.person = person;
    this.log = log;
    this.onLost = onLost;
    this.connection = null;
    this.speaker = null;
    this.state = voiceStateOf(person);
    this.stage = false;
    this.floor = undefined;
    this.stopped = false;
  }

  get name() {
    return helperNick(this.person);
  }

  /** Joins the channel; false when the helper can't right now. */
  start() {
    const guild = this.helper.client?.guilds.cache.get(this.guildId);
    if (!guild) return false;
    this.helper.take(this.guildId, this.owner, profileOf(this.person));
    const connection = joinVoiceChannel({
      channelId: this.channelId,
      guildId: this.guildId,
      adapterCreator: guild.voiceAdapterCreator,
      group: this.helper.key,
      selfMute: this.state.selfMute,
      selfDeaf: this.state.selfDeaf,
    });
    this.connection = connection;
    this.speaker = new DiscordSpeaker({ connection, log: this.log });
    connection.on(VoiceConnectionStatus.Ready, () => {
      if (this.connection !== connection) return;
      this.applyState();
      if (this.stage) this.askForFloor();
    });
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Moved or a blip: Discord reconnects by itself within a few seconds.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        if (this.connection === connection) this.lose("was taken out of the channel");
      }
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (this.connection === connection) this.lose(null);
    });
    connection.on("error", (error) => this.log(`voice ${this.helper.key}:`, error?.message || error));
    // On a stage it arrives in the audience; it asks for the floor once in (needs Mute Members there).
    this.stage = guild.channels.cache.get(this.channelId)?.type === 13;
    return true;
  }

  /** Connected and able to play: until then, this person stays in the main mix. */
  get live() {
    return !this.stopped && this.connection?.state.status === VoiceConnectionStatus.Ready;
  }

  /** The person's seat changed on Hoffle (name, picture, mute, the floor on a stage). */
  update(person) {
    this.person = person;
    if (this.stopped) return;
    this.helper.setProfile(this.guildId, profileOf(person));
    this.state = voiceStateOf(person);
    if (this.live) {
      this.applyState();
      if (this.stage && person.speakAllowed !== this.floor) this.askForFloor();
    }
  }

  applyState() {
    const config = this.connection?.joinConfig;
    if (!config || (config.selfMute === this.state.selfMute && config.selfDeaf === this.state.selfDeaf)) return;
    this.connection.rejoin({ channelId: this.channelId, selfMute: this.state.selfMute, selfDeaf: this.state.selfDeaf });
  }

  /** A Hoffle stage's speakers speak on the Discord stage too; its audience stays in the audience. */
  askForFloor() {
    this.floor = this.person.speakAllowed;
    const me = this.helper.client?.guilds.cache.get(this.guildId)?.members.me;
    if (!me?.voice?.channelId) return;
    void me.voice.setSuppressed(this.person.speakAllowed === false).catch(() => undefined);
  }

  /** It lost its place on Discord: let the link put this person back in the mix (or on another helper). */
  lose(why) {
    if (this.stopped) return;
    if (why) {
      this.log(`voice: ${this.helper.tag || this.helper.key} ${why} (as ${this.name}); it stays out of that server for a minute`);
      this.helper.backOff(this.guildId);
    }
    this.stop();
    this.onLost(this);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const connection = this.connection;
    this.connection = null;
    this.speaker?.stop();
    this.speaker = null;
    if (connection) {
      try {
        connection.destroy();
      } catch {
        // Already gone.
      }
    }
    this.helper.letGo(this.guildId, this.owner);
  }
}
