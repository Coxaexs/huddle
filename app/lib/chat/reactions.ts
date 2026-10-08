/** Reaction pills: folding a toggle into a message's list, and hover text. */

import type { ReactionList } from "./types";

/** Folds a single reaction toggle into a message's aggregated reaction list.
 *  Idempotent: if `me` is already (or no longer) in the users list, the count
 *  is not changed again. This keeps the optimistic update + socket echo from
 *  double-counting the same person. */
export function applyReaction(
  reactions: ReactionList | undefined,
  emoji: string,
  isMine: boolean,
  added: boolean,
  me?: { id: string; username: string; displayName: string; avatar: string; avatarUrl?: string | null; color: string },
): ReactionList {
  const list = (reactions || []).map((r) => ({ ...r, users: r.users ? [...r.users] : [] }));
  const entry = list.find((r) => r.emoji === emoji);
  const alreadyThere = Boolean(me && entry?.users?.some((u) => u.id === me.id));
  if (added) {
    if (entry) {
      if (!alreadyThere) entry.count += 1;
      if (isMine) entry.mine = true;
      if (me && !alreadyThere) {
        entry.users = [...(entry.users || []), me];
      }
    } else {
      list.push({ emoji, count: 1, mine: isMine, users: me ? [me] : [] });
    }
  } else if (entry) {
    if (alreadyThere) {
      entry.count -= 1;
      if (isMine) entry.mine = false;
      if (me) entry.users = (entry.users || []).filter((u) => u.id !== me.id);
    }
    if (entry.count <= 0) return list.filter((r) => r.emoji !== emoji);
  }
  return list;
}

/** Hover text for a reaction pill: who reacted with this emoji. */
export function reactionTooltip(reaction: ReactionList[number]): string {
  const names = (reaction.users || []).map((u) => u.displayName);
  if (!names.length) return `${reaction.count} reaction${reaction.count === 1 ? "" : "s"}`;
  const list = names.join(", ");
  return `${list} reacted with ${reaction.emoji}`;
}
