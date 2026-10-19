"use client";

import type { Dispatch, DragEvent, SetStateAction } from "react";
import type { PublicChannel, PublicServer } from "@/lib/servers";
import {
  channelKindInfo,
  channelNameRules,
  CREATABLE_CHANNEL_KINDS,
  type ChannelKind,
} from "@/lib/channel-kinds";
import {
  clampVoiceBitrate,
  VOICE_BITRATE_DEFAULT,
  VOICE_BITRATE_MAX,
  VOICE_BITRATE_MIN,
} from "@/lib/voice-quality";
import {
  createFolder,
  moveToFolder,
  removeFromFolders,
  type ServerFolder,
} from "@/lib/server-folders";
import type { ResolvedInvite } from "../components/server-invite-card";
import {
  CHANNEL_KIND_COPY,
  channelKindIcon,
  channelKindLabel,
} from "../components/chat/channel-kind";
import { DM_HOME } from "../lib/chat/constants";
import { withArticle } from "../lib/chat/format";
import { apiFetch } from "../lib/client";

export function useChannelServerActions({
  activeServer,
  activeServerId,
  servers,
  setServers,
  setActiveServerId,
  setActiveChannelId,
  setServerSettingsOpen,
  setResolvedInvites,
  setNotice,
  setKindMenu,
  canManageChannels,
  dragChannelId,
  setDragChannelId,
  dragServerId,
  setDragServerId,
  serverDropHint,
  setServerDropHint,
  serverFolders,
  setServerFolders,
  loadServerFolders,
  openFolders,
  setOpenFolders,
  setCollapsedCats,
  voiceChannelId,
  leaveVoice,
  showCustomPrompt,
  showCustomConfirm,
}: {
  activeServer: PublicServer | null;
  activeServerId: string | null;
  servers: PublicServer[];
  setServers: Dispatch<SetStateAction<PublicServer[]>>;
  setActiveServerId: Dispatch<SetStateAction<string | null>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setServerSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setResolvedInvites: Dispatch<SetStateAction<Record<string, ResolvedInvite>>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setKindMenu: Dispatch<SetStateAction<{ categoryId: string | null } | null>>;
  canManageChannels: boolean;
  dragChannelId: string | null;
  setDragChannelId: Dispatch<SetStateAction<string | null>>;
  dragServerId: string | null;
  setDragServerId: Dispatch<SetStateAction<string | null>>;
  serverDropHint: { id: string; mode: "before" | "merge" } | null;
  setServerDropHint: Dispatch<SetStateAction<{ id: string; mode: "before" | "merge" } | null>>;
  serverFolders: ServerFolder[];
  setServerFolders: Dispatch<SetStateAction<ServerFolder[]>>;
  loadServerFolders: () => Promise<void>;
  openFolders: Set<string>;
  setOpenFolders: Dispatch<SetStateAction<Set<string>>>;
  setCollapsedCats: Dispatch<SetStateAction<Set<string>>>;
  voiceChannelId: string | null;
  leaveVoice: () => void;
  showCustomPrompt: (options: {
    title: string;
    message?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
    maxLength?: number;
    onConfirm: (val?: string) => void;
  }) => void;
  showCustomConfirm: (options: {
    title: string;
    message?: string;
    isDanger?: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }) => void;
}) {
  async function leaveServer(serverId: string) {
    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(
        "/api/servers/membership",
        {
          method: "POST",
          body: JSON.stringify({ action: "leave", serverId }),
        },
      );
      setServers(data.servers);
      setServerSettingsOpen(false);
      setActiveServerId(data.servers[0]?.id || DM_HOME);
      setNotice("You left the server.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not leave.");
    }
  }

  async function joinServerDirect(rawInput?: string) {
    if (!rawInput?.trim()) return;
    let code = rawInput.trim();
    if (code.includes("?") || code.includes("/")) {
      try {
        const url = new URL(code.startsWith("http") ? code : `https://${code}`);
        code =
          url.searchParams.get("code") ||
          url.searchParams.get("servercode") ||
          url.searchParams.get("invite") ||
          url.search.slice(1) ||
          code;
      } catch {
        const qIdx = code.indexOf("?");
        if (qIdx !== -1) code = code.slice(qIdx + 1);
      }
    }
    code = code
      .replace(/^code=/i, "")
      .replace(/^servercode=/i, "")
      .replace(/^invite=/i, "")
      .trim()
      .toUpperCase();
    if (!code) return;
    try {
      const data = await apiFetch<{
        serverId: string;
        servers: PublicServer[];
        alreadyMember?: boolean;
      }>("/api/servers/membership", {
        method: "POST",
        body: JSON.stringify({ action: "join", code }),
      });
      setServers(data.servers);
      setActiveServerId(data.serverId);
      setResolvedInvites((prev) => {
        const existing = prev[code];
        if (!existing) return prev;
        return {
          ...prev,
          [code]: { ...existing, isMember: true },
        };
      });
      setNotice(data.alreadyMember ? "Switched to server." : "Joined the server.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not join.");
    }
  }

  async function joinServerByCode() {
    showCustomPrompt({
      title: "Join a Server",
      message: "Paste the invite code or invite link:",
      placeholder: "e.g. HX3F-9K2Q or deeppixel.online/hangout?HX3F-9K2Q",
      confirmText: "Join Server",
      onConfirm: async (rawInput) => {
        await joinServerDirect(rawInput);
      },
    });
  }

  function createServer() {
    showCustomConfirm({
      title: "Add a Server",
      message: "Create your own server, or join one with an invite code.",
      confirmText: "Create New",
      cancelText: "Join with Code",
      onConfirm: () => {
        showCustomPrompt({
          title: "Create Server",
          message: "Enter a name for your new server:",
          placeholder: "e.g. My Cool Server",
          confirmText: "Create Server",
          maxLength: 50,
          onConfirm: async (name) => {
            if (!name?.trim()) return;
            try {
              const data = await apiFetch<{
                server: PublicServer;
                servers: PublicServer[];
              }>("/api/servers", {
                method: "POST",
                body: JSON.stringify({ name: name.trim() }),
              });
              setServers(data.servers);
              setActiveServerId(data.server.id);
              setNotice(`${data.server.name} is live — invite people from its settings.`);
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "Could not create it.");
            }
          },
        });
      },
      onCancel: () => void joinServerByCode(),
    });
  }

  async function createChannel(
    kind: ChannelKind,
    categoryId: string | null = null,
  ) {
    if (!activeServerId || activeServerId === DM_HOME) return;
    const copy = CHANNEL_KIND_COPY[kind] ?? CHANNEL_KIND_COPY.text;
    showCustomPrompt({
      title: copy.title,
      message: copy.message,
      placeholder: copy.placeholder,
      confirmText: "Create Channel",
      maxLength: channelNameRules(kind).maxLength,
      onConfirm: async (name) => {
        if (!name?.trim()) return;
        try {
          const data = await apiFetch<{ channelId: string; servers: PublicServer[] }>(
            "/api/channels",
            {
              method: "POST",
              body: JSON.stringify({ serverId: activeServerId, name: name.trim(), kind, categoryId }),
            },
          );
          setServers(data.servers);
          if (channelKindInfo(kind).text) setActiveChannelId(data.channelId);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not create it.");
        }
      },
    });
  }

  async function changeChannelKind(channel: { id: string; name: string }, kind: ChannelKind) {
    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(`/api/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ kind }),
      });
      setServers(data.servers);
      setNotice(`#${channel.name} is now ${withArticle(channelKindLabel(kind))}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not change the channel type.");
    }
  }

  function renderKindMenu(categoryId: string | null) {
    return (
      <div className="channel-kind-menu" role="menu" aria-label="Channel type">
        {CREATABLE_CHANNEL_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="menuitem"
            onClick={() => {
              setKindMenu(null);
              void createChannel(kind, categoryId);
            }}
          >
            <span className="flex items-center gap-2">
              {channelKindIcon(kind)} {channelKindLabel(kind)}
            </span>
          </button>
        ))}
      </div>
    );
  }

  async function renameChannel(channel: PublicChannel) {
    showCustomPrompt({
      title: "Rename Channel",
      message: `Enter a new name for ${channel.name}:`,
      defaultValue: channel.name,
      confirmText: "Save Name",
      maxLength: 25,
      onConfirm: async (name) => {
        if (!name?.trim()) return;
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "PATCH", body: JSON.stringify({ name: name.trim() }) },
          );
          setServers(data.servers);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not rename it.");
        }
      },
    });
  }

  async function editChannelTopic(channel: PublicChannel) {
    showCustomPrompt({
      title: "Edit Channel Topic",
      message: `Set topic description for #${channel.name}:`,
      defaultValue: channel.topic || "",
      placeholder: "e.g. Plans, chaos, and meme sharing",
      confirmText: "Save Topic",
      onConfirm: async (topic) => {
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "PATCH", body: JSON.stringify({ topic: topic?.trim() || "" }) },
          );
          setServers(data.servers);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not save topic.");
        }
      },
    });
  }

  async function editChannelSlowmode(channel: PublicChannel) {
    showCustomPrompt({
      title: "Set Channel Slowmode Cooldown",
      message: "Enter slowmode cooldown in seconds (0 to disable, e.g. 5, 10, 30):",
      defaultValue: String(channel.slowmode || 0),
      placeholder: "0",
      confirmText: "Set Slowmode",
      onConfirm: async (val) => {
        const sec = parseInt(val || "0", 10) || 0;
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "PATCH", body: JSON.stringify({ slowmode: sec }) },
          );
          setServers(data.servers);
          setNotice(sec > 0 ? `Slowmode set to ${sec}s` : "Slowmode disabled");
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not set slowmode.");
        }
      },
    });
  }

  /** Age-restricted channels ask members to confirm they are 18+ before opening. */
  async function toggleChannelNsfw(channel: PublicChannel) {
    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(
        `/api/channels/${channel.id}`,
        { method: "PATCH", body: JSON.stringify({ nsfw: !channel.nsfw }) },
      );
      setServers(data.servers);
      setNotice(channel.nsfw ? `#${channel.name} is no longer age-restricted.` : `#${channel.name} is now age-restricted.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not change the age restriction.");
    }
  }

  async function editChannelBitrate(channel: PublicChannel) {
    const current = Math.round(clampVoiceBitrate(channel.bitrate) / 1000);
    showCustomPrompt({
      title: `Voice Bitrate for ${channel.name}`,
      message:
        `The most each speaker sends, in kbps (${VOICE_BITRATE_MIN / 1000}–${VOICE_BITRATE_MAX / 1000}). ` +
        `64 is clear speech; go higher for music or singing. Bigger rooms automatically send ` +
        `less per person, so nobody's upload gets swamped.`,
      defaultValue: String(current),
      placeholder: String(VOICE_BITRATE_DEFAULT / 1000),
      confirmText: "Set Bitrate",
      onConfirm: async (value) => {
        const kbps = parseInt(value || "", 10);
        if (!Number.isFinite(kbps)) return;
        const bitrate = clampVoiceBitrate(kbps * 1000);
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "PATCH", body: JSON.stringify({ bitrate }) },
          );
          setServers(data.servers);
          setNotice(`Voice bitrate set to ${bitrate / 1000} kbps`);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not set the bitrate.");
        }
      },
    });
  }

  async function toggleChannelSoundboard(channel: PublicChannel) {
    const enable = channel.soundboard === false;
    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(`/api/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ soundboard: enable }),
      });
      setServers(data.servers);
      setNotice(enable ? `Soundboard on in ${channel.name}.` : `Soundboard off in ${channel.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not change the soundboard.");
    }
  }

  async function editChannelRegion(channel: PublicChannel) {
    const current = channel.rtcRegion || "auto";
    showCustomPrompt({
      title: `Region Override for #${channel.name}`,
      message:
        `Select the primary voice server region for this channel.
` +
        `• "auto" - Netherlands normally, automatically routes to Germany when 40+ people join
` +
        `• "nl" - Netherlands (Home Server)
` +
        `• "de" - Germany (Oracle Cloud)`,
      defaultValue: current,
      placeholder: "auto, nl, or de",
      confirmText: "Set Region",
      onConfirm: async (value) => {
        const val = (value || "").trim().toLowerCase();
        if (val !== "auto" && val !== "nl" && val !== "de") {
          setNotice("Invalid region. Choose 'auto', 'nl', or 'de'.");
          return;
        }
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "PATCH", body: JSON.stringify({ rtcRegion: val }) },
          );
          setServers(data.servers);
          const label = val === "de" ? "Germany" : val === "nl" ? "Netherlands" : "Automatic";
          setNotice(`Voice region set to ${label} for #${channel.name}.`);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not set region.");
        }
      },
    });
  }

  async function deleteChannel(channel: PublicChannel) {
    showCustomConfirm({
      title: `Delete '${channel.name}'?`,
      message: "Are you sure? All messages in this channel will be permanently removed.",
      isDanger: true,
      confirmText: "Delete Channel",
      onConfirm: async () => {
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "DELETE" },
          );
          setServers(data.servers);
          if (voiceChannelId === channel.id) leaveVoice();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not delete it.");
        }
      },
    });
  }

  async function editServer() {
    if (!activeServer) return;
    setServerSettingsOpen(true);
  }

  function toggleCategory(id: string) {
    setCollapsedCats((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem("huddle-collapsed-cats", JSON.stringify([...next]));
      return next;
    });
  }

  async function addCategory() {
    if (!activeServerId || activeServerId === DM_HOME) return;
    showCustomPrompt({
      title: "Add Category",
      message: "Enter name for the new category:",
      placeholder: "e.g. Text Channels",
      confirmText: "Create Category",
      onConfirm: async (name) => {
        if (!name?.trim()) return;
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>("/api/categories", {
            method: "POST",
            body: JSON.stringify({ serverId: activeServerId, name: name.trim() }),
          });
          setServers(data.servers);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not create it.");
        }
      },
    });
  }

  async function renameCategory(categoryId: string, current: string) {
    showCustomPrompt({
      title: "Rename Category",
      message: `Enter new name for category "${current}":`,
      defaultValue: current,
      confirmText: "Save Name",
      onConfirm: async (name) => {
        if (!name?.trim() || name.trim() === current) return;
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/categories/${categoryId}`,
            { method: "PATCH", body: JSON.stringify({ name: name.trim() }) },
          );
          setServers(data.servers);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not rename it.");
        }
      },
    });
  }

  async function deleteCategory(categoryId: string, name: string) {
    showCustomConfirm({
      title: `Delete Category '${name}'?`,
      message: `Are you sure you want to delete the "${name}" category? Channels inside it will remain uncategorized.`,
      isDanger: true,
      confirmText: "Delete Category",
      onConfirm: async () => {
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/categories/${categoryId}`,
            { method: "DELETE" },
          );
          setServers(data.servers);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not delete it.");
        }
      },
    });
  }

  async function dropChannel(
    draggedId: string,
    targetCategoryId: string | null,
    beforeChannelId: string | null,
  ) {
    if (!activeServerId || !canManageChannels) return;
    const all = (activeServer?.channels.filter((c) => c.kind !== "dm") || []).map((c) => ({ ...c }));
    const dragged = all.find((c) => c.id === draggedId);
    if (!dragged || draggedId === beforeChannelId) return;

    const lists = new Map<string, PublicChannel[]>();
    const keyOf = (id: string | null) => id ?? "__none__";
    for (const channel of all) {
      if (channel.id === draggedId) continue;
      const key = keyOf(channel.categoryId);
      const list = lists.get(key) || [];
      list.push(channel);
      lists.set(key, list);
    }
    for (const list of lists.values()) list.sort((a, b) => a.position - b.position);

    dragged.categoryId = targetCategoryId;
    const targetKey = keyOf(targetCategoryId);
    const targetList = lists.get(targetKey) || [];
    const index = beforeChannelId ? targetList.findIndex((c) => c.id === beforeChannelId) : -1;
    if (index < 0) targetList.push(dragged);
    else targetList.splice(index, 0, dragged);
    lists.set(targetKey, targetList);

    const payload: Array<{ id: string; categoryId: string | null; position: number }> = [];
    for (const [key, list] of lists) {
      list.forEach((channel, position) => {
        payload.push({
          id: channel.id,
          categoryId: key === "__none__" ? null : key,
          position,
        });
      });
    }

    try {
      const data = await apiFetch<{ servers: PublicServer[] }>("/api/channels/reorder", {
        method: "POST",
        body: JSON.stringify({ serverId: activeServerId, channels: payload }),
      });
      setServers(data.servers);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not reorder.");
    } finally {
      setDragChannelId(null);
    }
  }

  function channelDragProps(channel: PublicChannel) {
    if (!canManageChannels) return {};
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        setDragChannelId(channel.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-huddle-channel", channel.id);
      },
      onDragEnd: () => setDragChannelId(null),
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragChannelId && dragChannelId !== channel.id) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!dragChannelId) return;
        event.preventDefault();
        event.stopPropagation();
        void dropChannel(dragChannelId, channel.categoryId, channel.id);
      },
    };
  }

  function categoryDropProps(categoryId: string | null) {
    if (!canManageChannels) return {};
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragChannelId) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!dragChannelId) return;
        event.preventDefault();
        void dropChannel(dragChannelId, categoryId, null);
      },
    };
  }

  async function dropServer(draggedId: string, beforeServerId: string | null) {
    if (!draggedId || draggedId === beforeServerId) return;
    const all = servers.map((s) => ({ ...s }));
    const dragged = all.find((s) => s.id === draggedId);
    if (!dragged) return;

    const rest = all.filter((s) => s.id !== draggedId);
    const index = beforeServerId ? rest.findIndex((s) => s.id === beforeServerId) : -1;
    if (index < 0) rest.push(dragged);
    else rest.splice(index, 0, dragged);

    const payload = rest.map((server, position) => ({
      id: server.id,
      position,
    }));

    try {
      const data = await apiFetch<{ servers: PublicServer[] }>("/api/servers/reorder", {
        method: "POST",
        body: JSON.stringify({ servers: payload }),
      });
      setServers(data.servers);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not reorder.");
    } finally {
      setDragServerId(null);
    }
  }

  function saveServerFolders(next: ServerFolder[]) {
    setServerFolders(next);
    void apiFetch<{ folders: ServerFolder[] }>("/api/servers/folders", {
      method: "PUT",
      body: JSON.stringify({ folders: next }),
    }).catch((error) => {
      setNotice(error instanceof Error ? error.message : "Could not save folders.");
      void loadServerFolders().catch(() => undefined);
    });
  }

  function toggleFolderOpen(folderId: string) {
    setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      try {
        localStorage.setItem("huddle:open-folders", JSON.stringify([...next]));
      } catch {
        // Private mode: folders just start closed next time.
      }
      return next;
    });
  }

  function folderIdOf(serverId: string): string | null {
    return serverFolders.find((folder) => folder.serverIds.includes(serverId))?.id || null;
  }

  function serverDragProps(server: PublicServer) {
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        setDragServerId(server.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-huddle-server", server.id);
      },
      onDragEnd: () => {
        setDragServerId(null);
        setServerDropHint(null);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragServerId && dragServerId !== server.id) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const box = event.currentTarget.getBoundingClientRect();
          const y = (event.clientY - box.top) / box.height;
          const mode = y > 0.25 && y < 0.75 ? "merge" : "before";
          if (serverDropHint?.id !== server.id || serverDropHint.mode !== mode) {
            setServerDropHint({ id: server.id, mode });
          }
        }
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setServerDropHint((hint) => (hint?.id === server.id ? null : hint));
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!dragServerId) return;
        event.preventDefault();
        event.stopPropagation();
        const merge = serverDropHint?.id === server.id && serverDropHint.mode === "merge";
        setServerDropHint(null);
        const targetFolder = folderIdOf(server.id);
        if (merge) {
          saveServerFolders(
            targetFolder
              ? moveToFolder(serverFolders, dragServerId, targetFolder)
              : createFolder(serverFolders, server.id, dragServerId, crypto.randomUUID()),
          );
          if (targetFolder && !openFolders.has(targetFolder)) toggleFolderOpen(targetFolder);
          setDragServerId(null);
          return;
        }
        if (targetFolder !== folderIdOf(dragServerId)) {
          saveServerFolders(
            targetFolder
              ? moveToFolder(serverFolders, dragServerId, targetFolder)
              : removeFromFolders(serverFolders, dragServerId),
          );
        }
        void dropServer(dragServerId, server.id);
      },
    };
  }

  function folderDropProps(folder: ServerFolder) {
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragServerId && !folder.serverIds.includes(dragServerId)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (serverDropHint?.id !== folder.id) {
            setServerDropHint({ id: folder.id, mode: "merge" });
          }
        }
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setServerDropHint((hint) => (hint?.id === folder.id ? null : hint));
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!dragServerId) return;
        event.preventDefault();
        event.stopPropagation();
        setServerDropHint(null);
        saveServerFolders(moveToFolder(serverFolders, dragServerId, folder.id));
        setDragServerId(null);
      },
    };
  }

  return {
    leaveServer,
    joinServerDirect,
    joinServerByCode,
    createServer,
    createChannel,
    changeChannelKind,
    renderKindMenu,
    renameChannel,
    editChannelTopic,
    editChannelSlowmode,
    toggleChannelNsfw,
    editChannelBitrate,
    toggleChannelSoundboard,
    editChannelRegion,
    deleteChannel,
    editServer,
    toggleCategory,
    addCategory,
    renameCategory,
    deleteCategory,
    dropChannel,
    channelDragProps,
    categoryDropProps,
    dropServer,
    saveServerFolders,
    toggleFolderOpen,
    folderIdOf,
    serverDragProps,
    folderDropProps,
  };
}
