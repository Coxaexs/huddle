"use client";

import { Fragment, type ReactNode } from "react";
import { type Message } from "./types";

/** "18:04", or "Tue 18:04" / "3 Oct 18:04" for older unread. */
export function unreadSinceLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const age = Date.now() - date.getTime();
  if (date.toDateString() === new Date().toDateString()) return time;
  if (age < 6 * 86_400_000) return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return `${date.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

/** Puts the "New" line above the first unread message. */
export function withUnreadLine(show: boolean, id: string | number, node: ReactNode): ReactNode {
  if (!show) return node;
  return (
    <Fragment key={id}>
      <div className="unread-divider" role="separator" aria-label="New messages">
        <span>New</span>
      </div>
      {node}
    </Fragment>
  );
}

export const DRAFTS_KEY = "huddle-drafts";

/** One entry of the saved-messages panel (see /api/saved). */
export interface SavedEntry {
  messageId: string;
  savedAt: string;
  channelId: string;
  serverId: string | null;
  channelName: string | null;
  serverName: string | null;
  author: string;
  avatar: string;
  color: string;
  text: string;
  createdAt: string;
}

/**
 * Combines two message lists (any overlap), newest version of each message
 * winning, in reading order.
 */
export function mergeMessages(first: Message[], second: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of first) byId.set(String(message.id), message);
  for (const message of second) byId.set(String(message.id), message);
  return [...byId.values()].sort((a, b) =>
    String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
  );
}

/** Sizes a message box to its text, up to 40% of the window. */
export function fitComposer(node: HTMLTextAreaElement) {
  node.style.height = "auto";
  node.style.height = `${Math.min(node.scrollHeight + 2, window.innerHeight * 0.4)}px`;
}