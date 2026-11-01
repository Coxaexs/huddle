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
 * channel (`blocked`).
 */
export function planVoice({ discord, hoffle, selfId, blocked = new Set() }) {
  const others = discord.filter((member) => member.id !== selfId && !blocked.has(member.id));
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
