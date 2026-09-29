/**
 * The MSN theme's contact list extras, stored per user as one JSON blob
 * (msn_contacts table): your own groups ("Friends", "Family"…), which group
 * each contact is in, and whose sign-ins you don't want a toast for.
 */

export interface ContactGroup {
  id: string;
  name: string;
}

export interface MsnContacts {
  groups: ContactGroup[];
  /** Contact user id → group id. Anyone missing sits in Online / Not Online. */
  placement: Record<string, string>;
  /** Contacts whose sign-ins don't pop a toast. */
  quiet: string[];
}

export const MAX_GROUPS = 20;
export const MAX_GROUP_NAME = 32;
const MAX_PLACEMENTS = 1000;

export function emptyContacts(): MsnContacts {
  return { groups: [], placement: {}, quiet: [] };
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Cleans whatever a client sent (or an old stored blob) into a valid shape. */
export function cleanContacts(value: unknown): MsnContacts {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const groups: ContactGroup[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(input.groups) ? input.groups : []) {
    if (groups.length >= MAX_GROUPS) break;
    const group = (raw || {}) as Partial<ContactGroup>;
    const id = String(group.id || "");
    const name = String(group.name || "").replace(/\s+/g, " ").trim().slice(0, MAX_GROUP_NAME);
    if (!ID.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    groups.push({ id, name });
  }
  const placement: Record<string, string> = {};
  const rawPlacement = input.placement && typeof input.placement === "object" ? input.placement : {};
  for (const [userId, groupId] of Object.entries(rawPlacement as Record<string, unknown>)) {
    if (Object.keys(placement).length >= MAX_PLACEMENTS) break;
    if (ID.test(userId) && typeof groupId === "string" && seen.has(groupId)) placement[userId] = groupId;
  }
  const quiet = [
    ...new Set((Array.isArray(input.quiet) ? input.quiet : []).filter((id): id is string => typeof id === "string" && ID.test(id))),
  ].slice(0, MAX_PLACEMENTS);
  return { groups, placement, quiet };
}

/** Personal emoticon shortcuts: 2–12 visible characters, no spaces or brackets. */
export function cleanShortcut(value: unknown): string | null {
  const shortcut = String(value ?? "").trim();
  if (shortcut.length < 2 || shortcut.length > 12) return null;
  if (/[\s[\]|<>]/.test(shortcut)) return null;
  return shortcut;
}

/** Upload keys we accept for emoticons: what /api/uploads hands back for a renamed file. */
export function cleanUploadKey(value: unknown): string | null {
  const key = String(value ?? "");
  return /^[A-Za-z0-9._-]{1,160}$/.test(key) ? key : null;
}

export interface PersonalEmoticon {
  shortcut: string;
  key: string;
}

/**
 * Swaps your shortcuts for `[emo:key|shortcut]` tokens as you send, so the
 * picture shows for everyone (message-body.tsx renders the token). Only whole
 * words convert, and never inside code.
 */
export function applyPersonalEmoticons(text: string, emoticons: PersonalEmoticon[]): string {
  if (!emoticons.length || text.includes("`")) return text;
  const byShortcut = new Map(emoticons.map((e) => [e.shortcut, e.key]));
  return text.replace(/(^|\s)(\S+)(?=\s|$)/g, (whole, lead: string, token: string) => {
    const key = byShortcut.get(token);
    return key ? `${lead}[emo:${key}|${token}]` : whole;
  });
}
