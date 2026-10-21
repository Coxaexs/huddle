"use client";

import { useEffect, useState } from "react";
import type { PublicServer } from "@/lib/servers";
import { VANITY_MAX } from "@/lib/vanity";
import { apiFetch } from "../../lib/client";
import { buildUserInviteLink } from "../../lib/chat/invites";
import { useI18n } from "../../lib/i18n-context";
import { ServerInvite, Tab } from "./types";

/** The server's own invite code: set, change or remove it (MANAGE_SERVER). */
function VanityInviteCard({
  server,
  canManageServer,
  onServerUpdated,
  setNotice,
}: {
  server: PublicServer;
  canManageServer: boolean;
  onServerUpdated: () => void;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
}) {
  const { t } = useI18n();
  const current = server.vanityCode || "";
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(current), [current]);

  const save = async (code: string | null) => {
    setSaving(true);
    try {
      await apiFetch(`/api/servers/${server.id}`, {
        method: "PATCH",
        body: JSON.stringify({ vanityCode: code }),
      });
      onServerUpdated();
      setNotice(code ? t("vanity.saved") : t("vanity.removed"));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("vanity.failed"));
    } finally {
      setSaving(false);
    }
  };

  if (!canManageServer && !current) return null;
  const link = current ? buildUserInviteLink(current) : "";
  return (
    <div className="vanity-invite-card" style={{ margin: "16px 0", display: "grid", gap: "8px" }}>
      <strong>{t("vanity.title")}</strong>
      <p className="pane-subtitle" style={{ margin: 0 }}>{t("vanity.desc")}</p>
      {canManageServer && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <input
            type="text"
            className="discord-search-input"
            style={{ flex: "1 1 180px", textTransform: "uppercase" }}
            placeholder={t("vanity.placeholder")}
            value={draft}
            maxLength={VANITY_MAX}
            onChange={(e) => setDraft(e.target.value.replace(/\s+/g, "-"))}
            data-streamer-hide
          />
          <button
            type="button"
            className="discord-btn primary-indigo"
            disabled={saving || !draft.trim() || draft.trim().toUpperCase() === current}
            onClick={() => void save(draft.trim())}
          >
            {t("vanity.save")}
          </button>
          {current && (
            <button type="button" className="discord-btn" disabled={saving} onClick={() => void save(null)}>
              {t("vanity.remove")}
            </button>
          )}
        </div>
      )}
      {link && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <code className="invite-code" data-streamer-hide>{link}</code>
          <button
            type="button"
            className="discord-btn"
            onClick={() => {
              void navigator.clipboard?.writeText(link).catch(() => undefined);
              setNotice(t("vanity.copied"));
            }}
          >
            {t("vanity.copy")}
          </button>
        </div>
      )}
    </div>
  );
}

export function ServerInvitesTab({
  tab,
  server,
  canCreateInvites,
  createServerInvite,
  creatingInvite,
  loadingInvites,
  invites,
  setNotice,
  revokeInvite,
  canManageServer = false,
  onServerUpdated = () => undefined,
}: {
  tab: Tab;
  server: PublicServer;
  canManageServer?: boolean;
  onServerUpdated?: () => void;
  canCreateInvites: boolean;
  createServerInvite: () => Promise<void>;
  creatingInvite: boolean;
  loadingInvites: boolean;
  invites: ServerInvite[];
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  revokeInvite: (code: string) => Promise<void>;
}) {
  return (
    <>
      {tab === "invites" && (
          <div className="tab-pane invites-pane">
            <h1 className="pane-title">Invite People</h1>
            <p className="pane-subtitle">
              Share one of these codes to let someone join {server.name}. A code
              with no use limit works until you revoke it.
            </p>
            {canCreateInvites ? (
              <button
                type="button"
                className="discord-btn primary-indigo"
                onClick={() => void createServerInvite()}
                disabled={creatingInvite}
              >
                {creatingInvite ? "Creating…" : "Create Invite Code"}
              </button>
            ) : (
              <p className="pane-subtitle" style={{ color: "#f0b232", marginTop: "8px" }}>
                Only the server owner and designated members can create invite codes.
              </p>
            )}

            <VanityInviteCard
              server={server}
              canManageServer={canManageServer}
              onServerUpdated={onServerUpdated}
              setNotice={setNotice}
            />

            {loadingInvites ? (
              <p className="pane-subtitle">Loading invites…</p>
            ) : !invites.length ? (
              <p className="pane-subtitle">No invites yet — create one above.</p>
            ) : (
              <ul className="invite-list">
                {invites.map((invite) => (
                  <li key={invite.code} className="invite-row">
                    <code className="invite-code" data-streamer-hide>{invite.code}</code>
                    <span className="invite-meta">
                      {invite.revoked
                        ? "revoked"
                        : invite.spent
                          ? "used up"
                          : invite.maxUses > 0
                            ? `${invite.uses}/${invite.maxUses} uses`
                            : `${invite.uses} uses · unlimited`}
                    </span>
                    <div className="invite-actions">
                      <button
                        type="button"
                        className="discord-btn"
                        onClick={() => {
                          const link = buildUserInviteLink(invite.code);
                          void navigator.clipboard
                            ?.writeText(link)
                            .then(() => setNotice("Invite link copied to clipboard."))
                            .catch(() => undefined);
                        }}
                      >
                        Copy Link
                      </button>
                      <button
                        type="button"
                        className="discord-btn secondary"
                        onClick={() =>
                          void navigator.clipboard
                            ?.writeText(invite.code)
                            .then(() => setNotice("Invite code copied."))
                            .catch(() => undefined)
                        }
                      >
                        Copy Code
                      </button>
                      {!invite.revoked && (
                        <button
                          type="button"
                          className="discord-btn danger-btn"
                          onClick={() => void revokeInvite(invite.code)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
    </>
  );
}
