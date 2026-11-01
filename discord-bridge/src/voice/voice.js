/**
 * Voice across the bridge.
 *
 * For each Hoffle voice room paired with a Discord voice channel (and voice
 * switched on in the bridge settings), a VoiceLink keeps the two in step:
 *
 *   Discord → Hoffle  every Discord person has their own seat in the room
 *                     (lib/discord-voice-seat.ts decides who that is) and their
 *                     own LiveKit participant; their voice is decoded, put
 *                     through their /hoffle-voice effect, and published there.
 *   Hoffle → Discord  one Discord person's LiveKit participant also listens
 *                     (the "ears"). Each Hoffle person with a voice helper
 *                     (helpers.js) is played by that helper, a Discord bot
 *                     sitting in the channel under their name; everyone else
 *                     is mixed and the main bot plays the mix. Both play in
 *                     bursts, so each only shows as talking while someone is.
 *
 * Discord lets a bot sit in one voice channel per server, so when a server
 * has several bridged voice channels, the first busy one gets the bot (and
 * each helper, likewise, sits in one channel per server).
 */
import { performance } from "node:perf_hooks";
import { EndBehaviorType, VoiceConnectionStatus, entersState, joinVoiceChannel } from "@discordjs/voice";
import { Leveler, createEffect, dbOf, int16ToMono, monoToInt16, peak, rms, stereoToMono } from "./dsp.js";
import { HelperVoice, VoiceHelpers } from "./helpers.js";
import { HubSeat } from "./hub-seat.js";
import { createOpus } from "./opus.js";
import { LiveKitSeat } from "./livekit-seat.js";
import { assignHelpers, connectionOf, planVoice, seatState, showable, userOf } from "./plan.js";
import { DiscordSpeaker } from "./speaker.js";

/** How long the bot stays in Discord after the Hoffle room empties, and audio after a side empties. */
const LINGER_MS = 15_000;
/** Discord frames (20 ms each) held back at the start of a stretch of speech. */
const CUSHION_FRAMES = 3;
const VOICE_CHANNEL_TYPES = new Set([2, 13]);

export class VoiceBridge {
  /** @param {import("../bridge.js").Bridge} bridge */
  constructor(bridge, log) {
    this.bridge = bridge;
    this.log = log;
    this.links = new Map();
    this.monitor = null;
    /** guild id → the link holding the bot's one voice connection there */
    this.guildHolder = new Map();
    /** Extra Discord bots that show Hoffle people one by one (DISCORD_VOICE_BOT_TOKENS). */
    this.helpers = bridge.cfg?.voiceBotTokens?.length
      ? new VoiceHelpers(bridge.cfg, { log, onChange: () => this.helpersChanged() })
      : null;
  }

  /** Logs the voice helpers in (the main bot logs in with the bridge). */
  start() {
    this.helpers?.start();
  }

  /** A helper logged in, dropped out, joined a server or came free. */
  helpersChanged() {
    for (const link of this.links.values()) link.reconcileSoon();
    this.bridge.scheduleStatus?.();
  }

  get cfg() {
    return this.bridge.cfg;
  }

  /** From the bridge config: every voice room paired with a Discord voice channel. */
  configure(bridges) {
    const wanted = new Map();
    for (const bridge of bridges) {
      if (!bridge.settings?.voice) continue;
      for (const channel of bridge.channels) {
        if (!channel.voice) continue;
        const discordChannel = this.bridge.discord?.channels.cache.get(channel.discordChannelId);
        // Until Discord is up we can't tell; a text partner never carries the call.
        if (discordChannel && !VOICE_CHANNEL_TYPES.has(discordChannel.type)) continue;
        if (!discordChannel && this.bridge.discordReady) continue;
        wanted.set(channel.discordChannelId, { bridge, channel });
      }
    }
    for (const [id, link] of this.links) {
      const next = wanted.get(id);
      if (!next || next.channel.hoffleChannelId !== link.hoffleChannelId) {
        link.stop();
        this.links.delete(id);
      } else {
        link.entry = next;
      }
    }
    for (const [id, entry] of wanted) {
      if (!this.links.has(id)) this.links.set(id, new VoiceLink(this, entry));
    }
    if (this.links.size && !this.monitor) {
      this.monitor = new HubSeat(this.cfg, { label: "monitor" });
      this.monitor.on("rooms", (channelId) => {
        for (const link of this.links.values()) if (!channelId || link.hoffleChannelId === channelId) link.reconcileSoon();
      });
      this.monitor.on("problem", (error) => this.log("voice monitor:", error?.message || error));
      this.monitor.open();
    } else if (!this.links.size && this.monitor) {
      this.monitor.close();
      this.monitor = null;
    }
    for (const link of this.links.values()) link.reconcileSoon();
  }

