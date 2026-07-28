"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicRole, PublicServer } from "@/lib/servers";
import type { Member } from "@/lib/users";
import { apiFetch } from "../lib/client";
import { PERMISSION_INFO, type PermissionFlag } from "@/lib/permissions";

interface ServerSettingsDialogProps {
  server: PublicServer;
  members?: Member[];
  canManageServer: boolean;
  onClose: () => void;
  onServerUpdated: () => void;
  onServerDeleted: () => void;
  onRequestPrompt: (options: {
    title: string;
    message?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
    onConfirm: (val?: string) => void;
  }) => void;
  onRequestConfirm: (options: {
    title: string;
    message?: string;
    isDanger?: boolean;
    confirmText?: string;
    onConfirm: () => void;
  }) => void;
  /** True when the viewer created this server (owners delete; others leave). */
  isOwner?: boolean;
  /** Leave this server (non-owners only). */
  onLeaveServer?: () => void;
}

interface ServerInvite {
  code: string;
  createdAt: string;
  maxUses: number;
  uses: number;
  revoked: boolean;
  note: string;
  spent: boolean;
}

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetId: string | null;
  targetName: string | null;
  detail: string | null;
  createdAt: string;
}

/** Human-friendly label for an audit action verb. */
const AUDIT_LABELS: Record<string, string> = {
  "server.create": "created the server",
  "server.update": "updated server settings",
  "channel.create": "created a channel",
  "channel.update": "edited a channel",
  "channel.delete": "deleted a channel",
  "role.create": "created a role",
  "role.update": "edited a role",
  "role.delete": "deleted a role",
  "member.join": "joined",
  "member.leave": "left",
  "member.kick": "kicked a member",
  "member.move": "moved a member",
  "member.ban": "banned a member",
  "member.unban": "unbanned a member",
  "invite.create": "created an invite",
};

type Tab =
  | "profile"
  | "tag"
  | "engagement"
  | "boost"
  | "emoji"
  | "stickers"
  | "soundboard"
  | "members"
  | "roles"
  | "invites"
  | "access"
  | "integrations"
  | "app_directory"
  | "safety"
  | "audit_log"
  | "bans"
  | "automod"
  | "community"
  | "template";

interface CustomEmoji {
  id: string;
  serverId: string;
  name: string;
  url: string;
}

interface ServerBan {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  bannedAt: string;
  bannedBy: string | null;
}

const BANNER_COLORS = [
  { label: "Dark", value: "linear-gradient(135deg, #1e1f29, #111218)" },
  { label: "Soul", value: "linear-gradient(135deg, #ff4081, #ff80ab)" },
  { label: "Crimson", value: "linear-gradient(135deg, #f44336, #ff7961)" },
  { label: "Amber", value: "linear-gradient(135deg, #ff9800, #ffc947)" },
  { label: "Gold", value: "linear-gradient(135deg, #ffeb3b, #fff350)" },
  { label: "Purple", value: "linear-gradient(135deg, #9c27b0, #ba68c8)" },
  { label: "Cyan", value: "linear-gradient(135deg, #00bcd4, #4dd0e1)" },
  { label: "Teal", value: "linear-gradient(135deg, #009688, #4db6ac)" },
  { label: "Green", value: "linear-gradient(135deg, #4caf50, #81c784)" },
  { label: "Charcoal", value: "linear-gradient(135deg, #37474f, #263238)" },
];

