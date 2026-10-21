"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GROUP_INVITE_USES } from "@/lib/invite-limits";
import { Trash2, ExternalLink, LogOut } from "lucide-react";
import { SoundboardTab, StickersTab } from "./expression-settings";
import { WelcomeTab } from "./server-welcome";
import { AutomodPanel } from "./automod-panel";
import { useI18n } from "@/app/lib/i18n-context";
import type { PublicRole, PublicServer } from "@/lib/servers";
import type { Member } from "@/lib/users";
import { apiFetch } from "../lib/client";
import { type PermissionFlag } from "@/lib/permissions";
import { ServerBot, ServerInvite, AuditEntry, Tab, CustomEmoji, ServerBan } from "./server-settings/types";
import { BANNER_COLORS } from "./server-settings/constants";
import { ServerProfileTab } from "./server-settings/profile-tab";
import { ServerEmojiTab } from "./server-settings/emoji-tab";
import { ServerMembersTab } from "./server-settings/members-tab";
import { ServerRolesTab } from "./server-settings/roles-tab";
import { ServerBansTab } from "./server-settings/bans-tab";
import { ServerInvitesTab } from "./server-settings/invites-tab";
import { ServerAuditLogTab } from "./server-settings/audit-log-tab";
import { ServerIntegrationsTab } from "./server-settings/integrations-tab";
import { ServerAccessTab } from "./server-settings/access-tab";
import { ServerSafetyTab } from "./server-settings/safety-tab";
import { ServerTemplateTab } from "./server-settings/template-tab";



