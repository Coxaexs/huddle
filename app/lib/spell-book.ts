/**
 * Spells as the tabletop needs them, from the D&D companion through
 * /api/integrations/dnd/spells: found by name while typing, and looked up
 * once each (kept for the life of the page).
 */
import type { SpellInfo } from "@/lib/dnd-spells";
import { apiFetch } from "./client";

const known = new Map<string, Promise<SpellInfo | null>>();

/** A spell's details; null when the companion does not know it or cannot be reached. */
export function getSpell(name: string, edition?: "2014" | "2024"): Promise<SpellInfo | null> {
  const key = `${edition ?? "default"}:${name.trim().toLowerCase()}`;
  let found = known.get(key);
  if (!found) {
    const qs = new URLSearchParams({ name: name.trim() });
    if (edition) qs.set("edition", edition);
    found = apiFetch<{ spell?: SpellInfo }>(`/api/integrations/dnd/spells?${qs.toString()}`)
      .then((data) => data.spell ?? null)
      .catch(() => {
        // Try again next time: the companion may have been down.
        known.delete(key);
        return null;
      });
    known.set(key, found);
  }
  return found;
}

/** Spell names that match what was typed (up to 8). */
export async function searchSpells(query: string, edition?: "2014" | "2024"): Promise<string[]> {
  if (query.trim().length < 2) return [];
  try {
    const qs = new URLSearchParams({ q: query.trim() });
    if (edition) qs.set("edition", edition);
    const data = await apiFetch<{ names?: string[] }>(`/api/integrations/dnd/spells?${qs.toString()}`);
    return data.names ?? [];
  } catch {
    return [];
  }
}

/** "3rd" for 3; "cantrip" for 0. */
export function levelName(level: number): string {
  if (level === 0) return "cantrip";
  return `${level}${level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th"}`;
}
