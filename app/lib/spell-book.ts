/**
 * Spells as the tabletop needs them, from the D&D companion through
 * /api/integrations/dnd/spells: found by name while typing, and looked up
 * once each (kept for the life of the page).
 */
import type { SpellInfo } from "@/lib/dnd-spells";
import { apiFetch } from "./client";

const known = new Map<string, Promise<SpellInfo | null>>();

/** A spell's details; null when the companion does not know it or cannot be reached. */
export function getSpell(name: string): Promise<SpellInfo | null> {
  const key = name.trim().toLowerCase();
  let found = known.get(key);
  if (!found) {
    found = apiFetch<{ spell?: SpellInfo }>(`/api/integrations/dnd/spells?name=${encodeURIComponent(name.trim())}`)
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
export async function searchSpells(query: string): Promise<string[]> {
  if (query.trim().length < 2) return [];
  try {
    const data = await apiFetch<{ names?: string[] }>(`/api/integrations/dnd/spells?q=${encodeURIComponent(query.trim())}`);
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
