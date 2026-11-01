/**
 * What a bridged voice pair should be doing, from who is where.
 *
 * - Everyone in the Discord voice channel gets a seat in the Hoffle room, so
 *   Hoffle can see who is talking over there (other Discord bots too, like a
 *   music bot, but only while a person is around on either side).
 * - The bot sits in the Discord channel while anyone is in the Hoffle room,
 *   so Discord sees the call is on, and plays the room into the channel.
 * - Sound crosses only when there is someone on both sides to hear it.
 *
 * Someone a Hoffle moderator removed stays out until they leave the Discord
 * channel (`blocked`). The bridge's own bots (`selfId`, and the voice helpers
 * in `selfIds`) never get a seat: they are the Hoffle people already.
 */
export function planVoice({ discord, hoffle, selfId, selfIds = [], blocked = new Set() }) {
  const ours = new Set([selfId, ...selfIds]);
  const others = discord.filter((member) => !ours.has(member.id) && !blocked.has(member.id));
  const discordHumans = others.filter((member) => !member.bot);
  const hofflePeople = hoffle.filter((person) => !person.discord && !person.bot && !person.recorder);
  const anyone = discordHumans.length > 0 || hofflePeople.length > 0;
  return {
    seats: anyone ? others.map((member) => member.id) : [],
    onDiscord: hofflePeople.length > 0,
    audio: others.length > 0 && hofflePeople.length > 0,
    hofflePeople: hofflePeople.length,
    discordPeople: discordHumans.length,
  };
}

/**
 * The Hoffle people a voice helper could stand in for on Discord: everyone in
 * the room except the Discord people's own seats and recorders. People come
 * before bots (a music bot), each in the order they joined.
 */
export function showable(hoffle) {
  return hoffle
    .filter((person) => person.connectionId && !person.discord && !person.recorder)
    .map((person, at) => ({ person, at }))
    .sort((a, b) => Number(Boolean(a.person.bot)) - Number(Boolean(b.person.bot)) || (a.person.joinedAt ?? 0) - (b.person.joinedAt ?? 0) || a.at - b.at)
    .map(({ person }) => person);
}

/**
 * Which voice helper stands in for which Hoffle person on Discord.
 *
 * - Whoever has a helper keeps it while it is still free for this channel.
 * - The rest take what is left in the order they come (`showable` order), so
 *   when there are more people than helpers, the first to join show up.
 * - A newcomer gets the helper they had last time when it is free, so Discord
 *   doesn't have to rename a helper back and forth.
 * - Anyone without one is heard through the main bot's mix, as before.
 *
 * @param {{ people: Array<{ id: string, connectionId: string }>, helpers: string[],
 *   current?: Map<string, string>, last?: Map<string, string> }} input
 *   `helpers` are the helper ids free for this channel, in order; `current`
 *   is connection id → helper id now; `last` is Hoffle user id → helper id.
 * @returns {Map<string, string>} connection id → helper id
 */
export function assignHelpers({ people, helpers, current = new Map(), last = new Map() }) {
  const out = new Map();
  const free = new Set(helpers);
  for (const person of people) {
    const helper = current.get(person.connectionId);
    if (helper && free.has(helper)) {
      out.set(person.connectionId, helper);
      free.delete(helper);
    }
  }
  // Newcomers, as many as there are helpers left, in order.
  const newcomers = people.filter((person) => !out.has(person.connectionId)).slice(0, free.size);
  for (const person of newcomers) {
    const before = last.get(person.id);
    if (before && free.has(before)) {
      out.set(person.connectionId, before);
      free.delete(before);
    }
  }
  for (const person of newcomers) {
    if (out.has(person.connectionId)) continue;
    const [helper] = free;
    if (!helper) break;
    out.set(person.connectionId, helper);
    free.delete(helper);
  }
  return out;
}

/** The name a helper takes on Discord for a Hoffle person (nicknames are 1 to 32 characters). */
export function helperNick(person) {
  const name = String(person?.displayName || person?.username || "").replace(/\s+/g, " ").trim();
  return [...(name || "Hoffle")].slice(0, 32).join("");
}

/** Discord's mute and deafen, as a Hoffle seat shows them. */
export function seatState(voice) {
  return {
    muted: Boolean(voice?.selfMute || voice?.serverMute || voice?.suppress),
    deafened: Boolean(voice?.selfDeaf || voice?.serverDeaf),
  };
}

/** The connection id half of a LiveKit identity (`<user>|<connection>`). */
export function connectionOf(identity) {
  const bar = String(identity || "").lastIndexOf("|");
  return bar > 0 ? identity.slice(bar + 1) : "";
}

/** The user half of a LiveKit identity (all of it when it has no connection id). */
export function userOf(identity) {
  const text = String(identity || "");
  const bar = text.lastIndexOf("|");
  return bar > 0 ? text.slice(0, bar) : text;
}