  /** Discord's voiceStateUpdate. */
  onVoiceState(oldState, newState) {
    // The bot itself was disconnected or moved by someone on Discord: step
    // back for a minute instead of fighting them.
    if (newState?.id && newState.id === this.bridge.discordUserId) {
      for (const link of this.links.values()) {
        if (link.connection && newState.channelId !== link.discordChannelId) link.backOff();
      }
    }
    // A helper moved to another channel: that one also steps back for a minute.
    const helper = this.helpers?.byUserId(newState?.id);
    if (helper && newState.channelId) {
      for (const link of this.links.values()) {
        for (const voice of link.voices.values()) {
          if (voice.helper === helper && voice.guildId === newState.guild?.id && newState.channelId !== voice.channelId) {
            voice.lose("was moved to another channel");
          }
        }
      }
    }
    for (const id of new Set([oldState?.channelId, newState?.channelId])) {
      if (id) this.links.get(id)?.reconcileSoon();
    }
  }

  /** Someone picked a new /hoffle-voice effect: it applies straight away. */
  setEffect(discordUserId, effectId) {
    for (const link of this.links.values()) {
      const person = link.people.get(discordUserId);
      if (person) person.effect = createEffect(effectId);
    }
  }

  /** Whether a LiveKit identity is one of our own Discord seats (never mixed back to Discord). */
  isOurs(identity) {
    const connection = connectionOf(identity);
    for (const link of this.links.values()) {
      for (const person of link.people.values()) if (person.seat.connectionId === connection) return true;
    }
    return false;
  }

  claimGuild(guildId, link) {
    const holder = this.guildHolder.get(guildId);
    if (holder && holder !== link && holder.connection) return false;
    this.guildHolder.set(guildId, link);
    return true;
  }

  releaseGuild(guildId, link) {
    if (this.guildHolder.get(guildId) !== link) return;
    this.guildHolder.delete(guildId);
    // Another bridged channel in that server may be waiting for the bot.
    for (const other of this.links.values()) if (other !== link && other.guildId === guildId) other.reconcileSoon();
  }

  status() {
    return [...this.links.values()].map((link) => link.status());
  }

  /** Leaves every call (the main bot's client is being replaced, or the bridge stops). */
  stop() {
    for (const link of this.links.values()) link.stop();
    this.links.clear();
    this.monitor?.close();
    this.monitor = null;
  }

  /** The bridge is stopping: the helpers log out too. */
  async shutdown() {
    this.stop();
    await this.helpers?.stop();
  }
}

export class VoiceLink {
  constructor(manager, entry) {
    this.manager = manager;
    this.entry = entry;
    this.people = new Map();
    this.blocked = new Set();
    this.connection = null;
    /** The main bot's sound on Discord: everyone without a helper, mixed. */
    this.speaker = null;
    /** Hoffle connection id → the voice helper standing in for that person on Discord. */
    this.voices = new Map();
    /** Hoffle user id → the helper they had last, to give them the same one back. */
    this.lastHelper = new Map();
    /** LiveKit track → the mixer its sound goes to (a helper's, or the main mix). */
    this.routes = new Map();
    this.clock = null;
    this.ears = null;
    this.leaveTimer = null;
    this.audioOffTimer = null;
    this.soon = null;
    this.stopped = false;
    this.plan = { seats: [], onDiscord: false, audio: false };
    /** Not before this time back into the Discord channel (after being kicked out of it). */
    this.rejoinAfter = 0;
  }

