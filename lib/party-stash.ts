/** Shared party loot, currency splitter, and quest board helpers. */

export interface PartyCurrency {
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

export interface PartyLootItem {
  id: string;
  name: string;
  qty: number;
  notes?: string;
  holder?: string;
  attunement?: boolean;
  valueGp?: number;
  updatedBy?: string;
}

export interface PartyQuest {
  id: string;
  title: string;
  status: "active" | "completed" | "failed";
  notes?: string;
  giver?: string;
  updatedAt: number;
}

export interface PartyStashState {
  currency: PartyCurrency;
  items: PartyLootItem[];
  quests: PartyQuest[];
  updatedAt: number;
}

export const EMPTY_CURRENCY: PartyCurrency = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

export function emptyPartyStash(now = Date.now()): PartyStashState {
  return { currency: { ...EMPTY_CURRENCY }, items: [], quests: [], updatedAt: now };
}

function nonNegInt(raw: unknown, max = 1_000_000): number {
  const n = Math.floor(Number(raw) || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, n);
}

export function sanitizeCurrency(raw: unknown): PartyCurrency {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_CURRENCY };
  }
  const obj = raw as Record<string, unknown>;
  return {
    pp: nonNegInt(obj.pp),
    gp: nonNegInt(obj.gp),
    ep: nonNegInt(obj.ep),
    sp: nonNegInt(obj.sp),
    cp: nonNegInt(obj.cp),
  };
}

export function sanitizeLootItems(raw: unknown): PartyLootItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PartyLootItem[] = [];
  for (const entry of raw.slice(0, 120)) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 80) : "";
    if (!name) continue;
    const id = typeof obj.id === "string" && obj.id ? obj.id.slice(0, 64) : crypto.randomUUID();
    const qty = Math.max(1, Math.min(99999, Math.floor(Number(obj.qty) || 1)));
    const item: PartyLootItem = { id, name, qty };
    if (typeof obj.notes === "string" && obj.notes.trim()) item.notes = obj.notes.trim().slice(0, 240);
    if (typeof obj.holder === "string" && obj.holder.trim()) item.holder = obj.holder.trim().slice(0, 48);
    if (obj.attunement) item.attunement = true;
    if (obj.valueGp !== undefined && Number.isFinite(Number(obj.valueGp)) && Number(obj.valueGp) >= 0) {
      item.valueGp = Math.round(Number(obj.valueGp) * 100) / 100;
    }
    if (typeof obj.updatedBy === "string" && obj.updatedBy.trim()) item.updatedBy = obj.updatedBy.trim().slice(0, 48);
    out.push(item);
  }
  return out;
}

export function sanitizeQuests(raw: unknown): PartyQuest[] {
  if (!Array.isArray(raw)) return [];
  const out: PartyQuest[] = [];
  for (const entry of raw.slice(0, 80)) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim().slice(0, 100) : "";
    if (!title) continue;
    const id = typeof obj.id === "string" && obj.id ? obj.id.slice(0, 64) : crypto.randomUUID();
    const status =
      obj.status === "completed" || obj.status === "failed" ? obj.status : "active";
    const quest: PartyQuest = {
      id,
      title,
      status,
      updatedAt: Number.isFinite(Number(obj.updatedAt)) ? Number(obj.updatedAt) : Date.now(),
    };
    if (typeof obj.notes === "string" && obj.notes.trim()) quest.notes = obj.notes.trim().slice(0, 400);
    if (typeof obj.giver === "string" && obj.giver.trim()) quest.giver = obj.giver.trim().slice(0, 64);
    out.push(quest);
  }
  return out;
}

export function sanitizePartyStash(raw: unknown): PartyStashState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyPartyStash();
  }
  const obj = raw as Record<string, unknown>;
  return {
    currency: sanitizeCurrency(obj.currency),
    items: sanitizeLootItems(obj.items),
    quests: sanitizeQuests(obj.quests),
    updatedAt: Number.isFinite(Number(obj.updatedAt)) ? Number(obj.updatedAt) : Date.now(),
  };
}

/** Total value of a coin pouch expressed in copper pieces (1 pp = 1000 cp). */
export function totalCopper(currency: PartyCurrency): number {
  return (
    currency.pp * 1000 +
    currency.gp * 100 +
    currency.ep * 50 +
    currency.sp * 10 +
    currency.cp
  );
}

/** Total value formatted in gold pieces (rounded to 2 decimal places). */
export function totalGpValue(currency: PartyCurrency): number {
  return Math.round((totalCopper(currency) / 100) * 100) / 100;
}

/**
 * Splits a coin pouch evenly across `count` party members while conserving
 * every copper piece (`totalCopper(perPlayer) * count + totalCopper(remainder) === totalCopper(currency)`).
 */
export function splitCurrency(
  currency: PartyCurrency,
  count: number,
): { perPlayer: PartyCurrency; remainder: PartyCurrency } {
  const n = Math.max(1, Math.min(20, Math.floor(count) || 1));
  const c = sanitizeCurrency(currency);
  const ppEach = Math.floor(c.pp / n);
  const ppRem = c.pp % n;
  const availGp = c.gp + ppRem * 10;
  const gpEach = Math.floor(availGp / n);
  const gpRem = availGp % n;
  const epEach = Math.floor(c.ep / n);
  const epRem = c.ep % n;
  const availSp = c.sp + gpRem * 10 + epRem * 5;
  const spEach = Math.floor(availSp / n);
  const spRem = availSp % n;
  const availCp = c.cp + spRem * 10;
  const cpEach = Math.floor(availCp / n);
  const cpRem = availCp % n;

  return {
    perPlayer: { pp: ppEach, gp: gpEach, ep: epEach, sp: spEach, cp: cpEach },
    remainder: { pp: 0, gp: 0, ep: 0, sp: 0, cp: cpRem },
  };
}
