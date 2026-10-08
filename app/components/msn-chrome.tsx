"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./avatar";
import { TextStyleMenu } from "./text-style-menu";
import {
  TEXT_COLORS,
  TEXT_FONTS,
  TEXT_SIZES,
  applyMessageFont,
  resolveColor,
  resolveFont,
  stripTextStyle,
  type MessageFont,
} from "@/lib/text-style";
import { StyledText } from "./message-body";
import { MSN_EMOTICON_MENU } from "@/lib/msn-emoticons";
import { GAME_INFO, GAME_KINDS, SOLO_GAMES, type GameKind } from "@/lib/games";
import type { PersonalEmoticon } from "@/lib/msn-contacts";
import type { WhatsNewEntry } from "../hooks/use-msn-extras";
import { MSN_PICTURES, type MsnPicture } from "../lib/msn-pictures";
import { playWinkScene, preloadWinkPlayer, winkThumbUrl } from "../lib/msn-winks";
import {
  SOUND_EVENTS,
  playSound,
  presetsFor,
  previewSound,
  setSoundChoice,
  soundChoice,
  getMsnVolume,
  setMsnVolume,
  type SoundEvent,
  type SoundPreset,
} from "../lib/msn-sounds";

/**
 * Extra furniture the MSN Messenger theme needs that CSS alone can't draw:
 * the display-picture column beside the conversation and the banner at the
 * foot of the contact list. Everything renders only while that theme is on.
 */

/** True while the MSN Messenger theme is the active one. */
export function useMsnTheme(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    // "msn" and "msn-dark" share all of the chrome.
    const read = () => setOn(Boolean(root.dataset.customThemeId?.startsWith("msn")));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-custom-theme-id"] });
    return () => observer.disconnect();
  }, []);
  return on;
}

interface Picture {
  name: string;
  avatar: string;
  avatarUrl?: string | null;
  color: string;
}

function DisplayPicture({
  who,
  caption,
  onChange,
}: {
  who: Picture;
  caption: string;
  onChange?: () => void;
}) {
  return (
    <figure
      className={`msn-dp ${onChange ? "changeable" : ""}`}
      onClick={onChange}
      title={onChange ? "Change your display picture" : undefined}
    >
      <div className="msn-dp-frame">
        <Avatar
          className="msn-dp-image"
          avatar={who.avatar}
          avatarUrl={who.avatarUrl}
          color={who.color}
          title={who.name}
        />
      </div>
      <figcaption>{stripTextStyle(caption)}</figcaption>
    </figure>
  );
}

/** Their picture beside the history, yours beside the typing box. */
export function MsnDisplayPictures({
  them,
  me,
  onChangeMine,
}: {
  them: Picture;
  me: Picture | null;
  onChangeMine?: () => void;
}) {
  return (
    <aside className="msn-dp-column">
      <DisplayPicture who={them} caption={them.name} />
      {me && <DisplayPicture who={me} caption={me.name} onChange={onChangeMine} />}
    </aside>
  );
}

/**
 * Messenger's "Display Picture" dialog: the stock pictures (app/lib/
 * msn-pictures.ts) plus Browse… for your own, which opens profile settings.
 */
