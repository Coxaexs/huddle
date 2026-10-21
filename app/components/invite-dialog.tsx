"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Hash, Loader2, Search, X } from "lucide-react";
import { Avatar } from "./avatar";
import { apiFetch } from "../lib/client";
import { buildUserInviteLink } from "../lib/chat/invites";
import { useI18n } from "@/app/lib/i18n-context";
import type { FriendUser } from "@/lib/friends";
import { GROUP_INVITE_USES, INVITE_USE_CHOICES } from "@/lib/invite-limits";
import type { DmSummary } from "../lib/chat/types";

/** How many joins a link from this dialog allows until someone picks otherwise. */
const DEFAULT_USES = GROUP_INVITE_USES;

interface InviteDialogProps {
  open: boolean;
  server: { id: string; name: string } | null;
  /** The text channel people land in; null leaves them on the server's first channel. */
  channel: { id: string; name: string } | null;
  /** Already in the server: listed, but with nothing to send. */
  memberIds: Set<string>;
  onClose: () => void;
  /** Sending an invite opens (or reopens) your DM with that friend. */
  onDmsChanged?: (conversations: DmSummary[]) => void;
}

interface Invite {
  code: string;
  maxUses: number;
  uses: number;
}

type SendState = "sending" | "sent" | "failed";

/**
 * Discord's "Invite friends to <server>": friends with an Invite button that
 * DMs them the link, and the link itself to copy. The link is your own
 * reusable one for this server and channel, so opening this again hands back
 * the same link instead of making another.
 */
