"use client";

import { useMemo, useState } from "react";
import { proxiedImage } from "@/app/lib/image-proxy";
import { MessageSquare, Plus, Tag, X } from "lucide-react";
import { MAX_FORUM_TAGS, MAX_POST_TAGS, TAG_NAME_MAX, type ForumTag } from "@/lib/forum-tags";
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
  /** Who wrote it, so its author can change its tags. */
  userId?: string | null;
  /** The tags the post wears (tag ids from the forum's list). */
  payload?: { forumTags?: string[] } | null;
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
  /** The forum's tags (lib/forum-tags.ts). */
  tags?: ForumTag[];
  /** May edit the tag list (Manage Channels). */
  canManageTags?: boolean;
  onSaveTags?: (tags: ForumTag[]) => Promise<void>;
  /** Tags picked for the next post, sent along when it is posted. */
  draftTags?: string[];
  onDraftTagsChange?: (ids: string[]) => void;
  currentUserId?: string;
  /** May put moderated tags on, and retag anyone's post. */
  canModerate?: boolean;
  onSetPostTags?: (postId: string | number, ids: string[]) => Promise<void>;
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

const NO_TAGS: ForumTag[] = [];
const NO_IDS: string[] = [];

function tagLabel(tag: ForumTag): string {
  return tag.emoji ? `${tag.emoji} ${tag.name}` : tag.name;
}

