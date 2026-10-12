"use client";

import type { PublicServer } from "@/lib/servers";
import { ServerInvite, Tab } from "./types";

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
}: {
  tab: Tab;
  server: PublicServer;
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

            {loadingInvites ? (
              <p className="pane-subtitle">Loading invites…</p>
            ) : !invites.length ? (
              <p className="pane-subtitle">No invites yet — create one above.</p>
            ) : (
              <ul className="invite-list">
                {invites.map((invite) => (
                  <li key={invite.code} className="invite-row">
                    <code className="invite-code">{invite.code}</code>
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
                          const origin = typeof window !== "undefined" ? window.location.origin : "https://deeppixel.online";
                          const link = `${origin}/hangout?${invite.code}`;
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