export function InviteDialog({ open, server, channel, memberIds, onClose, onDmsChanged }: InviteDialogProps) {
  const { t } = useI18n();
  const [friends, setFriends] = useState<FriendUser[] | null>(null);
  const [query, setQuery] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, SendState>>({});
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [maxUses, setMaxUses] = useState(DEFAULT_USES);
  const [generating, setGenerating] = useState(false);

  const serverId = server?.id;
  const channelId = channel?.id;

  async function loadInvite(uses: number, reuse: boolean) {
    if (!serverId) return;
    setInviteError(null);
    try {
      const data = await apiFetch<{ invite: Invite }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ serverId, channelId, maxUses: uses, reuse }),
      });
      setInvite(data.invite);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : t("inviteModal.failed"));
    }
  }

  useEffect(() => {
    if (!open || !serverId) return;
    setQuery("");
    setSent({});
    setCopied(false);
    setEditing(false);
    setMaxUses(DEFAULT_USES);
    setInvite(null);
    setFriends(null);
    apiFetch<{ friends: FriendUser[] }>("/api/friends")
      .then((data) => setFriends(data.friends || []))
      .catch(() => setFriends([]));
    void loadInvite(DEFAULT_USES, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serverId, channelId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Friends you can still invite first, then those already in the server.
    return (friends || [])
      .filter((friend) => !q || friend.displayName.toLowerCase().includes(q) || friend.username.toLowerCase().includes(q))
      .sort((a, b) => Number(memberIds.has(a.id)) - Number(memberIds.has(b.id)));
  }, [friends, query, memberIds]);

  if (!open || !server) return null;

  const link = invite ? buildUserInviteLink(invite.code) : "";

  async function send(friend: FriendUser) {
    if (!link || sent[friend.id] === "sending" || sent[friend.id] === "sent") return;
    setSent((current) => ({ ...current, [friend.id]: "sending" }));
    try {
      const dm = await apiFetch<{ channelId: string; conversations: DmSummary[] }>("/api/dms", {
        method: "POST",
        body: JSON.stringify({ userId: friend.id }),
      });
      await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({ channelId: dm.channelId, content: link }),
      });
      onDmsChanged?.(dm.conversations);
      setSent((current) => ({ ...current, [friend.id]: "sent" }));
    } catch {
      setSent((current) => ({ ...current, [friend.id]: "failed" }));
    }
  }

  async function copy() {
    if (!link) return;
    const ok = await navigator.clipboard
      ?.writeText(link)
      .then(() => true)
      .catch(() => false);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function generate() {
    setGenerating(true);
    await loadInvite(maxUses, false);
    setGenerating(false);
    setEditing(false);
  }

  const usesLeft = invite ? Math.max(0, invite.maxUses - invite.uses) : 0;

  return (
    <div className="custom-dialog-backdrop" onClick={onClose}>
      <div
        className="forward-dialog-card invite-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="forward-dialog-header">
          <div className="min-w-0 flex items-start gap-2">
            {editing && (
              <button
                type="button"
                className="forward-dialog-close"
                aria-label={t("common.back")}
                onClick={() => setEditing(false)}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="min-w-0">
              <h3 id="invite-dialog-title" className="forward-dialog-title invite-dialog-title">
                {editing ? t("inviteModal.settings") : t("inviteModal.title", { server: server.name })}
              </h3>
              {!editing && channel && (
                <p className="forward-dialog-subtitle invite-dialog-subtitle">
                  {t("inviteModal.landIn")}{" "}
                  <span className="invite-dialog-channel">
                    <Hash size={13} />
                    {channel.name}
                  </span>
                </p>
              )}
            </div>
          </div>
          <button type="button" className="forward-dialog-close" aria-label={t("common.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {editing ? (
          <div className="invite-dialog-edit">
            <label className="invite-dialog-label" htmlFor="invite-dialog-uses">
              {t("inviteModal.maxUses")}
            </label>
            <select
              id="invite-dialog-uses"
              className="forward-comment-input"
              value={maxUses}
              onChange={(event) => setMaxUses(Number(event.target.value))}
            >
              {INVITE_USE_CHOICES.map((uses) => (
                <option key={uses} value={uses}>
                  {t("inviteModal.usesOption", { count: uses })}
                </option>
              ))}
            </select>
            <div className="forward-dialog-footer">
              <button type="button" className="forward-btn-cancel" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </button>
              <button type="button" className="forward-btn-submit" disabled={generating} onClick={() => void generate()}>
                {generating ? <Loader2 size={14} className="animate-spin" /> : null}
                {t("inviteModal.generate")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="forward-search-wrap">
              <Search size={14} className="forward-search-icon" />
              <input
                autoFocus
                className="forward-search-input"
                placeholder={t("inviteModal.search")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="forward-dest-list invite-dialog-list">
              {friends === null ? (
                <div className="forward-dest-empty">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : !shown.length ? (
                <div className="forward-dest-empty">
                  {friends.length ? t("inviteModal.noMatch") : t("inviteModal.noFriends")}
                </div>
              ) : (
                shown.map((friend) => {
                  const member = memberIds.has(friend.id);
                  const state = sent[friend.id];
                  return (
                    <div key={friend.id} className="invite-dialog-row">
                      <Avatar
                        avatar={friend.avatar}
                        avatarUrl={friend.avatarUrl}
                        color={friend.color}
                        size={36}
                        className="flex-shrink-0"
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="forward-dest-name truncate">{friend.displayName}</span>
                        <span className="forward-dest-sub truncate">{friend.username}</span>
                      </div>
                      <button
                        type="button"
                        className={`invite-dialog-send ${state === "sent" ? "is-sent" : ""}`}
                        disabled={member || !link || state === "sending" || state === "sent"}
                        onClick={() => void send(friend)}
                      >
                        {member
                          ? t("inviteModal.member")
                          : state === "sending"
                            ? <Loader2 size={14} className="animate-spin" />
                            : state === "sent"
                              ? t("inviteModal.sent")
                              : state === "failed"
                                ? t("common.retry")
                                : t("inviteModal.invite")}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="invite-dialog-link-section">
              <div className="invite-dialog-label">{t("inviteModal.shareLink")}</div>
              <div className={`invite-dialog-link ${copied ? "is-copied" : ""}`}>
                <input
                  readOnly
                  aria-label={t("inviteModal.shareLink")}
                  value={inviteError ? "" : link}
                  placeholder={inviteError || "…"}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" disabled={!link} onClick={() => void copy()}>
                  {copied ? t("inviteModal.copied") : t("inviteModal.copy")}
                </button>
              </div>
              {invite && (
                <p className="invite-dialog-hint">
                  {t("inviteModal.usesLeft", { count: usesLeft })}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMaxUses(invite.maxUses);
                      setEditing(true);
                    }}
                  >
                    {t("inviteModal.edit")}
                  </button>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