  /** Someone on Discord took the bot out of the channel: leave it be for a minute. */
  backOff() {
    this.rejoinAfter = Date.now() + 60_000;
    this.leaveDiscord();
    setTimeout(() => this.reconcileSoon(), 60_500);
  }

  get log() {
    return this.manager.log;
  }

  get discordChannelId() {
    return this.entry.channel.discordChannelId;
  }

  get hoffleChannelId() {
    return this.entry.channel.hoffleChannelId;
  }

  get guildId() {
    return this.entry.bridge.discordGuildId;
  }

  reconcileSoon() {
    if (this.stopped || this.soon) return;
    this.soon = setTimeout(() => {
      this.soon = null;
      try {
        this.reconcile();
      } catch (error) {
        this.log(`voice ${this.entry.channel.name}:`, error?.message || error);
      }
    }, 250);
  }

  discordMembers() {
    const channel = this.manager.bridge.discord?.channels.cache.get(this.discordChannelId);
    if (!channel?.members) return [];
    return [...channel.members.values()];
  }

  reconcile() {
    if (this.stopped) return;
    const members = this.discordMembers();
    // Whoever left the Discord channel may come back in later.
    for (const id of [...this.blocked]) if (!members.some((member) => member.id === id)) this.blocked.delete(id);
    const room = this.manager.monitor?.rooms.get(this.hoffleChannelId) || [];
    const plan = planVoice({
      discord: members.map((member) => ({ id: member.id, bot: member.user.bot })),
      hoffle: room,
      selfId: this.manager.bridge.discordUserId,
      selfIds: this.manager.helpers?.userIds() ?? [],
      blocked: this.blocked,
    });
    this.plan = plan;

    // Seats for the Discord people.
    const seats = new Set(plan.seats);
    for (const [id, person] of this.people) if (!seats.has(id)) this.removePerson(id, person);
    for (const member of members) {
      if (!seats.has(member.id)) continue;
      const person = this.people.get(member.id) ?? this.addPerson(member);
      person.seat.setState(seatState(member.voice));
    }

    // The bot in the Discord channel.
    if (plan.onDiscord) {
      clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
      this.joinDiscord();
    } else if (this.connection && !this.leaveTimer) {
      this.leaveTimer = setTimeout(() => {
        this.leaveTimer = null;
        if (!this.plan.onDiscord) this.leaveDiscord();
      }, LINGER_MS);
    }
    this.reconcileHelpers(room);

    // Sound, while there is someone on both sides.
    // A seat that came back under a new connection id needs a LiveKit identity to match.
    for (const person of this.people.values()) {
      if (person.lk && person.lkFor !== person.seat.connectionId) this.closeLiveKit(person);
    }
    if (plan.audio) {
      clearTimeout(this.audioOffTimer);
      this.audioOffTimer = null;
      for (const person of this.people.values()) this.ensureLiveKit(person);
    } else if (!this.audioOffTimer && [...this.people.values()].some((person) => person.lk)) {
      this.audioOffTimer = setTimeout(() => {
        this.audioOffTimer = null;
        if (this.plan.audio) return;
        for (const person of this.people.values()) this.closeLiveKit(person);
      }, LINGER_MS);
    }
    this.pickEars();
  }

  addPerson(member) {
    const seat = new HubSeat(this.manager.cfg, {
      label: member.displayName,
      channelId: this.hoffleChannelId,
      discord: {
        id: member.id,
        name: member.displayName || member.user.globalName || member.user.username,
        avatarUrl: member.displayAvatarURL({ extension: "png", size: 128 }),
      },
    });
    const person = {
      id: member.id,
      name: member.displayName,
      seat,
      lk: null,
      lkUp: false,
      lkRetry: 0,
      effect: createEffect(this.manager.bridge.store.voiceEffect(member.id)),
      leveler: new Leveler(),
      decoder: createOpus(),
      meter: { packets: 0, decodeErrors: 0, gaps: 0, lastAt: 0, peak: 0, speech: 0 },
      listening: null,
      heard: true,
      seated: false,
    };
    seat.on("seat", (me) => {
      // The seat is in the room: now it can get a LiveKit token.
      if (!person.seated) {
        person.seated = true;
        this.reconcileSoon();
      }
      // A Hoffle moderator muted them, or a stage keeps them in the audience.
      const heard = !me.serverMuted && me.speakAllowed !== false;
      if (heard !== person.heard && person.lk) {
        // Their token's publish right follows: reconnect for a fresh one.
        person.heard = heard;
        this.closeLiveKit(person);
        this.reconcileSoon();
      }
      person.heard = heard;
    });
    seat.on("ready", () => this.reconcileSoon());
    seat.on("evicted", (reason) => {
      this.log(`voice: ${person.name} was ${reason === "moderator" ? "removed by a moderator" : "refused a seat"} in ${this.entry.channel.name}`);
      if (reason === "moderator") this.blocked.add(person.id);
      this.removePerson(person.id, person);
      if (reason !== "moderator") setTimeout(() => this.reconcileSoon(), 30_000);
    });
    seat.on("problem", () => undefined);
    seat.open();
    this.people.set(member.id, person);
    return person;
  }

