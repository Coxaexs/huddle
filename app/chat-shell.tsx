"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { PlayerState } from "@/lib/protocol";
import type { PublicChannel, PublicServer } from "@/lib/servers";
import type { Member, PublicUser } from "@/lib/users";
import { AuthGate } from "./components/auth-gate";
import { Avatar } from "./components/avatar";
import {
  BotMenu,
  type BotMenuAction,
} from "./components/bot-menu";
import { DndCard } from "./components/dnd-card";
import { GifPicker } from "./components/gif-picker";
import { LyricsNow } from "./components/lyrics-now";
import { MessageBody } from "./components/message-body";
import {
  MusicSettingsCard,
  MusicStatsCard,
  type MusicSettings,
} from "./components/music-cards";
import { NowPlaying } from "./components/now-playing";
import { SettingsDialog } from "./components/settings-dialog";
import { SlashMenu } from "./components/slash-menu";
import {
  UserMenu,
  type UserMenuTarget,
  type VoicePref,
} from "./components/user-menu";
import { useHub } from "./hooks/use-hub";
import { usePlayer } from "./hooks/use-player";
import {
  useVoice,
  type ScreenShareQuality,
} from "./hooks/use-voice";
import { apiFetch, apiUrl } from "./lib/client";
import { registerMedia, unlockAudio, unregisterMedia } from "./lib/devices";
import {
  COMMAND_ALIASES,
  DISCORD_ONLY_COMMANDS,
  DND_LINK_COMMANDS,
  LOOKUP_COMMANDS,
  MUSIC_COMMANDS,
  VOICE_REQUIRED_MUSIC_COMMANDS,
  matchCommands,
} from "./lib/commands";

interface Message {
  id: string | number;
  channelId?: string | null;
  userId?: string | null;
  author: string;
  avatar: string;
  color: string;
  time: string;
  text: string;
  bot?: boolean;
  image?: string;
  file?: { url: string; name: string; type: "pdf" };
  link?: string;
  actionLabel?: string;
  audio?: string;
  kind?: string;
  pinned?: boolean;
  payload?: {
    voiceChannelId?: string;
    trackId?: string;
    label?: string;
    track?: string;
    artist?: string;
    lines?: Array<{ at: number; line: string; active: boolean }>;
    type?: string;
    name?: string;
    subtitle?: string;
    description?: string;
    facts?: Array<{ label: string; value: string }>;
    total?: number;
    expression?: string;
    details?: string[];
    autoplay?: boolean;
    automix?: boolean;
    automix_blend_seconds?: number;
    crossfade_seconds?: number;
    audio_filter?: string | null;
    artist_diversity?: boolean;
    vibe_match?: boolean;
    wrapped?: boolean;
    plays?: number;
    unique?: number;
    hours?: number;
    topSongs?: Array<[string, number]>;
    topRequesters?: Array<[string, number]>;
  };
}

interface DmSummary {
  channelId: string;
  user: Member;
  lastMessage: string | null;
  lastAt: string | null;
}

/** The rail slot for direct messages, standing in for a server id. */
const DM_HOME = "@me";

