"use client";

import type { MouseEvent } from "react";
import { SmilePlus } from "lucide-react";
import { OutlineEmoji } from "../outline-emoji";
import { reactionTooltip } from "../../lib/chat/reactions";
import type { ReactionList } from "../../lib/chat/types";

/**
 * The reaction pills under a message, plus the "add reaction" button.
 * Click a pill to toggle your reaction, right-click to see who reacted;
 * shift-click the add button to add an emoji to your quick reactions.
 */
export function MessageReactions({
  reactions,
  emojiMap,
  viewerEmoji,
  pickerOpen,
  onToggle,
  onOpenViewer,
  onOpenPicker,
}: {
  reactions: ReactionList;
  /** Custom server emoji: name -> image URL. */
  emojiMap: Record<string, string>;
  /** The pill whose "who reacted" popover is open on this message, if any. */
  viewerEmoji: string | null;
  /** The reaction picker is open for this message. */
  pickerOpen: boolean;
  onToggle: (emoji: string) => void;
  onOpenViewer: (event: MouseEvent, emoji: string) => void;
  onOpenPicker: (event: MouseEvent, mode: "react" | "addToQuickReactions") => void;
}) {
  return (
    <div className="reactions">
      {reactions.map((reaction) => (
        <button
          type="button"
          key={reaction.emoji}
          className={`reaction outline-reaction-pill ${reaction.mine ? "mine" : ""} ${viewerEmoji === reaction.emoji ? "viewer-open" : ""}`}
          onClick={() => onToggle(reaction.emoji)}
          onContextMenu={(e) => onOpenViewer(e, reaction.emoji)}
          title={reactionTooltip(reaction)}
        >
          {emojiMap[reaction.emoji.replace(/^:|:$/g, "")] ? (
            <img
              className="custom-emoji"
              src={emojiMap[reaction.emoji.replace(/^:|:$/g, "")]}
              alt={reaction.emoji}
            />
          ) : (
            <OutlineEmoji emoji={reaction.emoji} />
          )}
          <b>{reaction.count}</b>
        </button>
      ))}
      <button
        type="button"
        className={`reaction add-reaction-btn ${pickerOpen ? "mine" : ""}`}
        title="Add reaction · Shift-click to add to quick reactions"
        onClick={(e) => {
          if (e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            onOpenPicker(e, "addToQuickReactions");
            return;
          }
          onOpenPicker(e, "react");
        }}
      >
        <SmilePlus size={14} />
      </button>
    </div>
  );
}
