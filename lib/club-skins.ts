/**
 * The club's dress for a few of the app's themes: more than the colours and
 * the sign over the bar (which every theme has), its own wall, fixtures and
 * things to touch. Built in app/components/club-skins.ts.
 *
 * - winamp: the LED wall is Winamp, its analyser the music itself; a llama.
 * - cantina (Star Wars): lightsabers for the beam fan, blaster bolts for the
 *   lasers, hyperspace on the drop, an opening crawl for each song, a droid DJ.
 * - construct (Matrix): code rain on the wall and the floor, a ringing
 *   payphone, the pills.
 * - redstone (Minecraft): redstone lamps on the wall, "Now playing" in
 *   Minecraft's colours, note blocks that play the song's notes, a creeper.
 */

export const CLUB_SKINS = ["plain", "winamp", "cantina", "construct", "redstone"] as const;
export type ClubSkin = (typeof CLUB_SKINS)[number];

/** The club's dress for the app's theme (`data-custom-theme-id`). */
export function clubSkinFor(customThemeId: string | undefined): ClubSkin {
  switch (customThemeId) {
    case "winamp": return "winamp";
    case "star-wars": return "cantina";
    case "matrix": return "construct";
    case "minecraft": return "redstone";
    default: return "plain";
  }
}

/** Who plays when nobody has the decks. */
export function residentDj(skin: ClubSkin): string {
  return skin === "cantina" ? "H0-FY" : "HOFFY";
}

/**
 * Minecraft's note particle colour for a pitch class (C = 0), as the game works it out: round the colour
 * wheel once over the note block's two octaves from F♯, green, yellow, red, purple, blue (the lower octave
 * here). Red, green and blue, 0..1.
 */
export function noteBlockColour(pc: number): [number, number, number] {
  const note = ((((pc - 6) % 12) + 12) % 12) / 24;
  const channel = (offset: number) => Math.max(0, Math.sin((note + offset) * Math.PI * 2) * 0.65 + 0.35);
  return [channel(0), channel(1 / 3), channel(2 / 3)];
}
