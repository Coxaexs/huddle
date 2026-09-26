"use client";

import { MessageSquare, Plus } from "lucide-react";
import { Avatar } from "./avatar";

/**
 * A forum channel's board.
 *
 * Each card is a top-level message; its replies live in the thread that opens
 * from the card. That mapping is exact rather than approximate: the channel
 * listing already returns only messages with `thread_id IS NULL`.
 *
 * The prop type is structural rather than imported from `chat-shell.tsx`. That
 * file owns its own `Message` interface and imports this component, so sharing
 * the type would create an import cycle for no benefit.
 */
export interface ForumPost {
  /** `string | number` because `chat-shell.tsx` types message ids that way. */
  id: string | number;
  text: string;
  author: string;
  avatar: string;
  avatarUrl?: string | null;
  color: string;
  /** ISO timestamp. Optional because `chat-shell.tsx` types it that way. */
  createdAt?: string;
  /** Replies in this post's thread. */
  threadCount?: number;
  image?: string;
  file?: { url: string; name: string; type: "pdf" };
  audio?: string;
  /** Set on rich cards (polls, bot embeds, now-playing). */
  kind?: string;
  reactions?: Array<{ emoji: string; count: number }>;
  mentions?: string[];
}

export interface ForumBoardProps {
  posts: ForumPost[];
  channelName: string;
  /** False for announcements-style read-only boards. */
  canPost: boolean;
  /**
   * Opening a post takes its id rather than the post itself: chat-shell owns
   * the real `Message` objects, and this component deliberately does not share
   * that type (importing it would cycle).
   */
  onOpenPost: (postId: string | number) => void;
  /** Focuses the composer, where a new post is actually written. */
  onNewPost: () => void;
}

/** Longest heading before it is trimmed with an ellipsis. */
const HEADING_LIMIT = 90;
/** Longest excerpt under a heading. */
const EXCERPT_LIMIT = 160;

function trim(value: string, limit: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 1)}…` : collapsed;
}

/**
 * Splits a post into a heading and an excerpt.
 *
 * The first line becomes the heading because that is how people write a forum
 * post: a title, then the body. An attachment-only post still needs a heading,
 * so it falls back to describing what was attached rather than showing an empty
 * card.
 */
export function postHeading(post: ForumPost): { title: string; excerpt: string } {
  const [first = "", ...rest] = (post.text || "").split("\n");

  if (first.trim()) {
    return { title: trim(first, HEADING_LIMIT), excerpt: trim(rest.join(" "), EXCERPT_LIMIT) };
  }

  if (post.file) return { title: post.file.name, excerpt: "Shared a document" };
  if (post.audio) return { title: "Voice message", excerpt: "" };
  if (post.kind) return { title: post.kind, excerpt: "Rich post" };
  if (post.image) return { title: "Image", excerpt: "" };
  return { title: "Post", excerpt: "" };
}

/** Short absolute date; a board card has no room for a full timestamp. */
export function postDate(createdAt?: string): string {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * What the board lists: real posts, newest first, the way a forum reads.
 * System notices ("X pinned a message") are channel housekeeping, not posts.
 */
export function boardPosts(posts: ForumPost[]): ForumPost[] {
  return posts
    .filter((post) => !post.kind?.startsWith("system-"))
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function ForumBoard({
  posts: allPosts,
  channelName,
  canPost,
  onOpenPost,
  onNewPost,
}: ForumBoardProps) {
  const posts = boardPosts(allPosts);
  return (
    <div className="forum-board">
      <div className="forum-board-head">
        <div>
          <h2 className="forum-board-title">
            <MessageSquare size={15} aria-hidden="true" /> {channelName}
          </h2>
          <p className="forum-board-sub">
            {posts.length} {posts.length === 1 ? "post" : "posts"} · each one opens its own
            thread
          </p>
        </div>
        {canPost && (
          <button type="button" className="forum-new-post" onClick={onNewPost}>
            <Plus size={14} aria-hidden="true" /> New post
          </button>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="forum-empty">
          <MessageSquare size={26} aria-hidden="true" />
          <h3>No posts yet</h3>
          <p>
            {canPost
              ? "Write the first one below. Every post here starts its own thread, so replies stay together."
              : "Nothing has been posted here yet."}
          </p>
        </div>
      ) : (
        <ul className="forum-grid" aria-label={`Posts in ${channelName}`}>
          {posts.map((post) => {
            const { title, excerpt } = postHeading(post);
            const replies = post.threadCount ?? 0;
            return (
              <li key={post.id}>
                <button
                  type="button"
                  className="forum-card"
                  onClick={() => onOpenPost(post.id)}
                  // The card's visible text is a title plus an excerpt; a label
                  // that says whose post and how many replies makes the list
                  // navigable without reading every card.
                  aria-label={`${title}, by ${post.author}, ${replies} ${
                    replies === 1 ? "reply" : "replies"
                  }`}
                >
                  <div className="forum-card-top">
                    <Avatar
                      avatar={post.avatar}
                      avatarUrl={post.avatarUrl}
                      color={post.color}
                      name={post.author}
                      size={26}
                    />
                    <span className="forum-card-author">{post.author}</span>
                    <time className="forum-card-date" dateTime={post.createdAt}>
                      {postDate(post.createdAt)}
                    </time>
                  </div>

                  <h3 className="forum-card-title">{title}</h3>
                  {excerpt && <p className="forum-card-excerpt">{excerpt}</p>}

                  {post.image && (
                    // Decorative here: the card's accessible name already
                    // describes the post, so a second description is noise.
                    <img className="forum-card-thumb" src={post.image} alt="" loading="lazy" />
                  )}

                  <div className="forum-card-foot">
                    <span className={`forum-card-replies ${replies ? "has-replies" : ""}`}>
                      <MessageSquare size={13} aria-hidden="true" /> {replies}
                    </span>
                    {post.reactions?.slice(0, 4).map((reaction) => (
                      <span key={reaction.emoji} className="forum-card-reaction">
                        {reaction.emoji} {reaction.count}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