export function ServerSettingsDialog({
  server,
  members = [],
  canManageServer,
  onClose,
  onServerUpdated,
  onServerDeleted,
  onRequestPrompt,
  onRequestConfirm,
  isOwner = false,
  onLeaveServer,
}: ServerSettingsDialogProps) {
  const [tab, setTab] = useState<Tab>("profile");
  const [serverName, setServerName] = useState(server.name);
  const [serverColor, setServerColor] = useState(server.color || "#7b63e6");
  const [bannerGradient, setBannerGradient] = useState(BANNER_COLORS[0].value);
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [loadingEmojis, setLoadingEmojis] = useState(false);
  const [uploadingEmoji, setUploadingEmoji] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Roles state
  const [roles, setRoles] = useState<PublicRole[]>(server.roles || []);
  const [activeRole, setActiveRole] = useState<PublicRole | null>(roles[0] || null);
  const [roleSearch, setRoleSearch] = useState("");

  // Bans state
  const [banSearch, setBanSearch] = useState("");
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [loadingBans, setLoadingBans] = useState(false);

  const loadBans = useCallback(async () => {
    setLoadingBans(true);
    try {
      const data = await apiFetch<{ bans: ServerBan[] }>(
        `/api/bans?serverId=${encodeURIComponent(server.id)}`,
      );
      setBans(data.bans || []);
    } catch {
      setBans([]);
    } finally {
      setLoadingBans(false);
    }
  }, [server.id]);

  useEffect(() => {
    if (tab === "bans") void loadBans();
  }, [tab, loadBans]);

  // Audit log state
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const loadAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const data = await apiFetch<{ entries: AuditEntry[] }>(
        `/api/audit?serverId=${encodeURIComponent(server.id)}`,
      );
      setAudit(data.entries || []);
    } catch {
      setAudit([]);
    } finally {
      setLoadingAudit(false);
    }
  }, [server.id]);
  useEffect(() => {
    if (tab === "audit_log") void loadAudit();
  }, [tab, loadAudit]);

  // Server invites state
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const loadInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const data = await apiFetch<{ invites: ServerInvite[] }>(
        `/api/invites?serverId=${encodeURIComponent(server.id)}`,
      );
      setInvites(data.invites || []);
    } catch {
      setInvites([]);
    } finally {
      setLoadingInvites(false);
    }
  }, [server.id]);
  useEffect(() => {
    if (tab === "invites") void loadInvites();
  }, [tab, loadInvites]);

  async function createServerInvite() {
    setCreatingInvite(true);
    try {
      await apiFetch("/api/invites", {
        method: "POST",
        body: JSON.stringify({ serverId: server.id, maxUses: 0 }),
      });
      await loadInvites();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not create an invite.",
      );
    } finally {
      setCreatingInvite(false);
    }
  }

  async function revokeInvite(code: string) {
    try {
      await apiFetch(`/api/invites?code=${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      await loadInvites();
    } catch {
      // Best effort; the list reload would show it still there.
    }
  }

  async function unban(ban: ServerBan) {
    try {
      await apiFetch(`/api/members/${ban.userId}`, {
        method: "POST",
        body: JSON.stringify({ serverId: server.id, action: "unban" }),
      });
      setBans((current) => current.filter((b) => b.userId !== ban.userId));
      setNotice(`${ban.displayName} can rejoin the conversation.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not lift that ban.",
      );
    }
  }

  useEffect(() => {
    setServerName(server.name);
    setServerColor(server.color || "#7b63e6");
    setRoles(server.roles || []);
    setActiveRole((server.roles || [])[0] || null);
  }, [server]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const loadEmojis = () => {
    setLoadingEmojis(true);
    apiFetch<{ emojis: CustomEmoji[] }>(
      `/api/emojis?serverId=${encodeURIComponent(server.id)}`,
    )
      .then((res) => setEmojis(res.emojis || []))
      .catch(() => setNotice("Could not load server emojis"))
      .finally(() => setLoadingEmojis(false));
  };

  useEffect(() => {
    if (tab === "emoji") loadEmojis();
  }, [tab, server.id]);

  const handleSaveProfile = async () => {
    if (!serverName.trim()) return;
    try {
      await apiFetch(`/api/servers/${server.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: serverName.trim(), color: serverColor }),
      });
      onServerUpdated();
      setNotice("Server Profile updated!");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to update profile");
    }
  };

  const handleDeleteServer = () => {
    onRequestConfirm({
      title: `Delete '${server.name}'?`,
      message:
        "Are you sure you want to delete this server? This action cannot be undone.",
      isDanger: true,
      confirmText: "Delete Server",
      onConfirm: async () => {
        try {
          await apiFetch(`/api/servers/${server.id}`, { method: "DELETE" });
          onServerDeleted();
          onClose();
        } catch (e) {
          setNotice(e instanceof Error ? e.message : "Could not delete server");
        }
      },
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const defaultName = file.name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 32);

    onRequestPrompt({
      title: "Upload Custom Emoji",
      message: "Enter emoji name (letters, numbers, underscores):",
      defaultValue: defaultName,
      placeholder: "e.g. party_cat",
      confirmText: "Upload Emoji",
      onConfirm: async (nameVal) => {
        if (!nameVal || !nameVal.trim()) return;
        setUploadingEmoji(true);
        try {
          const form = new FormData();
          form.append("file", file);
          const uploadRes = await apiFetch<{ key: string }>("/api/uploads", {
            method: "POST",
            body: form,
          });
          await apiFetch("/api/emojis", {
            method: "POST",
            body: JSON.stringify({
              serverId: server.id,
              key: uploadRes.key,
              name: nameVal.trim(),
            }),
          });
          loadEmojis();
          onServerUpdated();
          setNotice(`Uploaded emoji :${nameVal.trim()}:`);
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "Failed to add emoji");
        } finally {
          setUploadingEmoji(false);
        }
      },
    });
  };

  const handleDeleteEmoji = (emojiId: string, emojiName: string) => {
    onRequestConfirm({
      title: `Remove :${emojiName}:?`,
      message: "This emoji will be permanently removed from this server.",
      isDanger: true,
      confirmText: "Remove Emoji",
      onConfirm: async () => {
        try {
          await apiFetch(`/api/emojis?id=${encodeURIComponent(emojiId)}`, {
            method: "DELETE",
          });
          loadEmojis();
          onServerUpdated();
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "Could not delete emoji");
        }
      },
    });
  };

  const handleCreateRole = () => {
    onRequestPrompt({
      title: "Create Role",
      message: "Enter a name for the new role:",
      placeholder: "e.g. Moderator",
      confirmText: "Create Role",
      onConfirm: async (roleName) => {
        if (!roleName?.trim()) return;
        try {
          const res = await apiFetch<{ roles: PublicRole[] }>(
            `/api/servers/${server.id}/roles`,
            {
              method: "POST",
              body: JSON.stringify({ name: roleName.trim() }),
            },
          );
          setRoles(res.roles);
          onServerUpdated();
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "Could not create role");
        }
      },
    });
  };

  const toggleRolePermission = async (flag: PermissionFlag) => {
    if (!activeRole || !canManageServer) return;
    const current = activeRole.permissions;
    const nextPerms = (current & flag) === flag ? current & ~flag : current | flag;
    try {
      const res = await apiFetch<{ roles: PublicRole[] }>(
        `/api/servers/${server.id}/roles/${activeRole.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ permissions: nextPerms }),
        },
      );
      setRoles(res.roles);
      setActiveRole(res.roles.find((r) => r.id === activeRole.id) || null);
      onServerUpdated();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update permissions");
    }
  };

  const filteredRoles = roles.filter((r) =>
    r.name.toLowerCase().includes(roleSearch.toLowerCase()),
  );

  return (
    <div className="discord-server-settings-fullscreen">
      {/* Floating ESC Close Button in upper right corner */}
      <button
        type="button"
        className="discord-esc-button"
        onClick={onClose}
        title="Close (ESC)"
      >
        <span className="esc-circle">×</span>
        <span className="esc-label">ESC</span>
      </button>

      {/* Left Sidebar */}
      <aside className="discord-settings-sidebar">
        <div className="sidebar-group-header">{server.name.toUpperCase()}</div>
        <button
          type="button"
          className={`sidebar-item ${tab === "profile" ? "active" : ""}`}
          onClick={() => setTab("profile")}
        >
          Server Profile
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "tag" ? "active" : ""}`}
          onClick={() => setTab("tag")}
        >
          Server Tag
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "engagement" ? "active" : ""}`}
          onClick={() => setTab("engagement")}
        >
          Engagement
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "boost" ? "active" : ""}`}
          onClick={() => setTab("boost")}
        >
          Boost Perks
        </button>

        <div className="sidebar-divider" />
        <div className="sidebar-group-header">EXPRESSION</div>
        <button
          type="button"
          className={`sidebar-item ${tab === "emoji" ? "active" : ""}`}
          onClick={() => setTab("emoji")}
        >
          Emoji
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "stickers" ? "active" : ""}`}
          onClick={() => setTab("stickers")}
        >
          Stickers
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "soundboard" ? "active" : ""}`}
          onClick={() => setTab("soundboard")}
        >
          Soundboard
        </button>

        <div className="sidebar-divider" />
        <div className="sidebar-group-header">PEOPLE</div>
        <button
          type="button"
          className={`sidebar-item ${tab === "members" ? "active" : ""}`}
          onClick={() => setTab("members")}
        >
          Members
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "roles" ? "active" : ""}`}
          onClick={() => setTab("roles")}
        >
          Roles
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "invites" ? "active" : ""}`}
          onClick={() => setTab("invites")}
        >
          Invites
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "access" ? "active" : ""}`}
          onClick={() => setTab("access")}
        >
          Access
        </button>

        <div className="sidebar-divider" />
        <div className="sidebar-group-header">APPS</div>
        <button
          type="button"
          className={`sidebar-item ${tab === "integrations" ? "active" : ""}`}
          onClick={() => setTab("integrations")}
        >
          Integrations
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "app_directory" ? "active" : ""}`}
          onClick={() => setTab("app_directory")}
        >
          App Directory ↗
        </button>

        <div className="sidebar-divider" />
        <div className="sidebar-group-header">MODERATION</div>
        <button
          type="button"
          className={`sidebar-item ${tab === "safety" ? "active" : ""}`}
          onClick={() => setTab("safety")}
        >
          Safety Setup
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "audit_log" ? "active" : ""}`}
          onClick={() => setTab("audit_log")}
        >
          Audit Log
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "bans" ? "active" : ""}`}
          onClick={() => setTab("bans")}
        >
          Bans
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "automod" ? "active" : ""}`}
          onClick={() => setTab("automod")}
        >
          AutoMod
        </button>

        <div className="sidebar-divider" />
        <button
          type="button"
          className={`sidebar-item ${tab === "community" ? "active" : ""}`}
          onClick={() => setTab("community")}
        >
          Enable Community
        </button>
        <button
          type="button"
          className={`sidebar-item ${tab === "template" ? "active" : ""}`}
          onClick={() => setTab("template")}
        >
          Server Template
        </button>

        <div className="sidebar-divider" />
        {/* Owners delete their server; everyone else can leave it. */}
        {isOwner ? (
          canManageServer && (
            <button
              type="button"
              className="sidebar-item danger-item"
              onClick={handleDeleteServer}
            >
              Delete Server 🗑️
            </button>
          )
        ) : (
          <button
            type="button"
            className="sidebar-item danger-item"
            onClick={() =>
              onRequestConfirm({
                title: `Leave ${server.name}?`,
                message:
                  "You will need a fresh invite to come back. Your messages stay.",
                isDanger: true,
                confirmText: "Leave Server",
                onConfirm: () => onLeaveServer?.(),
              })
            }
          >
            Leave Server 🚪
          </button>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="discord-settings-main">
        {notice && <div className="discord-notice-banner">{notice}</div>}

        {/* Tab 1: Server Profile (SS 1) */}
        {tab === "profile" && (
          <div className="tab-pane profile-pane">
            <div className="pane-left">
              <h1 className="pane-title">Server Profile</h1>
              <p className="pane-subtitle">
                Customize how your server appears in invite links and, if enabled, in Server Discovery and Announcement Channel messages
              </p>

              <div className="form-field">
                <label>Name</label>
                <input
                  type="text"
                  className="discord-text-input"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  disabled={!canManageServer}
                />
              </div>

              <div className="form-field">
                <label>Icon</label>
                <p className="field-hint">We recommend an image of at least 512x512.</p>
                <div className="button-group">
                  <button
                    type="button"
                    className="discord-btn primary-indigo"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change Server Icon
                  </button>
                  <button type="button" className="discord-btn secondary-gray">
                    Remove Icon
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label>Banner Gradient</label>
                <div className="banner-swatches">
                  {BANNER_COLORS.map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      className={`banner-swatch ${bannerGradient === b.value ? "selected" : ""}`}
                      style={{ background: b.value }}
                      onClick={() => setBannerGradient(b.value)}
                      title={b.label}
                    />
                  ))}
                </div>
              </div>

              <div className="form-field">
                <label>Traits</label>
                <p className="field-hint">Add up to 5 traits to show off your server's interests and personality.</p>
                <div className="traits-grid">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="trait-box">
                      <span className="trait-icon">🙂</span>
                    </div>
                  ))}
                </div>
              </div>

              {canManageServer && (
                <div className="save-bar-actions">
                  <button
                    type="button"
                    className="discord-btn primary-indigo"
                    onClick={handleSaveProfile}
                  >
                    Save Changes
                  </button>
                </div>
              )}
            </div>

            {/* Right Side Live Server Preview Card (SS 1) */}
            <div className="pane-right-preview">
              <div className="server-card-preview">
                <div
                  className="server-card-banner"
                  style={{ background: bannerGradient }}
                />
                <div className="server-card-content">
                  <div
                    className="server-card-avatar"
                    style={{ background: serverColor }}
                  >
                    <span>{server.icon || serverName.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <h3 className="server-card-name">{serverName}</h3>
                  <div className="server-card-stats">
                    <span className="dot green" /> 5 Online &nbsp;
                    <span className="dot gray" /> {members.length || 12} Members
                  </div>
                  <div className="server-card-est">Est. Jun 2026</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Emoji (SS 2) */}
        {tab === "emoji" && (
          <div className="tab-pane emoji-pane">
            <h1 className="pane-title">Emoji</h1>
            <p className="pane-subtitle">
              Add up to 50 custom emoji that anyone can use in this server. Animated GIF emoji may be used by members with Discord Nitro.
            </p>

            {canManageServer && (
              <div className="emoji-upload-row">
                <button
                  type="button"
                  className="discord-btn primary-indigo"
                  disabled={uploadingEmoji}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingEmoji ? "Uploading..." : "Upload Emoji"}
                </button>
                <p className="drag-drop-note">
                  If you want to upload multiple emojis or skip the editor, drag and drop the file(s) onto this page.
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileSelect}
            />

            {loadingEmojis ? (
              <p className="loading-state">Loading emojis...</p>
            ) : emojis.length > 0 ? (
              <div className="custom-emojis-table">
                <div className="table-head">
                  <span>EMOJI</span>
                  <span>NAME</span>
                  <span>ACTIONS</span>
                </div>
                {emojis.map((emoji) => (
                  <div key={emoji.id} className="table-row">
                    <div className="emoji-preview-col">
                      <img src={emoji.url} alt={emoji.name} className="table-emoji-img" />
                    </div>
                    <div className="emoji-name-col">:{emoji.name}:</div>
                    <div className="emoji-actions-col">
                      {canManageServer && (
                        <button
                          type="button"
                          className="table-action-btn danger"
                          onClick={() => handleDeleteEmoji(emoji.id, emoji.name)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Empty State Graphic (SS 2) */
              <div className="empty-illustration-box">
                <div className="illustration-graphic">
                  <div className="graphic-emojis-cluster">
                    <span>👑</span>
                    <span>😄</span>
                    <span>🥸</span>
                    <span>💀</span>
                  </div>
                </div>
                <h2>NO EMOJI</h2>
                <p>Get the party started by uploading an emoji</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Roles (SS 3) */}
        {tab === "roles" && (
          <div className="tab-pane roles-pane">
            <h1 className="pane-title">Roles</h1>
            <p className="pane-subtitle">Use roles to group your server members and assign permissions.</p>

            <div className="default-permissions-card">
              <div className="card-info">
                <strong>Default Permissions</strong>
                <span>@everyone · applies to all server members</span>
              </div>
              <span className="chevron-arrow">›</span>
            </div>

            <div className="roles-toolbar">
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="discord-search-input"
                  placeholder="Search Roles"
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                />
              </div>
              {canManageServer && (
                <button
                  type="button"
                  className="discord-btn primary-indigo"
                  onClick={handleCreateRole}
                >
                  Create Role
                </button>
              )}
            </div>

            <div className="roles-table-head">
              <span>ROLES - {filteredRoles.length}</span>
              <span>MEMBERS</span>
            </div>

            <div className="roles-list-wrapper">
              {filteredRoles.map((role) => (
                <div
                  key={role.id}
                  className={`role-table-row ${activeRole?.id === role.id ? "selected" : ""}`}
                  onClick={() => setActiveRole(role)}
                >
                  <div className="role-name-col">
                    <span className="drag-dots">⋮⋮</span>
                    <span
                      className="role-shield-icon"
                      style={{ color: role.color || "#99aab5" }}
                    >
                      🛡️
                    </span>
                    <strong>{role.name}</strong>
                  </div>
                  <div className="role-members-col">
                    <span>{members.length} 👤</span>
                  </div>
                  <div className="role-actions-col">
                    <button type="button" className="icon-action-btn" title="Edit Role">
                      ✎
                    </button>
                    <button type="button" className="icon-action-btn" title="More">
                      •••
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {activeRole && canManageServer && (
              <div className="active-role-permissions-editor">
                <h3>Edit Permissions for {activeRole.name}</h3>
                <div className="permissions-toggle-grid">
                  {(Object.keys(PERMISSION_INFO) as unknown as PermissionFlag[]).map((flag) => {
                    const info = PERMISSION_INFO[flag];
                    const enabled = (activeRole.permissions & flag) === flag;
                    return (
                      <label key={flag} className="perm-item-row">
                        <div>
                          <strong>{info.label}</strong>
                          <p>{info.description}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleRolePermission(flag)}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Bans (SS 4) */}
        {tab === "bans" && (
          <div className="tab-pane bans-pane">
            <h1 className="pane-title">Server Ban List</h1>
            <p className="pane-subtitle">
              Bans by default are by account and IP. A user can circumvent an IP ban by using a proxy. Ban circumvention can be made very hard by enabling phone verification in Moderation.
            </p>

            <div className="bans-search-row">
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="discord-search-input"
                  placeholder="Search Bans by User Id or Username"
                  value={banSearch}
                  onChange={(e) => setBanSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="discord-btn primary-indigo"
                onClick={() => void loadBans()}
              >
                Refresh
              </button>
            </div>

            {(() => {
              const term = banSearch.trim().toLowerCase();
              const shown = term
                ? bans.filter(
                    (ban) =>
                      ban.username.toLowerCase().includes(term) ||
                      ban.displayName.toLowerCase().includes(term) ||
                      ban.userId.toLowerCase().includes(term),
                  )
                : bans;

              if (loadingBans) {
                return <p className="pane-subtitle">Loading the ban list…</p>;
              }

              if (!bans.length) {
                return (
                  <div className="bans-empty-card">
                    <div className="ban-hammer-illustration">
                      <span className="hammer-emoji">🔨⚡</span>
                    </div>
                    <h2>NO BANS</h2>
                    <p>
                      You haven&apos;t banned anybody... but if and when you must,
                      do not hesitate!
                    </p>
                  </div>
                );
              }

              if (!shown.length) {
                return <p className="pane-subtitle">Nobody matched that search.</p>;
              }

              return (
                <ul className="ban-list">
                  {shown.map((ban) => (
                    <li key={ban.userId} className="ban-row">
                      <span
                        className="ban-avatar"
                        style={{
                          background: ban.avatarUrl ? undefined : ban.color,
                        }}
                      >
                        {ban.avatarUrl ? (
                          <img src={ban.avatarUrl} alt="" />
                        ) : (
                          ban.avatar
                        )}
                      </span>
                      <span className="ban-who">
                        <strong>{ban.displayName}</strong>
                        <small>
                          @{ban.username}
                          {ban.bannedBy ? ` · banned by ${ban.bannedBy}` : ""}
                          {ban.bannedAt
                            ? ` · ${new Date(ban.bannedAt).toLocaleDateString()}`
                            : ""}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="discord-btn"
                        onClick={() =>
                          onRequestConfirm({
                            title: `Unban ${ban.displayName}?`,
                            message:
                              "They will be able to read and post here again.",
                            confirmText: "Unban",
                            onConfirm: () => void unban(ban),
                          })
                        }
                      >
                        Unban
                      </button>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        )}

        {/* Invites: server-scoped codes that let people join THIS server. */}
        {tab === "invites" && (
          <div className="tab-pane invites-pane">
            <h1 className="pane-title">Invite People</h1>
            <p className="pane-subtitle">
              Share one of these codes to let someone join {server.name}. A code
              with no use limit works until you revoke it.
            </p>
            <button
              type="button"
              className="discord-btn primary-indigo"
              onClick={() => void createServerInvite()}
              disabled={creatingInvite}
            >
              {creatingInvite ? "Creating…" : "Create Invite Code"}
            </button>

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
                        onClick={() =>
                          void navigator.clipboard
                            ?.writeText(invite.code)
                            .then(() => setNotice("Invite code copied."))
                            .catch(() => undefined)
                        }
                      >
                        Copy
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

        {/* Audit log: a real trail of moderation and structure changes. */}
        {tab === "audit_log" && (
          <div className="tab-pane audit-pane">
            <div className="bans-search-row">
              <div>
                <h1 className="pane-title">Audit Log</h1>
                <p className="pane-subtitle">
                  Who did what in {server.name}, newest first.
                </p>
              </div>
              <button
                type="button"
                className="discord-btn primary-indigo"
                onClick={() => void loadAudit()}
              >
                Refresh
              </button>
            </div>

            {loadingAudit ? (
              <p className="pane-subtitle">Loading the audit log…</p>
            ) : !audit.length ? (
              <div className="empty-illustration-box">
                <p>Nothing has happened here yet.</p>
              </div>
            ) : (
              <ul className="audit-list">
                {audit.map((entry) => (
                  <li key={entry.id} className="audit-row">
                    <span className="audit-dot" aria-hidden="true">
                      •
                    </span>
                    <span className="audit-text">
                      <strong>{entry.actorName}</strong>{" "}
                      {AUDIT_LABELS[entry.action] || entry.action}
                      {entry.targetName ? (
                        <>
                          {" "}
                          <em>{entry.targetName}</em>
                        </>
                      ) : null}
                      {entry.detail ? (
                        <span className="audit-detail"> ({entry.detail})</span>
                      ) : null}
                    </span>
                    <time className="audit-time">
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Fallback for other sidebar items */}
        {tab !== "profile" &&
          tab !== "emoji" &&
          tab !== "roles" &&
          tab !== "bans" &&
          tab !== "invites" &&
          tab !== "audit_log" && (
          <div className="tab-pane fallback-pane">
            <h1 className="pane-title">
              {tab.replace("_", " ").toUpperCase()}
            </h1>
            <p className="pane-subtitle">This section is active for {server.name}.</p>
            <div className="empty-illustration-box">
              <p>Settings & Configuration for this module are active.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
