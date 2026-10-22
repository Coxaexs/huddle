"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Lock, PartyPopper, X } from "lucide-react";
import type { PublicServer } from "@/lib/servers";
import { MAX_INVITE_USES } from "@/lib/invite-limits";
import { buildUserInviteLink } from "../lib/chat/invites";
import { apiFetch } from "../lib/client";
import { useI18n } from "../lib/i18n-context";

/** Shown once a server has been copied over from Discord (mounted with the chat overlays). */
export const DISCORD_MOVE_EVENT = "hoffle:discord-moved";

export interface DiscordMoveDetail {
  server: Pick<PublicServer, "id" | "name">;
  imported: { categories: number; channels: number; roles: number; privateChannels: string[]; skipped?: number };
}

export function showDiscordMove(detail: DiscordMoveDetail): void {
  window.dispatchEvent(new CustomEvent(DISCORD_MOVE_EVENT, { detail }));
}

export function DiscordMoveDialog() {
  const { t } = useI18n();
  const [detail, setDetail] = useState<DiscordMoveDetail | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<DiscordMoveDetail>).detail;
      if (!next?.server) return;
      setDetail(next);
      setLink("");
      setError("");
      setCopied(false);
      // One invite for the whole group, big enough for a Discord server's worth of people.
      apiFetch<{ invite: { code: string } }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ serverId: next.server.id, maxUses: MAX_INVITE_USES }),
      })
        .then((data) => setLink(buildUserInviteLink(data.invite.code)))
        .catch((err) => setError(err instanceof Error ? err.message : t("discordMove.inviteFailed")));
    };
    window.addEventListener(DISCORD_MOVE_EVENT, open);
    return () => window.removeEventListener(DISCORD_MOVE_EVENT, open);
  }, [t]);

  if (!detail) return null;
  const close = () => setDetail(null);
  const { imported } = detail;
  const message = link ? t("discordMove.message", { server: detail.server.name, link }) : "";
  const copy = () => {
    void navigator.clipboard?.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="custom-dialog-backdrop" onClick={close}>
      <div
        className="forward-dialog-card dmove-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dmove-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="forward-dialog-header">
          <div className="min-w-0 flex items-start gap-2">
            <PartyPopper size={18} className="dmove-icon" />
            <div className="min-w-0">
              <h3 id="dmove-title" className="forward-dialog-title">{t("discordMove.title", { server: detail.server.name })}</h3>
              <p className="forward-dialog-subtitle">
                {t("discordMove.summary", { categories: imported.categories, channels: imported.channels, roles: imported.roles })}
              </p>
            </div>
          </div>
          <button type="button" className="forward-dialog-close" aria-label={t("common.close")} onClick={close}>
            <X size={16} />
          </button>
        </div>

        {imported.privateChannels.length > 0 && (
          <p className="dmove-note">
            <Lock size={13} /> {t("discordMove.private", { channels: imported.privateChannels.map((name) => `#${name}`).join(", ") })}
          </p>
        )}
        {(imported.skipped ?? 0) > 0 && <p className="dmove-note">{t("discordMove.skipped", { count: imported.skipped ?? 0 })}</p>}

        <div className="dmove-step">
          <strong>{t("discordMove.tellThem")}</strong>
          <small>{t("discordMove.tellThemHint")}</small>
        </div>
        {link ? (
          <textarea className="forward-comment-input dmove-message" readOnly rows={5} value={message} onFocus={(event) => event.currentTarget.select()} />
        ) : error ? (
          <p className="auth-error">{error}</p>
        ) : (
          <div className="dmove-loading"><Loader2 size={16} className="animate-spin" /></div>
        )}

        <div className="forward-dialog-footer">
          <button type="button" className="forward-btn-cancel" onClick={close}>{t("discordMove.done")}</button>
          <button type="button" className="forward-btn-submit" disabled={!link} onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? t("common.copied") : t("discordMove.copy")}
          </button>
        </div>
      </div>
    </div>
  );
}
