import type { TableCharacter } from "./lounge-shared";

export interface ResolvedCheck {
  expression: string;
  label: string;
  isInitiative?: boolean;
}

const ABILITIES: Array<{ index: number; short: string; name: string; saveKey: string; aliases: string[] }> = [
  { index: 0, short: "str", name: "Strength", saveKey: "str_save", aliases: ["str", "strength"] },
  { index: 1, short: "dex", name: "Dexterity", saveKey: "dex_save", aliases: ["dex", "dexterity"] },
  { index: 2, short: "con", name: "Constitution", saveKey: "con_save", aliases: ["con", "constitution"] },
  { index: 3, short: "int", name: "Intelligence", saveKey: "int_save", aliases: ["int", "intelligence"] },
  { index: 4, short: "wis", name: "Wisdom", saveKey: "wis_save", aliases: ["wis", "wisdom"] },
  { index: 5, short: "cha", name: "Charisma", saveKey: "cha_save", aliases: ["cha", "charisma"] },
];

const SKILLS: Array<{ key: string; name: string; abilityIdx: number; aliases: string[] }> = [
  { key: "acrobatics", name: "Acrobatics", abilityIdx: 1, aliases: ["acrobatics", "acro"] },
  { key: "animal_handling", name: "Animal Handling", abilityIdx: 4, aliases: ["animal handling", "animal", "handling"] },
  { key: "arcana", name: "Arcana", abilityIdx: 3, aliases: ["arcana", "arc"] },
  { key: "athletics", name: "Athletics", abilityIdx: 0, aliases: ["athletics", "athl", "ath"] },
  { key: "deception", name: "Deception", abilityIdx: 5, aliases: ["deception", "decep"] },
  { key: "history", name: "History", abilityIdx: 3, aliases: ["history", "hist"] },
  { key: "insight", name: "Insight", abilityIdx: 4, aliases: ["insight", "ins"] },
  { key: "intimidation", name: "Intimidation", abilityIdx: 5, aliases: ["intimidation", "intim"] },
  { key: "investigation", name: "Investigation", abilityIdx: 3, aliases: ["investigation", "invest", "inv"] },
  { key: "medicine", name: "Medicine", abilityIdx: 4, aliases: ["medicine", "med"] },
  { key: "nature", name: "Nature", abilityIdx: 3, aliases: ["nature", "nat"] },
  { key: "perception", name: "Perception", abilityIdx: 4, aliases: ["perception", "perc"] },
  { key: "performance", name: "Performance", abilityIdx: 5, aliases: ["performance", "perf"] },
  { key: "persuasion", name: "Persuasion", abilityIdx: 5, aliases: ["persuasion", "pers"] },
  { key: "religion", name: "Religion", abilityIdx: 3, aliases: ["religion", "relig"] },
  { key: "sleight_of_hand", name: "Sleight of Hand", abilityIdx: 1, aliases: ["sleight of hand", "sleight", "soh"] },
  { key: "stealth", name: "Stealth", abilityIdx: 1, aliases: ["stealth", "sneak"] },
  { key: "survival", name: "Survival", abilityIdx: 4, aliases: ["survival", "surv"] },
];

function abilityMod(character: TableCharacter | null, idx: number): number {
  const score = character?.abilities?.[idx];
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return 0;
  return Math.floor((score - 10) / 2);
}

function formatRoll(bonus: number, mode: string, label: string, isInitiative?: boolean): ResolvedCheck {
  const signed = bonus > 0 ? `+${bonus}` : bonus < 0 ? `${bonus}` : "";
  return {
    expression: `1d20${signed}${mode ? ` ${mode}` : ""}`,
    label,
    ...(isInitiative ? { isInitiative: true } : {}),
  };
}

/**
 * Resolves a shorthanded check like `stealth`, `dex save adv`, `init`, or `pers`
 * into a rolled `1d20+bonus` expression using the active tabletop character.
 * Returns null if the input already contains explicit dice notation.
 */
export function resolveCheckCommand(input: string, character: TableCharacter | null): ResolvedCheck | null {
  if (!input.trim() || /\d*d\d+/i.test(input)) return null;

  let mode = "";
  let cleaned = input.trim();
  if (/\b(adv|advantage)\b/i.test(cleaned)) {
    mode = "adv";
    cleaned = cleaned.replace(/\b(adv|advantage)\b/gi, " ");
  } else if (/\b(dis|disadvantage)\b/i.test(cleaned)) {
    mode = "dis";
    cleaned = cleaned.replace(/\b(dis|disadvantage)\b/gi, " ");
  }

  cleaned = cleaned.toLowerCase().replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  if (cleaned === "init" || cleaned === "initiative") {
    const bonus = character?.initiativeBonus ?? abilityMod(character, 1);
    return formatRoll(bonus, mode, "Initiative", true);
  }

  const isSave = /\b(save|saving throw|saving)\b/i.test(cleaned);
  const saveTarget = cleaned.replace(/\b(saving throws?|save|check)\b/gi, " ").replace(/\s+/g, " ").trim();

  if (isSave) {
    const abil = ABILITIES.find((a) => a.aliases.includes(saveTarget));
    if (abil) {
      const bonus = character?.saves?.[abil.saveKey] ?? abilityMod(character, abil.index);
      return formatRoll(bonus, mode, `${abil.name} Save`);
    }
  }

  const skill = SKILLS.find((s) => s.aliases.includes(saveTarget));
  if (skill) {
    const bonus = character?.skills?.[skill.key] ?? abilityMod(character, skill.abilityIdx);
    return formatRoll(bonus, mode, skill.name);
  }

  const abil = ABILITIES.find((a) => a.aliases.includes(saveTarget));
  if (abil) {
    const bonus = abilityMod(character, abil.index);
    return formatRoll(bonus, mode, `${abil.name} Check`);
  }

  return null;
}