export function MsnPicturePicker({
  onPick,
  onBrowse,
  onClose,
}: {
  onPick: (picture: MsnPicture) => Promise<void>;
  onBrowse: () => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<MsnPicture | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="msn-today-backdrop" onClick={onClose}>
      <div
        className="msn-popover msn-picture-picker"
        role="dialog"
        aria-label="Display Picture"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="msn-popover-title">
          Display Picture
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p>Select a display picture to show others who you are:</p>
        <div className="msn-picture-grid">
          {MSN_PICTURES.map((picture) => (
            <button
              key={picture.id}
              type="button"
              className={chosen?.id === picture.id ? "active" : ""}
              onClick={() => setChosen(picture)}
              onDoubleClick={() => setChosen(picture)}
              title={picture.name}
            >
              <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(picture.svg)}`} alt={picture.name} />
            </button>
          ))}
        </div>
        {error && <p className="msn-create-error">{error}</p>}
        <div className="msn-dialog-buttons">
          <button type="button" onClick={onBrowse}>
            Browse…
          </button>
          <span />
          <button
            type="button"
            className="msn-default-button"
            disabled={!chosen || saving}
            onClick={async () => {
              if (!chosen) return;
              setSaving(true);
              setError(null);
              try {
                await onPick(chosen);
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't set that picture.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "OK"}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function timeAgo(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** One "What's New" line: "Ana changed their personal message: …". */
export function WhatsNewLine({ entry }: { entry: WhatsNewEntry }) {
  return (
    <>
      <strong>
        <StyledText text={entry.name} />
      </strong>{" "}
      {entry.kind === "status" ? (
        <>
          changed their personal message: <em><StyledText text={entry.text} /></em>
        </>
      ) : entry.kind === "picture" ? (
        "changed their display picture."
      ) : (
        "changed their name."
      )}{" "}
      <time>{timeAgo(entry.at)}</time>
    </>
  );
}

/** Messenger 2009's "What's New" box at the foot of the contact list. */
export function MsnWhatsNew({
  feed,
  onOpen,
  onClear,
}: {
  feed: WhatsNewEntry[];
  onOpen: (userId: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="msn-whatsnew">
      <div className="msn-whatsnew-head">
        <button type="button" className={open ? "" : "collapsed"} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          What&apos;s New {feed.length ? `(${feed.length})` : ""}
        </button>
        {feed.length > 0 && (
          <button type="button" className="msn-whatsnew-clear" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {open &&
        (feed.length ? (
          <ul>
            {feed.map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => onOpen(entry.userId)}>
                  <WhatsNewLine entry={entry} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>When your contacts change their personal message, picture or name, you&apos;ll see it here.</p>
        ))}
    </section>
  );
}

/** The banner strip that sat under every contact list. */
export function MsnAdBanner({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" className="msn-ad" onClick={onClick}>
      <span className="msn-ad-art" aria-hidden="true">
        <span />
        <span />
      </span>
      <span className="msn-ad-copy">
        <strong>Invite your friends to Hoffle!</strong>
        <em>Click here to add a contact</em>
      </span>
    </button>
  );
}

/**
 * Shakes the whole window the way Messenger did when a nudge arrived, with
 * the nudge sound from the Sounds settings. Works in every theme; nudges aren't MSN-only.
 */
export function playNudge() {
  const shell = document.querySelector(".app-shell");
  if (shell) {
    shell.classList.remove("nudging");
    // Force a reflow so back-to-back nudges restart the animation.
    void (shell as HTMLElement).offsetWidth;
    shell.classList.add("nudging");
    window.setTimeout(() => shell.classList.remove("nudging"), 900);
  }
  playSound("nudge");
}

/**
 * Winks: Messenger's full-window Flash animations, the originals, played by
 * Ruffle (app/lib/msn-winks.ts). Sent as a message payload like a nudge and
 * replayable from the line they leave in the conversation. The emoji stands in
 * for the wink in plain text (notifications, other clients).
 */
export const MSN_WINKS: ReadonlyArray<{ id: string; name: string; emoji: string }> = [
  { id: "kiss", name: "Kiss", emoji: "💋" },
  { id: "heart", name: "Heart", emoji: "💗" },
  { id: "laugh", name: "Laughing Face", emoji: "😆" },
  { id: "laughing-girl", name: "Laughing Girl", emoji: "🤣" },
  { id: "guitar-smash", name: "Guitar Smash", emoji: "🎸" },
  { id: "frog", name: "Frog", emoji: "🐸" },
  { id: "bow", name: "Bow", emoji: "🙇" },
  { id: "knock", name: "Knock", emoji: "✊" },
  { id: "dancing-pig", name: "Dancing Pig", emoji: "🐷" },
  { id: "love-letter", name: "Love Letter", emoji: "💌" },
  { id: "birthday", name: "Birthday Cake", emoji: "🎂" },
  { id: "water-balloon", name: "Water Balloon", emoji: "💦" },
  { id: "fartguy", name: "Fart Guy", emoji: "💨" },
  { id: "ufo", name: "UFO", emoji: "🛸" },
  { id: "sleepy", name: "Sleepy Guard", emoji: "💂" },
  { id: "yawning-moon", name: "Yawning Moon", emoji: "🌙" },
  { id: "waiting", name: "Waiting", emoji: "⏳" },
  { id: "busy", name: "Busy", emoji: "📞" },
  { id: "cry", name: "Crying Dog", emoji: "😭" },
  { id: "punch", name: "Punch", emoji: "🥊" },
  { id: "dart", name: "Bullseye", emoji: "🎯" },
  { id: "bouncy-ball", name: "Bouncy Smiley", emoji: "🙂" },
  { id: "silly-face", name: "Silly Face", emoji: "🤪" },
  { id: "eyeball", name: "Eyeball", emoji: "👁️" },
  { id: "lightbulb", name: "Bright Idea", emoji: "💡" },
  { id: "imissyou", name: "I Miss You", emoji: "🥺" },
  { id: "heartkey", name: "Key to My Heart", emoji: "🗝️" },
  { id: "lipstick-girl", name: "Lipstick", emoji: "💄" },
  { id: "rich", name: "Gold Coins", emoji: "💰" },
  { id: "drink", name: "Cheers", emoji: "🍻" },
  { id: "sunflower", name: "Sunflower", emoji: "🌻" },
  { id: "stars", name: "Shooting Stars", emoji: "✨" },
  { id: "notes", name: "Music Notes", emoji: "🎵" },
  { id: "dance", name: "Dancing Bunny", emoji: "🐰" },
  { id: "dancer", name: "Dancer", emoji: "🕺" },
  { id: "snowboarder-girl", name: "Snowboarder", emoji: "🏂" },
  { id: "taxi", name: "Rocket Taxi", emoji: "🚀" },
  { id: "hello", name: "Hello!", emoji: "👋" },
  { id: "byebye", name: "Bye Bye", emoji: "🪂" },
];

/** Ids from before the winks were the real ones, so old messages still replay. */
const OLD_WINK_IDS: Record<string, string> = {
  hearts: "heart",
  cake: "birthday",
  storm: "water-balloon",
  fireworks: "stars",
  guitar: "guitar-smash",
  flowers: "sunflower",
  ghost: "ufo",
};

export function findWink(id: unknown) {
  if (typeof id !== "string") return null;
  const real = OLD_WINK_IDS[id] ?? id;
  return MSN_WINKS.find((w) => w.id === real) ?? null;
}

/**
 * Plays a wink over the conversation window (app/lib/msn-winks.ts has the
 * scenes). Works in every theme; its sounds follow the Sounds settings.
 */
export function playWink(id: unknown) {
  const wink = findWink(id);
  if (!wink) return;
  playWinkScene(wink.id, { muted: soundChoice("wink") === "none" });
}

/** A file's name from its URL (uploads end in a random key, so those get a friendly one). */
export function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url, "https://x").pathname;
    // Upload keys are "<random id>--<original name>", or just the id.
    const name = decodeURIComponent(path.split("/").pop() || "file").replace(/^[0-9a-f-]{16,}--/i, "");
    // A bare id reads better as "picture.png".
    const match = name.match(/^[0-9a-f-]{16,}\.([a-z0-9]{2,5})$/i);
    return match ? `picture.${match[1].toLowerCase()}` : name;
  } catch {
    return "file";
  }
}

type TransferState = "invited" | "receiving" | "accepted" | "declined";

const TRANSFER_KEY = (id: string) => `huddle-msn-transfer:${id}`;
/** Old attachments predate the invite; don't make anyone accept last week's photos. */
const TRANSFER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Messenger's file transfers: "Ana would like to send you 'beach.jpg'.
 * Accept / Decline", a progress bar, then "Transfer of 'beach.jpg' is
 * complete." The file is already uploaded; this only decides when you see it,
 * and remembers your answer on this device.
 */
export function MsnFileTransfer({
  enabled,
  messageId,
  mine,
  fromName,
  createdAt,
  fileNames,
  children,
}: {
  enabled: boolean;
  messageId: string;
  mine: boolean;
  fromName: string;
  createdAt?: string;
  fileNames: string[];
  children: React.ReactNode;
}) {
  const recent = createdAt ? Date.now() - new Date(createdAt).getTime() < TRANSFER_WINDOW_MS : false;
  const [state, setState] = useState<TransferState>("accepted");
  useEffect(() => {
    if (!enabled || mine || !recent) return;
    try {
      const saved = window.localStorage.getItem(TRANSFER_KEY(messageId));
      setState(saved === "accepted" || saved === "declined" ? saved : "invited");
    } catch {
      setState("invited");
    }
  }, [enabled, mine, recent, messageId]);

  if (!enabled || !fileNames.length) return <>{children}</>;
  const label = fileNames.length === 1 ? `"${fileNames[0]}"` : `${fileNames.length} files`;
  const remember = (next: "accepted" | "declined") => {
    try {
      window.localStorage.setItem(TRANSFER_KEY(messageId), next);
    } catch {
      // Storage blocked: asks again next visit.
    }
  };

  if (mine) {
    return (
      <>
        <p className="msn-transfer-line">You have sent {label}.</p>
        {children}
      </>
    );
  }
  if (state === "invited") {
    return (
      <div className="msn-transfer">
        <p>
          <StyledText text={fromName} /> would like to send you {label}.
        </p>
        <div className="msn-transfer-actions">
          <button
            type="button"
            onClick={() => {
              setState("receiving");
              remember("accepted");
              window.setTimeout(() => setState("accepted"), 1200);
            }}
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => {
              setState("declined");
              remember("declined");
            }}
          >
            Decline
          </button>
        </div>
      </div>
    );
  }
  if (state === "receiving") {
    return (
      <div className="msn-transfer">
        <p>Receiving {label} from <StyledText text={fromName} />…</p>
        <div className="msn-transfer-progress">
          <span />
        </div>
      </div>
    );
  }
  if (state === "declined") {
    return (
      <p className="msn-transfer-line">
        You have declined to receive {label}.{" "}
        <button
          type="button"
          className="msn-transfer-undo"
          onClick={() => {
            setState("accepted");
            remember("accepted");
          }}
        >
          Receive it anyway
        </button>
      </p>
    );
  }
  return (
    <>
      {children}
      {recent && <p className="msn-transfer-line">Transfer of {label} is complete.</p>}
    </>
  );
}

/** The little card that pops up when you rest the mouse on a contact. */
export function MsnHoverCard({
  name,
  username,
  avatar,
  avatarUrl,
  color,
  presence,
  offline,
  personalMessage,
  group,
  style,
  onEnter,
  onLeave,
  onMessage,
  onProfile,
}: {
  name: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  color: string;
  presence: { label: string; color: string };
  offline: boolean;
  personalMessage?: string | null;
  group?: string;
  style: React.CSSProperties;
  onEnter: () => void;
  onLeave: () => void;
  onMessage?: () => void;
  onProfile: () => void;
}) {
  return (
    <div className="msn-hover-card" style={style} onMouseEnter={onEnter} onMouseLeave={onLeave} role="tooltip">
      <div className="msn-hover-top">
        <div className="msn-dp-frame msn-hover-dp">
          <Avatar className="msn-dp-image" avatar={avatar} avatarUrl={avatarUrl} color={color} />
        </div>
        <div className="msn-hover-text">
          <strong>
            <StyledText text={name} />
          </strong>
          <span className="msn-hover-status">
            <i style={{ background: offline ? "#9a9a9a" : presence.color }} />
            {offline ? "Offline" : presence.label}
          </span>
          {personalMessage && (
            <em>
              <StyledText text={personalMessage} />
            </em>
          )}
          <small>
            @{username}
            {group ? ` · ${group}` : ""}
          </small>
        </div>
      </div>
      <div className="msn-hover-actions">
        {onMessage && (
          <button type="button" onClick={onMessage}>
            Send a message
          </button>
        )}
        <button type="button" onClick={onProfile}>
          View profile
        </button>
      </div>
    </div>
  );
}

/** Messenger's Sounds settings: one sound per event, with a ▶ to hear it and master volume. */
export function MsnSoundsDialog({ onClose }: { onClose: () => void }) {
  const [choices, setChoices] = useState<Record<SoundEvent, SoundPreset>>(
    () => Object.fromEntries(SOUND_EVENTS.map((e) => [e.id, soundChoice(e.id)])) as Record<SoundEvent, SoundPreset>,
  );
  const [volume, setVolume] = useState(() => getMsnVolume());

  const preview = (event: SoundEvent, choice: SoundPreset) => {
    if (event === "wink") {
      if (choice !== "none") playWinkScene("kiss");
      return;
    }
    previewSound(event, choice);
  };

  const handleResetDefaults = () => {
    SOUND_EVENTS.forEach((e) => {
      const def: SoundPreset = e.id === "error" ? "win_error" : "classic";
      setSoundChoice(e.id, def);
    });
    setChoices(
      Object.fromEntries(SOUND_EVENTS.map((e) => [e.id, e.id === "error" ? "win_error" : "classic"])) as Record<
        SoundEvent,
        SoundPreset
      >,
    );
    setVolume(0.7);
    setMsnVolume(0.7);
    previewSound("message", "classic");
  };

  return (
    <div className="msn-today-backdrop" onClick={onClose}>
      <div
        className="msn-popover msn-picture-picker msn-sounds-dialog"
        role="dialog"
        aria-label="Sounds"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="msn-popover-title">
          Sounds
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p>Choose what you hear for each event:</p>
        <div className="msn-sounds-list">
          {SOUND_EVENTS.map((event) => (
            <div key={event.id} className="msn-sound-row">
              <span>
                <strong>{event.label}</strong>
                <small>{event.hint}</small>
              </span>
              <select
                value={choices[event.id]}
                aria-label={`${event.label} sound`}
                onChange={(e) => {
                  const choice = e.target.value as SoundPreset;
                  setChoices((current) => ({ ...current, [event.id]: choice }));
                  setSoundChoice(event.id, choice);
                  preview(event.id, choice);
                }}
              >
                {presetsFor(event.id).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Play"
                aria-label={`Play the ${event.label} sound`}
                disabled={choices[event.id] === "none"}
                onClick={() => preview(event.id, choices[event.id])}
              >
                ▶
              </button>
            </div>
          ))}
        </div>

        <div className="msn-sound-volume-row">
          <label htmlFor="msn-volume-slider">
            Volume: {Math.round(volume * 100)}%
          </label>
          <input
            id="msn-volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            aria-label="Sounds volume"
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              setMsnVolume(v);
            }}
          />
        </div>

        <div className="msn-dialog-buttons">
          <button
            type="button"
            onClick={handleResetDefaults}
            title="Reset sounds and volume to factory defaults"
          >
            Reset
          </button>
          <span />
          <button type="button" className="msn-default-button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

/** Messenger's Games menu: invite the conversation to a game, or open the voice room's activities. */
function GamesMenu({
  onStart,
  onActivities,
  inVoice,
  onClose,
}: {
  onStart: (kind: GameKind, solo?: boolean) => void;
  onActivities: () => void;
  inVoice: boolean;
  onClose: () => void;
}) {
  return (
    <div className="msn-popover msn-games" role="dialog" aria-label="Games">
      <div className="msn-popover-title">
        Games
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p className="msn-games-lead">Invite everyone in this conversation to play:</p>
      <div className="msn-games-list">
        {GAME_KINDS.map((kind) => (
          <div key={kind} className="games-row">
            <button type="button" onClick={() => onStart(kind)}>
              <span className="msn-games-icon">{GAME_INFO[kind].emoji}</span>
              <span>
                <strong>{GAME_INFO[kind].name}</strong>
                <small>{GAME_INFO[kind].blurb}</small>
              </span>
            </button>
            {SOLO_GAMES.includes(kind) && (
              <button type="button" className="games-solo" onClick={() => onStart(kind, true)}>
                Play alone
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="msn-winks-more" onClick={onActivities}>
        {inVoice
          ? "Voice activities: Whiteboard, Draw & Guess, DeepPixel…"
          : "Join a voice room for Whiteboard, Draw & Guess and more"}
      </button>
    </div>
  );
}

/** Makes one of your own emoticons: a picture plus the shortcut that types it. */
function CreateEmoticon({
  onSave,
  onCancel,
}: {
  onSave: (file: File, shortcut: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <form
      className="msn-create-emoticon"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!file) return setError("Pick a picture first.");
        setSaving(true);
        setError(null);
        try {
          await onSave(file, shortcut.trim());
          onCancel();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't save that emoticon.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="msn-create-title">Create an emoticon</p>
      <div className="msn-create-row">
        <label className="msn-create-picture" title="Choose a picture">
          {preview ? <img src={preview} alt="" /> : <span>Browse…</span>}
          <input
            type="file"
            accept="image/png,image/gif,image/jpeg,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label className="msn-create-shortcut">
          Keyboard shortcut:
          <input
            value={shortcut}
            maxLength={12}
            placeholder="(cat)"
            onChange={(event) => setShortcut(event.target.value)}
          />
        </label>
      </div>
      {error && <p className="msn-create-error">{error}</p>}
      <div className="msn-dialog-buttons">
        <span />
        <button type="submit" className="msn-default-button" disabled={saving}>
          {saving ? "Saving…" : "OK"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The ☺▾ dropdown: Messenger's emoticon grid, your own emoticons, then the full picker. */
function EmoticonMenu({
  onPick,
  onMore,
  onClose,
  personal,
  onAddPersonal,
  onRemovePersonal,
}: {
  onPick: (emoji: string) => void;
  onMore: () => void;
  onClose: () => void;
  personal: PersonalEmoticon[];
  onAddPersonal: (file: File, shortcut: string) => Promise<void>;
  onRemovePersonal: (shortcut: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="msn-popover msn-emoticons" role="dialog" aria-label="Emoticons">
      <div className="msn-popover-title">
        Emoticons
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="msn-emoticon-grid">
        {MSN_EMOTICON_MENU.map(({ emoji, shortcut }) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            title={`${emoji}  Type: ${shortcut}`}
            aria-label={`${emoji} (${shortcut})`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="msn-emoticons-mine">
        <span>My emoticons</span>
        {!creating && (
          <button type="button" className="msn-winks-more" onClick={() => setCreating(true)}>
            Create…
          </button>
        )}
      </div>
      {creating ? (
        <CreateEmoticon onSave={onAddPersonal} onCancel={() => setCreating(false)} />
      ) : personal.length ? (
        <div className="msn-emoticon-grid msn-emoticon-grid-mine">
          {personal.map((emoticon) => (
            <span key={emoticon.shortcut} className="msn-mine-cell">
              <button
                type="button"
                onClick={() => onPick(`${emoticon.shortcut} `)}
                title={`Type: ${emoticon.shortcut}`}
                aria-label={emoticon.shortcut}
              >
                <img src={`/hangout/api/uploads/${encodeURIComponent(emoticon.key)}`} alt="" />
              </button>
              <button
                type="button"
                className="msn-mine-delete"
                title={`Delete ${emoticon.shortcut}`}
                aria-label={`Delete ${emoticon.shortcut}`}
                onClick={() => onRemovePersonal(emoticon.shortcut)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="msn-emoticons-empty">Make your own: a picture that shows up when you type its shortcut.</p>
      )}
      <button type="button" className="msn-winks-more" onClick={onMore}>
        Show all emoticons…
      </button>
    </div>
  );
}

/** The Winks menu: Messenger's grid of animations, plus the GIF picker. */
function WinksMenu({
  onSend,
  onMore,
  onClose,
}: {
  onSend: (id: string) => void;
  onMore: () => void;
  onClose: () => void;
}) {
  // Fetch the Flash player while they choose, so the wink starts right away.
  useEffect(() => preloadWinkPlayer(), []);
  return (
    <div className="msn-popover msn-winks" role="dialog" aria-label="Winks">
      <div className="msn-popover-title">
        Winks
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="msn-winks-grid">
        {MSN_WINKS.map((wink) => (
          <button
            key={wink.id}
            type="button"
            className="msn-wink-tile"
            onClick={() => onSend(wink.id)}
            title={`Send the ${wink.name} wink`}
          >
            <img className="msn-wink-thumb" src={winkThumbUrl(wink.id)} alt="" width={40} height={40} loading="lazy" />
            <span>{wink.name}</span>
          </button>
        ))}
      </div>
      <button type="button" className="msn-winks-more" onClick={onMore}>
        More winks: GIFs &amp; stickers…
      </button>
    </div>
  );
}

/** Conversation backgrounds for the history pane, all drawn in CSS (see globals.css). */
export const MSN_BACKGROUNDS = [
  { id: "none", name: "None" },
  { id: "sky", name: "Blue Sky" },
  { id: "dots", name: "Polka Dots" },
  { id: "hearts", name: "Hearts" },
  { id: "stripes", name: "Candy Stripes" },
  { id: "sunset", name: "Sunset" },
  { id: "grass", name: "Meadow" },
  { id: "night", name: "Starry Night" },
  { id: "checks", name: "Checkers" },
] as const;

const BG_KEY = (channelId: string) => `huddle-msn-bg:${channelId}`;

function readBackground(channelId: string | null): string {
  if (!channelId) return "none";
  try {
    return window.localStorage.getItem(BG_KEY(channelId)) || "none";
  } catch {
    return "none";
  }
}

/** Picks a background per conversation, remembered on this device. */
function BackgroundPicker({
  channelId,
  onClose,
}: {
  channelId: string;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(() => readBackground(channelId));
  const pick = (id: string) => {
    setCurrent(id);
    try {
      window.localStorage.setItem(BG_KEY(channelId), id);
    } catch {
      // Storage blocked: still applies for this visit.
    }
    document.documentElement.dataset.msnBg = id;
  };
  return (
    <div className="msn-popover msn-bg-picker" role="dialog" aria-label="Backgrounds">
      <div className="msn-popover-title">
        Backgrounds
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="msn-bg-grid">
        {MSN_BACKGROUNDS.map((bg) => (
          <button
            key={bg.id}
            type="button"
            className={`msn-bg-swatch ${current === bg.id ? "active" : ""}`}
            onClick={() => pick(bg.id)}
            title={bg.name}
          >
            <span className="msn-bg-preview" data-msn-bg-preview={bg.id} />
            <span>{bg.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const INKS = ["#000000", "#d4352b", "#1c5ec6", "#3fa82f", "#e3a300", "#8e3fbf"];

/** The Handwriting ink pad: draw, then it's attached to your message as a picture. */
function HandwritingPad({ onDone, onClose }: { onDone: (file: File) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState(INKS[0]);
  const [width, setWidth] = useState(3);
  const [eraser, setEraser] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = eraser ? "#ffffff" : ink;
    ctx.lineWidth = eraser ? width * 4 : width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
  };

  const finish = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      onDone(new File([blob], `handwriting-${Date.now()}.png`, { type: "image/png" }));
    }, "image/png");
  };

  return (
    <div className="msn-popover msn-ink-pad" role="dialog" aria-label="Handwriting">
      <div className="msn-popover-title">
        Handwriting
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <canvas
        ref={canvasRef}
        width={480}
        height={200}
        className="msn-ink-canvas"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const at = point(event);
          drawing.current = at;
          stroke(at, { x: at.x + 0.1, y: at.y + 0.1 });
          setDirty(true);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const at = point(event);
          stroke(drawing.current, at);
          drawing.current = at;
        }}
        onPointerUp={() => {
          drawing.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = null;
        }}
      />
      <div className="msn-ink-tools">
        {INKS.map((colour) => (
          <button
            key={colour}
            type="button"
            className={`msn-ink-swatch ${!eraser && ink === colour ? "active" : ""}`}
            style={{ background: colour }}
            onClick={() => {
              setInk(colour);
              setEraser(false);
            }}
            aria-label={`Ink ${colour}`}
          />
        ))}
        <span className="msn-fmt-sep" />
        {[2, 3, 6].map((w) => (
          <button
            key={w}
            type="button"
            className={`msn-ink-width ${width === w ? "active" : ""}`}
            onClick={() => setWidth(w)}
            aria-label={`Pen width ${w}`}
          >
            <span style={{ width: w + 2, height: w + 2 }} />
          </button>
        ))}
        <button
          type="button"
          className={`msn-ink-text ${eraser ? "active" : ""}`}
          onClick={() => setEraser((e) => !e)}
        >
          Eraser
        </button>
        <button type="button" className="msn-ink-text" onClick={clear}>
          Clear
        </button>
        <button type="button" className="msn-ink-send" onClick={finish} disabled={!dirty}>
          Attach
        </button>
      </div>
    </div>
  );
}


/** Sizes as Messenger listed them, mapped onto the renderer's size names. */
const FONT_SIZES: Array<{ label: string; size?: string }> = [
  { label: "8", size: "tiny" },
  { label: "9", size: "small" },
  { label: "10" },
  { label: "14", size: "big" },
  { label: "20", size: "huge" },
];

const FONT_STYLES = ["Regular", "Italic", "Bold", "Bold Italic"] as const;

/** CSS for a message font, used for the Sample box and the typing box. */
export function messageFontStyle(font: MessageFont | null): React.CSSProperties {
  if (!font) return {};
  const decorations = [font.underline && "underline", font.strike && "line-through"].filter(Boolean);
  return {
    fontFamily: resolveFont(font.font)?.stack,
    color: resolveColor(font.color) ?? undefined,
    fontWeight: font.bold ? 700 : undefined,
    fontStyle: font.italic ? "italic" : undefined,
    textDecoration: decorations.length ? decorations.join(" ") : undefined,
  };
}

/**
 * Messenger's "Change My Message Font" dialog: font, style, size, effects and
 * colour, with a live sample. What you pick wraps every message you send
 * (see applyMessageFont), so friends see your font just like they did in 2005.
 */
function FontDialog({
  value,
  onSave,
  onClose,
}: {
  value: MessageFont | null;
  onSave: (font: MessageFont | null) => void;
  onClose: () => void;
}) {
  const [font, setFont] = useState<MessageFont>(value ?? {});
  const style = font.bold && font.italic ? "Bold Italic" : font.bold ? "Bold" : font.italic ? "Italic" : "Regular";
  const set = (patch: Partial<MessageFont>) => setFont((f) => ({ ...f, ...patch }));
  const sizeLabel = FONT_SIZES.find((s) => s.size === font.size)?.label ?? "10";

  return (
    <div className="msn-popover msn-font-dialog" role="dialog" aria-label="Change My Message Font">
      <div className="msn-popover-title">
        Change My Message Font
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="msn-font-columns">
        <label className="msn-font-col">
          <span>Font:</span>
          <input readOnly value={resolveFont(font.font)?.name ?? "Segoe UI"} />
          <div className="msn-listbox" role="listbox" aria-label="Font">
            <button
              type="button"
              role="option"
              aria-selected={!font.font}
              className={!font.font ? "active" : ""}
              onClick={() => set({ font: undefined })}
            >
              Segoe UI
            </button>
            {TEXT_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="option"
                aria-selected={font.font === f.id}
                className={font.font === f.id ? "active" : ""}
                style={{ fontFamily: f.stack }}
                onClick={() => set({ font: f.id })}
              >
                {f.name}
              </button>
            ))}
          </div>
        </label>
        <label className="msn-font-col narrow">
          <span>Font style:</span>
          <input readOnly value={style} />
          <div className="msn-listbox" role="listbox" aria-label="Font style">
            {FONT_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={style === s}
                className={style === s ? "active" : ""}
                style={{ fontWeight: s.includes("Bold") ? 700 : 400, fontStyle: s.includes("Italic") ? "italic" : "normal" }}
                onClick={() => set({ bold: s.includes("Bold"), italic: s.includes("Italic") })}
              >
                {s}
              </button>
            ))}
          </div>
        </label>
        <label className="msn-font-col tiny">
          <span>Size:</span>
          <input readOnly value={sizeLabel} />
          <div className="msn-listbox" role="listbox" aria-label="Size">
            {FONT_SIZES.map((s) => (
              <button
                key={s.label}
                type="button"
                role="option"
                aria-selected={sizeLabel === s.label}
                className={sizeLabel === s.label ? "active" : ""}
                onClick={() => set({ size: s.size })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </label>
      </div>
      <div className="msn-font-lower">
        <fieldset className="msn-groupbox">
          <legend>Effects</legend>
          <label>
            <input type="checkbox" checked={Boolean(font.strike)} onChange={(e) => set({ strike: e.target.checked })} />
            Strikeout
          </label>
          <label>
            <input type="checkbox" checked={Boolean(font.underline)} onChange={(e) => set({ underline: e.target.checked })} />
            Underline
          </label>
          <span className="msn-font-color-label">Color:</span>
          <div className="msn-font-colors">
            <button
              type="button"
              className={`msn-font-color ${!font.color ? "active" : ""}`}
              style={{ background: "#000" }}
              title="Automatic"
              aria-label="Automatic colour"
              onClick={() => set({ color: undefined })}
            />
            {Object.entries(TEXT_COLORS)
              .filter(([name]) => name !== "black" && name !== "white")
              .map(([name, hex]) => (
                <button
                  key={name}
                  type="button"
                  className={`msn-font-color ${font.color === name ? "active" : ""}`}
                  style={{ background: hex }}
                  title={name}
                  aria-label={`Colour ${name}`}
                  onClick={() => set({ color: name })}
                />
              ))}
          </div>
        </fieldset>
        <fieldset className="msn-groupbox msn-font-sample">
          <legend>Sample</legend>
          <div style={{ ...messageFontStyle(font), fontSize: TEXT_SIZES[font.size ?? ""] ? `calc(12px * ${parseFloat(TEXT_SIZES[font.size!])})` : "12px" }}>
            AaBbYyZz
          </div>
        </fieldset>
      </div>
      <div className="msn-dialog-buttons">
        <button type="button" onClick={() => setFont({})}>
          Default
        </button>
        <span />
        <button
          type="button"
          className="msn-default-button"
          onClick={() => {
            onSave(applyMessageFont("x", font) === "x" ? null : font);
            onClose();
          }}
        >
          OK
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface ToolbarProps {
  /** The font every message is sent in (null: Messenger's default). */
  messageFont: MessageFont | null;
  onMessageFont: (font: MessageFont | null) => void;
  /** Wraps the typing-box selection in tags (the Effects menu). */
  onWrap: (open: string, close: string) => void;
  /** Opens the full emoji picker ("Show all emoticons"). */
  onEmoticons: () => void;
  onNudge: () => void;
  onVoiceClip: () => void;
  /** Opens the GIF / sticker picker ("More winks"). */
  onWinks: () => void;
  onSendWink: (id: string) => void;
  onStartGame: (kind: GameKind, solo?: boolean) => void;
  personalEmoticons: PersonalEmoticon[];
  onAddEmoticon: (file: File, shortcut: string) => Promise<void>;
  onRemoveEmoticon: (shortcut: string) => void;
  /** Opens the voice room's activities (only offered while in voice). */
  onActivities: () => void;
  inVoice: boolean;
  onHandwriting: (file: File) => void;
  channelId: string | null;
  nudgeCooling: boolean;
}

/** The strip above the typing box: Font, Effects, Emoticons, Winks, Voice Clip, Handwriting, Backgrounds, Nudge. */
export function MsnFormatToolbar({
  messageFont,
  onMessageFont,
  onWrap,
  onEmoticons,
  onNudge,
  onVoiceClip,
  onWinks,
  onSendWink,
  onStartGame,
  personalEmoticons,
  onAddEmoticon,
  onRemoveEmoticon,
  onActivities,
  inVoice,
  onHandwriting,
  channelId,
  nudgeCooling,
}: ToolbarProps) {
  const [open, setOpen] = useState<"ink" | "bg" | "font" | "fx" | "winks" | "smile" | "games" | null>(null);
  const toggle = (which: NonNullable<typeof open>) => setOpen((o) => (o === which ? null : which));

  // Each conversation remembers its own background.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.msnBg = readBackground(channelId);
    setOpen(null);
    return () => {
      delete root.dataset.msnBg;
    };
  }, [channelId]);

  return (
    // The popovers sit outside the strip: it scrolls sideways on narrow
    // screens, and a scrolling box would clip anything drawn above it.
    <div className="msn-format-shell">
      {open === "ink" && (
        <HandwritingPad
          onClose={() => setOpen(null)}
          onDone={(file) => {
            onHandwriting(file);
            setOpen(null);
          }}
        />
      )}
      {open === "bg" && channelId && (
        <BackgroundPicker channelId={channelId} onClose={() => setOpen(null)} />
      )}
      {open === "font" && (
        <FontDialog value={messageFont} onSave={onMessageFont} onClose={() => setOpen(null)} />
      )}
      {open === "fx" && (
        <TextStyleMenu
          className="msn-popover msn-fx-menu text-style-menu"
          title="Text Effects"
          onClose={() => setOpen(null)}
          onWrap={(before, after) => {
            onWrap(before, after);
            setOpen(null);
          }}
        />
      )}
      {open === "winks" && (
        <WinksMenu
          onClose={() => setOpen(null)}
          onSend={(id) => {
            onSendWink(id);
            setOpen(null);
          }}
          onMore={() => {
            setOpen(null);
            onWinks();
          }}
        />
      )}
      {open === "smile" && (
        <EmoticonMenu
          personal={personalEmoticons}
          onAddPersonal={onAddEmoticon}
          onRemovePersonal={onRemoveEmoticon}
          onClose={() => setOpen(null)}
          onPick={(emoji) => {
            onWrap(emoji, "");
            setOpen(null);
          }}
          onMore={() => {
            setOpen(null);
            onEmoticons();
          }}
        />
      )}
      {open === "games" && (
        <GamesMenu
          inVoice={inVoice}
          onClose={() => setOpen(null)}
          onStart={(kind, solo) => {
            onStartGame(kind, solo);
            setOpen(null);
          }}
          onActivities={() => {
            setOpen(null);
            if (inVoice) onActivities();
          }}
        />
      )}
      <div className="msn-format-bar" role="toolbar" aria-label="Formatting">
      <button
        type="button"
        className={open === "font" ? "active" : ""}
        onClick={() => toggle("font")}
        title="Change the font and color of your messages"
      >
        <span className="msn-fmt-font" style={messageFontStyle(messageFont)}>A</span>
      </button>
      <button
        type="button"
        className={open === "fx" ? "active" : ""}
        onClick={() => toggle("fx")}
        title="Colours, highlights and effects for the selected text"
      >
        <span className="msn-fmt-icon msn-fmt-fx">✨</span>
        <span>Effects</span>
      </button>
      <button
        type="button"
        className={open === "smile" ? "active" : ""}
        onClick={() => toggle("smile")}
        title="Select an emoticon"
      >
        <span className="msn-fmt-smile">☺</span>
        <span className="msn-fmt-drop" />
      </button>
      <button
        type="button"
        className={open === "winks" ? "active" : ""}
        onClick={() => toggle("winks")}
        title="Send a wink"
      >
        <span className="msn-fmt-icon">😉</span>
        <span>Winks</span>
      </button>
      <span className="msn-fmt-sep" />
      <button type="button" onClick={onVoiceClip} title="Voice clip">
        <span className="msn-fmt-icon">🎤</span>
        <span>Voice Clip</span>
      </button>
      <button
        type="button"
        className={open === "ink" ? "active" : ""}
        onClick={() => toggle("ink")}
        title="Handwriting"
      >
        <span className="msn-fmt-icon">✎</span>
        <span>Handwriting</span>
      </button>
      <button
        type="button"
        className={open === "bg" ? "active" : ""}
        onClick={() => toggle("bg")}
        disabled={!channelId}
        title="Backgrounds"
      >
        <span className="msn-fmt-icon">🖼</span>
        <span>Backgrounds</span>
      </button>
      <span className="msn-fmt-sep" />
      <button
        type="button"
        className={open === "games" ? "active" : ""}
        onClick={() => toggle("games")}
        disabled={!channelId}
        title="Play a game"
      >
        <span className="msn-fmt-icon">🎲</span>
        <span>Games</span>
      </button>
      <button type="button" onClick={onNudge} disabled={nudgeCooling} title="Send a nudge">
        <span className="msn-fmt-icon msn-fmt-nudge">〰</span>
        <span>Nudge</span>
      </button>
      </div>
    </div>
  );
}

/**
 * Messenger's new-message sound: a soft rising "doo-dah". Shared with the
 * sign-in chime's approach: synthesized, so there's no sound file to ship.
 */
export function playMessageChime() {
  playSound("message");
}

let flashTimer: number | null = null;
let restingTitle = "";

function stopTitleFlash() {
  if (flashTimer !== null) window.clearInterval(flashTimer);
  flashTimer = null;
  if (restingTitle) document.title = restingTitle;
  restingTitle = "";
  window.removeEventListener("focus", stopTitleFlash);
}

/**
 * Blinks the tab title ("Ana says…" / "Hoffle") while the window is in the
 * background, the way Messenger flashed on the taskbar. Stops on focus.
 */
export function flashTitle(text: string) {
  if (document.hasFocus()) return;
  const resting = restingTitle || document.title;
  stopTitleFlash();
  restingTitle = resting;
  let showing = false;
  const tick = () => {
    showing = !showing;
    document.title = showing ? text : restingTitle;
  };
  tick();
  flashTimer = window.setInterval(tick, 1000);
  window.addEventListener("focus", stopTitleFlash);
}

/** The two-note "ding-dong" Messenger played when a contact signed in. */
function playSignInChime() {
  playSound("signin");
}

interface ToastPerson extends Picture {
  id: string;
}

/**
 * "Alice has just signed in." — the little window that slid up above the
 * taskbar. Watches the online set and pops one per contact who comes online.
 */
/** Back within this long counts as the same session, not a fresh sign-in. */
const SIGN_IN_GAP_MS = 60_000;

export function MsnSignInToasts({
  online,
  people,
  selfId,
  connected,
  onOpen,
}: {
  online: Set<string>;
  people: ToastPerson[];
  selfId: string | null;
  connected: boolean;
  onOpen: (id: string) => void;
}) {
  const [toasts, setToasts] = useState<Array<ToastPerson & { key: number }>>([]);
  const seen = useRef<Set<string> | null>(null);
  const settledAt = useRef(0);
  /** When each person was last known to be online, kept across reconnects. */
  const lastOnline = useRef(new Map<string, number>());

  useEffect(() => {
    const now = Date.now();
    // The first snapshot after (re)connecting is everyone already online, not
    // people signing in; give presence a moment to settle before announcing.
    if (!connected) {
      // Everyone online when the connection dropped was online until now, so
      // their reconnecting after a server restart is not a sign-in.
      for (const id of seen.current || []) lastOnline.current.set(id, now);
      seen.current = null;
      return;
    }
    if (!seen.current) {
      seen.current = new Set(online);
      for (const id of online) lastOnline.current.set(id, now);
      settledAt.current = now + 4000;
      return;
    }
    const arrivals = [...online].filter(
      (id) =>
        !seen.current!.has(id) &&
        id !== selfId &&
        now - (lastOnline.current.get(id) ?? 0) > SIGN_IN_GAP_MS,
    );
    seen.current = new Set(online);
    for (const id of online) lastOnline.current.set(id, now);
    if (!arrivals.length || now < settledAt.current) return;
    const found = arrivals
      .map((id) => people.find((p) => p.id === id))
      .filter((p): p is ToastPerson => Boolean(p));
    if (!found.length) return;
    playSignInChime();
    setToasts((current) =>
      [...current, ...found.map((p, i) => ({ ...p, key: Date.now() + i }))].slice(-3),
    );
  }, [online, people, selfId, connected]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setTimeout(() => setToasts((current) => current.slice(1)), 6000);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  if (!toasts.length) return null;
  return (
    <div className="msn-toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.key} className="msn-toast">
          <div className="msn-toast-title">
            <span>Huddle Messenger</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setToasts((current) => current.filter((t) => t.key !== toast.key))}
            >
              ×
            </button>
          </div>
          <button type="button" className="msn-toast-body" onClick={() => onOpen(toast.id)}>
            <Avatar
              className="msn-toast-avatar"
              avatar={toast.avatar}
              avatarUrl={toast.avatarUrl}
              color={toast.color}
            />
            <span>
              <strong><StyledText text={toast.name} /></strong> has just signed in.
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

/** Messenger's extra statuses, stored as a base presence plus a status line. */
export const MSN_EXTRA_STATUSES = [
  { label: "Be Right Back", status: "idle", text: "Be Right Back" },
  { label: "On the Phone", status: "dnd", text: "On the Phone" },
  { label: "Out to Lunch", status: "idle", text: "Out to Lunch" },
] as const;
