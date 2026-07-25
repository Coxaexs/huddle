"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { PlayerState } from "@/lib/protocol";
import type { PublicChannel, PublicServer } from "@/lib/servers";
import type { Member, PublicUser } from "@/lib/users";
import { AuthGate } from "./components/auth-gate";
import { NowPlaying } from "./components/now-playing";
import { SettingsDialog } from "./components/settings-dialog";
import { SlashMenu } from "./components/slash-menu";
import { useHub } from "./hooks/use-hub";
import { usePlayer } from "./hooks/use-player";
import { useVoice } from "./hooks/use-voice";
import { apiFetch, apiUrl } from "./lib/client";
import {
  COMMAND_ALIASES,
  LOOKUP_COMMANDS,
  MUSIC_COMMANDS,
  matchCommands,
} from "./lib/commands";

interface Message {
  id: string | number;
  channelId?: string | null;
  author: string;
  avatar: string;
  color: string;
  time: string;
  text: string;
  bot?: boolean;
  image?: string;
  link?: string;
  actionLabel?: string;
  audio?: string;
  kind?: string;
  payload?: { voiceChannelId?: string; trackId?: string; label?: string };
}

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

export function ChatShell() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [bootstrap, setBootstrap] = useState(false);
  const [ready, setReady] = useState(false);

  const [servers, setServers] = useState<PublicServer[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  const [musicWatchOnline, setMusicWatchOnline] = useState<boolean | null>(null);
  const [musicDashboardUrl, setMusicDashboardUrl] = useState<string | null>(null);
  const [dndOnline, setDndOnline] = useState<boolean | null>(null);
  const [dndUrl, setDndUrl] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const activeChannelRef = useRef<string | null>(null);
  activeChannelRef.current = activeChannelId;

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
  }, [user, loadServers, loadMembers]);

  // Pick up where you left off, or fall back to the first channel there is.
  useEffect(() => {
    if (!servers.length) return;
    setActiveServerId((current) => {
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

  useEffect(() => {
    if (!activeServerId) return;
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
    if (activeServerId && activeChannelId) {
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

  // ------------------------------------------------------------ realtime

  const handleIncomingMessage = useCallback(
    (channelId: string, message: unknown) => {
      if (channelId !== activeChannelRef.current) return;
      const incoming = message as Message;
      setMessages((current) =>
        current.some((existing) => existing.id === incoming.id)
          ? current
          : [...current, incoming],
      );
    },
    [],
  );

  const voiceSignalRef = useRef<(from: string, data: unknown) => void>(() => {});

  const hub = useHub(Boolean(user), {
    onMessage: handleIncomingMessage,
    onSignal: (from, data) => voiceSignalRef.current(from, data),
    onStructureChange: () => void loadServers().catch(() => undefined),
  });

  const voice = useVoice({
    connectionId: hub.connectionId,
    rooms: hub.voice,
    send: hub.send,
  });
  voiceSignalRef.current = voice.handleSignal;

  // The mesh only cares about the room you are actually in.
  const voiceParticipants = useMemo(
    () => (voice.channelId ? hub.voice[voice.channelId] || [] : []),
    [hub.voice, voice.channelId],
  );

  const roomPlayer: PlayerState | null = voice.channelId
    ? hub.players[voice.channelId] || null
    : null;

  const player = usePlayer({
    state: roomPlayer,
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
    if (!user || !activeChannelId) return;
    let cancelled = false;
    apiFetch<{ messages: Message[] }>(
      `/api/messages?channelId=${encodeURIComponent(activeChannelId)}`,
    )
      .then((data) => {
        if (!cancelled) setMessages(data.messages);
      })
      .catch(() => undefined);
    hub.send({ t: "subscribe", channelId: activeChannelId });
    return () => {
      cancelled = true;
    };
    // hub.send is stable; re-subscribing on every hub tick would be noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeChannelId, hub.connected]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const preferred =
      window.localStorage.getItem("huddle-theme") === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = preferred;
    const frame = window.requestAnimationFrame(() => setTheme(preferred));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/integrations/musicwatch"))
      .then((response) => response.json() as Promise<{ online?: boolean; dashboardUrl?: string }>)
      .then((data) => {
        setMusicWatchOnline(Boolean(data.online));
        setMusicDashboardUrl(data.dashboardUrl || null);
      })
      .catch(() => setMusicWatchOnline(false));

    fetch(apiUrl("/api/integrations/dnd"))
      .then((response) => response.json() as Promise<{ online?: boolean; appUrl?: string }>)
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
        }),
      }).catch(() => undefined);
    },
    [],
  );

  async function runCommand(raw: string) {
    const [rawName, ...parts] = raw.trim().split(/\s+/);
    const bare = rawName.replace(/^\//, "").toLowerCase();
    const name = COMMAND_ALIASES[bare] || bare;
    const value = parts.join(" ").trim();

    if (MUSIC_COMMANDS.has(name)) {
      if (!voice.channelId) {
        setNotice(
          "Join a voice channel first — the music bot plays into the room you are in.",
        );
        return;
      }
      try {
        await apiFetch("/api/music/command", {
          method: "POST",
          body: JSON.stringify({
            command: `/${name} ${value}`.trim(),
            voiceChannelId: voice.channelId,
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
            body: JSON.stringify({
              mode: name,
              name: `${activeChannel?.name || "huddle"} · Huddle`,
            }),
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

    if (name === "music") {
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

    if (LOOKUP_COMMANDS.has(name)) {
      if (!value) {
        setNotice(`Try \`/${name} ${name === "spell" ? "fireball" : "goblin"}\`.`);
        return;
      }
      try {
        const data = await apiFetch<{ text: string; link?: string }>(
          "/api/integrations/dnd/lookup",
          { method: "POST", body: JSON.stringify({ kind: name, query: value }) },
        );
        await postBotMessage(data.text, {
          author: "D&D Bot",
          avatar: "⚔",
          link: data.link,
          actionLabel: data.link ? "Open on 5e.tools" : undefined,
        });
      } catch (error) {
        await postBotMessage(
          error instanceof Error ? error.message : "That lookup failed.",
          { author: "D&D Bot", avatar: "⚔" },
        );
      }
      return;
    }

    if (name === "roll") {
      try {
        const data = await apiFetch<{ text?: string; error?: string }>(
          "/api/integrations/dnd/roll",
          { method: "POST", body: JSON.stringify({ command: raw }) },
        );
        await postBotMessage(data.text || "The roll failed.", {
          author: "D&D Bot",
          avatar: "⚔",
        });
      } catch (error) {
        await postBotMessage(
          error instanceof Error ? error.message : "The roll failed.",
          { author: "D&D Bot", avatar: "⚔" },
        );
      }
      return;
    }

    if (name === "dnd") {
      await postBotMessage(
        dndOnline
          ? "The D&D bot companion is online. Open it for character sheets, dice, maps, the compendium, and the GM panel."
          : "The D&D companion looks offline right now.",
        {
          ...(dndUrl ? { link: dndUrl, actionLabel: "Open D&D companion" } : {}),
          author: "D&D Bot",
          avatar: "⚔",
        },
      );
      return;
    }

    if (name === "flip") {
      await postBotMessage(Math.random() > 0.5 ? "Heads." : "Tails.");
      return;
    }

    if (name === "shrug") {
      await sendText("¯\\_(ツ)_/¯");
      return;
    }

    if (name === "help") {
      await postBotMessage(
        "Type / in the box to see every command with its arguments. Music commands need you to be in a voice channel.",
      );
      return;
    }

    setNotice(`I don't know /${bare}. Type / to see what I do know.`);
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

    // Slash commands are instructions, not chat: they never post as you.
    if (text.startsWith("/") && !pendingFile) {
      await runCommand(text);
      return;
    }

    try {
      let attachmentKey: string | undefined;
      if (pendingFile) {
        const form = new FormData();
        form.append("image", pendingFile);
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
    // Commands that take an argument stay open for you to type it.
    setDraft(command.args ? `/${command.name} ` : `/${command.name}`);
    composerRef.current?.focus();
    if (!command.args) {
      void runCommand(`/${command.name}`);
      setDraft("");
    }
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPendingImage(String(reader.result));
    reader.readAsDataURL(file);
    setPendingFile(file);
    event.target.value = "";
  }

  async function createServer() {
    const name = window.prompt("Name your new server");
    if (!name?.trim()) return;
    try {
      const data = await apiFetch<{ server: PublicServer; servers: PublicServer[] }>(
        "/api/servers",
        { method: "POST", body: JSON.stringify({ name }) },
      );
      setServers(data.servers);
      setActiveServerId(data.server.id);
      setNotice(`${data.server.name} is live — everyone here is already in it.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create it.");
    }
  }

  async function createChannel(kind: "text" | "voice") {
    if (!activeServerId) return;
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

  function playerCommand(action: Parameters<typeof hub.send>[0]) {
    hub.send(action);
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

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Servers">
        <button className="brand-mark" aria-label="Huddle home">
          h
        </button>
        <div className="rail-divider" />
        {servers.map((server) => (
          <button
            key={server.id}
            className={`space-mark ${server.id === activeServerId ? "active-space" : ""}`}
            style={
              server.id === activeServerId
                ? { background: server.color }
                : undefined
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
        <button
          className="profile-dot"
          aria-label="Settings"
          title="Settings"
          style={{ background: user.color }}
          onClick={() => setSettingsOpen(true)}
        >
          {user.avatar}
          <span className={hub.connected ? "online" : ""} />
        </button>
      </aside>

      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <header className="space-header">
          <div>
            <span className="eyebrow">PRIVATE SPACE</span>
            <h1>{activeServer?.name || "Huddle"}</h1>
          </div>
          <Icon label="Server settings" onClick={editServer}>
            •••
          </Icon>
        </header>

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
                  onClick={() => void voice.join(channel.id)}
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
                      >
                        <span
                          className="tiny-avatar"
                          style={{ backgroundColor: person.color }}
                        >
                          {person.avatar}
                        </span>
                        <span>
                          {person.connectionId === hub.connectionId
                            ? "You"
                            : person.displayName}
                        </span>
                        {person.muted && !person.bot && (
                          <span className="muted-pill" aria-label="Muted">
                            ⃠
                          </span>
                        )}
                        {person.bot && playing && (
                          <span className="speaking-bars" aria-label="Playing">
                            ııı
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
                    ? "Online · /dnd"
                    : "Offline"}
              </small>
            </span>
            <i className={dndOnline ? "online" : ""} />
          </button>
        </nav>

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
              >
                {voice.muted ? "Unmute" : "Mute"}
              </button>
              <button
                className={`mic-control ${voice.deafened ? "muted" : ""}`}
                onClick={voice.toggleDeafen}
              >
                {voice.deafened ? "Undeafen" : "Deafen"}
              </button>
              <button className="leave-button" onClick={voice.leave}>
                Leave
              </button>
            </div>
          ) : (
            <button
              className="join-button"
              disabled={!voiceChannels.length}
              onClick={() => voiceChannels[0] && void voice.join(voiceChannels[0].id)}
            >
              Join {voiceChannels[0]?.name || "voice"}
            </button>
          )}
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <button
            className="mobile-menu"
            aria-label="Open channels"
            onClick={() => setMobileNav((open) => !open)}
          >
            ☰
          </button>
          <span className="big-hash">#</span>
          <div className="channel-heading">
            <strong>{activeChannel?.name || "no channel"}</strong>
            <span>
              {activeChannel?.topic ||
                (activeChannel
                  ? `Everything happening in ${activeChannel.name}`
                  : "Create a channel to start talking")}
            </span>
          </div>
          <div className="header-actions">
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

        <div className="messages" aria-live="polite">
          <div className="channel-intro">
            <div className="intro-icon">#</div>
            <h2>Welcome to #{activeChannel?.name || "huddle"}</h2>
            <p>This is the start of the channel. Be excellent to each other.</p>
          </div>

          {messages.map((message) => (
            <article className="message" key={message.id}>
              <div
                className={`avatar ${message.bot ? "bot-avatar" : ""}`}
                style={{ backgroundColor: message.color }}
              >
                {message.avatar}
              </div>
              <div className="message-body">
                <div className="message-meta">
                  <strong>{message.author}</strong>
                  {message.bot && <span className="bot-tag">BOT</span>}
                  <time>{message.time}</time>
                </div>
                <p>{message.text}</p>

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
                      blocked={player.blocked}
                      onUnblock={player.unblock}
                      voiceChannelName={
                        voiceChannels.find(
                          (channel) =>
                            channel.id === message.payload?.voiceChannelId,
                        )?.name
                      }
                      onSeek={(positionMs) =>
                        playerCommand({
                          t: "player",
                          channelId: message.payload!.voiceChannelId!,
                          action: { name: "seek", positionMs },
                        })
                      }
                      onToggle={() =>
                        playerCommand({
                          t: "player",
                          channelId: message.payload!.voiceChannelId!,
                          action: { name: "toggle" },
                        })
                      }
                      onSkip={() =>
                        playerCommand({
                          t: "player",
                          channelId: message.payload!.voiceChannelId!,
                          action: { name: "skip" },
                        })
                      }
                      onVolume={(volume) =>
                        playerCommand({
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
              </div>
            </article>
          ))}
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

          <div className="composer">
            <button
              type="button"
              className="attach-button"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach an image"
            >
              +
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={chooseImage}
            />
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={`Message #${activeChannel?.name || "huddle"}`}
              aria-label={`Message ${activeChannel?.name || "huddle"}`}
              rows={1}
            />
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
                  <span
                    key={person.connectionId}
                    style={{ background: person.color }}
                  >
                    {person.avatar}
                  </span>
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
                >
                  {voice.muted ? "Muted" : "Mic on"}
                </button>
                <button className="leave-outline" onClick={voice.leave}>
                  Leave
                </button>
              </div>
            </div>

            {roomPlayer?.track && (
              <div className="member-player">
                <NowPlaying
                  state={roomPlayer}
                  position={player.position}
                  controllable
                  blocked={player.blocked}
                  onUnblock={player.unblock}
                  voiceChannelName={currentVoiceChannel?.name}
                  onSeek={(positionMs) =>
                    playerCommand({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "seek", positionMs },
                    })
                  }
                  onToggle={() =>
                    playerCommand({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "toggle" },
                    })
                  }
                  onSkip={() =>
                    playerCommand({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "skip" },
                    })
                  }
                  onVolume={(volume) =>
                    playerCommand({
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
          <div className="member" key={member.id}>
            <span className="member-avatar" style={{ background: member.color }}>
              {member.avatar}
            </span>
            <div>
              <strong>{member.displayName}</strong>
              <span>{member.id === user.id ? "Here now" : "Online"}</span>
            </div>
          </div>
        ))}

        <div className="member-panel-title offline-title">
          <span>OFFLINE — {offlineMembers.length}</span>
        </div>
        {offlineMembers.map((member) => (
          <div className="member offline-member" key={member.id}>
            <span className="member-avatar" style={{ background: member.color }}>
              {member.avatar}
            </span>
            <div>
              <strong>{member.displayName}</strong>
              <span>Away</span>
            </div>
          </div>
        ))}
      </aside>

      {/* Remote voice audio. Hidden, but this is what you actually hear. */}
      {voice.remoteStreams.map(({ connectionId, stream }) => (
        <audio
          key={connectionId}
          autoPlay
          ref={(element) => {
            if (element && element.srcObject !== stream) {
              element.srcObject = stream;
            }
          }}
          muted={voice.deafened}
        />
      ))}

      {settingsOpen && (
        <SettingsDialog
          user={user}
          theme={theme}
          onTheme={applyTheme}
          onUser={setUser}
          onClose={() => setSettingsOpen(false)}
          onSignOut={signOut}
        />
      )}
    </main>
  );
}