  removePerson(id, person) {
    this.people.delete(id);
    person.decoder.free();
    person.listening?.destroy();
    person.listening = null;
    this.closeLiveKit(person);
    person.seat.close();
    if (this.ears === person) this.ears = null;
  }

  ensureLiveKit(person) {
    if (person.lk || !person.seat.connectionId || !person.seat.seat()) return;
    if (Date.now() < person.lkRetry) return;
    const lk = new LiveKitSeat(this.manager.cfg, {
      channelId: this.hoffleChannelId,
      connectionId: person.seat.connectionId,
      isOurs: (identity) => this.manager.isOurs(identity),
      onAudio: (key, samples, identity) => this.hear(key, identity, samples),
      onGone: (key) => this.forget(key),
      onDown: () => {
        if (person.lk !== lk) return;
        person.lk = null;
        person.lkUp = false;
        if (this.ears === person) this.ears = null;
        person.lkRetry = Date.now() + 3000;
        setTimeout(() => this.reconcileSoon(), 3100);
      },
    });
    person.lk = lk;
    person.lkFor = person.seat.connectionId;
    lk.connect()
      .then(() => {
        if (person.lk !== lk) return;
        person.lkUp = true;
        this.pickEars();
      })
      .catch((error) => {
        if (person.lk !== lk) return;
        this.log(`voice: LiveKit for ${person.name}:`, error?.message || error);
        person.lk = null;
        person.lkRetry = Date.now() + 10_000;
        void lk.close();
        setTimeout(() => this.reconcileSoon(), 10_100);
      });
  }

  closeLiveKit(person) {
    const lk = person.lk;
    person.lk = null;
    person.lkUp = false;
    if (this.ears === person) this.ears = null;
    if (lk) void lk.close();
  }

  /** One connected Discord person listens to the Hoffle room for everyone. */
  pickEars() {
    const wanted = this.plan.audio ? (this.ears?.lkUp ? this.ears : [...this.people.values()].find((p) => p.lkUp) ?? null) : null;
    if (wanted === this.ears) {
      if (wanted && !wanted.lk.ears) wanted.lk.setEars(true);
      return;
    }
    this.ears?.lk?.setEars(false);
    this.ears = wanted;
    wanted?.lk.setEars(true);
  }

  /**
   * One frame of a Hoffle person's sound: to their own helper on Discord once
   * it is connected, otherwise into the main bot's mix. When it moves from
   * one to the other, what was waiting in the old place is dropped.
   */
  hear(key, identity, samples) {
    const voice = this.voiceFor(identity);
    const target = voice?.live ? voice.speaker.mixer : this.speaker?.mixer;
    const before = this.routes.get(key);
    if (before && before !== target) before.drop(key);
    if (!target) {
      this.routes.delete(key);
      return;
    }
    this.routes.set(key, target);
    target.push(key, int16ToMono(samples));
  }

  /** Whose helper a LiveKit identity is heard through, if anyone's. */
  voiceFor(identity) {
    const connection = connectionOf(identity);
    if (connection) return this.voices.get(connection) ?? null;
    // A bot that joins LiveKit without its seat's connection id: by user, when it has one seat.
    const user = userOf(identity);
    let found = null;
    for (const voice of this.voices.values()) {
      if (voice.person.id !== user) continue;
      if (found) return null;
      found = voice;
    }
    return found;
  }

