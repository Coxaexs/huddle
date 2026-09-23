"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Trash2, Shield, GripVertical, Users, Pencil, MoreHorizontal, ExternalLink, LogOut, Smile, Hammer, Zap, Crown, Skull, Plus, X, Link as LinkIcon, UserMinus, Bot, Copy, Check, Power, Terminal } from "lucide-react";
import { Avatar } from "./avatar";
import { SoundboardTab, StickersTab } from "./expression-settings";
import type { PublicRole, PublicServer } from "@/lib/servers";
import type { Member } from "@/lib/users";
import { apiFetch } from "../lib/client";
import { PERMISSION_INFO, type PermissionFlag } from "@/lib/permissions";

interface ServerBot {
  id: string;
  server_id: string;
  name: string;
  avatar: string;
  token: string;
  description: string;
  kind: string;
  enabled: number;
  created_at: string;
}

interface ServerSettingsDialogProps {
  server: PublicServer;
  members?: Member[];
  /** User ids currently online (from the hub), used for the online count. */
  onlineUserIds?: Set<string>;
  canManageServer: boolean;
  /** Manage Emojis & Stickers or Manage Channels: edits stickers and sounds. */
  canManageExpressions?: boolean;
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
  /** Whether the viewer has permission to create invite codes */
  canCreateInvites?: boolean;
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
  "member.nickname": "changed a nickname",
  "member.timeout": "timed out a member",
  "member.timeout_remove": "lifted a timeout",
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
  onlineUserIds,
  canManageServer,
  canManageExpressions = canManageServer,
  onClose,
  onServerUpdated,
  onServerDeleted,
  onRequestPrompt,
  onRequestConfirm,
  isOwner = false,
  onLeaveServer,
  canCreateInvites = true,
}: ServerSettingsDialogProps) {
  const [tab, setTab] = useState<Tab>("profile");
  const [serverName, setServerName] = useState(server.name);
  const [serverColor, setServerColor] = useState(server.color || "#7b63e6");
  const [serverIconUrl, setServerIconUrl] = useState(server.iconUrl || "");
  const [serverBannerUrl, setServerBannerUrl] = useState(server.bannerUrl || "");
  const [bannerGradient, setBannerGradient] = useState(BANNER_COLORS[0].value);
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [loadingEmojis, setLoadingEmojis] = useState(false);
  const [uploadingEmoji, setUploadingEmoji] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iconFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  async function handleSaveProfile() {
    try {
      await apiFetch(`/api/servers/${server.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: serverName,
          color: serverColor,
          iconUrl: serverIconUrl || null,
          bannerUrl: serverBannerUrl || null,
        }),
      });
      onServerUpdated();
      setNotice("Server profile saved successfully!");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to save server profile");
    }
  }

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<{ key: string; url: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      setServerIconUrl(res.url);
      setNotice("Server icon uploaded! Click 'Save Changes' to apply.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Icon upload failed");
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<{ key: string; url: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      setServerBannerUrl(res.url);
      setNotice("Server banner uploaded! Click 'Save Changes' to apply.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Banner upload failed");
    }
  };

  // Roles state
  const [roles, setRoles] = useState<PublicRole[]>(server.roles || []);
  const [activeRole, setActiveRole] = useState<PublicRole | null>(roles[0] || null);
  const [roleSearch, setRoleSearch] = useState("");
  const [editingRoleName, setEditingRoleName] = useState(false);
  const [roleNameDraft, setRoleNameDraft] = useState("");

  // Members state
  const [serverMembers, setServerMembers] = useState<Member[]>(members || []);
  const [memberSearch, setMemberSearch] = useState("");
  const [roleAssignMenuUser, setRoleAssignMenuUser] = useState<string | null>(null);

  const loadServerMembers = useCallback(async () => {
    try {
      const data = await apiFetch<{ members: Member[] }>(
        `/api/members?serverId=${encodeURIComponent(server.id)}`,
      );
      setServerMembers(data.members || []);
    } catch {
      // fallback to current
    }
  }, [server.id]);

  useEffect(() => {
    if (tab === "members") void loadServerMembers();
  }, [tab, loadServerMembers]);

  useEffect(() => {
    if (members?.length) setServerMembers(members);
  }, [members]);

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

  // Server bots & integrations state
  const [bots, setBots] = useState<ServerBot[]>([]);
  const [loadingBots, setLoadingBots] = useState(false);
  const [revealedTokens, setRevealedTokens] = useState<Record<string, boolean>>({});
  const [creatingBot, setCreatingBot] = useState(false);

  const loadBots = useCallback(async () => {
    setLoadingBots(true);
    try {
      const data = await apiFetch<ServerBot[]>(
        `/api/servers/${encodeURIComponent(server.id)}/bots`,
      );
      setBots(data || []);
    } catch {
      setBots([]);
    } finally {
      setLoadingBots(false);
    }
  }, [server.id]);

  useEffect(() => {
    if (tab === "integrations") void loadBots();
  }, [tab, loadBots]);

  async function addBot(name: string, kind = "custom", avatar = "🤖", description = "") {
    setCreatingBot(true);
    try {
      await apiFetch(`/api/servers/${encodeURIComponent(server.id)}/bots`, {
        method: "POST",
        body: JSON.stringify({ name, kind, avatar, description }),
      });
      await loadBots();
      setNotice(`Added bot ${name} to ${server.name}!`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not add bot.");
    } finally {
      setCreatingBot(false);
    }
  }

  async function toggleBot(bot: ServerBot) {
    try {
      await apiFetch(
        `/api/servers/${encodeURIComponent(server.id)}/bots/${encodeURIComponent(bot.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ enabled: bot.enabled ? 0 : 1 }),
        },
      );
      await loadBots();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not toggle bot.");
    }
  }

  async function removeBot(bot: ServerBot) {
    onRequestConfirm({
      title: `Remove ${bot.name}?`,
      message: `Revoking this bot will disable its access to ${server.name}.`,
      isDanger: true,
      confirmText: "Remove Bot",
      onConfirm: async () => {
        try {
          await apiFetch(
            `/api/servers/${encodeURIComponent(server.id)}/bots/${encodeURIComponent(bot.id)}`,
            { method: "DELETE" },
          );
          await loadBots();
          setNotice(`Removed ${bot.name}.`);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not remove bot.");
        }
      },
    });
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
          const res = await apiFetch<{ servers: PublicServer[] }>(
            "/api/roles",
            {
              method: "POST",
              body: JSON.stringify({ serverId: server.id, name: roleName.trim() }),
            },
          );
          const updatedServer = res.servers.find((s) => s.id === server.id);
          if (updatedServer) {
            setRoles(updatedServer.roles);
            const newRole = updatedServer.roles[updatedServer.roles.length - 1];
            if (newRole) setActiveRole(newRole);
          }
          onServerUpdated();
          setNotice(`Role "${roleName.trim()}" created.`);
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "Could not create role");
        }
      },
    });
  };

  const updateRoleName = async (name: string) => {
    if (!activeRole || !canManageServer || !name.trim()) return;
    try {
      const res = await apiFetch<{ servers: PublicServer[] }>(
        `/api/roles/${activeRole.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim() }),
        },
      );
      const updatedServer = res.servers.find((s) => s.id === server.id);
      if (updatedServer) {
        setRoles(updatedServer.roles);
        setActiveRole(
          updatedServer.roles.find((r) => r.id === activeRole.id) || null,
        );
      }
      onServerUpdated();
      setEditingRoleName(false);
      setNotice("Role name updated.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update role name");
    }
  };

  const handleDeleteRole = (role: PublicRole) => {
    if (!canManageServer) return;
    onRequestConfirm({
      title: `Delete ${role.name}?`,
      message: `Are you sure you want to delete the role "${role.name}"? This will remove it from all members.`,
      isDanger: true,
      confirmText: "Delete Role",
      onConfirm: async () => {
        try {
          const res = await apiFetch<{ servers: PublicServer[] }>(
            `/api/roles/${role.id}`,
            { method: "DELETE" },
          );
          const updatedServer = res.servers.find((s) => s.id === server.id);
          if (updatedServer) {
            setRoles(updatedServer.roles);
            if (activeRole?.id === role.id) {
              setActiveRole(updatedServer.roles[0] || null);
            }
          }
          onServerUpdated();
          void loadServerMembers();
          setNotice(`Role "${role.name}" deleted.`);
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "Could not delete role.");
        }
      },
    });
  };

  const toggleRolePermission = async (flag: PermissionFlag) => {
    if (!activeRole || !canManageServer) return;
    const current = activeRole.permissions;
    const nextPerms = (current & flag) === flag ? current & ~flag : current | flag;
    try {
      const res = await apiFetch<{ servers: PublicServer[] }>(
        `/api/roles/${activeRole.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ permissions: nextPerms }),
        },
      );
      const updatedServer = res.servers.find((s) => s.id === server.id);
      if (updatedServer) {
        setRoles(updatedServer.roles);
        setActiveRole(
          updatedServer.roles.find((r) => r.id === activeRole.id) || null,
        );
      }
      onServerUpdated();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update permissions");
    }
  };

  async function toggleMemberRole(userId: string, roleId: string, add: boolean) {
    try {
      setServerMembers((prev) =>
        prev.map((m) => {
          if (m.id !== userId) return m;
          const currentRoles = m.roleIds?.[server.id] || [];
          const nextRoles = add
            ? Array.from(new Set([...currentRoles, roleId]))
            : currentRoles.filter((id) => id !== roleId);
          return {
            ...m,
            roleIds: {
              ...(m.roleIds || {}),
              [server.id]: nextRoles,
            },
          };
        }),
      );

      await apiFetch("/api/roles/assign", {
        method: "POST",
        body: JSON.stringify({ serverId: server.id, userId, roleId, add }),
      });
      onServerUpdated();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not assign role");
      void loadServerMembers();
    }
  }

  function kickMember(member: Member) {
    onRequestConfirm({
      title: `Kick ${member.displayName}?`,
      message: `Are you sure you want to remove ${member.displayName} from ${server.name}? They will be able to rejoin with an invite.`,
      isDanger: true,
      confirmText: "Kick Member",
      onConfirm: async () => {
        try {
          await apiFetch(`/api/members/${member.id}`, {
            method: "POST",
            body: JSON.stringify({ serverId: server.id, action: "kick" }),
          });
          setServerMembers((prev) => prev.filter((m) => m.id !== member.id));
          setNotice(`Kicked ${member.displayName}.`);
          onServerUpdated();
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "Could not kick member.");
        }
      },
    });
  }

  function banMember(member: Member) {
    onRequestConfirm({
      title: `Ban ${member.displayName}?`,
      message: `Are you sure you want to ban ${member.displayName} from ${server.name}? They will not be able to rejoin unless unbanned.`,
      isDanger: true,
      confirmText: "Ban Member",
      onConfirm: async () => {
        try {
          await apiFetch(`/api/members/${member.id}`, {
            method: "POST",
            body: JSON.stringify({ serverId: server.id, action: "ban" }),
          });
          setServerMembers((prev) => prev.filter((m) => m.id !== member.id));
          setNotice(`Banned ${member.displayName}.`);
          onServerUpdated();
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "Could not ban member.");
        }
      },
    });
  }

  const filteredRoles = roles.filter((r) =>
    r.name.toLowerCase().includes(roleSearch.toLowerCase()),
  );

  const filteredMembers = serverMembers.filter((m) => {
    const q = memberSearch.toLowerCase().trim();
    if (!q) return true;
    if (m.displayName.toLowerCase().includes(q)) return true;
    if (m.username.toLowerCase().includes(q)) return true;
    if (m.joinedVia?.code.toLowerCase().includes(q)) return true;
    if (m.joinedVia?.creatorUsername?.toLowerCase().includes(q)) return true;
    if (m.joinedVia?.creatorName?.toLowerCase().includes(q)) return true;
    const assignedRoles = roles.filter((r) =>
      (m.roleIds?.[server.id] || []).includes(r.id),
    );
    return assignedRoles.some((r) => r.name.toLowerCase().includes(q));
  });

  // How many of THIS server's members are online right now (not the whole
  // Huddle). Falls back to the member count when presence isn't wired up.
  const onlineCount = onlineUserIds
    ? serverMembers.filter((m) => onlineUserIds.has(m.id)).length
    : serverMembers.length;

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
          App Directory <ExternalLink size={13} />
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
              className="sidebar-item danger-item flex items-center justify-between"
              onClick={handleDeleteServer}
            >
              <span>Delete Server</span>
              <Trash2 size={16} />
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
            Leave Server <LogOut size={14} />
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
                  maxLength={50}
                  disabled={!canManageServer}
                />
              </div>

              <input
                ref={iconFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleIconUpload}
              />
              <input
                ref={bannerFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleBannerUpload}
              />

              <div className="form-field">
                <label>Server Icon (Photo)</label>
                <p className="field-hint">Upload a custom image/photo for your server icon (minimum 512x512 recommended).</p>
                <div className="button-group">
                  <button
                    type="button"
                    className="discord-btn primary-indigo"
                    onClick={() => iconFileInputRef.current?.click()}
                  >
                    Upload Server Icon
                  </button>
                  {serverIconUrl && (
                    <button
                      type="button"
                      className="discord-btn secondary-gray"
                      onClick={() => setServerIconUrl("")}
                    >
                      Remove Icon
                    </button>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>Server Banner Image</label>
                <p className="field-hint">Upload a custom header banner image for your server sidebar.</p>
                <div className="button-group">
                  <button
                    type="button"
                    className="discord-btn primary-indigo"
                    onClick={() => bannerFileInputRef.current?.click()}
                  >
                    Upload Server Banner
                  </button>
                  {serverBannerUrl && (
                    <button
                      type="button"
                      className="discord-btn secondary-gray"
                      onClick={() => setServerBannerUrl("")}
                    >
                      Remove Banner
                    </button>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>Or Pick Banner Gradient</label>
                <div className="banner-swatches">
                  {BANNER_COLORS.map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      className={`banner-swatch ${bannerGradient === b.value ? "selected" : ""}`}
                      style={{ background: b.value }}
                      onClick={() => {
                        setBannerGradient(b.value);
                        setServerBannerUrl("");
                      }}
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
                      <span className="trait-icon"><Smile size={20} /></span>
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

            {/* Right Side Live Server Preview Card */}
            <div className="pane-right-preview">
              <div className="server-card-preview">
                <div
                  className="server-card-banner"
                  style={{
                    background: serverBannerUrl ? `url(${serverBannerUrl}) center/cover no-repeat` : bannerGradient,
                  }}
                />
                <div className="server-card-content">
                  <div
                    className="server-card-avatar"
                    style={{ background: serverColor, overflow: "hidden" }}
                  >
                    {serverIconUrl ? (
                      <img src={serverIconUrl} alt={serverName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span>{server.icon || serverName.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <h3 className="server-card-name">{serverName}</h3>
                  <div className="server-card-stats">
                    <span className="dot green" /> {onlineCount} Online &nbsp;
                    <span className="dot gray" /> {serverMembers.length || 12} Members
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
                    <span><Crown size={22} /></span>
                    <span><Smile size={22} /></span>
                    <span><MoreHorizontal size={22} /></span>
                    <span><Skull size={22} /></span>
                  </div>
                </div>
                <h2>NO EMOJI</h2>
                <p>Get the party started by uploading an emoji</p>
              </div>
            )}
          </div>
        )}

        {tab === "stickers" && (
          <StickersTab
            serverId={server.id}
            canManage={canManageExpressions}
            onRequestConfirm={onRequestConfirm}
            onNotice={setNotice}
          />
        )}

        {tab === "soundboard" && (
          <SoundboardTab
            serverId={server.id}
            canManage={canManageExpressions}
            onRequestConfirm={onRequestConfirm}
            onNotice={setNotice}
          />
        )}

        {/* Tab: Members */}
        {tab === "members" && (
          <div className="tab-pane members-pane">
            <h1 className="pane-title">Server Members</h1>
            <p className="pane-subtitle">
              {filteredMembers.length} {filteredMembers.length === 1 ? "member" : "members"} in {server.name}. Manage their server roles, view invite sources, and moderate members here.
            </p>

            <div className="members-toolbar">
              <div className="search-wrap">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  className="discord-search-input"
                  placeholder="Search Members, Roles, or Invites"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="members-table-head">
              <span>MEMBER</span>
              <span>JOINED VIA</span>
              <span>ROLES</span>
              <span style={{ textAlign: "right" }}>ACTIONS</span>
            </div>

            <div className="members-list-wrapper">
              {filteredMembers.map((member) => {
                const isOwner = member.id === server.ownerId;
                const assignedRoleIds = new Set(member.roleIds?.[server.id] || []);
                const memberRoles = roles.filter((r) => assignedRoleIds.has(r.id));
                const unassignedRoles = roles.filter((r) => !assignedRoleIds.has(r.id));
                const isMenuOpen = roleAssignMenuUser === member.id;

                return (
                  <div key={member.id} className="member-table-row">
                    <div className="member-user-col">
                      <div className="relative flex-shrink-0">
                        <Avatar
                          avatar={member.avatar}
                          avatarUrl={member.avatarUrl}
                          color={member.color}
                          size={36}
                        />
                        {onlineUserIds && (
                          <span
                            className={`member-online-dot ${
                              onlineUserIds.has(member.id) ? "online" : "offline"
                            }`}
                            title={
                              onlineUserIds.has(member.id)
                                ? "Online"
                                : "Offline"
                            }
                          />
                        )}
                      </div>
                      <div className="member-info-text">
                        <span className="member-info-name">
                          {member.displayName}
                          {isOwner && (
                            <span title="Server Owner" className="owner-crown">
                              <Crown size={14} />
                            </span>
                          )}
                        </span>
                        <span className="member-info-user">@{member.username}</span>
                      </div>
                    </div>

                    <div className="member-invite-col">
                      {member.joinedVia ? (
                        <div className="member-invite-info">
                          <span
                            className="member-invite-badge"
                            title={`Invite code: ${member.joinedVia.code}`}
                          >
                            <LinkIcon size={12} className="inline-icon" />
                            <code>{member.joinedVia.code}</code>
                          </span>
                          {member.joinedVia.creatorUsername || member.joinedVia.creatorName ? (
                            <span className="member-invite-by">
                              by @{member.joinedVia.creatorUsername || member.joinedVia.creatorName}
                            </span>
                          ) : null}
                        </div>
                      ) : isOwner ? (
                        <span className="member-invite-tag owner">
                          <Crown size={12} /> Server Owner
                        </span>
                      ) : (
                        <span className="member-invite-tag direct">
                          Direct / Default
                        </span>
                      )}
                    </div>

                    <div className="member-roles-col">
                      {memberRoles.map((role) => (
                        <span
                          key={role.id}
                          className="member-role-chip"
                          style={role.color ? { borderColor: `${role.color}66` } : undefined}
                        >
                          <span
                            className="member-role-dot"
                            style={{ background: role.color || "#99aab5" }}
                          />
                          <span style={{ color: role.color || "#dbdee1" }}>{role.name}</span>
                          {canManageServer && (
                            <button
                              type="button"
                              className="member-role-remove"
                              title={`Remove ${role.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleMemberRole(member.id, role.id, false);
                              }}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      ))}

                      {canManageServer && (
                        <div className="relative">
                          <button
                            type="button"
                            className="add-role-btn"
                            title="Add Role"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRoleAssignMenuUser(isMenuOpen ? null : member.id);
                            }}
                          >
                            <Plus size={14} />
                          </button>

                          {isMenuOpen && (
                            <div
                              className="role-assign-menu"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!unassignedRoles.length ? (
                                <div style={{ padding: "6px 8px", fontSize: 11, color: "#949ba4" }}>
                                  No more roles to add
                                </div>
                              ) : (
                                unassignedRoles.map((role) => (
                                  <button
                                    key={role.id}
                                    type="button"
                                    className="role-assign-option"
                                    onClick={() => {
                                      setRoleAssignMenuUser(null);
                                      void toggleMemberRole(member.id, role.id, true);
                                    }}
                                  >
                                    <span
                                      className="member-role-dot"
                                      style={{ background: role.color || "#99aab5" }}
                                    />
                                    <span style={{ color: role.color || "#dbdee1" }}>
                                      {role.name}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="member-actions-col">
                      {canManageServer && !isOwner && (
                        <>
                          <button
                            type="button"
                            className="member-action-btn"
                            title="Kick Member"
                            onClick={() => kickMember(member)}
                          >
                            <UserMinus size={15} />
                          </button>
                          <button
                            type="button"
                            className="member-action-btn danger"
                            title="Ban Member"
                            onClick={() => banMember(member)}
                          >
                            <Hammer size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
                <Search size={14} className="search-icon" />
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
                    <span className="drag-dots"><GripVertical size={14} /></span>
                    <span
                      className="role-shield-icon"
                      style={{ color: role.color || "#99aab5" }}
                    >
                      <Shield size={16} />
                    </span>
                    <strong>{role.name}</strong>
                  </div>
                  <div className="role-members-col flex items-center gap-1">
                    <span>{members.length}</span>
                    <Users size={14} />
                  </div>
                  <div className="role-actions-col">
                    <button type="button" className="icon-action-btn" title="Edit Role">
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="icon-action-btn" title="More">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {activeRole && canManageServer && (
              <div className="active-role-permissions-editor">
                <h3>Edit Permissions for {activeRole.name}</h3>
                <div className="permissions-toggle-grid">
                  {PERMISSION_INFO.map((info) => {
                    const enabled = (activeRole.permissions & info.flag) === info.flag;
                    return (
                      <label key={info.flag} className="perm-item-row">
                        <div>
                          <strong>{info.label}</strong>
                          <p>{info.description}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleRolePermission(info.flag)}
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
                <Search size={14} className="search-icon" />
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
                      <span className="hammer-emoji"><Hammer size={26} /><Zap size={26} /></span>
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

        {/* Integrations: Bots, Webhooks & Discord Bridge */}
        {tab === "integrations" && (
          <div className="tab-pane integrations-pane">
            <div className="bans-search-row">
              <div>
                <h1 className="pane-title">Bots & Integrations</h1>
                <p className="pane-subtitle">
                  Add music bots, D&D companions, Discord bridges, or custom Discord-compatible bots to {server.name}.
                </p>
              </div>
              <button
                type="button"
                className="discord-btn primary-indigo"
                onClick={() => {
                  onRequestPrompt({
                    title: "Create Custom Bot",
                    message: "Give your bot a name. A unique Discord-compatible bot token will be generated.",
                    placeholder: "e.g. Trivia Bot",
                    confirmText: "Create Bot",
                    onConfirm: (val) => {
                      if (val?.trim()) void addBot(val.trim(), "custom", "🤖");
                    },
                  });
                }}
                disabled={creatingBot}
              >
                <Plus size={16} style={{ marginRight: 6 }} /> Create Bot Integration
              </button>
            </div>

            {/* Quick-Add Built-in Bot Templates */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              <div style={{ background: "#2b2d31", border: "1px solid #3f4147", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>🎵</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: "#fff" }}>Hoffle Music Bot</h3>
                    <span style={{ fontSize: 12, color: "#949ba4" }}>Voice Audio & Synchronized Playback</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#dbdee1", margin: "8px 0 14px 0", lineHeight: 1.4 }}>
                  Streams YouTube / audio into voice channels with synchronized playback, lyrics, autoplay, and smart queue.
                </p>
                <button
                  type="button"
                  className="discord-btn secondary"
                  style={{ width: "100%" }}
                  onClick={() => void addBot("Hoffle Music", "music", "🎵", "Synchronized voice audio & playback")}
                >
                  Add Music Bot to Server
                </button>
              </div>

              <div style={{ background: "#2b2d31", border: "1px solid #3f4147", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>⚔️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: "#fff" }}>D&D 5e Bot</h3>
                    <span style={{ fontSize: 12, color: "#949ba4" }}>SRD Compendium & Dice Roller</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#dbdee1", margin: "8px 0 14px 0", lineHeight: 1.4 }}>
                  Look up 5e spells, monsters, items, conditions and roll cryptographic dice directly in chat channels.
                </p>
                <button
                  type="button"
                  className="discord-btn secondary"
                  style={{ width: "100%" }}
                  onClick={() => void addBot("D&D Companion", "dnd", "⚔️", "5e compendium and dice roller")}
                >
                  Add D&D Bot to Server
                </button>
              </div>

              <div style={{ background: "#2b2d31", border: "1px solid #3f4147", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>🌉</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: "#fff" }}>Discord Bridge</h3>
                    <span style={{ fontSize: 12, color: "#949ba4" }}>Bidirectional Discord &lt;-&gt; Hoffle Sync</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#dbdee1", margin: "8px 0 14px 0", lineHeight: 1.4 }}>
                  Sync channels bidirectionally with your Discord server. Forwards chat, embeds, and attachments.
                </p>
                <button
                  type="button"
                  className="discord-btn secondary"
                  style={{ width: "100%" }}
                  onClick={() => void addBot("Discord Bridge", "discord-bridge", "🌉", "Bidirectional Discord bridge")}
                >
                  Add Discord Bridge to Server
                </button>
              </div>
            </div>

            {/* Active Bots List */}
            <h2 style={{ fontSize: 16, color: "#fff", marginTop: 24, marginBottom: 8 }}>Installed Bots ({bots.length})</h2>
            {loadingBots ? (
              <p className="pane-subtitle">Loading installed bots…</p>
            ) : !bots.length ? (
              <div className="empty-illustration-box">
                <p>No bots installed on {server.name} yet. Add one above or create a custom bot!</p>
              </div>
            ) : (
              <ul className="invite-list" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 0, listStyle: "none" }}>
                {bots.map((bot) => (
                  <li
                    key={bot.id}
                    style={{
                      background: "#2b2d31",
                      border: "1px solid #3f4147",
                      borderRadius: 8,
                      padding: "14px 18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ fontSize: 24 }}>{bot.avatar || "🤖"}</span>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ color: "#fff", fontSize: 15 }}>{bot.name}</strong>
                          <span
                            style={{
                              fontSize: 10,
                              textTransform: "uppercase",
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: bot.enabled ? "#23a55a" : "#ed4245",
                              color: "#fff",
                              fontWeight: 700,
                            }}
                          >
                            {bot.enabled ? "ACTIVE" : "DISABLED"}
                          </span>
                          <span style={{ fontSize: 12, color: "#949ba4" }}>{bot.kind}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <code style={{ fontSize: 12, background: "#1e1f22", padding: "2px 6px", borderRadius: 4, color: "#00a8fc" }}>
                            {revealedTokens[bot.id] ? bot.token : `${bot.token.slice(0, 10)}••••••••••••••••`}
                          </code>
                          <button
                            type="button"
                            className="discord-btn"
                            style={{ padding: "2px 8px", fontSize: 12 }}
                            onClick={() => {
                              setRevealedTokens((prev) => ({ ...prev, [bot.id]: !prev[bot.id] }));
                            }}
                          >
                            {revealedTokens[bot.id] ? "Hide" : "Reveal"}
                          </button>
                          <button
                            type="button"
                            className="discord-btn secondary"
                            style={{ padding: "2px 8px", fontSize: 12 }}
                            onClick={() => {
                              void navigator.clipboard?.writeText(bot.token).then(() => {
                                setNotice(`Copied bot token for ${bot.name}.`);
                              });
                            }}
                          >
                            <Copy size={12} style={{ marginRight: 4 }} /> Copy Token
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        className="discord-btn secondary"
                        onClick={() => void toggleBot(bot)}
                        title={bot.enabled ? "Disable Bot" : "Enable Bot"}
                      >
                        <Power size={14} style={{ marginRight: 4 }} /> {bot.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="discord-btn danger-btn"
                        onClick={() => void removeBot(bot)}
                        title="Remove Bot"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Developer Quick Reference */}
            <div style={{ background: "#1e1f22", border: "1px solid #3f4147", borderRadius: 8, padding: 18, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#5865f2" }}>
                <Terminal size={18} />
                <h3 style={{ margin: 0, fontSize: 15, color: "#fff" }}>Discord-Compatible Bot API</h3>
              </div>
              <p style={{ fontSize: 13, color: "#949ba4", margin: "0 0 10px 0" }}>
                Connect your custom bots or Discord bot code to Hoffle by sending standard HTTP requests:
              </p>
              <pre style={{ margin: 0, padding: 12, background: "#111214", borderRadius: 6, fontSize: 12, color: "#dbdee1", overflowX: "auto" }}>
{`# Send a message to a channel:
curl -X POST "\${typeof window !== "undefined" ? window.location.origin : "https://chat.hoffle.online"}/hangout/api/v1/channels/<CHANNEL_ID>/messages" \\
  -H "Authorization: Bot <YOUR_BOT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello from my self-hosted bot!"}'

# Real-time event gateway:
# Connect via WebSocket to: /hangout/api/realtime
# Or stream SSE events: /hangout/api/v1/gateway/events?token=<YOUR_BOT_TOKEN>`}
              </pre>
            </div>
          </div>
        )}

        {/* Fallback for other sidebar items */}
        {tab !== "profile" &&
          tab !== "emoji" &&
          tab !== "roles" &&
          tab !== "bans" &&
          tab !== "invites" &&
          tab !== "audit_log" &&
          tab !== "integrations" && (
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
