"use client";

import { INVITE_USE_CHOICES } from "@/lib/invite-limits";
import { Avatar } from "../avatar";
import { BUILTIN_THEMES, findThemeById } from "@/lib/themes";
import type { PublicServer } from "@/lib/servers";
import { type PublicUser } from "@/lib/users";
import { buildUserInviteLink } from "../../lib/chat/invites";
import { Invite, Tab } from "./types";

export function InvitesTab({
  tab,
  inviteTheme,
  setInviteTheme,
  inviteServer,
  setInviteServer,
  inviteServers,
  inviteUses,
  setInviteUses,
  createInvite,
  invites,
  setStatus,
  revokeInvite,
  user,
  permissionSearch,
  setPermissionSearch,
  permissionUsers,
  toggleInvitePermission,
  updatingPermission,
}: {
  tab: Tab;
  inviteTheme: string;
  setInviteTheme: React.Dispatch<React.SetStateAction<string>>;
  inviteServer: string;
  setInviteServer: React.Dispatch<React.SetStateAction<string>>;
  inviteServers: PublicServer[];
  inviteUses: number;
  setInviteUses: React.Dispatch<React.SetStateAction<number>>;
  createInvite: () => Promise<void>;
  invites: Invite[];
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  revokeInvite: (code: string) => Promise<void>;
  user: PublicUser;
  permissionSearch: string;
  setPermissionSearch: React.Dispatch<React.SetStateAction<string>>;
  permissionUsers: { id: string; username: string; displayName: string; avatar: string; avatarUrl: string | null; color: string; isAdmin: boolean; canInvite: boolean; }[];
  toggleInvitePermission: (targetUserId: string, currentCanInvite: boolean) => Promise<void>;
  updatingPermission: string | null;
}) {
  return (
    <>
      {tab === "invites" && (
            <>
              <p className="modal-hint">
                Anyone with a code can create an account here. Pick the theme
                they start with and a server they join right away.
              </p>
              <div className="invite-defaults">
                <label>
                  Default theme
                  <select
                    value={inviteTheme}
                    onChange={(event) => setInviteTheme(event.target.value)}
                  >
                    <option value="">Their own choice</option>
                    {BUILTIN_THEMES.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Default server
                  <select
                    value={inviteServer}
                    onChange={(event) => setInviteServer(event.target.value)}
                  >
                    <option value="">None</option>
                    {inviteServers.map((server) => (
                      <option key={server.id} value={server.id}>
                        {server.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Uses
                  <select
                    value={inviteUses}
                    onChange={(event) => setInviteUses(Number(event.target.value))}
                  >
                    {INVITE_USE_CHOICES.map((uses) => (
                      <option key={uses} value={uses}>
                        {uses === 0 ? "No limit" : uses === 1 ? "1 person" : `${uses} people`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="button" className="primary" onClick={createInvite}>
                Create an invite code
              </button>
              <ul className="invite-list">
                {invites.map((invite) => (
                  <li key={invite.code}>
                    <code>{invite.code}</code>
                    {(invite.defaultTheme || invite.defaultServerId) && (
                      <span className="invite-defaults-tag">
                        {[
                          invite.defaultTheme &&
                            (findThemeById(invite.defaultTheme)?.name ||
                              invite.defaultTheme),
                          invite.defaultServerId &&
                            (inviteServers.find(
                              (server) => server.id === invite.defaultServerId,
                            )?.name || invite.defaultServerId),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    <span>
                      {invite.revoked
                        ? "revoked"
                        : invite.spent
                          ? "used"
                          : `${invite.uses}/${invite.maxUses || "∞"} used`}
                    </span>
                    <div className="invite-actions">
                      <button
                        type="button"
                        onClick={() => {
                          const link = buildUserInviteLink(invite.code);
                          void navigator.clipboard
                            ?.writeText(link)
                            .then(() => {
                              setStatus("Invite link copied to clipboard.");
                              window.setTimeout(() => setStatus(""), 2500);
                            })
                            .catch(() => undefined);
                        }}
                      >
                        Copy Link
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(invite.code)
                            .then(() => {
                              setStatus("Invite code copied to clipboard.");
                              window.setTimeout(() => setStatus(""), 2500);
                            })
                            .catch(() => undefined);
                        }}
                      >
                        Copy Code
                      </button>
                      {!invite.revoked && !invite.spent && (
                        <button
                          type="button"
                          onClick={() => revokeInvite(invite.code)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </li>
                ))}
                {!invites.length && (
                  <li className="empty">No codes yet.</li>
                )}
              </ul>

              {user.isAdmin && (
                <div
                  className="invite-permissions-container"
                  style={{
                    marginTop: "24px",
                    paddingTop: "20px",
                    borderTop: "1px solid #41434f",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#fff",
                      marginBottom: "4px",
                    }}
                  >
                    Invite Creation Permissions
                  </h3>
                  <p className="modal-hint" style={{ marginBottom: "12px" }}>
                    Only you (the first created user/owner) and selected members can
                    create invite codes. Choose who else is authorized to create
                    invites below.
                  </p>
                  <input
                    type="text"
                    placeholder="Filter members by name..."
                    value={permissionSearch}
                    onChange={(e) => setPermissionSearch(e.target.value)}
                    style={{ marginBottom: "12px", width: "100%" }}
                  />
                  <div
                    style={{
                      maxHeight: "220px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {permissionUsers
                      .filter((u) => {
                        if (!permissionSearch) return true;
                        const term = permissionSearch.toLowerCase();
                        return (
                          u.displayName.toLowerCase().includes(term) ||
                          u.username.toLowerCase().includes(term)
                        );
                      })
                      .map((u) => (
                        <div
                          key={u.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            background: "rgba(255, 255, 255, 0.04)",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.06)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                            }}
                          >
                            <Avatar
                              avatar={u.avatar}
                              avatarUrl={u.avatarUrl}
                              color={u.color}
                              size={28}
                            />
                            <div>
                              <span
                                style={{
                                  fontWeight: 500,
                                  color: "#fff",
                                  fontSize: "13px",
                                }}
                              >
                                {u.displayName}
                              </span>{" "}
                              <span
                                style={{
                                  color: "var(--muted)",
                                  fontSize: "12px",
                                }}
                              >
                                @{u.username}
                              </span>
                            </div>
                          </div>

                          {u.isAdmin ? (
                            <span
                              style={{
                                fontSize: "11px",
                                padding: "3px 8px",
                                borderRadius: "4px",
                                background: "rgba(235, 185, 50, 0.15)",
                                color: "#ffd67c",
                                fontWeight: 600,
                              }}
                            >
                              Owner (Always Allowed)
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void toggleInvitePermission(u.id, u.canInvite)
                              }
                              disabled={updatingPermission === u.id}
                              style={{
                                fontSize: "12px",
                                padding: "4px 12px",
                                borderRadius: "6px",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                background: u.canInvite
                                  ? "rgba(87, 242, 135, 0.2)"
                                  : "rgba(255, 255, 255, 0.08)",
                                color: u.canInvite ? "#57f287" : "#aaaeba",
                                border: u.canInvite
                                  ? "1px solid rgba(87, 242, 135, 0.4)"
                                  : "1px solid #4b4d5b",
                              }}
                            >
                              {updatingPermission === u.id
                                ? "Updating…"
                                : u.canInvite
                                  ? "✓ Can Invite"
                                  : "+ Allow Invite"}
                            </button>
                          )}
                        </div>
                      ))}
                    {permissionUsers.length === 0 && (
                      <p className="modal-hint" style={{ textAlign: "center" }}>
                        Loading members…
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
    </>
  );
}