function Icon({
  children,
  label,
  onClick,
  active,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Audio-taper curve: makes the whole 0–100 slider feel evenly useful. */
function volumeGain(percent: number): number {
  const normalized = Math.max(0, Math.min(1, percent / 100));
  return normalized * normalized;
}

export function ChatShell() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [bootstrap, setBootstrap] = useState(false);
  const [ready, setReady] = useState(false);

  const [servers, setServers] = useState<PublicServer[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [dms, setDms] = useState<DmSummary[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pins, setPins] = useState<Message[]>([]);
  const [pinsOpen, setPinsOpen] = useState(false);

  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  // On a phone the member list is an overlay, so it starts out of the way.
  const [membersOpen, setMembersOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 760,
  );
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [userMenu, setUserMenu] = useState<UserMenuTarget | null>(null);
  const [botMenu, setBotMenu] = useState<{
    kind: "music" | "dnd";
    x: number;
    y: number;
  } | null>(null);
  const [voicePrefs, setVoicePrefs] = useState<Record<string, VoicePref>>({});

  const [musicWatchOnline, setMusicWatchOnline] = useState<boolean | null>(null);
  const [musicDashboardUrl, setMusicDashboardUrl] = useState<string | null>(null);
  const [dndOnline, setDndOnline] = useState<boolean | null>(null);
  const [dndUrl, setDndUrl] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const activeChannelRef = useRef<string | null>(null);
  activeChannelRef.current = activeChannelId;

  const inDmHome = activeServerId === DM_HOME;
  const [touchInput, setTouchInput] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const apply = () => setTouchInput(coarse.matches);
    apply();
    coarse.addEventListener("change", apply);
    return () => coarse.removeEventListener("change", apply);
  }, []);

  // Phones refuse to start any audio until the page has been touched. Every
  // media element registers itself, so one gesture is enough for all of them.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("touchend", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchend", unlock);
    };
  }, []);

  // ------------------------------------------------------------- session

  const loadServers = useCallback(async () => {
    const data = await apiFetch<{ servers: PublicServer[] }>("/api/servers");
    setServers(data.servers);
    return data.servers;
  }, []);

  const loadMembers = useCallback(async () => {
    const data = await apiFetch<{ members: Member[] }>("/api/members");
    setMembers(data.members);
  }, []);

  const loadDms = useCallback(async () => {
    const data = await apiFetch<{ conversations: DmSummary[] }>("/api/dms");
    setDms(data.conversations);
    return data.conversations;
  }, []);

  const loadPrefs = useCallback(async () => {
    const data = await apiFetch<{ prefs: Record<string, VoicePref> }>(
      "/api/voice/prefs",
    );
    setVoicePrefs(data.prefs || {});
  }, []);

  useEffect(() => {
    apiFetch<{ user: PublicUser | null; bootstrap: boolean }>(
      "/api/auth/session",
    )
      .then((data) => {
        setUser(data.user);
        setBootstrap(data.bootstrap);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadServers().catch(() => undefined);
    void loadMembers().catch(() => undefined);
    void loadDms().catch(() => undefined);
    void loadPrefs().catch(() => undefined);
  }, [user, loadServers, loadMembers, loadDms, loadPrefs]);

  useEffect(() => {
    if (!servers.length) return;
    setActiveServerId((current) => {
      if (current === DM_HOME) return current;
      const remembered =
        current || window.localStorage.getItem("huddle-server") || "";
      return servers.some((server) => server.id === remembered)
        ? remembered
        : servers[0].id;
    });
  }, [servers]);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || null,
    [servers, activeServerId],
  );
  const textChannels = useMemo(
    () => activeServer?.channels.filter((c) => c.kind === "text") || [],
    [activeServer],
  );
  const voiceChannels = useMemo(
    () => activeServer?.channels.filter((c) => c.kind === "voice") || [],
    [activeServer],
  );
  const membersById = useMemo(() => {
    const map = new Map<string, Member>();
    for (const member of members) map.set(member.id, member);
    return map;
  }, [members]);

  useEffect(() => {
    if (!activeServerId || activeServerId === DM_HOME) return;
    window.localStorage.setItem("huddle-server", activeServerId);
    setActiveChannelId((current) => {
      if (current && textChannels.some((channel) => channel.id === current)) {
        return current;
      }
      const remembered = window.localStorage.getItem(
        `huddle-channel:${activeServerId}`,
      );
      return (
        textChannels.find((channel) => channel.id === remembered)?.id ||
        textChannels[0]?.id ||
        null
      );
    });
  }, [activeServerId, textChannels]);

  useEffect(() => {
    if (activeServerId && activeServerId !== DM_HOME && activeChannelId) {
      window.localStorage.setItem(
        `huddle-channel:${activeServerId}`,
        activeChannelId,
      );
    }
  }, [activeServerId, activeChannelId]);

  const activeChannel = useMemo(
    () => textChannels.find((channel) => channel.id === activeChannelId) || null,
    [textChannels, activeChannelId],
  );
  const activeDm = useMemo(
    () => dms.find((dm) => dm.channelId === activeChannelId) || null,
    [dms, activeChannelId],
  );
  const channelTitle = inDmHome
    ? activeDm?.user.displayName || "Direct messages"
    : activeChannel?.name || "no channel";

  // ------------------------------------------------------------ realtime

  const refreshPins = useCallback(async (channelId: string) => {
    const data = await apiFetch<{ messages: Message[] }>(
      `/api/messages?channelId=${encodeURIComponent(channelId)}&pinned=1`,
    ).catch(() => ({ messages: [] as Message[] }));
    setPins(data.messages);
  }, []);

  const handleIncomingMessage = useCallback(
    (channelId: string, message: unknown) => {
      if (channelId !== activeChannelRef.current) {
        // A DM you are not looking at still deserves to bubble up the list.
        void loadDms().catch(() => undefined);
        return;
      }
      const incoming = message as Message;
      setMessages((current) =>
        current.some((existing) => existing.id === incoming.id)
          ? current
          : [...current, incoming],
      );
    },
    [loadDms],
  );

  const voiceSignalRef = useRef<(from: string, data: unknown) => void>(() => {});
  const forcedMuteRef = useRef<(userId: string, muted: boolean) => void>(
    () => {},
  );

  const hub = useHub(Boolean(user), {
    onMessage: handleIncomingMessage,
    onSignal: (from, data) => voiceSignalRef.current(from, data),
    onStructureChange: () => {
      void loadServers().catch(() => undefined);
      void loadMembers().catch(() => undefined);
    },
    onMessageDeleted: (channelId, id) => {
      if (channelId !== activeChannelRef.current) return;
      setMessages((current) => current.filter((message) => message.id !== id));
      setPins((current) => current.filter((message) => message.id !== id));
    },
    onMessagePinned: (channelId, id, pinned) => {
      if (channelId !== activeChannelRef.current) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === id ? { ...message, pinned } : message,
        ),
      );
      void refreshPins(channelId);
    },
    onForceMute: (userId, muted) => forcedMuteRef.current(userId, muted),
  });

  const voice = useVoice({
    connectionId: hub.connectionId,
    rooms: hub.voice,
    send: hub.send,
  });
  voiceSignalRef.current = voice.handleSignal;
  forcedMuteRef.current = (userId, muted) => {
    if (user && userId === user.id) voice.setForcedMute(muted);
  };

  const voiceParticipants = useMemo(
    () => (voice.channelId ? hub.voice[voice.channelId] || [] : []),
    [hub.voice, voice.channelId],
  );

  const roomPlayer: PlayerState | null = voice.channelId
    ? hub.players[voice.channelId] || null
    : null;
  const botStreaming = voiceParticipants.some(
    (participant) => participant.bot,
  );

  const player = usePlayer({
    state: roomPlayer,
    streamed: botStreaming,
    serverNow: hub.serverNow,
    deafened: voice.deafened,
    onEnded: (trackId) => {
      if (!voice.channelId) return;
      hub.send({
        t: "player",
        channelId: voice.channelId,
        action: { name: "ended", trackId },
      });
    },
  });

  // --------------------------------------------------------------- data

  useEffect(() => {
    if (!user || !activeChannelId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    apiFetch<{ messages: Message[] }>(
      `/api/messages?channelId=${encodeURIComponent(activeChannelId)}`,
    )
      .then((data) => {
        if (!cancelled) setMessages(data.messages);
      })
      .catch(() => undefined);
    void refreshPins(activeChannelId);
    hub.send({ t: "subscribe", channelId: activeChannelId });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeChannelId, hub.connected]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const preferred =
      window.localStorage.getItem("huddle-theme") === "light" ? "light" : "dark";
    const root = document.documentElement;
    root.dataset.theme = preferred;
    root.dataset.density =
      window.localStorage.getItem("huddle-density") || "cozy";
    root.dataset.backdrop =
      ["plain", "aurora", "dots"].includes(
        window.localStorage.getItem("huddle-backdrop") || "",
      )
        ? window.localStorage.getItem("huddle-backdrop")!
        : "plain";
    root.dataset.motion =
      window.localStorage.getItem("huddle-motion") || "full";
    root.style.setProperty(
      "--lavender",
      window.localStorage.getItem("huddle-accent") || "#9d8cf5",
    );
    root.style.setProperty(
      "--ui-corners",
      `${Number(window.localStorage.getItem("huddle-corners")) || 16}px`,
    );
    const frame = window.requestAnimationFrame(() => setTheme(preferred));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/integrations/musicwatch"))
      .then(
        (response) =>
          response.json() as Promise<{ online?: boolean; dashboardUrl?: string }>,
      )
      .then((data) => {
        setMusicWatchOnline(Boolean(data.online));
        setMusicDashboardUrl(data.dashboardUrl || null);
      })
      .catch(() => setMusicWatchOnline(false));

    fetch(apiUrl("/api/integrations/dnd"))
      .then(
        (response) =>
          response.json() as Promise<{ online?: boolean; appUrl?: string }>,
      )
      .then((data) => {
        setDndOnline(Boolean(data.online));
        setDndUrl(data.appUrl || null);
      })
      .catch(() => setDndOnline(false));
  }, [user]);

  // ------------------------------------------------------------- actions

  function applyTheme(next: "dark" | "light") {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("huddle-theme", next);
  }

  const postBotMessage = useCallback(
    async (text: string, options?: Partial<Message>) => {
      if (!activeChannelRef.current) return;
      await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          channelId: activeChannelRef.current,
          content: text,
          asBot: true,
          botName: options?.author || "Music + Watch",
          botAvatar: options?.avatar || "♫",
          link: options?.link,
          actionLabel: options?.actionLabel,
          audio: options?.audio,
          kind: options?.kind,
          payload: options?.payload,
        }),
      }).catch(() => undefined);
    },
    [],
  );

  async function openDm(targetId: string) {
    try {
      const data = await apiFetch<{
        channelId: string;
        conversations: DmSummary[];
      }>("/api/dms", {
        method: "POST",
        body: JSON.stringify({ userId: targetId }),
      });
      setDms(data.conversations);
      setActiveServerId(DM_HOME);
      setActiveChannelId(data.channelId);
      setMobileNav(false);
      composerRef.current?.focus();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open that.");
    }
  }

  async function deleteMessage(id: string | number) {
    try {
      await apiFetch(`/api/messages/${id}`, { method: "DELETE" });
      setMessages((current) => current.filter((message) => message.id !== id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete it.");
    }
  }

  async function togglePin(message: Message) {
    try {
      const data = await apiFetch<{ pinned: boolean }>(
        `/api/messages/${message.id}`,
        { method: "PATCH", body: JSON.stringify({ pinned: !message.pinned }) },
      );
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, pinned: data.pinned } : item,
        ),
      );
      if (activeChannelId) void refreshPins(activeChannelId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not pin it.");
    }
  }

  async function saveVoicePref(
    targetId: string,
    patch: { volume?: number; muted?: boolean; serverMuted?: boolean },
  ) {
    if (patch.volume !== undefined || patch.muted !== undefined) {
      setVoicePrefs((current) => ({
        ...current,
        [targetId]: {
          volume: patch.volume ?? current[targetId]?.volume ?? 100,
          muted: patch.muted ?? current[targetId]?.muted ?? false,
        },
      }));
    }
    await apiFetch("/api/voice/prefs", {
      method: "POST",
      body: JSON.stringify({ targetId, ...patch }),
    }).catch((error: Error) => setNotice(error.message));
  }

  async function runCommand(raw: string) {
    const [rawName, ...parts] = raw.trim().split(/\s+/);
    const bare = rawName.replace(/^\//, "").toLowerCase();
    const name = COMMAND_ALIASES[bare] || bare;
    const value = parts.join(" ").trim();

    if (MUSIC_COMMANDS.has(name)) {
      const requiresPresence = VOICE_REQUIRED_MUSIC_COMMANDS.has(name);
      if (requiresPresence && !voice.channelId) {
        setNotice(
          `Join a voice channel first to use /${name}. Room info, settings, stats and Wrapped work from anywhere.`,
        );
        return;
      }
      const targetVoiceChannelId =
        voice.channelId ||
        voiceChannels.find((channel) => hub.players[channel.id]?.track)?.id ||
        voiceChannels[0]?.id;
      if (!targetVoiceChannelId) {
        setNotice("This server does not have a voice room yet.");
        return;
      }
      // Keep the permanent media element unlocked when a playback command is
      // submitted from a user gesture.
      if (requiresPresence) player.prime();
      try {
        await apiFetch("/api/music/command", {
          method: "POST",
          body: JSON.stringify({
            command: `/${name} ${value}`.trim(),
            voiceChannelId: targetVoiceChannelId,
            textChannelId: activeChannelId,
          }),
        });
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "That music command failed.",
        );
      }
      return;
    }

    if (DISCORD_ONLY_COMMANDS.has(name)) {
      // These drive the bot's Discord voice connection, not Huddle playback.
      try {
        const data = await apiFetch<{
          text?: string;
          kind?: string;
          payload?: Message["payload"];
        }>(
          "/api/integrations/musicwatch/command",
          {
            method: "POST",
            body: JSON.stringify({ command: `/${name} ${value}`.trim() }),
          },
        );
        await postBotMessage(data.text || "Done on Discord.");
      } catch (error) {
        await postBotMessage(
          error instanceof Error
            ? error.message
            : "The Discord music bot could not do that.",
        );
      }
      return;
    }

    if (name === "watch" || name === "reels") {
      await postBotMessage(
        name === "reels"
          ? "Creating a synchronized ReelsTogether room…"
          : "Creating a synchronized Watch Together room…",
      );
      try {
        const data = await apiFetch<{ url: string }>(
          "/api/integrations/musicwatch",
          {
            method: "POST",
            body: JSON.stringify({ mode: name, name: `${channelTitle} · Huddle` }),
          },
        );
        await postBotMessage(
          name === "reels"
            ? "Your shared reels room is ready. Everyone who opens this link joins the same synchronized feed."
            : "Your watch room is ready. Everyone who opens this link joins the same synchronized player.",
          {
            link: data.url,
            actionLabel: name === "reels" ? "Open reels room" : "Open watch room",
          },
        );
      } catch {
        await postBotMessage(
          "I couldn’t reach the Music + Watch server. Start it on your server and set MUSICWATCH_BASE_URL in Huddle.",
        );
      }
      return;
    }

    if (name === "music" || name === "web") {
      await postBotMessage(
        musicWatchOnline
          ? "The music dashboard is online. It can see this Huddle's voice rooms as well as Discord."
          : "The music server looks offline. Start musicwatchtogether first, then try again.",
        musicDashboardUrl
          ? { link: musicDashboardUrl, actionLabel: "Open music dashboard" }
          : undefined,
      );
      return;
    }

    if (name === "roll") {
      try {
        const data = await apiFetch<{
          text?: string;
          kind?: string;
          payload?: Message["payload"];
        }>(
          "/api/integrations/dnd/roll",
          { method: "POST", body: JSON.stringify({ command: raw }) },
        );
        await postBotMessage(data.text || "The roll failed.", {
          author: "D&D Bot",
          avatar: "⚔",
          kind: data.kind,
          payload: data.payload,
        });
      } catch (error) {
        await postBotMessage(
          error instanceof Error ? error.message : "The roll failed.",
          { author: "D&D Bot", avatar: "⚔" },
        );
      }
      return;
    }

    if (LOOKUP_COMMANDS.has(name)) {
      if (!value) {
        setNotice(`Try \`/${name} ${name === "spell" ? "fireball" : "goblin"}\`.`);
        return;
      }
      try {
        const data = await apiFetch<{
          text: string;
          link?: string;
          kind?: string;
          payload?: Message["payload"];
        }>(
          "/api/integrations/dnd/lookup",
          { method: "POST", body: JSON.stringify({ kind: name, query: value }) },
        );
        await postBotMessage(data.text, {
          author: "D&D Bot",
          avatar: "⚔",
          link: data.link,
          actionLabel: data.link ? "Open on 5e.tools" : undefined,
          kind: data.kind,
          payload: data.payload,
        });
      } catch (error) {
        await postBotMessage(
          error instanceof Error ? error.message : "That lookup failed.",
          { author: "D&D Bot", avatar: "⚔" },
        );
      }
      return;
    }

    if (DND_LINK_COMMANDS.has(name)) {
      await postBotMessage(
        dndOnline
          ? "Character sheets, inventory and the GM panel live in the D&D companion — open it here."
          : "The D&D companion looks offline right now.",
        {
          ...(dndUrl ? { link: dndUrl, actionLabel: "Open D&D companion" } : {}),
          author: "D&D Bot",
          avatar: "⚔",
        },
      );
      return;
    }

    if (name === "flip" || name === "coinflip") {
      await postBotMessage(Math.random() > 0.5 ? "Heads." : "Tails.");
      return;
    }

    if (name === "shrug") {
      await sendText("¯\\_(ツ)_/¯");
      return;
    }

    if (name === "help") {
      await postBotMessage(
        "Type / in the box to see every command with its arguments. Music commands need you to be in a voice channel; a few still run on Discord and say so.",
      );
      return;
    }

    setNotice(`I don't know /${bare}. Type / to see what I do know.`);
  }

  async function runMusicUiCommand(
    raw: string,
    roomHint?: string,
  ): Promise<MusicSettings | void> {
    const targetVoiceChannelId =
      roomHint ||
      voice.channelId ||
      voiceChannels.find((channel) => hub.players[channel.id]?.track)?.id ||
      voiceChannels[0]?.id;
    if (!targetVoiceChannelId) {
      setNotice("This server does not have a voice room yet.");
      return;
    }
    const name = raw.trim().split(/\s+/)[0].replace(/^\//, "");
    const silent = new Set([
      "autoplay",
      "automix",
      "artistdiversity",
      "vibematch",
      "automixblend",
      "crossfade",
      "filter",
    ]).has(name);
    try {
      const data = await apiFetch<{ state?: MusicSettings }>(
        "/api/music/command",
        {
          method: "POST",
          body: JSON.stringify({
            command: raw,
            voiceChannelId: targetVoiceChannelId,
            textChannelId: activeChannelId,
            silent,
          }),
        },
      );
      return data.state;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "That music control failed.",
      );
    }
  }

  async function sendText(text: string, attachmentKey?: string) {
    if (!activeChannelId) return;
    await apiFetch("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        channelId: activeChannelId,
        content: text,
        attachmentKey,
      }),
    });
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text && !pendingFile) return;

    setDraft("");
    setPendingImage(null);
    setPendingFile(null);

    if (text.startsWith("/") && !pendingFile) {
      await runCommand(text);
      return;
    }

    try {
      let attachmentKey: string | undefined;
      if (pendingFile) {
        const form = new FormData();
        form.append("file", pendingFile);
        const upload = await apiFetch<{ key: string }>("/api/uploads", {
          method: "POST",
          body: form,
        });
        attachmentKey = upload.key;
      }
      await sendText(text, attachmentKey);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "That message did not send.",
      );
    }
  }

  const slashOpen = draft.startsWith("/") && !draft.includes("\n");
  const slashMatches = useMemo(
    () => (slashOpen ? matchCommands(draft.split(/\s+/)[0]) : []),
    [slashOpen, draft],
  );
  const slashActive = slashOpen && !draft.includes(" ") && slashMatches.length > 0;

  useEffect(() => setSlashIndex(0), [draft]);

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
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
        pickCommand(slashIndex);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDraft("");
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function pickCommand(index: number) {
    const command = slashMatches[index];
    if (!command) return;
    setDraft(command.args ? `/${command.name} ` : `/${command.name}`);
    composerRef.current?.focus();
    if (!command.args) {
      void runCommand(`/${command.name}`);
      setDraft("");
    }
  }

  /** Shared by the paperclip, a drop, and a paste. */
  function acceptAttachment(file: File | undefined | null) {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      setNotice("Huddle takes images and PDFs.");
      return;
    }
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => setPendingImage(String(reader.result));
      reader.readAsDataURL(file);
    } else {
      setPendingImage(null);
    }
    setPendingFile(file);
    composerRef.current?.focus();
  }

  function chooseAttachment(event: ChangeEvent<HTMLInputElement>) {
    acceptAttachment(event.target.files?.[0]);
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
    acceptAttachment(event.dataTransfer.files?.[0]);
  }

  async function createServer() {
    const name = window.prompt("Name your new server");
    if (!name?.trim()) return;
    try {
      const data = await apiFetch<{
        server: PublicServer;
        servers: PublicServer[];
      }>("/api/servers", { method: "POST", body: JSON.stringify({ name }) });
      setServers(data.servers);
      setActiveServerId(data.server.id);
      setNotice(`${data.server.name} is live — everyone here is already in it.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create it.");
    }
  }

  async function createChannel(kind: "text" | "voice") {
    if (!activeServerId || activeServerId === DM_HOME) return;
    const name = window.prompt(
      kind === "text" ? "New text channel name" : "New voice room name",
    );
    if (!name?.trim()) return;
    try {
      const data = await apiFetch<{ channelId: string; servers: PublicServer[] }>(
        "/api/channels",
        {
          method: "POST",
          body: JSON.stringify({ serverId: activeServerId, name, kind }),
        },
      );
      setServers(data.servers);
      if (kind === "text") setActiveChannelId(data.channelId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create it.");
    }
  }

  async function renameChannel(channel: PublicChannel) {
    const name = window.prompt(`Rename ${channel.name}`, channel.name);
    if (!name?.trim()) return;
    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(
        `/api/channels/${channel.id}`,
        { method: "PATCH", body: JSON.stringify({ name }) },
      );
      setServers(data.servers);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not rename it.");
    }
  }

  async function deleteChannel(channel: PublicChannel) {
    if (!window.confirm(`Delete ${channel.name} and everything in it?`)) return;
    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(
        `/api/channels/${channel.id}`,
        { method: "DELETE" },
      );
      setServers(data.servers);
      if (voice.channelId === channel.id) voice.leave();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete it.");
    }
  }

  async function editServer() {
    if (!activeServer) return;
    const name = window.prompt("Rename this server", activeServer.name);
    if (name === null) return;
    if (!name.trim()) {
      if (!window.confirm(`Delete ${activeServer.name}?`)) return;
      const data = await apiFetch<{ servers: PublicServer[] }>(
        `/api/servers/${activeServer.id}`,
        { method: "DELETE" },
      ).catch((error: Error) => {
        setNotice(error.message);
        return null;
      });
      if (data) {
        setServers(data.servers);
        setActiveServerId(data.servers[0]?.id || null);
      }
      return;
    }
    const data = await apiFetch<{ servers: PublicServer[] }>(
      `/api/servers/${activeServer.id}`,
      { method: "PATCH", body: JSON.stringify({ name }) },
    ).catch(() => null);
    if (data) setServers(data.servers);
  }

  async function signOut() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    voice.leave();
    setUser(null);
    setSettingsOpen(false);
  }

  function openUserMenu(event: MouseEvent, member: Member) {
    event.preventDefault();
    setBotMenu(null);
    setUserMenu({ member, x: event.clientX, y: event.clientY });
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

  if (!ready) {
    return (
      <main className="app-shell booting">
        <div className="boot-card">Opening Huddle…</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell">
        <AuthGate
          bootstrap={bootstrap}
          onSignedIn={(signedIn) => {
            setUser(signedIn);
            setBootstrap(false);
          }}
        />
      </main>
    );
  }

  const onlineMembers = members.filter((member) => hub.online.has(member.id));
  const offlineMembers = members.filter((member) => !hub.online.has(member.id));
  const currentVoiceChannel = voiceChannels.find(
    (channel) => channel.id === voice.channelId,
  );
  const prefFor = (id: string): VoicePref =>
    voicePrefs[id] || { volume: 100, muted: false };
  const currentPlayer = voice.channelId
    ? hub.players[voice.channelId] || null
    : null;
  const musicBotActions: BotMenuAction[] = [
    { label: "Play something…", onSelect: () => prepareCommand("/play ") },
    { label: "Show queue", onSelect: () => prepareCommand("/queue") },
    { label: "Lyrics now", onSelect: () => void runCommand("/lyricsnow") },
    {
      label: "Toggle Smart Autoplay",
      onSelect: () => void runCommand("/autoplay"),
    },
    {
      label: "Toggle AutoMix",
      onSelect: () => void runCommand("/automix"),
    },
    { label: "Like this track", onSelect: () => void runCommand("/like") },
    {
      label: "Dislike this track",
      onSelect: () => void runCommand("/dislike"),
    },
    { label: "Listening stats", onSelect: () => void runCommand("/stats") },
    { label: "Room Wrapped", onSelect: () => void runCommand("/wrapped") },
    { label: "Music settings", onSelect: () => void runCommand("/settings") },
    ...(voice.channelId && currentPlayer?.track
      ? [
          {
            label: currentPlayer.paused ? "Resume" : "Pause",
            onSelect: () =>
              hub.send({
                t: "player",
                channelId: voice.channelId!,
                action: { name: "toggle" },
              }),
          },
          {
            label: "Skip",
            onSelect: () =>
              hub.send({
                t: "player",
                channelId: voice.channelId!,
                action: { name: "skip" },
              }),
          },
          {
            label: "Stop playing",
            danger: true,
            onSelect: () =>
              hub.send({
                t: "player",
                channelId: voice.channelId!,
                action: { name: "stop" },
              }),
          },
        ]
      : []),
    ...(musicDashboardUrl
      ? [
          {
            label: "Open dashboard",
            onSelect: () =>
              window.open(
                musicDashboardUrl,
                "_blank",
                "noopener,noreferrer",
              ),
          },
        ]
      : []),
  ];
  const dndBotActions: BotMenuAction[] = [
    { label: "Roll dice…", onSelect: () => prepareCommand("/roll ") },
    { label: "Find a spell…", onSelect: () => prepareCommand("/spell ") },
    { label: "Find a monster…", onSelect: () => prepareCommand("/monster ") },
    ...(dndUrl
      ? [
          {
            label: "Open dashboard",
            onSelect: () =>
              window.open(dndUrl, "_blank", "noopener,noreferrer"),
          },
        ]
      : []),
  ];

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Servers">
        <button
          className={`brand-mark ${inDmHome ? "active-space" : ""}`}
          aria-label="Direct messages"
          title="Direct messages"
          onClick={() => {
            setActiveServerId(DM_HOME);
            setActiveChannelId(dms[0]?.channelId || null);
          }}
        >
          h
        </button>
        <div className="rail-divider" />
        {servers.map((server) => (
          <button
            key={server.id}
            className={`space-mark ${server.id === activeServerId ? "active-space" : ""}`}
            style={
              server.id === activeServerId ? { background: server.color } : undefined
            }
            aria-label={server.name}
            title={server.name}
            onClick={() => setActiveServerId(server.id)}
          >
            {server.icon}
          </button>
        ))}
        <button
          className="space-mark add-space"
          aria-label="Create a server"
          title="Create a server"
          onClick={createServer}
        >
          +
        </button>
        <div className="rail-spacer" />
        <Avatar
          className="profile-dot"
          avatar={user.avatar}
          avatarUrl={user.avatarUrl}
          color={user.color}
          title="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <span className={hub.connected ? "online" : ""} />
        </Avatar>
      </aside>

      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <header className="space-header">
          <div>
            <span className="eyebrow">
              {inDmHome ? "PRIVATE" : "PRIVATE SPACE"}
            </span>
            <h1>{inDmHome ? "Direct messages" : activeServer?.name || "Huddle"}</h1>
          </div>
          {!inDmHome && (
            <Icon label="Server settings" onClick={editServer}>
              •••
            </Icon>
          )}
        </header>

        {inDmHome ? (
          <nav className="channel-nav" aria-label="Conversations">
            <div className="section-label">
              <span>CONVERSATIONS</span>
            </div>
            {dms.map((dm) => (
              <button
                key={dm.channelId}
                className={`channel dm-channel ${activeChannelId === dm.channelId ? "selected" : ""}`}
                onClick={() => {
                  setActiveChannelId(dm.channelId);
                  setMobileNav(false);
                }}
                onContextMenu={(event) => openUserMenu(event, dm.user)}
              >
                <Avatar
                  className="tiny-avatar"
                  avatar={dm.user.avatar}
                  avatarUrl={dm.user.avatarUrl}
                  color={dm.user.color}
                />
                <span>{dm.user.displayName}</span>
                {hub.online.has(dm.user.id) && <i className="dm-online" />}
              </button>
            ))}
            {!dms.length && (
              <p className="sidebar-empty">
                Right-click someone in the member list to start a conversation.
              </p>
            )}
          </nav>
        ) : (
          <nav className="channel-nav" aria-label="Channels">
            <div className="section-label">
              <span>TEXT CHANNELS</span>
              <button
                aria-label="Add text channel"
                onClick={() => createChannel("text")}
              >
                +
              </button>
            </div>

            {textChannels.map((channel) => (
              <button
                key={channel.id}
                className={`channel ${activeChannelId === channel.id ? "selected" : ""}`}
                onClick={() => {
                  setActiveChannelId(channel.id);
                  setMobileNav(false);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  void renameChannel(channel);
                }}
              >
                <span className="channel-hash">#</span>
                <span>{channel.name}</span>
                <span
                  className="channel-delete"
                  role="button"
                  aria-label={`Delete ${channel.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteChannel(channel);
                  }}
                >
                  ×
                </span>
              </button>
            ))}

            <div className="section-label voice-label">
              <span>VOICE ROOMS</span>
              <button
                aria-label="Add voice room"
                onClick={() => createChannel("voice")}
              >
                +
              </button>
            </div>

            {voiceChannels.map((channel) => {
              const people = hub.voice[channel.id] || [];
              const playing = hub.players[channel.id]?.track;
              return (
                <div key={channel.id}>
                  <button
                    className={`voice-room ${voice.channelId === channel.id ? "selected-voice" : ""}`}
                    onClick={() => {
                      player.prime();
                      void voice.join(channel.id);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void renameChannel(channel);
                    }}
                  >
                    <span className="speaker-icon">◖))</span>
                    <span>{channel.name}</span>
                    {people.length > 0 && <span className="live-pill">LIVE</span>}
                    <span
                      className="channel-delete"
                      role="button"
                      aria-label={`Delete ${channel.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteChannel(channel);
                      }}
                    >
                      ×
                    </span>
                  </button>

                  {people.length > 0 && (
                    <div className="voice-members">
                      {people.map((person) => (
                        <div
                          className={`voice-member ${
                            voice.speaking.has(
                              person.connectionId === hub.connectionId
                                ? "self"
                                : person.connectionId,
                            )
                              ? "is-speaking"
                              : ""
                          }`}
                          key={person.connectionId}
                          onContextMenu={(event) => {
                            if (person.bot) {
                              openBotMenu(event, "music");
                              return;
                            }
                            const member = membersById.get(person.id);
                            if (member) openUserMenu(event, member);
                          }}
                        >
                          <Avatar
                            className="tiny-avatar"
                            avatar={person.avatar}
                            avatarUrl={person.avatarUrl}
                            color={person.color}
                          />
                          <span>
                            {person.connectionId === hub.connectionId
                              ? "You"
                              : person.displayName}
                          </span>
                          {person.muted && !person.bot && (
                            <span
                              className="muted-pill"
                              title={
                                person.serverMuted
                                  ? "Muted for everyone"
                                  : "Muted"
                              }
                            >
                              ⃠
                            </span>
                          )}
                          {person.bot && playing && (
                            <span className="speaking-bars" aria-label="Playing">
                              ııı
                            </span>
                          )}
                          {person.bot && person.deafened && (
                            <span
                              className="bot-deafened-pill"
                              title="The bot sends music but cannot hear the room"
                              aria-label="Bot deafened"
                            >
                              🎧
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="section-label bot-section-label">
              <span>APPS &amp; BOTS</span>
            </div>

            <button
              className="bot-app"
              onContextMenu={(event) => openBotMenu(event, "music")}
              onClick={() => {
                if (musicDashboardUrl) {
                  window.open(musicDashboardUrl, "_blank", "noopener,noreferrer");
                } else {
                  setDraft("/play ");
                  composerRef.current?.focus();
                }
                setMobileNav(false);
              }}
            >
              <span className="bot-app-icon">♫</span>
              <span className="bot-app-copy">
                <strong>Music + Watch</strong>
                <small>
                  {musicWatchOnline === null
                    ? "Checking server…"
                    : musicWatchOnline
                      ? "Online · /play in a voice room"
                      : "Offline · needs your server"}
                </small>
              </span>
              <i className={musicWatchOnline ? "online" : ""} />
            </button>

            <button
              className="bot-app"
              onContextMenu={(event) => openBotMenu(event, "dnd")}
              onClick={() => {
                if (dndUrl) {
                  window.open(dndUrl, "_blank", "noopener,noreferrer");
                } else {
                  setDraft("/dnd");
                }
                setMobileNav(false);
              }}
            >
              <span className="bot-app-icon">⚔</span>
              <span className="bot-app-copy">
                <strong>D&amp;D Bot</strong>
                <small>
                  {dndOnline === null
                    ? "Checking server…"
                    : dndOnline
                      ? "Online · /spell /monster /roll"
                      : "Offline"}
                </small>
              </span>
              <i className={dndOnline ? "online" : ""} />
            </button>
          </nav>
        )}

        {!inDmHome && (
          <div className="voice-card">
            <div className="voice-card-top">
              <span className={`voice-pulse ${voice.channelId ? "connected" : ""}`} />
              <div>
                <strong>
                  {voice.channelId ? "Voice connected" : "Voice is quiet"}
                </strong>
                <span>
                  {currentVoiceChannel
                    ? `${currentVoiceChannel.name} · ${voiceParticipants.length} here`
                    : "Pick a room to join"}
                </span>
              </div>
            </div>
            {voice.channelId ? (
              <div className="voice-card-controls">
                <button
                  className={`mic-control ${voice.muted ? "muted" : ""}`}
                  onClick={voice.toggleMute}
                  disabled={voice.forcedMute}
                  title={voice.forcedMute ? "You are muted for everyone" : undefined}
                >
                  {voice.forcedMute
                    ? "Server muted"
                    : voice.muted
                      ? "Unmute"
                      : "Mute"}
                </button>
                <button
                  className={`mic-control ${voice.deafened ? "muted" : ""}`}
                  onClick={voice.toggleDeafen}
                >
                  {voice.deafened ? "Undeafen" : "Deafen"}
                </button>
                <div className="screen-share-controls">
                  <select
                    aria-label="Screen share quality"
                    value={voice.screenQuality}
                    disabled={voice.screenSharing}
                    onChange={(event) =>
                      voice.setScreenQuality(
                        event.target.value as ScreenShareQuality,
                      )
                    }
                  >
                    <option value="720p30">720p · 30 FPS</option>
                    <option value="1080p30">1080p · 30 FPS</option>
                    <option value="1080p60">1080p · 60 FPS</option>
                  </select>
                  <button
                    className={voice.screenSharing ? "sharing" : ""}
                    onClick={() =>
                      voice.screenSharing
                        ? voice.stopScreenShare()
                        : void voice.startScreenShare()
                    }
                  >
                    {voice.screenSharing ? "Stop sharing" : "Share screen"}
                  </button>
                  <button
                    className={voice.cameraOn ? "sharing" : ""}
                    onClick={() =>
                      voice.cameraOn
                        ? voice.stopCamera()
                        : void voice.startCamera()
                    }
                  >
                    {voice.cameraOn ? "Turn camera off" : "Turn camera on"}
                  </button>
                </div>
                <button className="leave-button" onClick={voice.leave}>
                  Leave
                </button>
              </div>
            ) : (
              <button
                className="join-button"
                disabled={!voiceChannels.length}
                onClick={() => {
                  if (!voiceChannels[0]) return;
                  player.prime();
                  void voice.join(voiceChannels[0].id);
                }}
              >
                Join {voiceChannels[0]?.name || "voice"}
              </button>
            )}
          </div>
        )}
      </aside>

      <section
        className={`chat-panel ${dragging ? "drop-target" : ""}`}
        onDragOver={onChannelDragOver}
        onDragLeave={(event) => {
          // Ignore the flicker as the pointer crosses child elements.
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={onChannelDrop}
      >
        {dragging && (
          <div className="drop-overlay" aria-hidden="true">
            <div>Drop to attach · images and PDFs</div>
          </div>
        )}
        <header className="chat-header">
          <button
            className="mobile-menu"
            aria-label="Open channels"
            onClick={() => setMobileNav((open) => !open)}
          >
            ☰
          </button>
          <span className="big-hash">{inDmHome ? "@" : "#"}</span>
          <div className="channel-heading">
            <strong>{channelTitle}</strong>
            <span>
              {inDmHome
                ? activeDm
                  ? `Just you and ${activeDm.user.displayName}`
                  : "Pick a conversation"
                : activeChannel?.topic ||
                  (activeChannel
                    ? `Everything happening in ${activeChannel.name}`
                    : "Create a channel to start talking")}
            </span>
          </div>
          <div className="header-actions">
            <Icon
              label="Pinned messages"
              active={pinsOpen}
              onClick={() => setPinsOpen((open) => !open)}
            >
              📌
            </Icon>
            <Icon
              label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? "☀" : "☾"}
            </Icon>
            <Icon label="Settings" onClick={() => setSettingsOpen(true)}>
              ⚙
            </Icon>
            <Icon
              label="Toggle member list"
              active={membersOpen}
              onClick={() => setMembersOpen((open) => !open)}
            >
              ♙
            </Icon>
          </div>
        </header>

        {pinsOpen && (
          <div className="pins-panel">
            <div className="pins-head">
              <strong>Pinned in {channelTitle}</strong>
              <button type="button" onClick={() => setPinsOpen(false)}>
                ×
              </button>
            </div>
            {pins.length ? (
              pins.map((pin) => (
                <div className="pin-item" key={pin.id}>
                  <strong>{pin.author}</strong>
                  <p>{pin.text}</p>
                  <button type="button" onClick={() => void togglePin(pin)}>
                    Unpin
                  </button>
                </div>
              ))
            ) : (
              <p className="pins-empty">
                Nothing pinned yet. Hover a message and press the pin.
              </p>
            )}
          </div>
        )}

        <div className="messages" aria-live="polite">
          <div className="channel-intro">
            <div className="intro-icon">{inDmHome ? "@" : "#"}</div>
            <h2>{inDmHome ? channelTitle : `Welcome to #${channelTitle}`}</h2>
            <p>
              {inDmHome
                ? "This conversation is only visible to the two of you."
                : "This is the start of the channel. Be excellent to each other."}
            </p>
          </div>

          {messages.map((message) => {
            const author = message.userId
              ? membersById.get(message.userId)
              : undefined;
            const canDelete =
              message.userId === user.id || message.bot || user.isAdmin;
            return (
              <article
                className={`message ${message.pinned ? "is-pinned" : ""}`}
                key={message.id}
                onContextMenu={(event) => {
                  if (message.bot) {
                    openBotMenu(
                      event,
                      message.author.toLowerCase().includes("d&d")
                        ? "dnd"
                        : "music",
                    );
                  }
                }}
              >
                <Avatar
                  className={`avatar ${message.bot ? "bot-avatar" : ""}`}
                  avatar={author?.avatar || message.avatar}
                  avatarUrl={author?.avatarUrl}
                  color={author?.color || message.color}
                  onContextMenu={(event) => {
                    if (author) openUserMenu(event, author);
                  }}
                  onClick={(event) => {
                    if (touchInput && author) openUserMenu(event, author);
                  }}
                />
                <div className="message-body">
                  <div className="message-meta">
                    <strong
                      onContextMenu={(event) => {
                        if (author) openUserMenu(event, author);
                      }}
                      onClick={(event) => {
                        if (touchInput && author) openUserMenu(event, author);
                      }}
                    >
                      {author?.displayName || message.author}
                    </strong>
                    {message.bot && <span className="bot-tag">BOT</span>}
                    <time>{message.time}</time>
                    {message.pinned && (
                      <span className="pin-tag" title="Pinned">
                        📌
                      </span>
                    )}
                  </div>

                  {message.kind === "lyricsnow" && message.payload?.lines ? (
                    <LyricsNow
                      track={message.payload.track}
                      artist={message.payload.artist}
                      lines={message.payload.lines}
                      positionMs={
                        message.payload.voiceChannelId === voice.channelId
                          ? player.position
                          : undefined
                      }
                      live={
                        message.payload.voiceChannelId === voice.channelId &&
                        hub.players[voice.channelId!]?.track?.id ===
                          message.payload.trackId
                      }
                    />
                  ) : message.kind === "dnd" && message.payload ? (
                    <DndCard {...message.payload} />
                  ) : message.kind === "music-settings" && message.payload ? (
                    <MusicSettingsCard
                      settings={message.payload}
                      disabled={!message.payload.voiceChannelId}
                      onCommand={(command) =>
                        runMusicUiCommand(
                          command,
                          message.payload?.voiceChannelId,
                        )
                      }
                    />
                  ) : message.kind === "music-stats" && message.payload ? (
                    <MusicStatsCard
                      wrapped={message.payload.wrapped}
                      label={message.payload.label}
                      plays={message.payload.plays}
                      unique={message.payload.unique}
                      hours={message.payload.hours}
                      topSongs={message.payload.topSongs}
                      topRequesters={message.payload.topRequesters}
                    />
                  ) : (
                    <MessageBody text={message.text} />
                  )}

                  {message.kind === "nowplaying" &&
                    message.payload?.voiceChannelId && (
                      <NowPlaying
                        state={hub.players[message.payload.voiceChannelId] || null}
                        trackId={message.payload.trackId}
                        trackLabel={message.payload.label}
                        position={
                          voice.channelId === message.payload.voiceChannelId
                            ? player.position
                            : 0
                        }
                        controllable={
                          voice.channelId === message.payload.voiceChannelId
                        }
                        blocked={!botStreaming && player.blocked}
                        onUnblock={player.unblock}
                        voiceChannelName={
                          voiceChannels.find(
                            (channel) =>
                              channel.id === message.payload?.voiceChannelId,
                          )?.name
                        }
                        onSeek={(positionMs) =>
                          hub.send({
                            t: "player",
                            channelId: message.payload!.voiceChannelId!,
                            action: { name: "seek", positionMs },
                          })
                        }
                        onToggle={() =>
                          hub.send({
                            t: "player",
                            channelId: message.payload!.voiceChannelId!,
                            action: { name: "toggle" },
                          })
                        }
                        onSkip={() =>
                          hub.send({
                            t: "player",
                            channelId: message.payload!.voiceChannelId!,
                            action: { name: "skip" },
                          })
                        }
                        onVolume={(volume) =>
                          hub.send({
                            t: "player",
                            channelId: message.payload!.voiceChannelId!,
                            action: { name: "volume", volume },
                          })
                        }
                      />
                    )}

                  {message.link && (
                    <a
                      className="bot-action"
                      href={message.link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {message.actionLabel || "Open"}
                      <span aria-hidden="true">↗</span>
                    </a>
                  )}
                  {message.audio && (
                    <audio
                      className="message-audio"
                      controls
                      preload="none"
                      src={message.audio}
                    />
                  )}
                  {message.image && (
                    <img
                      className="message-image"
                      src={message.image}
                      alt="Shared attachment"
                    />
                  )}
                  {message.file?.type === "pdf" && (
                    <a
                      className="message-file-card"
                      href={message.file.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="message-file-icon">PDF</span>
                      <span>
                        <strong>{message.file.name}</strong>
                        <small>PDF document · open in a new tab</small>
                      </span>
                      <b aria-hidden="true">↗</b>
                    </a>
                  )}
                </div>

                <div className="message-actions">
                  <button
                    type="button"
                    title={message.pinned ? "Unpin" : "Pin"}
                    onClick={() => void togglePin(message)}
                  >
                    📌
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => void deleteMessage(message.id)}
                    >
                      🗑
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          <div ref={messageEndRef} />
        </div>

        {(notice || voice.error) && (
          <button
            className="notice"
            onClick={() => {
              setNotice("");
              voice.setError("");
            }}
            aria-label="Dismiss notification"
          >
            {notice || voice.error}
            <span>×</span>
          </button>
        )}

        <form className="composer-wrap" onSubmit={sendMessage}>
          {slashActive && (
            <SlashMenu
              query={draft.split(/\s+/)[0]}
              highlighted={slashIndex}
              onHighlight={setSlashIndex}
              onPick={(command) =>
                pickCommand(
                  slashMatches.findIndex((item) => item.name === command.name),
                )
              }
              inVoice={Boolean(voice.channelId)}
            />
          )}

          {gifOpen && (
            <GifPicker
              onClose={() => setGifOpen(false)}
              onPick={(url) => {
                setGifOpen(false);
                void sendText(url);
              }}
            />
          )}

          {pendingImage && (
            <div className="attachment-preview">
              <img src={pendingImage} alt="Attachment ready to send" />
              <button
                type="button"
                onClick={() => {
                  setPendingImage(null);
                  setPendingFile(null);
                }}
                aria-label="Remove attachment"
              >
                ×
              </button>
            </div>
          )}
          {pendingFile && !pendingImage && (
            <div className="attachment-preview file-preview">
              <span className="message-file-icon">PDF</span>
              <span>
                <strong>{pendingFile.name}</strong>
                <small>{(pendingFile.size / 1024 / 1024).toFixed(1)} MB</small>
              </span>
              <button
                type="button"
                onClick={() => setPendingFile(null)}
                aria-label="Remove attachment"
              >
                ×
              </button>
            </div>
          )}

          <div className="composer">
            <button
              type="button"
              className="attach-button"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach an image or PDF"
            >
              +
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              hidden
              onChange={chooseAttachment}
            />
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={
                activeChannelId
                  ? `Message ${inDmHome ? "" : "#"}${channelTitle}`
                  : "Pick a channel first"
              }
              aria-label={`Message ${channelTitle}`}
              rows={1}
              disabled={!activeChannelId}
            />
            <button
              type="button"
              className="gif-button"
              onClick={() => setGifOpen((open) => !open)}
              aria-label="Add a GIF"
            >
              GIF
            </button>
            <button
              type="button"
              className="gif-button"
              onClick={() => {
                setDraft("/");
                composerRef.current?.focus();
              }}
              aria-label="Show commands"
            >
              /
            </button>
            <button className="send-button" type="submit" aria-label="Send message">
              ↑
            </button>
          </div>

          <div className="composer-hint">
            Enter to send · Shift + Enter for a new line · / for commands
          </div>
        </form>
      </section>

      <aside className={`member-panel ${membersOpen ? "" : "closed"}`}>
        {voice.channelId && (
          <>
            <div className="member-panel-title">
              <span>IN VOICE — {voiceParticipants.length}</span>
            </div>
            <div className="voice-feature">
              <div className="voice-feature-avatars">
                {voiceParticipants.slice(0, 5).map((person) => (
                  <Avatar
                    key={person.connectionId}
                    avatar={person.avatar}
                    avatarUrl={person.avatarUrl}
                    color={person.color}
                  />
                ))}
              </div>
              <strong>{currentVoiceChannel?.name}</strong>
              <p>
                {voiceParticipants.length === 1
                  ? "Just you so far"
                  : `${voiceParticipants.length} in the room`}
              </p>
              <div className="voice-controls">
                <button
                  className={`mic-control ${voice.muted ? "muted" : ""}`}
                  onClick={voice.toggleMute}
                  disabled={voice.forcedMute}
                >
                  {voice.forcedMute
                    ? "Server muted"
                    : voice.muted
                      ? "Muted"
                      : "Mic on"}
                </button>
                <button className="leave-outline" onClick={voice.leave}>
                  Leave
                </button>
              </div>
              <div className="screen-share-controls compact">
                <select
                  aria-label="Screen share quality"
                  value={voice.screenQuality}
                  disabled={voice.screenSharing}
                  onChange={(event) =>
                    voice.setScreenQuality(
                      event.target.value as ScreenShareQuality,
                    )
                  }
                >
                  <option value="720p30">720p30</option>
                  <option value="1080p30">1080p30</option>
                  <option value="1080p60">1080p60</option>
                </select>
                <button
                  className={voice.screenSharing ? "sharing" : ""}
                  onClick={() =>
                    voice.screenSharing
                      ? voice.stopScreenShare()
                      : void voice.startScreenShare()
                  }
                >
                  {voice.screenSharing ? "Stop" : "Share screen"}
                </button>
                <button
                  className={voice.cameraOn ? "sharing" : ""}
                  onClick={() =>
                    voice.cameraOn ? voice.stopCamera() : void voice.startCamera()
                  }
                >
                  {voice.cameraOn ? "Camera off" : "Camera"}
                </button>
              </div>
            </div>

            {(voice.localVideos.length > 0 ||
              voice.remoteStreams.some((entry) =>
                entry.stream
                  .getVideoTracks()
                  .some((track) => track.readyState === "live"),
              )) && (
              <div className="screen-share-grid">
                {/* Your own camera and screen, so you can see what you are
                    sending. Muted, or you would hear yourself. */}
                {voice.localVideos.map(({ kind, stream }) => (
                  <figure key={stream.id} className="self-tile">
                    <video
                      autoPlay
                      playsInline
                      muted
                      className={kind === "camera" ? "mirrored" : ""}
                      ref={(element) => {
                        if (element && element.srcObject !== stream) {
                          element.srcObject = stream;
                          void element.play().catch(() => undefined);
                        }
                      }}
                    />
                    <figcaption>
                      You · {kind === "camera" ? "camera" : "screen"}
                    </figcaption>
                  </figure>
                ))}
                {voice.remoteStreams
                  .filter((entry) =>
                    entry.stream
                      .getVideoTracks()
                      .some((track) => track.readyState === "live"),
                  )
                  .map(({ connectionId, stream }) => {
                    const person = voiceParticipants.find(
                      (participant) =>
                        participant.connectionId === connectionId,
                    );
                    const connecting =
                      voice.peerStates[connectionId] !== undefined &&
                      voice.peerStates[connectionId] !== "connected";
                    return (
                      <figure
                        key={`${connectionId}:${stream.id}`}
                        className={connecting ? "tile-connecting" : ""}
                      >
                        <video
                          autoPlay
                          playsInline
                          ref={(element) => {
                            if (element && element.srcObject !== stream) {
                              element.srcObject = stream;
                            }
                          }}
                        />
                        <figcaption>
                          {person?.displayName || "Screen share"}
                          {person?.cameraStreamId === stream.id
                            ? " · camera"
                            : person?.screenStreamId === stream.id
                              ? " · screen"
                              : ""}
                        </figcaption>
                      </figure>
                    );
                  })}
              </div>
            )}

            {roomPlayer?.track && (
              <div className="member-player">
                <NowPlaying
                  state={roomPlayer}
                  position={player.position}
                  controllable
                  blocked={!botStreaming && player.blocked}
                  onUnblock={player.unblock}
                  voiceChannelName={currentVoiceChannel?.name}
                  onSeek={(positionMs) =>
                    hub.send({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "seek", positionMs },
                    })
                  }
                  onToggle={() =>
                    hub.send({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "toggle" },
                    })
                  }
                  onSkip={() =>
                    hub.send({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "skip" },
                    })
                  }
                  onVolume={(volume) =>
                    hub.send({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "volume", volume },
                    })
                  }
                />
              </div>
            )}
          </>
        )}

        <div className="member-panel-title online-title">
          <span>ONLINE — {onlineMembers.length}</span>
        </div>
        {onlineMembers.map((member) => (
          <div
            className="member"
            key={member.id}
            {...userMenuHandlers(member)}
            onDoubleClick={() => member.id !== user.id && void openDm(member.id)}
          >
            <Avatar
              className="member-avatar"
              avatar={member.avatar}
              avatarUrl={member.avatarUrl}
              color={member.color}
            />
            <div>
              <strong>{member.displayName}</strong>
              <span>
                {member.id === user.id
                  ? "Here now"
                  : prefFor(member.id).muted
                    ? "Muted for you"
                    : hub.forcedMutes.has(member.id)
                      ? "Server muted"
                      : "Online"}
              </span>
            </div>
          </div>
        ))}

        <div className="member-panel-title offline-title">
          <span>OFFLINE — {offlineMembers.length}</span>
        </div>
        {offlineMembers.map((member) => (
          <div
            className="member offline-member"
            key={member.id}
            {...userMenuHandlers(member)}
          >
            <Avatar
              className="member-avatar"
              avatar={member.avatar}
              avatarUrl={member.avatarUrl}
              color={member.color}
            />
            <div>
              <strong>{member.displayName}</strong>
              <span>Away</span>
            </div>
          </div>
        ))}
      </aside>

      {/* Remote voice audio. Hidden, but this is what you actually hear. */}
      {voice.remoteStreams
        .filter(({ stream }) => stream.getAudioTracks().length > 0)
        .map(({ connectionId, stream }) => {
        const person = voiceParticipants.find(
          (participant) => participant.connectionId === connectionId,
        );
        const pref = person ? prefFor(person.id) : { volume: 100, muted: false };
        return (
          <audio
            key={`${connectionId}:${stream.id}`}
            autoPlay
            playsInline
            ref={(element) => {
              if (!element) {
                return;
              }
              registerMedia(element);
              if (element.srcObject !== stream) {
                element.srcObject = stream;
                // Safari is more reliable when playback is requested after
                // srcObject is assigned, even with the autoPlay attribute.
                void element.play().catch(() => undefined);
              }
              // Per-person volume, on top of your own deafen switch.
              element.volume = volumeGain(pref.volume);
            }}
            muted={voice.deafened || pref.muted}
          />
        );
        })}

      {botMenu && (
        <BotMenu
          name={botMenu.kind === "music" ? "Music + Watch" : "D&D Bot"}
          description={
            botMenu.kind === "music"
              ? "Music and watch-together bot"
              : "Tabletop helper bot"
          }
          x={botMenu.x}
          y={botMenu.y}
          actions={
            botMenu.kind === "music" ? musicBotActions : dndBotActions
          }
          voicePref={
            botMenu.kind === "music" &&
            voiceParticipants.some((person) => person.bot)
              ? prefFor("bot:music")
              : undefined
          }
          onVoiceMute={
            botMenu.kind === "music"
              ? (muted) => void saveVoicePref("bot:music", { muted })
              : undefined
          }
          onVoiceVolume={
            botMenu.kind === "music"
              ? (volume) => void saveVoicePref("bot:music", { volume })
              : undefined
          }
          onClose={() => setBotMenu(null)}
        />
      )}

      {userMenu && (
        <UserMenu
          target={userMenu}
          isSelf={userMenu.member.id === user.id}
          pref={prefFor(userMenu.member.id)}
          serverMuted={hub.forcedMutes.has(userMenu.member.id)}
          onClose={() => setUserMenu(null)}
          onMessage={() => {
            const id = userMenu.member.id;
            setUserMenu(null);
            void openDm(id);
          }}
          onLocalMute={(muted) => {
            void saveVoicePref(userMenu.member.id, { muted });
          }}
          onVolume={(volume) => {
            void saveVoicePref(userMenu.member.id, { volume });
          }}
          onServerMute={(muted) => {
            void saveVoicePref(userMenu.member.id, { serverMuted: muted });
            setUserMenu(null);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          user={user}
          theme={theme}
          onTheme={applyTheme}
          onUser={setUser}
          onClose={() => setSettingsOpen(false)}
          onSignOut={signOut}
          onMicrophoneChange={() => void voice.switchMicrophone()}
        />
      )}
    </main>
  );
}
