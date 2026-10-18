import { useEffect, useLayoutEffect, useRef, type FormEvent } from "react";
import { shrinkImage } from "../../lib/shrink-image";
import { convertMsnEmoticons } from "@/lib/msn-emoticons";
import { playSound as playMsnSound } from "../../lib/msn-sounds";
import { applyPersonalEmoticons } from "@/lib/msn-contacts";
import { applyMessageFont } from "@/lib/text-style";
import { playScreenShareStartSound, playScreenShareStopSound } from "../../lib/audio-cues";
import { isImageUrl } from "../../components/message-body";
import { announceUnlocked } from "../../lib/achievement-client";
import { type Message } from "../../lib/chat/types";
import { applyReaction } from "../../lib/chat/reactions";
import { replaceEmojiShortcodes, parseQuickReaction } from "@/lib/emoji-shortcodes";
import { apiFetch } from "../../lib/client";
import { uploadBigFile } from "../../lib/big-upload";
import { NORMAL_UPLOAD_MAX_BYTES } from "@/lib/big-upload-key";
import { useDmCalls } from "../use-dm-calls";
import { mergeMessages, fitComposer } from "../../lib/chat/shell-helpers";
import type { useShellCommands } from "./use-shell-commands";

/** ChatShell, part 8 of 9. Reactions, threads, editing, screen-share alerts, search and sending from the composer. */
export function useShellMessaging(s: ReturnType<typeof useShellCommands>) {
  const {
    activeChannelId, activeChannelRef, activeDm, activeServerId, blockedUserIdsRef, composerRef,
    countedThreadRepliesRef, detachedRef, dms, draft, editDraft, emojiMap, hub, inDmHome,
    loadChannelPage, membersOpen, messageFont, messages, msnSoundsRef, msnTheme, onDmCallRef,
    pendingFiles, personalEmoticons, runCommand, runMessageSearch, sendText, setActiveChannelId,
    setActiveServerId, setDraft, setEditDraft, setEditingId, setMembersOpen, setMessages,
    setNotice, setPendingFiles, setThreadDraft, setThreadMessages, setThreadRoot, threadDraft,
    threadMessages, threadRoot, user, voice, voiceParticipants, voiceRooms,
  } = s;

  /** Uploads a recorded clip and posts it as a voice message. */
  async function toggleReaction(messageId: string | number, emoji: string) {
    const id = String(messageId);
    const me = user
      ? {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        avatarUrl: user.avatarUrl,
        color: user.color,
      }
      : undefined;
    // Optimistic: flip locally, then persist. The socket echo reconciles.
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
            ...message,
            reactions: applyReaction(
              message.reactions,
              emoji,
              true,
              !message.reactions?.find((r) => r.emoji === emoji)?.mine,
              me,
            ),
          }
          : message,
      ),
    );
    setThreadMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
            ...message,
            reactions: applyReaction(
              message.reactions,
              emoji,
              true,
              !message.reactions?.find((r) => r.emoji === emoji)?.mine,
              me,
            ),
          }
          : message,
      ),
    );
    setThreadRoot((current) =>
      current && current.id === messageId
        ? {
          ...current,
          reactions: applyReaction(
            current.reactions,
            emoji,
            true,
            !current.reactions?.find((r) => r.emoji === emoji)?.mine,
            me,
          ),
        }
        : current,
    );
    await apiFetch(`/api/messages/${id}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    }).catch((error: Error) => {
      // The reaction did not land (a timeout, say): show what is really there.
      setNotice(error.message);
      const channelId = activeChannelRef.current;
      if (!channelId || detachedRef.current) return;
      void loadChannelPage(channelId)
        .then((data) => {
          if (activeChannelRef.current === channelId) {
            setMessages((current) => mergeMessages(current, data.messages));
          }
        })
        .catch(() => undefined);
    });
  }

  const threadBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (threadRoot && threadBottomRef.current) {
      threadBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [threadRoot?.id, threadMessages.length]);

  async function openThread(message: Message) {
    setThreadRoot(message);
    setThreadDraft("");
    // If window is < 1300px, automatically close member panel to leave ample room for chat + thread
    if (typeof window !== "undefined" && window.innerWidth < 1300 && membersOpen) {
      setMembersOpen(false);
    }
    const data = await apiFetch<{ messages: Message[] }>(
      `/api/messages?threadId=${encodeURIComponent(String(message.id))}`,
    ).catch(() => ({ messages: [] as Message[] }));
    setThreadMessages(data.messages);
  }

  async function sendThreadReply() {
    const text = threadDraft.trim();
    if (!text || !threadRoot || !activeChannelId) return;
    setThreadDraft("");

    // Quick reaction shortcut support in threads (e.g. :+tada:, :+smiley:, :+thumbsup:)
    const quickReaction = parseQuickReaction(text, emojiMap);
    if (quickReaction) {
      const targetMessage = threadMessages.length > 0
        ? threadMessages[threadMessages.length - 1]
        : threadRoot;
      if (targetMessage) {
        await toggleReaction(targetMessage.id, quickReaction.emoji);
        return;
      }
    }

    // In an AI answer's thread every reply is a follow-up question. Both the
    // question and the answer arrive over the socket like any thread reply.
    if (threadRoot.kind === "ai") {
      try {
        await apiFetch("/api/ai/ask", {
          method: "POST",
          body: JSON.stringify({
            channelId: activeChannelId,
            question: text,
            threadId: String(threadRoot.id),
          }),
        });
      } catch (error) {
        setThreadDraft(text);
        setNotice(error instanceof Error ? error.message : "The AI did not answer.");
      }
      return;
    }

    try {
      const processedText = replaceEmojiShortcodes(text, emojiMap);
      const data = await apiFetch<{ message: Message }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          channelId: activeChannelId,
          content: processedText,
          threadId: String(threadRoot.id),
        }),
      });
      // The socket echo may have already delivered this reply; don't add or
      // count it twice.
      setThreadMessages((current) =>
        current.some((m) => m.id === data.message.id)
          ? current
          : [...current, data.message],
      );
      if (!countedThreadRepliesRef.current.has(String(data.message.id))) {
        countedThreadRepliesRef.current.add(String(data.message.id));
        // Bump the reply count on the root message in the main view.
        setMessages((current) =>
          current.map((m) =>
            m.id === threadRoot.id
              ? { ...m, threadCount: (m.threadCount || 0) + 1 }
              : m,
          ),
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Reply did not send.");
    }
  }

  function beginEdit(message: Message) {
    setEditingId(message.id);
    setEditDraft(message.text);
  }

  async function saveEdit(message: Message) {
    const content = editDraft.trim();
    setEditingId(null);
    if (!content || content === message.text) return;
    setMessages((current) =>
      current.map((m) =>
        m.id === message.id
          ? { ...m, text: content, editedAt: new Date().toISOString() }
          : m,
      ),
    );
    await apiFetch(`/api/messages/${message.id}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }).catch((error: Error) => {
      // Put the text back as it was: the edit did not happen.
      setMessages((current) =>
        current.map((m) =>
          m.id === message.id ? { ...m, text: message.text, editedAt: message.editedAt } : m,
        ),
      );
      setNotice(error.message);
    });
  }

  // The message box grows with what you type instead of scrolling a slot.
  useLayoutEffect(() => {
    if (composerRef.current) fitComposer(composerRef.current);
  }, [draft]);

  const {
    incomingDmCall,
    dmCall,
    setDmCall,
    callDuration,
    dmCallView,
    startDmCall,
    endDmCall,
    acceptIncomingCall,
    declineIncomingCall,
  } = useDmCalls({
    user,
    hub,
    voice,
    voiceParticipants,
    voiceRooms,
    dms,
    activeDm,
    activeChannelId,
    blockedUserIdsRef,
    onDmCallRef,
    setNotice,
    setActiveServerId,
    setActiveChannelId,
  });

  // Peer screen sharing sound tracker
  const prevPeerScreenShares = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentScreenPeers = new Set(
      voiceParticipants
        .filter((p) => p.connectionId !== hub.connectionId && !!p.screenStreamId)
        .map((p) => p.connectionId),
    );
    if (voice.channelId) {
      for (const id of currentScreenPeers) {
        if (!prevPeerScreenShares.current.has(id)) {
          playScreenShareStartSound();
          break;
        }
      }
      for (const id of prevPeerScreenShares.current) {
        if (!currentScreenPeers.has(id)) {
          playScreenShareStopSound();
          break;
        }
      }
    }
    prevPeerScreenShares.current = currentScreenPeers;
  }, [voiceParticipants, voice.channelId, hub.connectionId]);

  const runSearch = (query: string) =>
    runMessageSearch(query, inDmHome ? null : activeServerId);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const typed = draft.trim();
    // The MSN theme turns :) (Y) <3 into pictures, as Messenger did. Never
    // inside a slash command, where the text is an argument.
    const text = msnTheme && !typed.startsWith("/") ? convertMsnEmoticons(typed) : typed;
    const files = pendingFiles;
    if (!text && !files.length) return;

    setDraft("");
    setPendingFiles([]);

    if (text.startsWith("/") && !files.length) {
      await runCommand(text);
      return;
    }

    // Quick reaction shortcut to react to the last message in the channel (e.g. :+tada:, :+smiley:, :+thumbsup:, :+1:)
    const quickReaction = parseQuickReaction(text, emojiMap);
    if (quickReaction && !files.length) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        await toggleReaction(lastMessage.id, quickReaction.emoji);
        return;
      } else {
        setNotice("There are no messages in this channel to react to yet.");
        return;
      }
    }

    try {
      // Upload every staged file, then send one message carrying them all.
      const keys: string[] = [];
      const imageAlts: Record<string, string> = {};
      for (const entry of files) {
        const file = entry.original ? entry.file : await shrinkImage(entry.file);
        if (file.size > NORMAL_UPLOAD_MAX_BYTES) {
          const name = file.name;
          keys.push(
            await uploadBigFile(file, (sent, total) =>
              setNotice(`Uploading ${name}… ${Math.floor((sent / total) * 100)}% — keep this tab open.`),
            ),
          );
          setNotice("");
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        const upload = await apiFetch<{ key: string }>("/api/uploads", {
          method: "POST",
          body: form,
        });
        keys.push(upload.key);
        if (entry.alt) imageAlts[upload.key] = entry.alt;
      }
      const processedText = replaceEmojiShortcodes(text, emojiMap);
      // MSN sends everything in the font picked in its Font dialog (not a
      // bare GIF/sticker link, which has to stay a link to show as a picture).
      // Your own emoticons turn into their pictures for everyone, too.
      const styled =
        msnTheme && !isImageUrl(processedText)
          ? applyMessageFont(applyPersonalEmoticons(processedText, personalEmoticons.emoticons), messageFont)
          : processedText;
      const res = await sendText(styled, keys, Object.keys(imageAlts).length ? { imageAlts } : undefined);
      announceUnlocked(res?.newAchievements);
      if (msnSoundsRef.current) {
        playMsnSound("send");
      }
    } catch (error) {
      if (msnSoundsRef.current) {
        playMsnSound("error");
      }
      // Put the message back so a dropped connection or a rate limit does not
      // eat what someone typed — unless they have already started a new one.
      setDraft((current) => (current ? current : text));
      setPendingFiles((current) => (current.length ? current : files));
      setNotice(
        error instanceof Error ? error.message : "That message did not send.",
      );
    }
  }

  // Posts a file (e.g. a filled-in PDF copy) straight to the current channel.
  async function sendFileCopy(file: File) {
    const form = new FormData();
    form.append("file", file);
    const upload = await apiFetch<{ key: string }>("/api/uploads", {
      method: "POST",
      body: form,
    });
    await sendText("", [upload.key]);
  }

  return {
    ...s,
    toggleReaction, threadBottomRef, openThread, sendThreadReply, beginEdit, saveEdit,
    incomingDmCall, dmCall, setDmCall, callDuration, dmCallView, startDmCall, endDmCall,
    acceptIncomingCall, declineIncomingCall, prevPeerScreenShares, runSearch, sendMessage,
    sendFileCopy,
  };
}