export function ForumBoard({
  posts: allPosts,
  channelName,
  canPost,
  onOpenPost,
  onNewPost,
  tags = NO_TAGS,
  canManageTags = false,
  onSaveTags,
  draftTags = NO_IDS,
  onDraftTagsChange,
  currentUserId,
  canModerate = false,
  onSetPostTags,
}: ForumBoardProps) {
  const [filter, setFilter] = useState<string[]>([]);
  const [editingList, setEditingList] = useState(false);
  const [editingPost, setEditingPost] = useState<string | number | null>(null);
  const byId = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const tagsOf = (post: ForumPost) => (post.payload?.forumTags || []).filter((id) => byId.has(id));
  // A filter for a tag that has since been deleted filters nothing.
  const activeFilter = filter.filter((id) => byId.has(id));
  const everyPost = boardPosts(allPosts);
  const posts = activeFilter.length
    ? everyPost.filter((post) => tagsOf(post).some((id) => activeFilter.includes(id)))
    : everyPost;
  const pickable = tags.filter((tag) => canModerate || !tag.moderated);
  const draft = draftTags.filter((id) => byId.has(id));

  return (
    <div className="forum-board">
      <div className="forum-board-head">
        <div>
          <h2 className="forum-board-title">
            <MessageSquare size={15} aria-hidden="true" /> {channelName}
          </h2>
          <p className="forum-board-sub">
            {activeFilter.length ? `${posts.length} of ` : ""}
            {everyPost.length} {everyPost.length === 1 ? "post" : "posts"} · each one opens its own
            thread
          </p>
        </div>
        <div className="forum-board-actions">
          {canManageTags && onSaveTags && !editingList && (
            <button type="button" className="forum-edit-tags" onClick={() => setEditingList(true)}>
              <Tag size={13} aria-hidden="true" /> {tags.length ? "Edit tags" : "Add tags"}
            </button>
          )}
          {canPost && (
            <button type="button" className="forum-new-post" onClick={onNewPost}>
              <Plus size={14} aria-hidden="true" /> New post
            </button>
          )}
        </div>
      </div>

      {editingList && onSaveTags && (
        <TagListEditor
          tags={tags}
          onCancel={() => setEditingList(false)}
          onSave={async (next) => {
            await onSaveTags(next);
            setEditingList(false);
          }}
        />
      )}

      {!editingList && tags.length > 0 && (
        <div className="forum-tagbar" role="group" aria-label="Show posts with these tags">
          {tags.map((tag) => {
            const on = activeFilter.includes(tag.id);
            return (
              <button
                type="button"
                key={tag.id}
                className="forum-tag"
                aria-pressed={on}
                onClick={() => setFilter((current) => (on ? current.filter((id) => id !== tag.id) : [...current, tag.id]))}
              >
                {tagLabel(tag)}
              </button>
            );
          })}
          {activeFilter.length > 0 && (
            <button type="button" className="forum-tag-clear" onClick={() => setFilter([])}>
              Show all
            </button>
          )}
        </div>
      )}

      {!editingList && canPost && onDraftTagsChange && pickable.length > 0 && (
        <div className="forum-tagbar forum-draft-tags" role="group" aria-label="Tags for your next post">
          <span className="forum-tagbar-label">Your next post:</span>
          {pickable.map((tag) => {
            const on = draft.includes(tag.id);
            return (
              <button
                type="button"
                key={tag.id}
                className="forum-tag"
                aria-pressed={on}
                disabled={!on && draft.length >= MAX_POST_TAGS}
                onClick={() => onDraftTagsChange(on ? draft.filter((id) => id !== tag.id) : [...draft, tag.id])}
              >
                {tagLabel(tag)}
              </button>
            );
          })}
        </div>
      )}

      {posts.length === 0 ? (
        <div className="forum-empty">
          <MessageSquare size={26} aria-hidden="true" />
          {activeFilter.length ? (
            <>
              <h3>No posts with these tags</h3>
              <p>Pick other tags, or show all posts.</p>
            </>
          ) : (
            <>
              <h3>No posts yet</h3>
              <p>
                {canPost
                  ? "Write the first one below. Every post here starts its own thread, so replies stay together."
                  : "Nothing has been posted here yet."}
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="forum-grid" aria-label={`Posts in ${channelName}`}>
          {posts.map((post) => {
            const { title, excerpt } = postHeading(post);
            const replies = post.threadCount ?? 0;
            const postTags = tagsOf(post);
            const mayRetag =
              Boolean(onSetPostTags) && tags.length > 0 && (canModerate || (Boolean(currentUserId) && post.userId === currentUserId));
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
                  {postTags.length > 0 && (
                    <span className="forum-card-tags">
                      {postTags.map((id) => (
                        <span key={id} className="forum-tag small">
                          {tagLabel(byId.get(id)!)}
                        </span>
                      ))}
                    </span>
                  )}
                  {excerpt && <p className="forum-card-excerpt">{excerpt}</p>}

                  {post.image && (
                    // Decorative here: the card's accessible name already
                    // describes the post, so a second description is noise.
                    <img className="forum-card-thumb" src={proxiedImage(post.image)} alt="" loading="lazy" />
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
                {mayRetag && editingPost !== post.id && (
                  <button
                    type="button"
                    className="forum-card-edit-tags"
                    aria-label={`Change tags on ${title}`}
                    onClick={() => setEditingPost(post.id)}
                  >
                    <Tag size={12} aria-hidden="true" /> Tags
                  </button>
                )}
                {mayRetag && editingPost === post.id && onSetPostTags && (
                  <PostTagsEditor
                    title={title}
                    tags={tags}
                    current={postTags}
                    canModerate={canModerate}
                    onCancel={() => setEditingPost(null)}
                    onSave={async (ids) => {
                      await onSetPostTags(post.id, ids);
                      setEditingPost(null);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Picks a post's tags: moderated ones stay as they are unless you moderate. */
function PostTagsEditor({
  title,
  tags,
  current,
  canModerate,
  onSave,
  onCancel,
}: {
  title: string;
  tags: ForumTag[];
  current: string[];
  canModerate: boolean;
  onSave: (ids: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(current);
  const [saving, setSaving] = useState(false);
  return (
    <div className="forum-post-tags-editor" role="group" aria-label={`Tags on ${title}`}>
      <div className="forum-tagbar">
        {tags.map((tag) => {
          const on = picked.includes(tag.id);
          const locked = Boolean(tag.moderated) && !canModerate;
          return (
            <button
              type="button"
              key={tag.id}
              className="forum-tag"
              aria-pressed={on}
              disabled={locked || (!on && picked.length >= MAX_POST_TAGS)}
              title={locked ? "Only moderators can change this tag" : undefined}
              onClick={() => setPicked((ids) => (on ? ids.filter((id) => id !== tag.id) : [...ids, tag.id]))}
            >
              {tagLabel(tag)}
            </button>
          );
        })}
      </div>
      <div className="forum-tag-editor-actions">
        <button type="button" className="forum-tag-clear" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="forum-new-post"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(picked);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/** The forum's tag list, for people who manage the channel. */
function TagListEditor({
  tags,
  onSave,
  onCancel,
}: {
  tags: ForumTag[];
  onSave: (tags: ForumTag[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<ForumTag[]>(() => tags.map((tag) => ({ ...tag })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const change = (index: number, patch: Partial<ForumTag>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <form
      className="forum-tag-editor"
      aria-label="Forum tags"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
          await onSave(rows.filter((row) => row.name.trim()));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save the tags.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="forum-tag-editor-hint">
        Up to {MAX_FORUM_TAGS} tags; a post can wear {MAX_POST_TAGS}. Moderated tags can only be put on
        or taken off by moderators.
      </p>
      {rows.length > 0 && (
        <ul>
          {rows.map((row, index) => (
            <li key={row.id} className="forum-tag-editor-row">
              <input
                type="text"
                className="forum-tag-emoji-input"
                aria-label={`Emoji for tag ${index + 1}`}
                placeholder="🏷️"
                value={row.emoji || ""}
                onChange={(event) => change(index, { emoji: event.target.value })}
              />
              <input
                type="text"
                aria-label={`Name of tag ${index + 1}`}
                placeholder="Tag name"
                maxLength={TAG_NAME_MAX}
                value={row.name}
                onChange={(event) => change(index, { name: event.target.value })}
              />
              <label className="forum-tag-moderated">
                <input
                  type="checkbox"
                  checked={Boolean(row.moderated)}
                  onChange={(event) => change(index, { moderated: event.target.checked })}
                />
                Moderated
              </label>
              <button
                type="button"
                className="forum-tag-remove"
                aria-label={`Remove ${row.name || `tag ${index + 1}`}`}
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="forum-tag-editor-actions">
        <button
          type="button"
          className="forum-tag-clear"
          disabled={rows.length >= MAX_FORUM_TAGS}
          onClick={() =>
            setRows((current) => [...current, { id: `new${Date.now().toString(36)}${current.length}`, name: "" }])
          }
        >
          <Plus size={13} aria-hidden="true" /> Add tag
        </button>
        <span className="forum-tag-editor-spacer" />
        <button type="button" className="forum-tag-clear" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="forum-new-post" disabled={saving}>
          {saving ? "Saving…" : "Save tags"}
        </button>
      </div>
      {error && (
        <p className="forum-tag-editor-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
