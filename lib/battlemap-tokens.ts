/**
 * Common 2D monster & tabletop fixture tokens for Hoffle's voice battlemap.
 *
 * Monsters resolve to `/hangout/api/integrations/dnd/token?name=...` (served
 * from the D&D Companion's 4,500+ local 5e VTT token portraits), and common
 * tabletop fixtures (chest, door, barrel, torch, campfire, pillar, trap) get
 * crisp inline 2D top-down SVGs from the same endpoint.
 */

export interface BattlemapPaletteEntry {
  label: string;
  color: string;
  size: number;
  hp?: number;
  avatarUrl: string;
}

export function tokenImageUrl(name: string): string {
  return `/hangout/api/integrations/dnd/token?name=${encodeURIComponent(name.trim())}`;
}

export const FIXTURE_TOKEN_SVGS: Record<string, string> = {
  chest: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#291d14" stroke="#d4a017" stroke-width="3"/><rect x="15" y="21" width="34" height="24" rx="4" fill="#8b5a2b" stroke="#3e2412" stroke-width="2"/><path d="M15 30h34" stroke="#d4a017" stroke-width="3"/><rect x="28" y="26" width="8" height="10" rx="2" fill="#f5c542" stroke="#5c4106" stroke-width="1.5"/></svg>`,
  door: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1e1b18" stroke="#a67c52" stroke-width="3"/><rect x="19" y="12" width="26" height="40" rx="3" fill="#6b4423" stroke="#36200d" stroke-width="2"/><line x1="25" y1="14" x2="25" y2="50" stroke="#4a2e16" stroke-width="1.5"/><line x1="39" y1="14" x2="39" y2="50" stroke="#4a2e16" stroke-width="1.5"/><circle cx="39" cy="33" r="2.8" fill="#eab308"/></svg>`,
  barrel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1c1917" stroke="#9a6a2a" stroke-width="3"/><circle cx="32" cy="32" r="19" fill="#8b5a2b" stroke="#475569" stroke-width="4"/><circle cx="32" cy="32" r="12" fill="none" stroke="#5c3818" stroke-width="1.5"/><circle cx="32" cy="32" r="3" fill="#3b2310"/></svg>`,
  torch: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1b1410" stroke="#f59e0b" stroke-width="3"/><circle cx="32" cy="32" r="21" fill="rgba(245,158,11,0.22)"/><circle cx="32" cy="32" r="11" fill="#f97316"/><circle cx="32" cy="32" r="5" fill="#fde047"/></svg>`,
  campfire: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1c1410" stroke="#ea580c" stroke-width="3"/><path d="M16 40l32-16M16 24l32 16" stroke="#7c4a2d" stroke-width="6" stroke-linecap="round"/><path d="M32 14c7 8 11 14 11 20a11 11 0 1 1-22 0c0-6 4-12 11-20z" fill="#f97316"/><path d="M32 23c4 5 6 8 6 12a6 6 0 1 1-12 0c0-4 2-7 6-12z" fill="#fde047"/></svg>`,
  pillar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1e293b" stroke="#94a3b8" stroke-width="3"/><rect x="16" y="16" width="32" height="32" rx="4" fill="#64748b" stroke="#cbd5e1" stroke-width="2"/><circle cx="32" cy="32" r="11" fill="#94a3b8"/></svg>`,
  trap: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#271418" stroke="#ef4444" stroke-width="3"/><path d="M32 14l18 32H14z" fill="none" stroke="#f87171" stroke-width="3" stroke-linejoin="round"/><rect x="30" y="25" width="4" height="11" rx="1.5" fill="#fca5a5"/><circle cx="32" cy="41" r="2.2" fill="#fca5a5"/></svg>`,
};

export function fixtureTokenSvg(name: string): string | null {
  const key = name.trim().toLowerCase();
  return FIXTURE_TOKEN_SVGS[key] ?? null;
}

const RAW_PALETTE: Array<{
  label: string;
  color: string;
  size: number;
  hp?: number;
}> = [
  // Common mobs
  { label: "Goblin", color: "#49a35d", size: 1, hp: 7 },
  { label: "Goblin Boss", color: "#2f7d45", size: 1, hp: 21 },
  { label: "Orc", color: "#3d7a47", size: 1, hp: 15 },
  { label: "Hobgoblin", color: "#6b8f4e", size: 1, hp: 11 },
  { label: "Kobold", color: "#b8a6ff", size: 0.85, hp: 5 },
  { label: "Bugbear", color: "#8c5230", size: 1.15, hp: 27 },
  { label: "Gnoll", color: "#9e7238", size: 1, hp: 22 },
  { label: "Skeleton", color: "#cfd6dd", size: 1, hp: 13 },
  { label: "Zombie", color: "#7a9a5a", size: 1, hp: 22 },
  { label: "Ghoul", color: "#84cc16", size: 1, hp: 22 },
  { label: "Bandit", color: "#c05c3f", size: 1, hp: 11 },
  { label: "Guard", color: "#64748b", size: 1, hp: 11 },
  { label: "Cultist", color: "#7e22ce", size: 1, hp: 9 },
  { label: "Knight", color: "#94a3b8", size: 1, hp: 52 },
  { label: "Mage", color: "#3b82f6", size: 1, hp: 40 },
  { label: "Wolf", color: "#8a8f98", size: 1, hp: 11 },
  { label: "Dire Wolf", color: "#57534e", size: 2, hp: 37 },
  { label: "Giant Spider", color: "#3a3a44", size: 1.5, hp: 26 },
  { label: "Owlbear", color: "#854d0e", size: 2, hp: 59 },
  { label: "Mimic", color: "#b45309", size: 1, hp: 58 },
  { label: "Ogre", color: "#7a4a2a", size: 2, hp: 59 },
  { label: "Troll", color: "#5a7a4a", size: 2, hp: 84 },
  { label: "Gelatinous Cube", color: "#0891b2", size: 2, hp: 84 },
  { label: "Beholder", color: "#9333ea", size: 2, hp: 180 },
  { label: "Adult Red Dragon", color: "#a43a3a", size: 3, hp: 256 },
  // 2D Tabletop Fixtures
  { label: "Chest", color: "#b8860b", size: 1 },
  { label: "Door", color: "#8a6a3a", size: 1 },
  { label: "Barrel", color: "#9a6a2a", size: 0.9 },
  { label: "Torch", color: "#e8a541", size: 0.7 },
  { label: "Campfire", color: "#ea580c", size: 1 },
  { label: "Pillar", color: "#64748b", size: 1 },
  { label: "Trap", color: "#ef4444", size: 1 },
];

export const MONSTER_PALETTE: BattlemapPaletteEntry[] = RAW_PALETTE.map((entry) => ({
  ...entry,
  avatarUrl: tokenImageUrl(entry.label),
}));
