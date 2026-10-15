/** The spells cast most at tables, each with its own animation in tabletop-spellfx.ts (lower case). */
export const LOOK_NAMES = [
  // Cantrips
  "fire bolt", "ray of frost", "eldritch blast", "chill touch", "sacred flame", "toll the dead", "vicious mockery", "mage hand",
  // 1st to 3rd level
  "magic missile", "scorching ray", "guiding bolt", "shield", "cure wounds", "healing word", "bless", "hunter's mark", "hex",
  "hold person", "misty step", "fireball", "lightning bolt", "burning hands", "thunderwave", "shatter", "spirit guardians",
  "moonbeam", "faerie fire", "sleep", "web",
  // Higher
  "cone of cold",
] as const;

export type LookName = (typeof LOOK_NAMES)[number];

export const SPELL_LOOKS: ReadonlySet<string> = new Set(LOOK_NAMES);
