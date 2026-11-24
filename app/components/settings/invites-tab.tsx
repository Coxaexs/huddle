"use client";

import { INVITE_USE_CHOICES } from "@/lib/invite-limits";
import { Avatar } from "../avatar";
import { BUILTIN_THEMES, findThemeById } from "@/lib/themes";
import type { PublicServer } from "@/lib/servers";
import { type PublicUser } from "@/lib/users";
import { buildUserInviteLink } from "../../lib/chat/invites";
import { useI18n } from "../../lib/i18n-context";
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
  const { t } = useI18n();
  return (
    <>
      {tab === "invites" && (
            <>
              <p className="modal-hint">
                {t("settings.invites.intro")}
              </p>
              <div className="invite-defaults">
                <label>
                  {t("settings.invites.defaultTheme")}
                  <select
                    value={inviteTheme}
                    onChange={(event) => setInviteTheme(event.target.value)}
                  >
                    <option value="">{t("settings.invites.theirChoice")}</option>
                    {BUILTIN_THEMES.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("settings.invites.defaultServer")}
                  <select
                    value={inviteServer}
                    onChange={(event) => setInviteServer(event.target.value)}
                  >
                    <option value="">{t("settings.invites.none")}</option>
                    {inviteServers.map((server) => (
                      <option key={server.id} value={server.id}>
                        {server.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("settings.invites.uses")}
                  <select
                    value={inviteUses}
                    onChange={(event) => setInviteUses(Number(event.target.value))}
                  >
                    {INVITE_USE_CHOICES.map((uses) => (
                      <option key={uses} value={uses}>
                        {uses === 1 ? t("settings.invites.onePerson") : t("settings.invites.manyPeople", { count: uses })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="button" className="primary" onClick={createInvite}>
                {t("settings.invites.createBtn")}
              </button>
              <ul className="invite-list">
                {invites.map((invite) => (
                  <li key={invite.code}>
                    <code data-streamer-hide>{invite.code}</code>
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
                        ? t("settings.invites.revoked")
                        : invite.spent
                          ? t("settings.invites.used")
                          : t("settings.invites.usesCount", { used: invite.uses, max: invite.maxUses || "∞" })}
                    </span>
                    <div className="invite-actions">
                      <button
                        type="button"
                        onClick={() => {
                          const link = buildUserInviteLink(invite.code);
                          void navigator.clipboard
                            ?.writeText(link)
                            .then(() => {
                              setStatus(t("settings.invites.linkCopied"));
                              window.setTimeout(() => setStatus(""), 2500);
                            })
                            .catch(() => undefined);
                        }}
                      >
                        {t("settings.invites.copyLink")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(invite.code)
                            .then(() => {
                              setStatus(t("settings.invites.codeCopied"));
                              window.setTimeout(() => setStatus(""), 2500);
                            })
                            .catch(() => undefined);
                        }}
                      >
                        {t("settings.invites.copyCode")}
                      </button>
                      {!invite.revoked && !invite.spent && (
                        <button
                          type="button"
                          onClick={() => revokeInvite(invite.code)}
                        >
                          {t("settings.invites.revoke")}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
                {!invites.length && (
                  <li className="empty">{t("settings.invites.empty")}</li>
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
                    {t("settings.invites.permsTitle")}
                  </h3>
                  <p className="modal-hint" style={{ marginBottom: "12px" }}>
                    {t("settings.invites.permsDesc")}
                  </p>
                  <input
                    type="text"
                    placeholder={t("settings.invites.filterPlaceholder")}
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
                              {t("settings.invites.ownerAlways")}
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
                                ? t("settings.invites.updating")
                                : u.canInvite
                                  ? t("settings.invites.canInvite")
                                  : t("settings.invites.allowInvite")}
                            </button>
                          )}
                        </div>
                      ))}
                    {permissionUsers.length === 0 && (
                      <p className="modal-hint" style={{ textAlign: "center" }}>
                        {t("settings.invites.loadingMembers")}
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
