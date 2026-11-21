"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ExternalLink,
  Hash,
  HeadphoneOff,
  Headphones,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  Volume2,
  X,
} from "lucide-react";
import { basePath } from "../../lib/client";
import {
  overlayPageBridge,
  type OverlayDm,
  type OverlayMessageEvent,
  type OverlayPageBridge,
  type OverlayPerson,
  type OverlayServer,
  type OverlayShell,
  type OverlayState,
  type OverlayToast,
  type OverlayVoice,
} from "../../lib/desktop-overlay";
import { ChatPane, type ChatPaneLiveSignal, type SimpleChatMessage } from "../second-screen/chat-pane";
import "../second-screen/second-screen.css";
import "./overlay.css";

const DM_HOME = "@me";
const TOAST_MS = 6000;
/** The corner widget lists this many people before "+N more". */
const WIDGET_PEOPLE = 8;

const CLOSED: OverlayState = { open: false, game: null, shortcut: "", platform: "" };

/**
 * The desktop app's game overlay (desktop/src/overlay.js loads this page into
 * a see-through window over everything). Closed, it shows who is in your call
 * and new-message pop-ups and lets every click through to the game. Open, it
 * is a small Hoffle: servers, channels, chat and the call buttons.
 */
export function OverlayApp() {
  // undefined until mounted, so the server render and the first client render agree.
  const [bridge, setBridge] = useState<OverlayPageBridge | null | undefined>(undefined);
  const [state, setState] = useState<OverlayState>(CLOSED);
  const [voice, setVoice] = useState<OverlayVoice | null>(null);
  const [shell, setShell] = useState<OverlayShell | null>(null);
  const [toasts, setToasts] = useState<OverlayToast[]>([]);
  const [signal, setSignal] = useState<ChatPaneLiveSignal | null>(null);
  const [serverId, setServerId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const found = overlayPageBridge();
    setBridge(found);
    if (found) document.documentElement.classList.add("hoffle-overlay-page");
  }, []);

  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void bridge.hello().then((hello) => {
      if (!live || !hello) return;
      setState(hello.state);
      setVoice(hello.voice);
      if (hello.shell) setShell(hello.shell);
    });
    const offs = [
      bridge.onState(setState),
      bridge.onVoice(setVoice),
      bridge.onShell((next) => next && setShell(next)),
      bridge.onToast((toast) => {
        setToasts((list) => [...list.slice(-2), toast]);
        window.setTimeout(() => setToasts((list) => list.filter((item) => item !== toast)), TOAST_MS);
      }),
      bridge.onMessage((event: OverlayMessageEvent) => {
        seq.current += 1;
        if (event.t === "message" && event.message) {
          setSignal({ seq: seq.current, kind: "message", channelId: event.channelId, message: event.message as SimpleChatMessage });
        } else if (event.t === "message-edited" && event.id) {
          setSignal({ seq: seq.current, kind: "edited", channelId: event.channelId, messageId: event.id, content: event.content, editedAt: event.editedAt });
        } else if (event.t === "message-deleted" && event.id) {
          setSignal({ seq: seq.current, kind: "deleted", channelId: event.channelId, messageId: event.id });
        }
      }),
    ];
    return () => {
      live = false;
      offs.forEach((off) => off());
    };
  }, [bridge]);

  // Start where the main window is, the first time it says.
  useEffect(() => {
    if (!shell || serverId) return;
    setServerId(shell.activeServerId || shell.servers[0]?.id || DM_HOME);
    if (shell.activeChannelId) setChannelId(shell.activeChannelId);
  }, [shell, serverId]);

  useEffect(() => {
    if (!bridge || !state.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") bridge.action({ type: "close" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bridge, state.open]);

  if (bridge === undefined) return null;
  if (!bridge) {
    return (
      <main className="ov-elsewhere">
        <p>This page is Hoffle&apos;s game overlay. It opens from the Hoffle desktop app.</p>
        <a href={basePath}>Open Hoffle</a>
      </main>
    );
  }

  return (
    <div className="ov-root">
      {!state.open && voice && <CallWidget voice={voice} shortcut={state.shortcut} />}
      {!state.open && toasts.length > 0 && (
        <div className="ov-toasts" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.at} className={`ov-toast ${toast.kind === "hint" ? "is-hint" : ""}`}>
              <MessageCircle size={16} aria-hidden="true" />
              <div>
                <strong>{toast.title}</strong>
                {toast.body && <p>{toast.body}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {state.open && (
        <MiniHoffle
          bridge={bridge}
          state={state}
          voice={voice}
          shell={shell}
          serverId={serverId}
          channelId={channelId}
          onServer={(id) => {
            setServerId(id);
            setChannelId(null);
          }}
          onChannel={setChannelId}
          signal={signal}
        />
      )}
    </div>
  );
}

function Avatar({ name, avatar, avatarUrl, color, size = 28 }: { name: string; avatar?: string; avatarUrl?: string | null; color?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, background: color || "#7b63e6", fontSize: Math.round(size * 0.42) };
  if (avatarUrl && !broken) {
    return <img className="ov-avatar" src={avatarUrl} alt="" style={style} onError={() => setBroken(true)} />;
  }
  return (
    <span className="ov-avatar" style={style} aria-hidden="true">
      {(avatar || name || "?").slice(0, 2)}
    </span>
  );
}

function PersonRow({ person, speaking }: { person: OverlayPerson; speaking: boolean }) {
  return (
    <li className={`ov-person ${speaking ? "is-speaking" : ""}`}>
      <span className="ov-person-face">
        <Avatar name={person.name} avatar={person.avatar} avatarUrl={person.avatarUrl} color={person.color} size={24} />
      </span>
      <span className="ov-person-name">{person.name}</span>
      {person.deafened ? (
        <HeadphoneOff size={13} aria-label="Deafened" />
      ) : person.muted ? (
        <MicOff size={13} aria-label="Muted" />
      ) : null}
    </li>
  );
}

/** The corner card over a game: the room and who is talking. */
function CallWidget({ voice, shortcut }: { voice: OverlayVoice; shortcut: string }) {
  const speaking = new Set(voice.speaking);
  // Talking people first, so a big room still shows who is speaking.
  const people = [...voice.people].sort((a, b) => Number(speaking.has(b.connectionId)) - Number(speaking.has(a.connectionId)));
  const shown = people.slice(0, WIDGET_PEOPLE);
  return (
    <section className="ov-widget" aria-label={`In voice: ${voice.channelName}`}>
      <header>
        <Volume2 size={13} aria-hidden="true" />
        <span>{voice.channelName}</span>
        {voice.deafened ? <HeadphoneOff size={13} aria-label="You are deafened" /> : voice.muted ? <MicOff size={13} aria-label="You are muted" /> : null}
      </header>
      <ul>
        {shown.map((person) => (
          <PersonRow key={person.connectionId} person={person} speaking={speaking.has(person.connectionId)} />
        ))}
      </ul>
      {people.length > shown.length && <p className="ov-more">+{people.length - shown.length} more</p>}
      {shortcut && <p className="ov-widget-hint">{shortcut} opens Hoffle</p>}
    </section>
  );
}

function IconButton({ label, onClick, active, danger, children }: { label: string; onClick: () => void; active?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={`ov-icon-btn ${active ? "is-active" : ""} ${danger ? "is-danger" : ""}`} onClick={onClick} title={label} aria-label={label} aria-pressed={active}>
      {children}
    </button>
  );
}

function MiniHoffle({
  bridge,
  state,
  voice,
  shell,
  serverId,
  channelId,
  onServer,
  onChannel,
  signal,
}: {
  bridge: OverlayPageBridge;
  state: OverlayState;
  voice: OverlayVoice | null;
  shell: OverlayShell | null;
  serverId: string | null;
  channelId: string | null;
  onServer: (id: string) => void;
  onChannel: (id: string) => void;
  signal: ChatPaneLiveSignal | null;
}) {
  const server = shell?.servers.find((item) => item.id === serverId) || null;
  const inDms = serverId === DM_HOME;
  const textChannel = useMemo(() => {
    if (!channelId || !shell) return null;
    const dm = shell.dms.find((item) => item.channelId === channelId);
    if (dm) return { id: dm.channelId, name: dm.name };
    for (const item of shell.servers) {
      const found = item.channels.find((channel) => channel.id === channelId && channel.kind === "text");
      if (found) return { id: found.id, name: found.name };
    }
    return null;
  }, [shell, channelId]);
  const dmUnread = shell?.dms.some((dm) => dm.unread) ?? false;
  // The main window sends the list within a moment; if it doesn't, it is
  // signed out or still starting, and waiting here would never end.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (shell) return;
    const timer = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(timer);
  }, [shell]);

  return (
    <div
      className="ov-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) bridge.action({ type: "close" });
      }}
    >
      <div className="ov-panel" role="dialog" aria-label="Hoffle">
        <header className="ov-head">
          <strong className="ov-brand">Hoffle</strong>
          {state.game && <span className="ov-chip">Playing {state.game}</span>}
          <span className="ov-head-hint">{state.shortcut ? `${state.shortcut} or Esc to close` : "Esc to close"}</span>
          <button type="button" className="ov-text-btn" onClick={() => bridge.action({ type: "open-main", channelId: textChannel?.id })}>
            <ExternalLink size={14} aria-hidden="true" /> Open in Hoffle
          </button>
          <IconButton label="Overlay settings" onClick={() => bridge.action({ type: "settings" })}>
            <Settings size={16} />
          </IconButton>
          <IconButton label="Close" onClick={() => bridge.action({ type: "close" })}>
            <X size={16} />
          </IconButton>
        </header>
        {!shell ? (
          <div className="ov-loading">
            {slow ? (
              <>
                <p>Your servers show up here once Hoffle is open and you are signed in.</p>
                <button type="button" className="ov-text-btn" onClick={() => bridge.action({ type: "open-main" })}>
                  <ExternalLink size={14} aria-hidden="true" /> Open Hoffle
                </button>
              </>
            ) : (
              "Loading your servers…"
            )}
          </div>
        ) : (
          <div className="ov-body">
            <nav className="ov-rail" aria-label="Servers">
              <button type="button" className={`ov-rail-item ${inDms ? "is-active" : ""}`} onClick={() => onServer(DM_HOME)} title="Direct messages" aria-label="Direct messages">
                <MessageCircle size={18} />
                {dmUnread && <span className="ov-dot" />}
              </button>
              <span className="ov-rail-sep" />
              {shell.servers.map((item) => (
                <ServerButton key={item.id} server={item} active={item.id === serverId} onClick={() => onServer(item.id)} />
              ))}
            </nav>
            <aside className="ov-channels">
              <h2>{inDms ? "Direct messages" : server?.name || "Servers"}</h2>
              <div className="ov-channel-list">
                {inDms ? (
                  shell.dms.length ? (
                    shell.dms.map((dm) => <DmButton key={dm.channelId} dm={dm} active={dm.channelId === channelId} onClick={() => onChannel(dm.channelId)} />)
                  ) : (
                    <p className="ov-empty-note">No direct messages yet.</p>
                  )
                ) : server ? (
                  <ChannelList
                    server={server}
                    rooms={shell.rooms}
                    voice={voice}
                    channelId={channelId}
                    onText={onChannel}
                    onVoice={(id) => bridge.action({ type: "join", channelId: id })}
                  />
                ) : (
                  <p className="ov-empty-note">You are not in a server yet.</p>
                )}
              </div>
              {voice && (
                <div className="ov-call">
                  <div className="ov-call-where">
                    <strong>In voice</strong>
                    <span>
                      {voice.channelName}
                      {voice.serverName ? ` · ${voice.serverName}` : ""}
                    </span>
                  </div>
                  <IconButton label={voice.muted ? "Unmute" : "Mute"} active={voice.muted} onClick={() => bridge.action({ type: "mute" })}>
                    {voice.muted ? <MicOff size={16} /> : <Mic size={16} />}
                  </IconButton>
                  <IconButton label={voice.deafened ? "Undeafen" : "Deafen"} active={voice.deafened} onClick={() => bridge.action({ type: "deafen" })}>
                    {voice.deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
                  </IconButton>
                  <IconButton label="Leave call" danger onClick={() => bridge.action({ type: "leave" })}>
                    <PhoneOff size={16} />
                  </IconButton>
                </div>
              )}
            </aside>
            <main className="ov-chat">
              {textChannel ? (
                <ChatPane channelId={textChannel.id} channelName={textChannel.name} pairToken="" pairedReadOnly={false} liveSignal={signal} />
              ) : (
                <div className="ov-pick">
                  <Hash size={28} aria-hidden="true" />
                  <p>Pick a channel to read and reply. Click a voice room to join it.</p>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ mentions, unread }: { mentions: number; unread: boolean }) {
  if (mentions > 0) return <span className="ov-badge">{mentions > 99 ? "99+" : mentions}</span>;
  if (unread) return <span className="ov-dot" />;
  return null;
}

function ServerButton({ server, active, onClick }: { server: OverlayServer; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`ov-rail-item ${active ? "is-active" : ""}`} onClick={onClick} title={server.name} aria-label={server.name}>
      {server.iconUrl ? (
        <img src={server.iconUrl} alt="" />
      ) : (
        <span className="ov-rail-letter" style={{ background: server.color }}>
          {(server.icon || server.name).slice(0, 2)}
        </span>
      )}
      <Badge mentions={server.mentions} unread={server.unread} />
    </button>
  );
}

function DmButton({ dm, active, onClick }: { dm: OverlayDm; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`ov-channel ${active ? "is-active" : ""} ${dm.unread ? "is-unread" : ""}`} onClick={onClick}>
      <Avatar name={dm.name} avatar={dm.avatar} avatarUrl={dm.avatarUrl} color={dm.color} size={20} />
      <span className="ov-channel-name">{dm.name}</span>
      <Badge mentions={dm.mentions} unread={false} />
    </button>
  );
}

function ChannelList({
  server,
  rooms,
  voice,
  channelId,
  onText,
  onVoice,
}: {
  server: OverlayServer;
  rooms: Record<string, OverlayPerson[]>;
  voice: OverlayVoice | null;
  channelId: string | null;
  onText: (id: string) => void;
  onVoice: (id: string) => void;
}) {
  // Grouped by category in the server's own order; uncategorised first.
  const groups: Array<{ name: string | null; channels: OverlayServer["channels"] }> = [];
  for (const channel of server.channels) {
    let group = groups.find((item) => item.name === channel.category);
    if (!group) {
      group = { name: channel.category, channels: [] };
      if (channel.category === null) groups.unshift(group);
      else groups.push(group);
    }
    group.channels.push(channel);
  }
  const speaking = new Set(voice?.speaking || []);
  return (
    <>
      {groups.map((group) => (
        <div key={group.name ?? ""} className="ov-group">
          {group.name && <h3>{group.name}</h3>}
          {group.channels.map((channel) =>
            channel.kind === "text" ? (
              <button
                key={channel.id}
                type="button"
                className={`ov-channel ${channel.id === channelId ? "is-active" : ""} ${channel.unread ? "is-unread" : ""}`}
                onClick={() => onText(channel.id)}
              >
                <Hash size={15} aria-hidden="true" />
                <span className="ov-channel-name">{channel.name}</span>
                <Badge mentions={channel.mentions} unread={false} />
              </button>
            ) : (
              <div key={channel.id} className="ov-room">
                <button
                  type="button"
                  className={`ov-channel ${voice?.channelId === channel.id ? "is-here" : ""}`}
                  onClick={() => onVoice(channel.id)}
                  title={voice?.channelId === channel.id ? "You are here" : `Join ${channel.name}`}
                >
                  <Volume2 size={15} aria-hidden="true" />
                  <span className="ov-channel-name">{channel.name}</span>
                  {voice?.channelId !== channel.id && <span className="ov-join">Join</span>}
                </button>
                {(rooms[channel.id] || []).length > 0 && (
                  <ul className="ov-room-people">
                    {(rooms[channel.id] || []).map((person) => (
                      <PersonRow key={person.connectionId} person={person} speaking={voice?.channelId === channel.id && speaking.has(person.connectionId)} />
                    ))}
                  </ul>
                )}
              </div>
            ),
          )}
        </div>
      ))}
    </>
  );
}