  forget(key) {
    this.routes.get(key)?.drop(key);
    this.routes.delete(key);
  }

  // ------------------------------------------------------------ voice helpers

  /**
   * While the bot is in the Discord channel, each Hoffle person it can spare a
   * helper for gets one there (plan.js assignHelpers decides who).
   */
  reconcileHelpers(room) {
    const helpers = this.manager.helpers;
    if (!helpers?.size) return;
    const people = this.connection ? showable(room) : [];
    const free = this.connection ? helpers.freeFor(this.guildId, this.discordChannelId, this) : [];
    const current = new Map([...this.voices].map(([connectionId, voice]) => [connectionId, voice.helper.key]));
    const wanted = assignHelpers({ people, helpers: free, current, last: this.lastHelper });
    for (const [connectionId, voice] of this.voices) {
      if (wanted.get(connectionId) === voice.helper.key) continue;
      this.voices.delete(connectionId);
      voice.stop();
    }
    for (const person of people) {
      const key = wanted.get(person.connectionId);
      if (!key) continue;
      const existing = this.voices.get(person.connectionId);
      if (existing) {
        existing.update(person);
        continue;
      }
      const voice = new HelperVoice({
        helper: helpers.byKey(key),
        owner: this,
        guildId: this.guildId,
        channelId: this.discordChannelId,
        person,
        log: this.log,
        onLost: (lost) => {
          if (this.voices.get(person.connectionId) === lost) this.voices.delete(person.connectionId);
          this.reconcileSoon();
        },
      });
      if (!voice.start()) continue;
      this.voices.set(person.connectionId, voice);
      this.lastHelper.set(person.id, key);
      if (this.lastHelper.size > 500) this.lastHelper.delete(this.lastHelper.keys().next().value);
    }
  }

  stopHelpers() {
    const voices = [...this.voices.values()];
    this.voices.clear();
    for (const voice of voices) voice.stop();
  }

  // ----------------------------------------------------------- Discord side

