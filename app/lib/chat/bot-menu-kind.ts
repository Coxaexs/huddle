/**
 * Which built-in bot menu a bot message opens on right click, if any.
 *
 * Only the music bot and the D&D bot have a menu of their own. Every other
 * bot (the weekly digest, Hoffle Bot, bridged and third-party bots) gets the
 * ordinary message menu, so its messages can be copied, replied to and reported.
 */
export function botMenuKind(author: string): "music" | "dnd" | null {
  const name = author.trim().toLowerCase();
  if (name === "music + watch") return "music";
  if (name.includes("d&d")) return "dnd";
  return null;
}
