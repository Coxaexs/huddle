"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

interface ChannelSummary {
  name: string;
  icon: string;
  unread: number;
}

interface Message {
  id: string | number;
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
}

const channels: ChannelSummary[] = [
  { name: "general", icon: "#", unread: 0 },
  { name: "game-night", icon: "#", unread: 3 },
  { name: "memes", icon: "#", unread: 0 },
];

const voicePeople = [
  { name: "Maya", initial: "M", color: "#f4a7b9" },
  { name: "Theo", initial: "T", color: "#8dd7d0" },
];

/** Huddle is mounted under /hangout, so every fetch needs the prefix. */
const basePath = "/hangout";
const apiUrl = (path: string) => `${basePath}${path}`;

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
  const [activeChannel, setActiveChannel] = useState("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [inVoice, setInVoice] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [musicWatchOnline, setMusicWatchOnline] = useState<boolean | null>(null);
  const [musicDashboardUrl, setMusicDashboardUrl] = useState<string | null>(null);
  const [dndOnline, setDndOnline] = useState<boolean | null>(null);
  const [dndUrl, setDndUrl] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const savedName = window.localStorage.getItem("huddle-username")?.trim();
    const frame = window.requestAnimationFrame(() => {
      setUsername(savedName || "");
      setUsernameDraft(savedName || "");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
    fetch(apiUrl("/api/integrations/musicwatch"))
      .then((response) => response.json())
      .then((data) => {
        setMusicWatchOnline(Boolean(data.online));
        setMusicDashboardUrl(data.dashboardUrl || null);
      })
      .catch(() => setMusicWatchOnline(false));
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/integrations/dnd"))
      .then((response) => response.json())
      .then((data) => {
        setDndOnline(Boolean(data.online));
        setDndUrl(data.appUrl || null);
      })
      .catch(() => setDndOnline(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadMessages = () =>
      fetch(apiUrl(`/api/messages?channel=${encodeURIComponent(activeChannel)}`))
        .then((response) => response.json())
        .then((data) => {
          if (!cancelled && data.messages) setMessages(data.messages);
        })
        .catch(() => undefined);

    loadMessages();
    const poll = window.setInterval(loadMessages, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [activeChannel]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function currentTime() {
    return new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  }

  function addBotMessage(text: string, options?: Partial<Message>) {
    const message: Message = {
      id: crypto.randomUUID(),
      author: options?.author || "Music + Watch",
      avatar: options?.avatar || "♫",
      color: "#b8a6ff",
      time: currentTime(),
      text,
      bot: true,
      ...options,
    };
    setMessages((current) => [...current, message]);

    fetch(apiUrl("/api/messages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: activeChannel,
        content: text,
        author: message.author,
        avatar: message.avatar,
        color: message.color,
        bot: true,
        link: message.link,
        actionLabel: message.actionLabel,
        audio: message.audio,
      }),
    });
  }

  async function botReply(command: string) {
    const normalized = command.trim().toLowerCase();

    if (normalized.startsWith("/watch") || normalized.startsWith("/reels")) {
      const mode = normalized.startsWith("/reels") ? "reels" : "watch";
      addBotMessage(
        mode === "reels"
          ? "Creating a synchronized ReelsTogether room…"
          : "Creating a synchronized Watch Together room…",
      );
      try {
        const response = await fetch(apiUrl("/api/integrations/musicwatch"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, name: `${activeChannel} · Huddle` }),
        });
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error(data.error);
        addBotMessage(
          mode === "reels"
            ? "Your shared reels room is ready. Everyone who opens this link joins the same synchronized feed."
            : "Your watch room is ready. Everyone who opens this link joins the same synchronized player.",
          {
            link: data.url,
            actionLabel: mode === "reels" ? "Open reels room" : "Open watch room",
          },
        );
      } catch {
        addBotMessage(
          "I couldn’t reach the Music + Watch server. Start it on your server and set MUSICWATCH_BASE_URL in Huddle.",
        );
      }
      return;
    }

    if (normalized.startsWith("/music")) {
      addBotMessage(
        musicWatchOnline
          ? "The music dashboard is online. Use /play in Huddle for browser playback, or open the dashboard for the full Music + Watch experience."
          : "The music server looks offline. Start musicwatchtogether first, then try again.",
        musicDashboardUrl
          ? { link: musicDashboardUrl, actionLabel: "Open music dashboard" }
          : undefined,
      );
      return;
    }

    const musicCommand = normalized.split(/\s+/, 1)[0];
    if (
      new Set([
        "/play",
        "/join",
        "/disconnect",
        "/pause",
        "/resume",
        "/skip",
        "/previous",
        "/stop",
        "/queue",
        "/nowplaying",
        "/np",
        "/volume",
        "/loop",
        "/shuffle",
        "/clear",
        "/remove",
        "/seek",
        "/lyrics",
        "/playlists",
        "/filter",
        "/crossfade",
        "/autoplay",
        "/automix",
        "/karaoke",
        "/sleep",
      ]).has(musicCommand)
    ) {
      try {
        const response = await fetch(
          apiUrl("/api/integrations/musicwatch/command"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command }),
          },
        );
        const data = await response.json();
        if (!response.ok || !data.text) {
          throw new Error(
            data.error || "The music bot could not complete that command.",
          );
        }
        addBotMessage(data.text, {
          audio: data.audio,
          link: data.link,
          actionLabel: data.link ? "Open source" : undefined,
        });
      } catch (error) {
        addBotMessage(
          error instanceof Error && error.message
            ? error.message
            : "The music command failed. Open the full dashboard to check the bot’s Discord voice connection.",
          musicDashboardUrl
            ? { link: musicDashboardUrl, actionLabel: "Open full dashboard" }
            : undefined,
        );
      }
      return;
    }

    if (normalized.startsWith("/roll")) {
      try {
        const data = await (
          await fetch(apiUrl("/api/integrations/dnd/roll"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command }),
          })
        ).json();
        addBotMessage(data.text || data.error || "The roll failed.", {
          author: "D&D Bot",
          avatar: "⚔",
        });
      } catch {
        addBotMessage("The D&D dice roller is unavailable.", {
          author: "D&D Bot",
          avatar: "⚔",
        });
      }
      return;
    }

    if (normalized.startsWith("/dnd") || normalized.startsWith("/campaign")) {
      addBotMessage(
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

    let text =
      "I heard you. Try `/play`, `/queue`, `/watch`, `/reels`, `/music`, `/dnd`, `/roll`, `/flip`, or `/help`.";
    if (normalized.startsWith("/flip")) {
      text = Math.random() > 0.5 ? "Heads." : "Tails.";
    } else if (normalized.startsWith("/help")) {
      text =
        "Music: `/join`, `/play`, `/pause`, `/resume`, `/skip`, `/previous`, `/stop`, `/disconnect`, `/queue`, `/nowplaying`, `/volume`, `/loop`, `/shuffle`, `/clear`, `/remove`, `/seek`, `/lyrics`, `/playlists`, `/filter`, `/crossfade`, `/autoplay`, `/automix`, `/karaoke`, `/sleep`. Rooms: `/watch`, `/reels`. Apps: `/music`, `/dnd`.";
    }

    window.setTimeout(() => {
      addBotMessage(text);
    }, 420);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("huddle-theme", next);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text && !pendingImage) return;

    const optimistic: Message = {
      id: Date.now(),
      author: username || "Friend",
      avatar: (username || "F").slice(0, 1).toUpperCase(),
      color: "#ffd67c",
      time: currentTime(),
      text: text || "Shared an image",
      image: pendingImage || undefined,
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setPendingImage(null);
    setPendingFile(null);

    try {
      let attachmentKey: string | undefined;
      if (pendingFile) {
        const form = new FormData();
        form.append("image", pendingFile);
        const uploadResponse = await fetch(apiUrl("/api/uploads"), {
          method: "POST",
          body: form,
        });
        if (uploadResponse.ok) {
          attachmentKey = (await uploadResponse.json()).key;
        }
      }

      await fetch(apiUrl("/api/messages"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: activeChannel,
          content: text,
          attachmentKey,
          author: username || "Friend",
          avatar: (username || "F").slice(0, 1).toUpperCase(),
          color: "#ffd67c",
        }),
      });
    } catch {
      setVoiceNotice("Saved in this view; the shared message store is offline.");
    }

    if (text.startsWith("/")) botReply(text);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setVoiceNotice("Choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPendingImage(String(reader.result));
    reader.readAsDataURL(file);
    setPendingFile(file);
    event.target.value = "";
  }

  async function toggleVoice() {
    if (inVoice) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setInVoice(false);
      setVoiceNotice("You left the voice room.");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setInVoice(true);
      setMicOn(true);
      setVoiceNotice("Microphone connected. Voice provider is ready to attach.");
    } catch {
      setVoiceNotice(
        "Microphone access was blocked. You can allow it in browser settings.",
      );
    }
  }

  function toggleMic() {
    const next = !micOn;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicOn(next);
  }

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Spaces">
        <button className="brand-mark" aria-label="Huddle home">
          h
        </button>
        <div className="rail-divider" />
        <button className="space-mark active-space" aria-label="The Hangout">
          HG
        </button>
        <button className="space-mark add-space" aria-label="Add a space">
          +
        </button>
        <div className="rail-spacer" />
        <button
          className="profile-dot"
          aria-label="Change your username"
          onClick={() => {
            setUsernameDraft(username || "");
            setUsername("");
          }}
        >
          {(username || "Y").slice(0, 1).toUpperCase()}
          <span />
        </button>
      </aside>

      {username === "" && (
        <div className="username-gate" role="dialog" aria-modal="true">
          <form
            className="username-card"
            onSubmit={(event) => {
              event.preventDefault();
              const nextName = usernameDraft.trim().slice(0, 40);
              if (!nextName) return;
              window.localStorage.setItem("huddle-username", nextName);
              setUsername(nextName);
            }}
          >
            <span className="username-mark">h</span>
            <p className="eyebrow">WELCOME TO THE HANGOUT</p>
            <h2>What should we call you?</h2>
            <p>This name appears beside your messages for everyone here.</p>
            <label htmlFor="huddle-username">Username</label>
            <input
              id="huddle-username"
              value={usernameDraft}
              onChange={(event) => setUsernameDraft(event.target.value)}
              maxLength={40}
              autoFocus
              placeholder="Your name"
            />
            <button type="submit" disabled={!usernameDraft.trim()}>
              Enter the Hangout
            </button>
          </form>
        </div>
      )}

      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <header className="space-header">
          <div>
            <span className="eyebrow">PRIVATE SPACE</span>
            <h1>The Hangout</h1>
          </div>
          <Icon label="Space settings">•••</Icon>
        </header>

        <nav className="channel-nav" aria-label="Channels">
          <div className="section-label">
            <span>TEXT CHANNELS</span>
            <button aria-label="Add text channel">+</button>
          </div>

          {channels.map((channel) => (
            <button
              key={channel.name}
              className={`channel ${activeChannel === channel.name ? "selected" : ""}`}
              onClick={() => {
                setActiveChannel(channel.name);
                setMobileNav(false);
              }}
            >
              <span className="channel-hash">{channel.icon}</span>
              <span>{channel.name}</span>
              {channel.unread > 0 && (
                <span className="unread">{channel.unread}</span>
              )}
            </button>
          ))}

          <div className="section-label voice-label">
            <span>VOICE ROOMS</span>
            <button aria-label="Add voice room">+</button>
          </div>

          <button className="voice-room selected-voice">
            <span className="speaker-icon">◖))</span>
            <span>Kitchen Table</span>
            <span className="live-pill">LIVE</span>
          </button>

          <div className="voice-members">
            {voicePeople.map((person) => (
              <div className="voice-member" key={person.name}>
                <span
                  className="tiny-avatar"
                  style={{ backgroundColor: person.color }}
                >
                  {person.initial}
                </span>
                <span>{person.name}</span>
                <span className="speaking-bars" aria-label="Speaking">
                  ııı
                </span>
              </div>
            ))}
            {inVoice && (
              <div className="voice-member you-in-voice">
                <span className="tiny-avatar" style={{ backgroundColor: "#ffd67c" }}>
                  Y
                </span>
                <span>You</span>
                <span className="speaking-bars">ıı</span>
              </div>
            )}
          </div>

          <button className="voice-room">
            <span className="speaker-icon">◖))</span>
            <span>AFK Sofa</span>
          </button>

          <div className="section-label bot-section-label">
            <span>APPS &amp; BOTS</span>
          </div>

          <button
            className="bot-app"
            onClick={() => {
              if (musicDashboardUrl) {
                window.open(musicDashboardUrl, "_blank", "noopener,noreferrer");
              } else {
                setDraft("/watch");
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
                    ? "Online · /watch /reels"
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
            <span className={`voice-pulse ${inVoice ? "connected" : ""}`} />
            <div>
              <strong>{inVoice ? "Voice connected" : "Voice is live"}</strong>
              <span>{inVoice ? "Kitchen Table" : "2 friends chatting"}</span>
            </div>
          </div>
          <button
            className={inVoice ? "leave-button" : "join-button"}
            onClick={toggleVoice}
          >
            {inVoice ? "Leave voice" : "Join voice"}
          </button>
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
            <strong>{activeChannel}</strong>
            <span>
              {activeChannel === "general"
                ? "Plans, chaos, and whatever else"
                : `Everything happening in ${activeChannel}`}
            </span>
          </div>
          <div className="header-actions">
            <Icon
              label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={toggleTheme}
            >
              {theme === "dark" ? "☀" : "☾"}
            </Icon>
            <Icon label="Search">⌕</Icon>
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
            <h2>Welcome to #{activeChannel}</h2>
            <p>This is the start of the channel. Be excellent to each other.</p>
          </div>
          <div className="day-divider">
            <span>Today</span>
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
                    autoPlay
                    preload="none"
                    src={message.audio}
                  />
                )}
                {message.image &&
                  (message.image.startsWith("data:") ||
                  message.image.startsWith("/") ||
                  message.image.startsWith("http") ? (
                    <img
                      className="message-image"
                      src={message.image}
                      alt="Shared attachment"
                    />
                  ) : (
                    <div
                      className="message-image sample-image"
                      role="img"
                      aria-label="A warmly colored shared photo preview"
                      style={{ background: message.image }}
                    >
                      <span>shared image</span>
                    </div>
                  ))}
              </div>
            </article>
          ))}
          <div ref={messageEndRef} />
        </div>

        {voiceNotice && (
          <button
            className="notice"
            onClick={() => setVoiceNotice("")}
            aria-label="Dismiss notification"
          >
            {voiceNotice}
            <span>×</span>
          </button>
        )}

        <form className="composer-wrap" onSubmit={sendMessage}>
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
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={`Message #${activeChannel}`}
              aria-label={`Message ${activeChannel}`}
              rows={1}
            />
            <button
              type="button"
              className="gif-button"
              onClick={() => setDraft((value) => `${value} /roll`.trimStart())}
              aria-label="Try the Watch Together bot"
            >
              /watch
            </button>
            <button className="send-button" type="submit" aria-label="Send message">
              ↑
            </button>
          </div>

          <div className="composer-hint">
            Enter to send · Shift + Enter for a new line · Try /watch
          </div>
        </form>
      </section>

      <aside className={`member-panel ${membersOpen ? "" : "closed"}`}>
        <div className="member-panel-title">
          <span>IN VOICE — {inVoice ? 3 : 2}</span>
        </div>

        <div className="voice-feature">
          <div className="voice-feature-avatars">
            <span style={{ background: "#f4a7b9" }}>M</span>
            <span style={{ background: "#8dd7d0" }}>T</span>
            {inVoice && <span style={{ background: "#ffd67c" }}>Y</span>}
          </div>
          <strong>Kitchen Table</strong>
          <p>{inVoice ? "You and 2 friends" : "2 friends are hanging out"}</p>
          <div className="voice-controls">
            {inVoice && (
              <button
                className={`mic-control ${micOn ? "" : "muted"}`}
                onClick={toggleMic}
              >
                {micOn ? "Mic on" : "Muted"}
              </button>
            )}
            <button
              className={inVoice ? "leave-outline" : "join-outline"}
              onClick={toggleVoice}
            >
              {inVoice ? "Leave" : "Join"}
            </button>
          </div>
        </div>

        <div className="member-panel-title online-title">
          <span>ONLINE — 5</span>
        </div>

        {(
          [
            ["Maya", "Planning game night", "M", "#f4a7b9", "online"],
            ["Theo", "Probably making tea", "T", "#8dd7d0", "online"],
            ["You", "Here now", "Y", "#ffd67c", "online"],
            ["Dicey", "Ready for /roll", "✦", "#b8a6ff", "bot"],
            [
              "Music + Watch",
              musicWatchOnline ? "Ready for /watch" : "Waiting for your server",
              "♫",
              "#a99af5",
              "bot",
            ],
          ] as const
        ).map(([name, status, initial, color, kind]) => (
          <div className="member" key={name}>
            <span className="member-avatar" style={{ background: color }}>
              {initial}
              <i className={kind === "bot" ? "bot-status" : ""} />
            </span>
            <div>
              <strong>{name}</strong>
              <span>{status}</span>
            </div>
            {kind === "bot" && <span className="bot-tag">BOT</span>}
          </div>
        ))}

        <div className="member-panel-title offline-title">
          <span>OFFLINE — 1</span>
        </div>
        <div className="member offline-member">
          <span className="member-avatar" style={{ background: "#87909f" }}>
            N
          </span>
          <div>
            <strong>Noah</strong>
            <span>Last seen yesterday</span>
          </div>
        </div>
      </aside>
    </main>
  );
}