  joinDiscord() {
    if (this.connection || Date.now() < this.rejoinAfter) return;
    const guild = this.manager.bridge.discord?.guilds.cache.get(this.guildId);
    if (!guild || !this.manager.bridge.discordReady) return;
    // Only a voice channel of the bridge's own Discord server, never one elsewhere.
    if (!guild.channels.cache.has(this.discordChannelId)) return;
    if (!this.manager.claimGuild(this.guildId, this)) return;
    const connection = joinVoiceChannel({
      channelId: this.discordChannelId,
      guildId: this.guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
    this.connection = connection;
    this.log(`voice: joined Discord ${this.entry.channel.name}`);
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Moved or a blip: Discord reconnects by itself within a few seconds.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        if (this.connection === connection) this.backOff();
      }
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (this.connection === connection) {
        this.connection = null;
        // The helpers play on the bot's clock: they leave with it, and come back when it does.
        this.stopHelpers();
        this.stopPlayback();
        this.manager.releaseGuild(this.guildId, this);
      }
    });
    connection.on("error", (error) => this.log("voice: Discord connection:", error?.message || error));
    connection.receiver.speaking.on("start", (userId) => this.onSpeaking(userId));
    this.startPlayback(connection);
    // On a stage the bot arrives in the audience; ask to speak (needs Mute Members there).
    if (guild.channels.cache.get(this.discordChannelId)?.type === 13) {
      void entersState(connection, VoiceConnectionStatus.Ready, 20_000)
        .then(() => guild.members.me?.voice.setSuppressed(false))
        .catch(() => undefined);
    }
  }

  leaveDiscord() {
    const connection = this.connection;
    this.connection = null;
    this.stopHelpers();
    this.stopPlayback();
    for (const person of this.people.values()) {
      person.listening?.destroy();
      person.listening = null;
    }
    if (connection) {
      try {
        connection.destroy();
      } catch {
        // Already gone.
      }
      this.log(`voice: left Discord ${this.entry.channel.name}`);
    }
    this.manager.releaseGuild(this.guildId, this);
  }

  /** A Discord person started talking: carry it while they do. */
  onSpeaking(userId) {
    const person = this.people.get(userId);
    if (!person || person.listening || !this.connection) return;
    const stream = this.connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 600 },
    });
    person.listening = stream;
    // The first few frames of each stretch go to LiveKit together, so its
    // queue has a cushion and a late packet from Discord doesn't leave a hole.
    let held = [];
    const send = (frame) => person.lk?.capture(frame);
    const flush = () => {
      if (!held) return;
      for (const frame of held) send(frame);
      held = null;
    };
    const meter = person.meter;
    stream.on("data", (packet) => {
      const now = performance.now();
      if (meter.lastAt && now - meter.lastAt > 60 && now - meter.lastAt < 600) meter.gaps++;
      meter.lastAt = now;
      meter.packets++;
      if (!person.lkUp || !person.heard) return;
      let samples;
      try {
        samples = stereoToMono(person.decoder.decode(packet));
      } catch {
        meter.decodeErrors++;
        return;
      }
      const loudest = peak(samples);
      meter.peak = Math.max(meter.peak * 0.995, loudest);
      if (dbOf(rms(samples)) > person.leveler.floorDb) meter.speech++;
      const frame = monoToInt16(person.effect.process(person.leveler.process(samples)));
      if (!held) send(frame);
      else if (held.push(frame) >= CUSHION_FRAMES) flush();
    });
    const done = () => {
      flush();
      if (person.listening === stream) person.listening = null;
    };
    stream.once("end", done);
    stream.once("close", done);
    stream.on("error", done);
  }

  startPlayback(connection) {
    this.speaker = new DiscordSpeaker({ connection, log: this.log });
    let next = performance.now();
    const tick = () => {
      const now = performance.now();
      // Catch up if the process was busy, but never by more than a quarter second.
      if (now - next > 250) next = now;
      while (next <= now) {
        this.step();
        next += 20;
      }
      this.clock = setTimeout(tick, Math.max(1, next - performance.now()));
    };
    this.clock = setTimeout(tick, 20);
  }

  /** Every 20 ms: one frame for Discord from the main bot and from each helper (speaker.js). */
  step() {
    this.speaker?.step();
    for (const voice of this.voices.values()) voice.speaker?.step();
  }

  stopPlayback() {
    clearTimeout(this.clock);
    this.clock = null;
    this.speaker?.stop();
    this.speaker = null;
    this.routes.clear();
  }

  status() {
    return {
      discordChannelId: this.discordChannelId,
      hoffleChannelId: this.hoffleChannelId,
      name: this.entry.channel.name,
      onDiscord: Boolean(this.connection),
      discordPeople: this.plan.discordPeople ?? 0,
      hofflePeople: this.plan.hofflePeople ?? 0,
      seats: this.people.size,
      audio: this.plan.audio,
      ears: this.ears?.name ?? null,
      // Hoffle people shown on Discord by a helper of their own; the rest are in the main bot's mix.
      helpers: [...this.voices.values()].map((voice) => ({
        name: voice.name,
        helper: voice.helper.tag || voice.helper.key,
        live: voice.live,
        talking: Boolean(voice.speaker?.talking),
      })),
      // How each Discord voice arrives, to tell "too quiet" from "cutting out".
      people: [...this.people.values()].map((person) => ({
        name: person.name,
        effect: person.effect.id,
        live: person.lkUp,
        publishing: Boolean(person.lk?.publishing),
        packets: person.meter.packets,
        speechFrames: person.meter.speech,
        gaps: person.meter.gaps,
        decodeErrors: person.meter.decodeErrors,
        queueResets: person.lk?.resets ?? 0,
        peakDb: Math.round(dbOf(person.meter.peak)),
        speakingLevelDb: Math.round(person.leveler.levelDb),
        boostDb: Math.round(person.leveler.gainDb * 10) / 10,
      })),
    };
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.soon);
    clearTimeout(this.leaveTimer);
    clearTimeout(this.audioOffTimer);
    for (const [id, person] of this.people) this.removePerson(id, person);
    this.leaveDiscord();
  }
}

