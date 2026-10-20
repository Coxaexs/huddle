import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { unregisterNativePush } from "../../lib/native-push";
import { channelKindInfo } from "@/lib/channel-kinds";
import { type Member } from "@/lib/users";
import { findTagQuery, nameToHandle } from "@/lib/mention-handles";
import { type MentionOption } from "../../lib/chat/types";
import { rankMentionMatches } from "../../lib/chat/format";
import { findMatchingEmojiShortcodes } from "@/lib/emoji-shortcodes";
import { apiFetch } from "../../lib/client";
import { bigUploadStatus } from "../../lib/big-upload";
import { NORMAL_UPLOAD_MAX_BYTES } from "@/lib/big-upload-key";
import { disableWebPush } from "../../lib/web-push";
import { matchCommands } from "../../lib/commands";
import { useVoiceRecorder } from "../../components/voice-message";
import { useChannelServerActions } from "../use-channel-server-actions";
import type { useShellMessaging } from "./use-shell-messaging";

/** ChatShell, part 9 of 9. Composer autocomplete (/commands, @mentions, :emoji:), its keyboard handling, attachments, server and channel actions, and the voice recorder. */
export function useShellComposer(s: ReturnType<typeof useShellMessaging>) {
  const {
    activeChannelId, activeDm, activeServer, activeServerId, beginEdit, botCommands,
    canManageChannels, canMentionEveryone, composerRef, draft, dragChannelId, dragServerId,
    editingId, emojiMap, features, inDmHome, joinServerDirectRef, loadServerFolders, members,
    messages, openFolders, runCommand, sendMessage, sendVoiceMessage, serverDropHint,
    serverFolders, servers, setActiveChannelId, setActiveServerId, setBotMenu, setCollapsedCats,
    setDraft, setDragChannelId, setDragServerId, setDragging, setGroupDmMenu, setKindMenu,
    setNotice, setOpenFolders, setPendingFiles, setResolvedInvites, setServerDropHint,
    setServerFolders, setServerSettingsOpen, setServers, setSettingsOpen, setSlashIndex, setUser,
    setUserMenu, showCustomConfirm, showCustomPrompt, slashIndex, touchInput, user, voice,
    wrapSelection,
  } = s;

  const activeDisabledModules = useMemo(
    () => [...(activeServer?.disabledModules || []), ...(user?.disabledModules || [])],
    [activeServer?.disabledModules, user?.disabledModules],
  );
  const slashOpen = draft.startsWith("/") && !draft.includes("\n");
  const slashMatches = useMemo(
    () =>
      (slashOpen
        ? matchCommands(draft.split(/\s+/)[0], botCommands, activeDisabledModules)
        : []
      ).filter((command) => features.recordSessions || command.name !== "record"),
    [slashOpen, draft, features.recordSessions, botCommands, activeDisabledModules],
  );
  const slashActive = slashOpen && !draft.includes(" ") && slashMatches.length > 0;

  // @-mention / #-channel autocomplete for the token right before the caret.
  const [composerCaret, setComposerCaret] = useState(0);
  const [dismissedTagAt, setDismissedTagAt] = useState<number | null>(null);
  const tagQuery = useMemo(
    () => findTagQuery(draft.slice(0, composerCaret)),
    [draft, composerCaret],
  );
  useEffect(() => {
    if (!tagQuery) setDismissedTagAt(null);
  }, [tagQuery]);
  const dmMembers: Member[] = useMemo(() => {
    if (!inDmHome || !user) return [];
    const meAsMember: Member = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      avatarUrl: user.avatarUrl,
      color: user.color,
      lastSeenAt: new Date().toISOString(),
    };
    if (!activeDm) return [meAsMember];
    if (activeDm.group) {
      return activeDm.group.members.map((member) =>
        member.id === user.id ? meAsMember : member,
      );
    }
    const otherAsMember: Member = {
      id: activeDm.user.id,
      username: activeDm.user.username,
      displayName: activeDm.user.displayName,
      avatar: activeDm.user.avatar,
      avatarUrl: activeDm.user.avatarUrl,
      color: activeDm.user.color,
      lastSeenAt: new Date().toISOString(),
    };
    return [meAsMember, otherAsMember];
  }, [inDmHome, activeDm, user]);

  const mentionMatches = useMemo<MentionOption[]>(() => {
    if (!tagQuery) return [];
    const query = tagQuery.query;
    if (tagQuery.trigger === "#") {
      if (inDmHome) return [];
      // Voice rooms stay listed: people link `#kitchen-table` to send someone
      // into a room, so only the DM pseudo-kind is excluded.
      const channels = (activeServer?.channels || []).filter((channel) => {
        const info = channelKindInfo(channel.kind);
        return (info.text || info.appearsAsVoice) && channel.kind !== "dm";
      });
      return rankMentionMatches(
        channels,
        query,
        (channel) => [channel.name],
        (a, b) =>
          Number(channelKindInfo(a.kind).appearsAsVoice) -
            Number(channelKindInfo(b.kind).appearsAsVoice) || a.position - b.position,
      )
        .slice(0, 10)
        .map((channel) => ({ kind: "channel", channel }));
    }
    // People first: that's what @ is usually for. Nicknames, global names
    // and usernames all match, so "@es" finds "Escanor" by any of them.
    const memberOptions: MentionOption[] = rankMentionMatches(
      inDmHome ? dmMembers : members,
      query,
      (member) => [member.displayName, member.nickname, member.globalName, member.username],
      (a, b) => a.displayName.localeCompare(b.displayName),
    )
      .slice(0, 8)
      .map((member) => ({ kind: "user", member }));
    const roleOptions: MentionOption[] = rankMentionMatches(
      (activeServer?.roles || []).filter((role) => nameToHandle(role.name) !== ""),
      query,
      (role) => [role.name],
      (a, b) => a.name.localeCompare(b.name),
    )
      .slice(0, 5)
      .map((role) => ({ kind: "role", role }));
    const broadcastOptions: MentionOption[] =
      inDmHome || !canMentionEveryone
        ? []
        : rankMentionMatches(
            ["everyone", "here"] as const,
            query,
            (name) => [name],
            () => 0,
          ).map((name) => ({ kind: "broadcast", name }));
    return [...memberOptions, ...roleOptions, ...broadcastOptions];
  }, [tagQuery, members, activeServer, inDmHome, dmMembers, canMentionEveryone]);
  const mentionActive =
    tagQuery !== null && tagQuery.start !== dismissedTagAt && mentionMatches.length > 0;

  useEffect(() => setSlashIndex(0), [draft, tagQuery?.trigger]);

  function pickMention(option: MentionOption) {
    if (!tagQuery) return;
    const token =
      option.kind === "user"
        ? `@${option.member.username}`
        : option.kind === "role"
          ? `@${nameToHandle(option.role.name)}`
          : option.kind === "broadcast"
            ? `@${option.name}`
            : `#${nameToHandle(option.channel.name)}`;
    const before = draft.slice(0, tagQuery.start);
    // Swallow the rest of a half-typed word when picking from the middle of it.
    const after = draft.slice(composerCaret).replace(/^[^\s]*/, "");
    const insert = after.startsWith(" ") ? token : `${token} `;
    const caret = before.length + insert.length + (after.startsWith(" ") ? 1 : 0);
    setDraft(before + insert + after);
    setComposerCaret(caret);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(caret, caret);
    });
  }

  // :-emoji autocomplete: matches a :shortcode or :+shortcode being typed at the end of the draft.
  const emojiShortcodeMatch = useMemo(() => {
    const match = draft.match(/(?:^|\s)(:\+?|[+]:?)([a-zA-Z0-9_+-]{1,20})$/);
    if (!match) return null;
    return {
      prefix: match[1],
      query: match[2].toLowerCase(),
    };
  }, [draft]);

  const emojiMatches = useMemo(() => {
    if (!emojiShortcodeMatch) return [];
    return findMatchingEmojiShortcodes(emojiShortcodeMatch.query, emojiMap, 8);
  }, [emojiShortcodeMatch, emojiMap]);

  const emojiActive = emojiShortcodeMatch !== null && emojiMatches.length > 0;
  const [emojiIndex, setEmojiIndex] = useState(0);
  useEffect(() => setEmojiIndex(0), [emojiShortcodeMatch?.query]);

  function pickEmojiShortcode(item: { name: string; symbol: string; isCustom?: boolean; url?: string }) {
    if (!emojiShortcodeMatch) return;
    const isReaction = emojiShortcodeMatch.prefix.includes("+");
    const replacement = isReaction
      ? `:+${item.name}:`
      : item.isCustom
        ? `:${item.name}: `
        : `${item.symbol} `;
    setDraft((current) =>
      current.replace(/(?:^|\s)(:\+?|[+]:?)[a-zA-Z0-9_+-]{1,20}$/, (m) => {
        const lead = m.startsWith(" ") ? " " : "";
        return lead + replacement;
      }),
    );
    composerRef.current?.focus();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd+B, I, U format the selection, as in any editor.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      const fence = { b: "**", i: "*", u: "__" }[event.key.toLowerCase()];
      if (fence) {
        event.preventDefault();
        wrapSelection(fence, fence);
        return;
      }
    }
    if (mentionActive) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedTagAt(tagQuery?.start ?? null);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashIndex((index) => (index + 1) % mentionMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashIndex(
          (index) => (index - 1 + mentionMatches.length) % mentionMatches.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        pickMention(mentionMatches[slashIndex % mentionMatches.length]);
        return;
      }
    }
    if (emojiActive) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setEmojiIndex((index) => (index + 1) % emojiMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setEmojiIndex(
          (index) => (index - 1 + emojiMatches.length) % emojiMatches.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        pickEmojiShortcode(emojiMatches[emojiIndex % emojiMatches.length]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setEmojiIndex(0);
        return;
      }
    }
    if (slashActive) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashIndex((index) => (index + 1) % slashMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashIndex(
          (index) => (index - 1 + slashMatches.length) % slashMatches.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        pickCommand(slashIndex, true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDraft("");
        return;
      }
    }
    if (
      event.key === "ArrowUp" &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      if (!draft && !editingId && user) {
        const lastUserMessage = [...messages]
          .reverse()
          // Not one still on its way: it has no id the server knows yet.
          .find((m) => m.userId === user.id && !m.bot && !m.pending);
        if (lastUserMessage) {
          event.preventDefault();
          beginEdit(lastUserMessage);
          return;
        }
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function pickCommand(index: number, fromKeyboard = false) {
    const command = slashMatches[index];
    if (!command) return;
    composerRef.current?.focus();
    // Run straight away only when the full name was typed (or it was clicked):
    // "/s" + Enter used to fire /skip or /stop for the whole room.
    const typedFully = draft.trim().toLowerCase() === `/${command.name}`;
    if (!command.args && (!fromKeyboard || typedFully)) {
      void runCommand(`/${command.name}`);
      setDraft("");
      return;
    }
    setDraft(command.args ? `/${command.name} ` : `/${command.name}`);
  }

  /** Shared by the paperclip, a drop, and a paste. Accepts several at once. */
  function acceptAttachment(files: FileList | File[] | undefined | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const MAX = 10;

    for (const file of list) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".html") || lower.endsWith(".htm")) {
        setNotice("For security, HTML files cannot be attached.");
        continue;
      }
      if (file.size > NORMAL_UPLOAD_MAX_BYTES) {
        // Up to 2 GB for people an admin picked; deleted 12 hours after sending.
        void bigUploadStatus()
          .then((big) => {
            if (!big.allowed) setNotice(`${file.name} is larger than 40 MB.`);
            else if (file.size > big.maxBytes) setNotice(`${file.name} is larger than 2 GB.`);
            else {
              stage(file, false);
              setNotice(`${file.name} is a big file: it is deleted 12 hours after you send it.`);
            }
          })
          .catch(() => setNotice(`${file.name} is larger than 40 MB.`));
        continue;
      }
      stage(file, file.type.startsWith("image/"));
    }
    composerRef.current?.focus();

    function stage(file: File, isImage: boolean) {
      const id = `${file.name}:${file.size}:${crypto.randomUUID()}`;
      setPendingFiles((current) =>
        current.length >= MAX ? current : [...current, { id, file, preview: null }],
      );
      if (isImage) {
        const reader = new FileReader();
        reader.onload = () =>
          setPendingFiles((current) =>
            current.map((entry) =>
              entry.id === id
                ? { ...entry, preview: String(reader.result) }
                : entry,
            ),
          );
        reader.readAsDataURL(file);
      }
    }
  }

  function chooseAttachment(event: ChangeEvent<HTMLInputElement>) {
    acceptAttachment(event.target.files);
    event.target.value = "";
  }

  function onChannelDragOver(event: DragEvent<HTMLElement>) {
    if (!activeChannelId) return;
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function onChannelDrop(event: DragEvent<HTMLElement>) {
    if (!activeChannelId) return;
    event.preventDefault();
    setDragging(false);
    acceptAttachment(event.dataTransfer.files);
  }

  const {
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
  } = useChannelServerActions({
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
    voiceChannelId: voice.channelId,
    leaveVoice: voice.leave,
    showCustomPrompt,
    showCustomConfirm,
  });

  joinServerDirectRef.current = joinServerDirect;

  async function signOut() {
    // Before logging out, while the request is still authenticated: this
    // device must stop getting the account's notifications.
    await unregisterNativePush();
    await disableWebPush().catch(() => undefined);
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    voice.leave();
    setUser(null);
    setSettingsOpen(false);
  }

  function openUserMenu(
    event: MouseEvent,
    member: Member,
    opts?: { dmChannelId?: string; dmPinned?: boolean },
  ) {
    event.preventDefault();
    setBotMenu(null);
    setGroupDmMenu(null);
    setUserMenu({
      member,
      x: event.clientX,
      y: event.clientY,
      dmChannelId: opts?.dmChannelId,
      dmPinned: opts?.dmPinned,
    });
  }

  /**
   * Touch screens have no right-click, so on a coarse pointer a plain tap opens
   * the same menu. Handed to both onClick and onContextMenu.
   */
  function userMenuHandlers(member: Member) {
    return {
      onContextMenu: (event: MouseEvent) => openUserMenu(event, member),
      onClick: (event: MouseEvent) => {
        if (!touchInput) return;
        openUserMenu(event, member);
      },
    };
  }

  function openBotMenu(event: MouseEvent, kind: "music" | "dnd") {
    event.preventDefault();
    setUserMenu(null);
    setBotMenu({ kind, x: event.clientX, y: event.clientY });
  }

  function prepareCommand(command: string) {
    setDraft(command);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }


  // --------------------------------------------------------------- render

  const voiceRecorder = useVoiceRecorder(sendVoiceMessage);
  useEffect(() => {
    if (!voiceRecorder.error) return;
    setNotice(voiceRecorder.error);
    voiceRecorder.clearError();
  }, [voiceRecorder.error]);
  // Switching channels mid-recording throws the recording away.
  useEffect(() => {
    voiceRecorder.cancel();
  }, [activeChannelId]);

  return {
    ...s,
    activeDisabledModules, slashOpen, slashMatches, slashActive, composerCaret, setComposerCaret,
    dismissedTagAt, setDismissedTagAt, tagQuery, dmMembers, mentionMatches, mentionActive,
    pickMention, emojiShortcodeMatch, emojiMatches, emojiActive, emojiIndex, setEmojiIndex,
    pickEmojiShortcode, onComposerKeyDown, pickCommand, acceptAttachment, chooseAttachment,
    onChannelDragOver, onChannelDrop, leaveServer, joinServerDirect, joinServerByCode,
    createServer, createChannel, changeChannelKind, renderKindMenu, renameChannel,
    editChannelTopic, editChannelSlowmode, toggleChannelNsfw, editChannelBitrate, toggleChannelSoundboard,
    editChannelRegion, deleteChannel, editServer, toggleCategory, addCategory, renameCategory,
    deleteCategory, dropChannel, channelDragProps, categoryDropProps, dropServer,
    saveServerFolders, toggleFolderOpen, folderIdOf, serverDragProps, folderDropProps, signOut,
    openUserMenu, userMenuHandlers, openBotMenu, prepareCommand, voiceRecorder,
  };
}
