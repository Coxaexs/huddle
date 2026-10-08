/** Small pure helpers for the chat shell: time formatting, hints, ranking. */

import { mentionMatchScore } from "@/lib/mention-handles";
import type { Message } from "./types";

/**
 * The argument hint the slash menu shows for a bot command: subcommands as
 * `<join|add|next>`, options as `<required> [optional]`.
 */
export function commandArgsHint(options: unknown): string | undefined {
  if (!Array.isArray(options) || !options.length) return undefined;
  const list = options as Array<{ name: string; type?: number; required?: boolean }>;
  const subs = list.filter((option) => option.type === 1 || option.type === 2);
  if (subs.length) return `<${subs.map((option) => option.name).join("|")}>`;
  return list
    .map((option) => (option.required ? `<${option.name}>` : `[${option.name}]`))
    .join(" ");
}

/** Effective notification level: the channel's own, else its server's, else "all". */
export function notifyLevel(
  prefs: Record<string, string>,
  channelId: string,
  serverId: string | undefined,
): string {
  return prefs[channelId] || (serverId && prefs[`server:${serverId}`]) || "all";
}

/** Items matching `query` on any of their names, best matches first. */
export function rankMentionMatches<T>(
  items: T[],
  query: string,
  names: (item: T) => Array<string | null | undefined>,
  tieBreak: (a: T, b: T) => number,
): T[] {
  return items
    .map((item) => ({ item, score: mentionMatchScore(query, names(item)) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || tieBreak(a.item, b.item))
    .map((entry) => entry.item);
}

export function formatClientTime(createdAt?: string, fallbackTime?: string): string {
  if (!createdAt) return fallbackTime || "";
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return fallbackTime || "";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return fallbackTime || "";
  }
}

export function formatClientDateTime(createdAt?: string): string {
  if (!createdAt) return "";
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

/** Messenger's status-bar line: "Last message received at 7:06 PM on 9/26/2026." */
export function msnLastReceived(list: Message[], selfId: string | undefined): string {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const message = list[i];
    if (message.userId === selfId || !message.createdAt) continue;
    const at = new Date(message.createdAt);
    if (Number.isNaN(at.getTime())) continue;
    return `Last message received at ${at.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })} on ${at.toLocaleDateString()}.`;
  }
  return "No messages received yet.";
}

/**
 * Audio-taper curve: makes the whole 0–100 slider feel evenly useful. Above
 * 100% it boosts linearly, so 200% is twice as loud as the original (+6 dB).
 */
export function volumeGain(percent: number): number {
  const normalized = Math.max(0, Math.min(2, percent / 100));
  return normalized <= 1 ? normalized * normalized : normalized;
}

/** "an announcement", "a forum". */
export function withArticle(label: string): string {
  const lower = label.toLowerCase();
  return `${/^[aeiou]/.test(lower) ? "an" : "a"} ${lower}`;
}