interface ServerSettingsDialogProps {
  server: PublicServer;
  members?: Member[];
  /** User ids currently online (from the hub), used for the online count. */
  onlineUserIds?: Set<string>;
  canManageServer: boolean;
  /** Manage Emojis & Stickers or Manage Channels: edits stickers and sounds. */
  canManageExpressions?: boolean;
  /** Permission to manage roles in the server */
  canManageRoles?: boolean;
  /** Permission to manage channels and categories */
  canManageChannels?: boolean;
  /** Permission to moderate */
  canModerate?: boolean;
  /** Permission to kick members */
  canKickMembers?: boolean;
  /** Permission to ban members */
  canBanMembers?: boolean;
  /** Permission to view audit log */
  canViewAuditLog?: boolean;
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















export function ServerSettingsDialog({
  server,
  members = [],
  onlineUserIds,
  canManageServer,
  canManageExpressions = canManageServer,
  canManageRoles = canManageServer,
  canManageChannels = canManageServer,
  canModerate = canManageServer,
  canKickMembers = canManageServer,
  canBanMembers = canManageServer,
  canViewAuditLog = canManageServer,
  onClose,
  onServerUpdated,
  onServerDeleted,
  onRequestPrompt,
  onRequestConfirm,
  isOwner = false,
  onLeaveServer,
  canCreateInvites = true,
}: ServerSettingsDialogProps) {
  const { t } = useI18n();
  const canManageRolesEffective = Boolean(canManageRoles || canManageServer || isOwner);
  const canModerateEffective = Boolean(canModerate || canManageServer || isOwner);
  const canKickEffective = Boolean(canKickMembers || canModerate || canManageServer || isOwner);
  const canBanEffective = Boolean(canBanMembers || canModerate || canManageServer || isOwner);
  const canAuditEffective = Boolean(canViewAuditLog || canManageServer || isOwner);
  const canExpressionsEffective = Boolean(canManageExpressions || canManageServer || isOwner);
  const canInvitesEffective = Boolean(canCreateInvites || canManageServer || isOwner);
  const canManageMembersEffective = Boolean(
    canManageServer || canManageRoles || canModerate || canKickMembers || canBanMembers || isOwner
  );

  const isTabVisible = useCallback((t: Tab): boolean => {
    switch (t) {
      case "profile":
        return true;
      case "tag":
      case "engagement":
      case "boost":
        return false;
      case "emoji":
      case "stickers":
      case "soundboard":
        return canExpressionsEffective;
      case "members":
        return canManageMembersEffective;
      case "roles":
        return canManageRolesEffective;
      case "invites":
        return canInvitesEffective;
      case "access":
        return Boolean(canManageServer || canManageRoles || isOwner);
      case "integrations":
        return Boolean(canManageServer || isOwner);
      case "app_directory":
        return false;
      case "safety":
        return Boolean(canManageServer || canModerate || isOwner);
      case "audit_log":
        return canAuditEffective;
      case "bans":
        return canBanEffective;
      case "automod":
        return Boolean(canManageServer || canModerate || isOwner);
      case "welcome":
      case "community":
      case "template":
        return Boolean(canManageServer || isOwner);
      default:
        return false;
    }
  }, [
    canManageServer,
    isOwner,
    canExpressionsEffective,
    canManageMembersEffective,
    canManageRolesEffective,
    canInvitesEffective,
    canAuditEffective,
    canBanEffective,
    canModerate,
  ]);

  const [tab, setTab] = useState<Tab>("profile");

  useEffect(() => {
    if (!isTabVisible(tab)) {
      setTab("profile");
    }
  }, [tab, isTabVisible]);
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
        body: JSON.stringify({ serverId: server.id, maxUses: GROUP_INVITE_USES }),
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
    if (!activeRole || !canManageRolesEffective || !name.trim()) return;
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

  const updateRoleIcon = async (icon: string | null) => {
    if (!activeRole || !canManageRolesEffective) return;
    try {
      const res = await apiFetch<{ servers: PublicServer[] }>(`/api/roles/${activeRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({ icon }),
      });
      const updatedServer = res.servers.find((s) => s.id === server.id);
      if (updatedServer) {
        setRoles(updatedServer.roles);
        setActiveRole(updatedServer.roles.find((r) => r.id === activeRole.id) || null);
      }
      onServerUpdated();
      setNotice(icon ? "Role icon saved." : "Role icon removed.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not change the role icon.");
    }
  };

  const uploadRoleIcon = async (file: File) => {
    try {
      const form = new FormData();
      form.append("image", file);
      const upload = await apiFetch<{ key: string }>("/api/uploads", { method: "POST", body: form });
      await updateRoleIcon(`/hangout/api/uploads/${encodeURIComponent(upload.key)}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That image did not upload.");
    }
  };

  const handleDeleteRole = (role: PublicRole) => {
    if (!canManageRolesEffective) return;
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

  // Quick clicks on several permissions must stack: each toggle builds on the
  // last one sent, not on the role as it was before the first answer came back.
  const pendingPermsRef = useRef(new Map<string, number>());
  const toggleRolePermission = async (flag: PermissionFlag) => {
    if (!activeRole || !canManageRolesEffective) return;
    const current = pendingPermsRef.current.get(activeRole.id) ?? activeRole.permissions;
    const nextPerms = (current & flag) === flag ? current & ~flag : current | flag;
    pendingPermsRef.current.set(activeRole.id, nextPerms);
    setActiveRole({ ...activeRole, permissions: nextPerms });
    try {
      const res = await apiFetch<{ servers: PublicServer[] }>(
        `/api/roles/${activeRole.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ permissions: nextPerms }),
        },
      );
      // A later toggle is already on its way: its answer is the one to show.
      if (pendingPermsRef.current.get(activeRole.id) !== nextPerms) return;
      pendingPermsRef.current.delete(activeRole.id);
      const updatedServer = res.servers.find((s) => s.id === server.id);
      if (updatedServer) {
        setRoles(updatedServer.roles);
        setActiveRole(
          updatedServer.roles.find((r) => r.id === activeRole.id) || null,
        );
      }
      onServerUpdated();
    } catch (e) {
      pendingPermsRef.current.delete(activeRole.id);
      setActiveRole(activeRole);
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
          {t("serverSettings.tab.profile")}
        </button>
        {isTabVisible("tag") && (
          <button
            type="button"
            className={`sidebar-item ${tab === "tag" ? "active" : ""}`}
            onClick={() => setTab("tag")}
          >
            Server Tag
          </button>
        )}
        {isTabVisible("engagement") && (
          <button
            type="button"
            className={`sidebar-item ${tab === "engagement" ? "active" : ""}`}
            onClick={() => setTab("engagement")}
          >
            Engagement
          </button>
        )}
        {isTabVisible("boost") && (
          <button
            type="button"
            className={`sidebar-item ${tab === "boost" ? "active" : ""}`}
            onClick={() => setTab("boost")}
          >
            Boost Perks
          </button>
        )}

        {(isTabVisible("emoji") || isTabVisible("stickers") || isTabVisible("soundboard")) && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-group-header">{t("serverSettings.group.expression")}</div>
            {isTabVisible("emoji") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "emoji" ? "active" : ""}`}
                onClick={() => setTab("emoji")}
              >
                {t("serverSettings.tab.emoji")}
              </button>
            )}
            {isTabVisible("stickers") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "stickers" ? "active" : ""}`}
                onClick={() => setTab("stickers")}
              >
                {t("serverSettings.tab.stickers")}
              </button>
            )}
            {isTabVisible("soundboard") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "soundboard" ? "active" : ""}`}
                onClick={() => setTab("soundboard")}
              >
                {t("serverSettings.tab.soundboard")}
              </button>
            )}
          </>
        )}

        {(isTabVisible("members") || isTabVisible("roles") || isTabVisible("invites") || isTabVisible("access") || isTabVisible("welcome")) && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-group-header">{t("serverSettings.group.people")}</div>
            {isTabVisible("members") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "members" ? "active" : ""}`}
                onClick={() => setTab("members")}
              >
                {t("serverSettings.tab.members")}
              </button>
            )}
            {isTabVisible("roles") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "roles" ? "active" : ""}`}
                onClick={() => setTab("roles")}
              >
                {t("serverSettings.tab.roles")}
              </button>
            )}
            {isTabVisible("invites") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "invites" ? "active" : ""}`}
                onClick={() => setTab("invites")}
              >
                {t("serverSettings.tab.invites")}
              </button>
            )}
            {isTabVisible("access") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "access" ? "active" : ""}`}
                onClick={() => setTab("access")}
              >
                {t("serverSettings.tab.access")}
              </button>
            )}
            {isTabVisible("welcome") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "welcome" ? "active" : ""}`}
                onClick={() => setTab("welcome")}
              >
                {t("serverSettings.tab.welcome")}
              </button>
            )}
          </>
        )}

        {(isTabVisible("integrations") || isTabVisible("app_directory")) && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-group-header">{t("serverSettings.group.apps")}</div>
            {isTabVisible("integrations") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "integrations" ? "active" : ""}`}
                onClick={() => setTab("integrations")}
              >
                {t("serverSettings.tab.integrations")}
              </button>
            )}
            {isTabVisible("app_directory") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "app_directory" ? "active" : ""}`}
                onClick={() => setTab("app_directory")}
              >
                App Directory <ExternalLink size={13} />
              </button>
            )}
          </>
        )}

        {(isTabVisible("safety") || isTabVisible("audit_log") || isTabVisible("bans") || isTabVisible("automod")) && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-group-header">{t("serverSettings.group.moderation")}</div>
            {isTabVisible("safety") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "safety" ? "active" : ""}`}
                onClick={() => setTab("safety")}
              >
                {t("serverSettings.tab.safety")}
              </button>
            )}
            {isTabVisible("audit_log") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "audit_log" ? "active" : ""}`}
                onClick={() => setTab("audit_log")}
              >
                {t("serverSettings.tab.auditLog")}
              </button>
            )}
            {isTabVisible("bans") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "bans" ? "active" : ""}`}
                onClick={() => setTab("bans")}
              >
                {t("serverSettings.tab.bans")}
              </button>
            )}
            {isTabVisible("automod") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "automod" ? "active" : ""}`}
                onClick={() => setTab("automod")}
              >
                {t("serverSettings.tab.automod")}
              </button>
            )}
          </>
        )}

        {(isTabVisible("community") || isTabVisible("template")) && (
          <>
            <div className="sidebar-divider" />
            {isTabVisible("community") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "community" ? "active" : ""}`}
                onClick={() => setTab("community")}
              >
                Enable Community
              </button>
            )}
            {isTabVisible("template") && (
              <button
                type="button"
                className={`sidebar-item ${tab === "template" ? "active" : ""}`}
                onClick={() => setTab("template")}
              >
                {t("serverSettings.tab.templates")}
              </button>
            )}
          </>
        )}

        <div className="sidebar-divider" />
        {/* Owners delete their server; everyone else can leave it. */}
        {isOwner ? (
          canManageServer && (
            <button
              type="button"
              className="sidebar-item danger-item flex items-center justify-between"
              onClick={handleDeleteServer}
            >
              <span>{t("serverSettings.deleteServer")}</span>
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
                confirmText: t("serverSettings.leaveServer"),
                onConfirm: () => onLeaveServer?.(),
              })
            }
          >
            {t("serverSettings.leaveServer")} <LogOut size={14} />
          </button>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="discord-settings-main">
        {notice && <div className="discord-notice-banner">{notice}</div>}

        {/* Tab 1: Server Profile (SS 1) */}
        <ServerProfileTab
        tab={tab}
        canManageServer={canManageServer}
        serverName={serverName}
        setServerName={setServerName}
        iconFileInputRef={iconFileInputRef}
        handleIconUpload={handleIconUpload}
        bannerFileInputRef={bannerFileInputRef}
        handleBannerUpload={handleBannerUpload}
        serverIconUrl={serverIconUrl}
        setServerIconUrl={setServerIconUrl}
        serverBannerUrl={serverBannerUrl}
        setServerBannerUrl={setServerBannerUrl}
        bannerGradient={bannerGradient}
        setBannerGradient={setBannerGradient}
        handleSaveProfile={handleSaveProfile}
        serverColor={serverColor}
        server={server}
        onlineCount={onlineCount}
        serverMembers={serverMembers}
      />

        {/* Tab 2: Emoji (SS 2) */}
        <ServerEmojiTab
        tab={tab}
        canManageServer={canManageServer}
        uploadingEmoji={uploadingEmoji}
        fileInputRef={fileInputRef}
        handleFileSelect={handleFileSelect}
        loadingEmojis={loadingEmojis}
        emojis={emojis}
        handleDeleteEmoji={handleDeleteEmoji}
      />

        {tab === "welcome" && <WelcomeTab serverId={server.id} onNotice={setNotice} />}

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
        <ServerMembersTab
        tab={tab}
        filteredMembers={filteredMembers}
        server={server}
        memberSearch={memberSearch}
        setMemberSearch={setMemberSearch}
        roles={roles}
        roleAssignMenuUser={roleAssignMenuUser}
        onlineUserIds={onlineUserIds}
        canManageRolesEffective={canManageRolesEffective}
        toggleMemberRole={toggleMemberRole}
        setRoleAssignMenuUser={setRoleAssignMenuUser}
        canKickEffective={canKickEffective}
        canBanEffective={canBanEffective}
        kickMember={kickMember}
        banMember={banMember}
      />

        {/* Tab 3: Roles (SS 3) */}
        <ServerRolesTab
        tab={tab}
        roleSearch={roleSearch}
        setRoleSearch={setRoleSearch}
        canManageRolesEffective={canManageRolesEffective}
        handleCreateRole={handleCreateRole}
        filteredRoles={filteredRoles}
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        members={members}
        toggleRolePermission={toggleRolePermission}
        updateRoleIcon={updateRoleIcon}
        uploadRoleIcon={uploadRoleIcon}
      />

        {/* Tab 4: Bans (SS 4) */}
        <ServerBansTab
        tab={tab}
        banSearch={banSearch}
        setBanSearch={setBanSearch}
        loadBans={loadBans}
        bans={bans}
        loadingBans={loadingBans}
        onRequestConfirm={onRequestConfirm}
        unban={unban}
      />

        {/* Invites: server-scoped codes that let people join THIS server. */}
        {/* The automod tab has existed in the sidebar since the beginning but
            rendered nothing; this is the panel that finally fills it. */}
        {tab === "automod" && (
          <AutomodPanel
            serverId={server.id}
            serverName={server.name}
            canManageServer={canManageServer}
            onRequestConfirm={onRequestConfirm}
          />
        )}

        <ServerInvitesTab
        tab={tab}
        server={server}
        canCreateInvites={canCreateInvites}
        createServerInvite={createServerInvite}
        creatingInvite={creatingInvite}
        loadingInvites={loadingInvites}
        invites={invites}
        setNotice={setNotice}
        revokeInvite={revokeInvite}
        canManageServer={canManageServer}
        onServerUpdated={onServerUpdated}
      />

        {/* Audit log: a real trail of moderation and structure changes. */}
        <ServerAuditLogTab
        tab={tab}
        server={server}
        loadAudit={loadAudit}
        loadingAudit={loadingAudit}
        audit={audit}
      />

        {/* Integrations: Bots, Webhooks & Discord Bridge */}
        <ServerIntegrationsTab
        tab={tab}
        server={server}
        onRequestPrompt={onRequestPrompt}
        onRequestConfirm={onRequestConfirm}
        addBot={addBot}
        creatingBot={creatingBot}
        bots={bots}
        loadingBots={loadingBots}
        revealedTokens={revealedTokens}
        setRevealedTokens={setRevealedTokens}
        setNotice={setNotice}
        toggleBot={toggleBot}
        removeBot={removeBot}
      />

        <ServerAccessTab
          tab={tab}
          server={server}
          canManageServer={Boolean(canManageServer || isOwner)}
          onServerUpdated={onServerUpdated}
          setNotice={setNotice}
        />

        <ServerSafetyTab
          tab={tab}
          server={server}
          canManageServer={Boolean(canManageServer || isOwner)}
          canModerate={canModerateEffective}
          onServerUpdated={onServerUpdated}
          setNotice={setNotice}
        />

        <ServerTemplateTab
          tab={tab}
          server={server}
          onServerUpdated={onServerUpdated}
          setNotice={setNotice}
        />

        {/* Sidebar items with no panel yet. Listed by what exists rather than
            what doesn't, so a new panel can't end up with this under it. */}
        {!["profile", "emoji", "stickers", "soundboard", "members", "roles", "bans", "invites",
          "audit_log", "integrations", "automod", "access", "community", "safety", "template", "welcome"].includes(tab) && (
          <div className="tab-pane fallback-pane">
            <h1 className="pane-title">
              {tab.replace("_", " ").toUpperCase()}
            </h1>
            <div className="empty-illustration-box">
              <p>This isn't available in Hoffle yet.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
