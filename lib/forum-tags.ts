/**
 * Forum tags, as on Discord: a forum channel keeps a short list of labels,
 * and each post wears up to five of them so the board can be filtered.
 * "Moderated" tags (say, "Solved" or "Official") are for moderators to put on
 * and take off; anyone else keeps whichever ones their post already has.
 *
 * The list lives on the channel (channels.forum_tags, JSON); a post's picks
 * live in its payload (`forumTags`, the tag ids; `tags` is taken by D&D cards).
 */
export interface ForumTag {
  id: string;
  name: string;
  /** One emoji shown before the name. */
  emoji?: string;
  /** Only moderators may add or remove it. */
  moderated?: boolean;
}

export const MAX_FORUM_TAGS = 20;
export const MAX_POST_TAGS = 5;
export const TAG_NAME_MAX = 20;
const EMOJI_MAX = 8;
const ID_PATTERN = /^[a-z0-9]{1,24}$/;

function newTagId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/**
 * A forum's tag list, cleaned: at most 20, names trimmed and unique (ignoring
 * case), ids kept when valid so posts keep their tags across edits.
 */
export function normalizeForumTags(value: unknown, makeId: () => string = newTagId): ForumTag[] {
  if (!Array.isArray(value)) return [];
  const names = new Set<string>();
  const ids = new Set<string>();
  const tags: ForumTag[] = [];
  for (const raw of value) {
    if (tags.length >= MAX_FORUM_TAGS) break;
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const name = typeof entry.name === "string" ? entry.name.replace(/\s+/g, " ").trim().slice(0, TAG_NAME_MAX) : "";
    if (!name || names.has(name.toLowerCase())) continue;
    let id = typeof entry.id === "string" && ID_PATTERN.test(entry.id) ? entry.id : makeId();
    while (ids.has(id)) id = makeId();
    // Counted in characters, so an emoji is never cut in half.
    const emoji = typeof entry.emoji === "string" ? Array.from(entry.emoji.trim()).slice(0, EMOJI_MAX).join("") : "";
    names.add(name.toLowerCase());
    ids.add(id);
    tags.push({ id, name, ...(emoji ? { emoji } : {}), ...(entry.moderated === true ? { moderated: true } : {}) });
  }
  return tags;
}

/** The stored column, read back. */
export function parseForumTags(column: string | null | undefined): ForumTag[] {
  if (!column) return [];
  try {
    return normalizeForumTags(JSON.parse(column));
  } catch {
    return [];
  }
}

/** The tag ids a payload asks for, or null when it does not mention tags. */
export function requestedTags(payload: unknown): string[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const tags = (payload as { forumTags?: unknown }).forumTags;
  return Array.isArray(tags) ? tags.filter((id): id is string => typeof id === "string") : null;
}

/**
 * The tags a post ends up with: from the forum's list, at most five. Someone
 * who is not a moderator cannot add a moderated tag, nor take one off.
 */
export function pickPostTags(
  requested: unknown,
  available: ForumTag[],
  moderator: boolean,
  current: string[] = [],
): string[] {
  const byId = new Map(available.map((tag) => [tag.id, tag]));
  const picked: string[] = [];
  const add = (id: string) => {
    if (!picked.includes(id) && picked.length < MAX_POST_TAGS) picked.push(id);
  };
  if (!moderator) {
    for (const id of current) if (byId.get(id)?.moderated) add(id);
  }
  const wanted = Array.isArray(requested) ? requested : [];
  for (const id of wanted) {
    if (typeof id !== "string") continue;
    const tag = byId.get(id);
    if (!tag || (tag.moderated && !moderator)) continue;
    add(id);
  }
  return picked;
}

/** The payload wearing these tags, without the field when there are none. */
export function withPostTags(payload: unknown, tags: string[]): Record<string, unknown> | undefined {
  const base: Record<string, unknown> =
    payload && typeof payload === "object" && !Array.isArray(payload) ? { ...(payload as Record<string, unknown>) } : {};
  if (tags.length) base.forumTags = tags;
  else delete base.forumTags;
  return Object.keys(base).length ? base : undefined;
}
