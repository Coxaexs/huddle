"use client";

/** How each channel kind is named, drawn and introduced in the UI. */

import { Hash, MessageSquare, Radio, Users, Volume2 } from "lucide-react";
import type { ChannelKind } from "@/lib/channel-kinds";

/**
 * Creation-UI copy per channel kind.
 *
 * Presentation only, so it lives here rather than in `lib/channel-kinds.ts`,
 * which owns behaviour. A kind missing from this map still works — the prompt
 * falls back to plain "text" wording — so adding a kind server-side never
 * breaks this screen.
 */
export const CHANNEL_KIND_COPY: Record<
  string,
  { title: string; message: string; placeholder: string }
> = {
  text: {
    title: "Create Text Channel",
    message: "Enter name for the new text channel:",
    placeholder: "general",
  },
  announcement: {
    title: "Create Announcement Channel",
    message: "Create a read-only feed that only moderators can post in:",
    placeholder: "announcements",
  },
  forum: {
    title: "Create Forum",
    message: "Create a board where each post starts its own thread:",
    placeholder: "help",
  },
  voice: {
    title: "Create Voice Room",
    message: "Enter name for the new voice room:",
    placeholder: "Voice Lounge",
  },
  stage: {
    title: "Create Stage",
    message: "Create a voice room with an audience, where speaking is a permission:",
    placeholder: "Friday Standup",
  },
};

/** Human label for a kind, for menus and badges. */
export function channelKindLabel(kind: ChannelKind): string {
  switch (kind) {
    case "announcement":
      return "Announcement";
    case "forum":
      return "Forum";
    case "voice":
      return "Voice room";
    case "stage":
      return "Stage";
    case "text":
    default:
      return "Text channel";
  }
}

/**
 * Icon for a kind, chosen to match what the channel actually does: a forum is a
 * board of posts, a stage has an audience, an announcement is a broadcast.
 */
export function channelKindIcon(kind: ChannelKind, size = 14, className?: string) {
  switch (kind) {
    case "announcement":
      return <Radio size={size} className={className} aria-hidden="true" />;
    case "forum":
      return <MessageSquare size={size} className={className} aria-hidden="true" />;
    case "voice":
      return <Volume2 size={size} className={className} aria-hidden="true" />;
    case "stage":
      return <Users size={size} className={className} aria-hidden="true" />;
    case "text":
    default:
      return <Hash size={size} className={className} aria-hidden="true" />;
  }
}
