"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sun, Moon, Mic, Volume2, Activity } from "lucide-react";
import { PERMISSION_INFO, type PermissionFlag } from "@/lib/permissions";

function MicTest({ selectedMicId }: { selectedMicId: string }) {
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number | null>(null);

  const stopTest = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setTesting(false);
    setLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      stopTest();
    };
  }, [stopTest]);

  const startTest = async () => {
    if (testing) {
      stopTest();
      return;
    }
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      setTesting(true);

      const update = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setLevel(normalized);
        animRef.current = requestAnimationFrame(update);
      };
      update();
    } catch {
      stopTest();
    }
  };

  return (
    <div className="mic-test-container">
      <div className="mic-test-header">
        <label className="flex items-center gap-1.5 font-semibold text-sm">
          <Mic size={16} /> Mic Test
        </label>
        <button
          type="button"
          className={`discord-btn ${testing ? "danger-red" : "primary-indigo"}`}
          onClick={() => void startTest()}
        >
          {testing ? "Stop Testing" : "Test Microphone"}
        </button>
      </div>
      <div className="mic-test-bar-wrap">
        <div
          className="mic-test-bar-fill"
          style={{ width: `${level}%` }}
        />
      </div>
    </div>
  );
}
import type { PublicRole, PublicServer } from "@/lib/servers";
import { AVATAR_COLORS, type Member, type PublicUser } from "@/lib/users";
import { apiFetch } from "../lib/client";
import { comboFromEvent, comboLabel, isModifierOnly } from "../lib/hotkeys";
import {
  listDevices,
  primeDeviceLabels,
  saveDevice,
  savedDevice,
  supportsOutputSelection,
  type DeviceLists,
} from "../lib/devices";

interface Invite {
  code: string;
  uses: number;
  maxUses: number;
  revoked: boolean;
  spent: boolean;
  note: string;
}

interface SettingsDialogProps {
  user: PublicUser;
  theme: "dark" | "light";
  onTheme: (theme: "dark" | "light") => void;
  onUser: (user: PublicUser) => void;
  onClose: () => void;
  onSignOut: () => void;
  /** Called after the microphone choice changes, to swap it mid-call. */
  onMicrophoneChange?: () => void;
  /** Push-to-talk state + setters, owned by the voice hook. */
  pushToTalk?: boolean;
  pttKey?: string;
  onPushToTalk?: (enabled: boolean) => void;
  onPttKey?: (code: string) => void;
  /** Mute / deafen toggle shortcuts. */
  muteKey?: string;
  deafenKey?: string;
  onMuteKey?: (combo: string) => void;
  onDeafenKey?: (combo: string) => void;
  /** The active server, for the roles tab. */
  server?: PublicServer | null;
  members?: Member[];
  /** Whether this user may manage the server (shows the Roles tab). */
  canManageServer?: boolean;
}

type Tab =
  | "profile"
  | "activities"
  | "voice"
  | "password"
  | "invites"
  | "appearance"
  | "roles";
type Density = "compact" | "cozy" | "roomy";
type Backdrop = "plain" | "aurora" | "dots";

export function SettingsDialog({
  user,
  theme,
  onTheme,
  onUser,
  onClose,
  onSignOut,
  onMicrophoneChange,
  pushToTalk = false,
  pttKey = "Space",
  onPushToTalk,
  onPttKey,
  muteKey = "Ctrl+Shift+KeyM",
  deafenKey = "Ctrl+Shift+KeyD",
  onMuteKey,
  onDeafenKey,
  server,
  members = [],
  canManageServer = false,
}: SettingsDialogProps) {
  const [capturingKey, setCapturingKey] = useState(false);
  const [noise, setNoise] = useState(
    () =>
      typeof window === "undefined" ||
      window.localStorage.getItem("huddle-noise") !== "off",
  );
  const [tab, setTab] = useState<Tab>("profile");
  const [devices, setDevices] = useState<DeviceLists>({
    microphones: [],
    speakers: [],
    cameras: [],
  });
  const [micId, setMicId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatar, setAvatar] = useState(user.avatar);
  const [color, setColor] = useState(user.color);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || null);
  const [avatarKey, setAvatarKey] = useState<string | null | undefined>(undefined);
  const [accent, setAccent] = useState("#9d8cf5");
  const [density, setDensity] = useState<Density>("cozy");
  const [backdrop, setBackdrop] = useState<Backdrop>("plain");
  const [corners, setCorners] = useState(16);
  const [motion, setMotion] = useState(true);
  const [cute, setCute] = useState(false);
  const [notify, setNotify] = useState(
    () =>
      typeof window === "undefined" ||
      window.localStorage.getItem("huddle-notify") !== "off",
  );
  const [activityShare, setActivityShare] = useState(true);
  const [spotifyShare, setSpotifyShare] = useState(true);
  const [appShare, setAppShare] = useState(true);
  const [spotifyUserInput, setSpotifyUserInput] = useState("");
  const [trackSearchInput, setTrackSearchInput] = useState("");
  const [currentAppId, setCurrentAppId] = useState("spotify");
  const [detectedApps, setDetectedApps] = useState([
    { id: "spotify", name: "Spotify", type: "music", details: "Listening to Spotify" },
    { id: "vscode", name: "Visual Studio Code", type: "coding", details: "Editing Huddle codebase" },
    { id: "minecraft", name: "Minecraft", type: "game", details: "Playing Survival Mode" },
  ]);
  const pictureRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedAccent = window.localStorage.getItem("huddle-accent");
    const savedDensity = window.localStorage.getItem("huddle-density") as Density;
    const savedBackdrop = window.localStorage.getItem("huddle-backdrop") || "";
    const savedCorners = Number(window.localStorage.getItem("huddle-corners"));
    const savedMotion = window.localStorage.getItem("huddle-motion");
    const savedCute = window.localStorage.getItem("huddle-cute");
    if (savedAccent) setAccent(savedAccent);
    if (["compact", "cozy", "roomy"].includes(savedDensity)) setDensity(savedDensity);
    // The old glow was the default. Do not carry it forward: gradients are
    // now an explicit opt-in appearance choice.
    if (["plain", "aurora", "dots"].includes(savedBackdrop)) {
      setBackdrop(savedBackdrop as Backdrop);
    } else if (savedBackdrop === "glow") {
      setBackdrop("plain");
    }
    if (savedCorners >= 4 && savedCorners <= 28) setCorners(savedCorners);
    if (savedMotion) setMotion(savedMotion !== "reduced");
    setCute(savedCute === "on");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--lavender", accent);
    root.style.setProperty("--ui-corners", `${corners}px`);
    root.dataset.density = density;
    root.dataset.backdrop = backdrop;
    root.dataset.motion = motion ? "full" : "reduced";
    root.dataset.cute = cute ? "on" : "off";
    window.localStorage.setItem("huddle-accent", accent);
    window.localStorage.setItem("huddle-density", density);
    window.localStorage.setItem("huddle-backdrop", backdrop);
    window.localStorage.setItem("huddle-corners", String(corners));
    window.localStorage.setItem("huddle-motion", motion ? "full" : "reduced");
    window.localStorage.setItem("huddle-cute", cute ? "on" : "off");
  }, [accent, corners, density, backdrop, motion, cute]);

  useEffect(() => {
    if (tab !== "voice") return;
    setMicId(savedDevice("microphone"));
    setSpeakerId(savedDevice("speaker"));
    setCameraId(savedDevice("camera"));

    let cancelled = false;
    const refresh = () =>
      listDevices()
        .then((lists) => !cancelled && setDevices(lists))
        .catch(() => undefined);
    void refresh();
    // Labels stay blank until the page has held a media permission once.
    void primeDeviceLabels().then(refresh);
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== "invites") return;
    apiFetch<{ invites: Invite[] }>("/api/invites")
      .then((data) => setInvites(data.invites))
      .catch(() => undefined);
  }, [tab]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveProfile() {
    setError("");
    try {
      const data = await apiFetch<{ user: PublicUser }>("/api/settings/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName,
          avatar,
          color,
          ...(avatarKey === undefined ? {} : { avatarKey }),
        }),
      });
      onUser(data.user);
      setStatus("Saved.");
      window.setTimeout(() => setStatus(""), 2000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    }
  }

  async function savePassword() {
    setError("");
    try {
      await apiFetch("/api/settings/password", {
        method: "POST",
        body: JSON.stringify({ current, next }),
      });
      setCurrent("");
      setNext("");
      setStatus("Password changed. Other devices were signed out.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    }
  }

  async function choosePicture(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const upload = await apiFetch<{ key: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      setAvatarKey(upload.key);
      setAvatarUrl(`/hangout/api/uploads/${encodeURIComponent(upload.key)}`);
      setStatus("Picture ready — save the profile to keep it.");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "That image did not upload.",
      );
    }
  }

  async function createInvite() {
    setError("");
    try {
      const data = await apiFetch<{ invite: Invite }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ maxUses: 1 }),
      });
      setInvites((list) => [data.invite, ...list]);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not make a code.",
      );
    }
  }

  async function revokeInvite(code: string) {
    await apiFetch(`/api/invites?code=${encodeURIComponent(code)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    setInvites((list) =>
      list.map((invite) =>
        invite.code === code ? { ...invite, revoked: true } : invite,
      ),
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal settings-modal">
        <header className="modal-head">
          <h2>Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>

        <nav className="modal-tabs">
          {(
            [
              ["profile", "Profile"],
              ["activities", "Activities & Privacy"],
              ["voice", "Voice & Video"],
              ["password", "Password"],
              ["invites", "Invites"],
              ["appearance", "Appearance"],
              ...(canManageServer && server
                ? ([["roles", "Roles"]] as const)
                : []),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setError("");
                setStatus("");
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="modal-body">
          {tab === "profile" && (
            <>
              <label htmlFor="settings-name">Display name</label>
              <input
                id="settings-name"
                value={displayName}
                maxLength={40}
                onChange={(event) => setDisplayName(event.target.value)}
              />

              <label htmlFor="settings-avatar">Avatar letters</label>
              <input
                id="settings-avatar"
                value={avatar}
                maxLength={2}
                onChange={(event) => setAvatar(event.target.value)}
              />

              <span className="field-label">Profile picture</span>
              <div className="picture-row">
                <span
                  className="picture-preview"
                  style={{ background: avatarUrl ? undefined : color }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    avatar || displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <div className="picture-actions">
                  <button
                    type="button"
                    onClick={() => pictureRef.current?.click()}
                  >
                    Upload
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarUrl(null);
                        setAvatarKey(null);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={pictureRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    void choosePicture(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>

              <span className="field-label">Colour</span>
              <div className="color-row">
                {AVATAR_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`color-dot ${color === option ? "chosen" : ""}`}
                    style={{ background: option }}
                    aria-label={`Use ${option}`}
                    onClick={() => setColor(option)}
                  />
                ))}
              </div>

              <button type="button" className="primary" onClick={saveProfile}>
                Save profile
              </button>
            </>
          )}

          {tab === "voice" && (
            <>
              <p className="modal-hint">
                Choices are remembered on this device. Changing the microphone
                while you are in a call swaps it without dropping the call.
              </p>

              <label htmlFor="settings-mic">Microphone</label>
              <select
                id="settings-mic"
                value={micId}
                onChange={(event) => {
                  setMicId(event.target.value);
                  saveDevice("microphone", event.target.value);
                  void onMicrophoneChange?.();
                }}
              >
                <option value="">System default</option>
                {devices.microphones.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>

              <MicTest selectedMicId={micId} />

              {supportsOutputSelection() ? (
                <>
                  <label htmlFor="settings-speaker">Output</label>
                  <select
                    id="settings-speaker"
                    value={speakerId}
                    onChange={(event) => {
                      setSpeakerId(event.target.value);
                      saveDevice("speaker", event.target.value);
                    }}
                  >
                    <option value="">System default</option>
                    {devices.speakers.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p className="modal-hint">
                  This browser plays through whichever output the system
                  chooses — pick it there instead.
                </p>
              )}

              <label htmlFor="settings-camera">Camera</label>
              <select
                id="settings-camera"
                value={cameraId}
                onChange={(event) => {
                  setCameraId(event.target.value);
                  saveDevice("camera", event.target.value);
                }}
              >
                <option value="">System default</option>
                {devices.cameras.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>

              <label className="appearance-switch">
                <span>
                  <strong>Noise suppression</strong>
                  <small>Filter out keyboard and background noise</small>
                </span>
                <input
                  type="checkbox"
                  checked={noise}
                  onChange={(event) => {
                    const on = event.target.checked;
                    setNoise(on);
                    window.localStorage.setItem("huddle-noise", on ? "on" : "off");
                    void onMicrophoneChange?.();
                  }}
                />
              </label>

              <label className="appearance-switch">
                <span>
                  <strong>Push to talk</strong>
                  <small>Transmit only while holding a key</small>
                </span>
                <input
                  type="checkbox"
                  checked={pushToTalk}
                  onChange={(event) => onPushToTalk?.(event.target.checked)}
                />
              </label>

              {pushToTalk && (
                <button
                  type="button"
                  className="ptt-key-button"
                  onClick={() => setCapturingKey(true)}
                  onKeyDown={(event) => {
                    if (!capturingKey) return;
                    event.preventDefault();
                    onPttKey?.(event.code);
                    setCapturingKey(false);
                  }}
                >
                  {capturingKey
                    ? "Press a key…"
                    : `Push-to-talk key: ${pttKey.replace(/^Key/, "")}`}
                </button>
              )}

              <span className="field-label">Shortcuts</span>
              <p className="modal-hint">
                These work while you are in a voice room, and are ignored while
                you are typing. Hold modifiers and press a key to rebind.
              </p>
              <ComboButton
                label="Toggle mute"
                combo={muteKey}
                onChange={(combo) => onMuteKey?.(combo)}
              />
              <ComboButton
                label="Toggle deafen"
                combo={deafenKey}
                onChange={(combo) => onDeafenKey?.(combo)}
              />
            </>
          )}

          {tab === "password" && (
            <>
              <label htmlFor="settings-current">Current password</label>
              <input
                id="settings-current"
                type="password"
                value={current}
                autoComplete="current-password"
                onChange={(event) => setCurrent(event.target.value)}
              />
              <label htmlFor="settings-next">New password</label>
              <input
                id="settings-next"
                type="password"
                value={next}
                autoComplete="new-password"
                onChange={(event) => setNext(event.target.value)}
              />
              <button
                type="button"
                className="primary"
                onClick={savePassword}
                disabled={!current || !next}
              >
                Change password
              </button>
            </>
          )}

          {tab === "invites" && (
            <>
              <p className="modal-hint">
                Anyone with a code can create an account here. Every member sees
                every server automatically.
              </p>
              <button type="button" className="primary" onClick={createInvite}>
                Create an invite code
              </button>
              <ul className="invite-list">
                {invites.map((invite) => (
                  <li key={invite.code}>
                    <code>{invite.code}</code>
                    <span>
                      {invite.revoked
                        ? "revoked"
                        : invite.spent
                          ? "used"
                          : `${invite.uses}/${invite.maxUses || "∞"} used`}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(invite.code)}
                    >
                      Copy
                    </button>
                    {!invite.revoked && !invite.spent && (
                      <button
                        type="button"
                        onClick={() => revokeInvite(invite.code)}
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
                {!invites.length && (
                  <li className="empty">No codes yet.</li>
                )}
              </ul>
            </>
          )}

          {tab === "appearance" && (
            <>
              <span className="field-label">Theme</span>
              <div className="theme-row">
                <button
                  type="button"
                  className={`flex items-center gap-1.5 justify-center ${theme === "dark" ? "active" : ""}`}
                  onClick={() => onTheme("dark")}
                >
                  <Moon size={16} /> Dark
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 justify-center ${theme === "light" ? "active" : ""}`}
                  onClick={() => onTheme("light")}
                >
                  <Sun size={16} /> Light
                </button>
              </div>

              <span className="field-label">Accent colour</span>
              <div className="accent-picker-row">
                {["#9d8cf5", "#68a8ff", "#49c99a", "#ff8b72", "#f3bd5d", "#e57bd8"].map(
                  (option) => (
                    <button
                      type="button"
                      key={option}
                      aria-label={`Use accent ${option}`}
                      className={accent === option ? "active" : ""}
                      style={{ background: option }}
                      onClick={() => setAccent(option)}
                    />
                  ),
                )}
                <input
                  type="color"
                  value={accent}
                  aria-label="Custom accent colour"
                  onChange={(event) => setAccent(event.target.value)}
                />
              </div>

              <span className="field-label">Message spacing</span>
              <div className="appearance-choice-row">
                {(["compact", "cozy", "roomy"] as const).map((option) => (
                  <button
                    type="button"
                    className={density === option ? "active" : ""}
                    key={option}
                    onClick={() => setDensity(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <span className="field-label">Chat backdrop</span>
              <div className="appearance-choice-row">
                {(["plain", "aurora", "dots"] as const).map((option) => (
                  <button
                    type="button"
                    className={backdrop === option ? "active" : ""}
                    key={option}
                    onClick={() => setBackdrop(option)}
                  >
                    {option === "aurora" ? "Purple + green" : option}
                  </button>
                ))}
              </div>

              <label className="appearance-range">
                <span>Corner roundness <b>{corners}px</b></span>
                <input
                  type="range"
                  min={4}
                  max={28}
                  value={corners}
                  onChange={(event) => setCorners(Number(event.target.value))}
                />
              </label>

              <label className="appearance-switch">
                <span>
                  <strong>Interface motion</strong>
                  <small>Animations and smooth scrolling</small>
                </span>
                <input
                  type="checkbox"
                  checked={motion}
                  onChange={(event) => setMotion(event.target.checked)}
                />
              </label>

              <label className="appearance-switch cute-appearance-switch">
                <span>
                  <strong>Cozy Huddle ✨</strong>
                  <small>Room pet, sparkles, tiny charms, and celebrations</small>
                </span>
                <input
                  type="checkbox"
                  checked={cute}
                  onChange={(event) => setCute(event.target.checked)}
                />
              </label>

              <label className="appearance-switch">
                <span>
                  <strong>Desktop notifications</strong>
                  <small>Ping when someone @mentions you</small>
                </span>
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(event) => {
                    const on = event.target.checked;
                    setNotify(on);
                    window.localStorage.setItem(
                      "huddle-notify",
                      on ? "on" : "off",
                    );
                    if (on && typeof Notification !== "undefined") {
                      void Notification.requestPermission();
                    }
                  }}
                />
              </label>
            </>
          )}

          {tab === "activities" && (
            <div className="space-y-4">
              <label className="appearance-switch">
                <span>
                  <strong>Display current activity as a status message</strong>
                  <small>Huddle will automatically update your profile status when you play a game or listen to Spotify</small>
                </span>
                <input
                  type="checkbox"
                  checked={activityShare}
                  onChange={(e) => setActivityShare(e.target.checked)}
                />
              </label>

              <label className="appearance-switch">
                <span>
                  <strong>Share Spotify / Music Listening</strong>
                  <small>Show live Spotify song titles, artists, and album art on your profile card automatically</small>
                </span>
                <input
                  type="checkbox"
                  checked={spotifyShare}
                  onChange={(e) => setSpotifyShare(e.target.checked)}
                />
              </label>

              {spotifyShare && (
                <div className="bg-green-950/20 border border-green-500/30 p-3 rounded-lg space-y-3 mt-2">
                  <h4 className="text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                    <Activity size={14} /> SPOTIFY REAL-TIME TRACK SYNC
                  </h4>

                  <div>
                    <label className="text-xs text-gray-300 block mb-1">
                      Spotify / Last.fm Account Sync (Automatic Scrobbler)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="discord-text-input text-xs"
                        placeholder="Enter Spotify / Last.fm username..."
                        value={spotifyUserInput}
                        onChange={(e) => setSpotifyUserInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="discord-btn primary-indigo text-xs whitespace-nowrap"
                        onClick={async () => {
                          if (!spotifyUserInput.trim()) return;
                          try {
                            const res = await apiFetch<{ song?: string; artist?: string; albumArt?: string }>(
                              `/api/integrations/spotify?username=${encodeURIComponent(spotifyUserInput.trim())}`
                            );
                            if (res.song) {
                              const act = { song: res.song, artist: res.artist || "Spotify", albumArt: res.albumArt, isPlaying: true };
                              await apiFetch("/api/settings/profile", {
                                method: "PATCH",
                                body: JSON.stringify({ spotifyActivity: act }),
                              });
                              setStatus(`Synced! Currently playing: ${res.song} by ${res.artist}`);
                              onUser({ ...user, spotifyActivity: act });
                            } else {
                              setStatus("Connected! Play a song on Spotify to broadcast it live.");
                            }
                          } catch {
                            setError("Could not connect to Spotify scrobbler.");
                          }
                        }}
                      >
                        Connect & Sync
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-300 block mb-1">
                      Quick Track Search / Set Current Song
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="discord-text-input text-xs"
                        placeholder="Search song title & artist (e.g. Starboy - The Weeknd)..."
                        value={trackSearchInput}
                        onChange={(e) => setTrackSearchInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="discord-btn secondary-gray text-xs whitespace-nowrap"
                        onClick={async () => {
                          if (!trackSearchInput.trim()) return;
                          try {
                            const res = await apiFetch<{ song?: string; artist?: string; albumArt?: string }>(
                              `/api/integrations/spotify?track=${encodeURIComponent(trackSearchInput.trim())}`
                            );
                            if (res.song) {
                              const act = { song: res.song, artist: res.artist || "Spotify", albumArt: res.albumArt, isPlaying: true };
                              await apiFetch("/api/settings/profile", {
                                method: "PATCH",
                                body: JSON.stringify({ spotifyActivity: act }),
                              });
                              onUser({ ...user, spotifyActivity: act });
                              setStatus(`Now playing: ${res.song} by ${res.artist}`);
                            }
                          } catch {
                            setError("Track search failed.");
                          }
                        }}
                      >
                        Set Song
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <label className="appearance-switch">
                <span>
                  <strong>Share Desktop Games & App Activity</strong>
                  <small>Display detected active desktop apps, games, or coding sessions</small>
                </span>
                <input
                  type="checkbox"
                  checked={appShare}
                  onChange={(e) => setAppShare(e.target.checked)}
                />
              </label>

              <div className="border-t border-white/10 pt-4 mt-4">
                <h4 className="text-xs font-bold text-gray-300 uppercase mb-3">
                  DETECTED APPLICATIONS & CURRENT ACTIVITY
                </h4>
                
                <div className="space-y-2">
                  {detectedApps.map((app) => (
                    <div
                      key={app.id}
                      className="bg-black/30 p-3 rounded-lg border border-white/10 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">{app.name}</span>
                          {currentAppId === app.id && (
                            <span className="text-[10px] bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded-full font-bold">
                              ACTIVE NOW
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{app.details}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="discord-btn secondary-gray text-xs py-1 px-2.5"
                          onClick={() => {
                            const newName = window.prompt("Correct / Edit Activity Name:", app.name);
                            if (newName && newName.trim()) {
                              setDetectedApps((prev) =>
                                prev.map((a) => (a.id === app.id ? { ...a, name: newName.trim() } : a))
                              );
                            }
                          }}
                        >
                          Edit / Correct
                        </button>

                        {currentAppId !== app.id && (
                          <button
                            type="button"
                            className="discord-btn primary-indigo text-xs py-1 px-2.5"
                            onClick={() => setCurrentAppId(app.id)}
                          >
                            Set Active
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "roles" && server && (
            <RolesTab server={server} members={members} onError={setError} />
          )}

          {error && <p className="auth-error">{error}</p>}
          {status && <p className="modal-status">{status}</p>}
        </div>

        <footer className="modal-foot">
          <span className="modal-hint">
            Signed in as {user.username}
            {user.isAdmin ? " · owner" : ""}
          </span>
          <button type="button" className="danger" onClick={onSignOut}>
            Sign out
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * A button that records the next key combination pressed. Modifier-only
 * presses are ignored so you can hold Ctrl+Shift before choosing the letter,
 * and Escape cancels without changing anything.
 */
function ComboButton({
  label,
  combo,
  onChange,
}: {
  label: string;
  combo: string;
  onChange: (combo: string) => void;
}) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setListening(false);
        return;
      }
      if (isModifierOnly(event.code)) return;
      onChange(comboFromEvent(event));
      setListening(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, onChange]);

  return (
    <button
      type="button"
      className={`ptt-key-button ${listening ? "listening" : ""}`}
      onClick={() => setListening(true)}
    >
      <span>{label}</span>
      <kbd>{listening ? "Press keys… (Esc to cancel)" : comboLabel(combo)}</kbd>
    </button>
  );
}

/**
 * Server roles: create roles, edit their colour and permissions, and assign
 * them to members. Every mutation broadcasts a structure change, so the parent's
 * server/member state refreshes over the socket without extra plumbing here.
 */
function RolesTab({
  server,
  members,
  onError,
}: {
  server: PublicServer;
  members: Member[];
  onError: (message: string) => void;
}) {
  const roles = [...server.roles].sort((a, b) => b.position - a.position);

  async function createRole() {
    try {
      await apiFetch("/api/roles", {
        method: "POST",
        body: JSON.stringify({ serverId: server.id, name: "new role" }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not create role.");
    }
  }

  return (
    <div className="roles-tab">
      <p className="modal-hint">
        Roles paint member names their colour and grant permissions. The highest
        role a member holds decides their name colour.
      </p>
      <button type="button" className="primary" onClick={() => void createRole()}>
        Create a role
      </button>

      <div className="roles-list">
        {roles.map((role) => (
          <RoleEditor key={role.id} role={role} onError={onError} />
        ))}
        {!roles.length && <p className="modal-hint">No roles yet.</p>}
      </div>

      {roles.length > 0 && (
        <>
          <span className="field-label">Assign roles</span>
          <div className="assign-list">
            {members.map((member) => (
              <MemberRoles
                key={member.id}
                serverId={server.id}
                member={member}
                roles={roles}
                onError={onError}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RoleEditor({
  role,
  onError,
}: {
  role: PublicRole;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [permissions, setPermissions] = useState(role.permissions);
  const [saving, setSaving] = useState(false);

  function toggle(flag: PermissionFlag) {
    setPermissions((current) => current ^ flag);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, color, permissions }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not save role.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the "${role.name}" role?`)) return;
    try {
      await apiFetch(`/api/roles/${role.id}`, { method: "DELETE" });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not delete role.");
    }
  }

  const dirty =
    name !== role.name || color !== role.color || permissions !== role.permissions;

  return (
    <div className="role-editor">
      <div className="role-editor-head">
        <input
          type="color"
          value={color}
          aria-label="Role colour"
          onChange={(event) => setColor(event.target.value)}
        />
        <input
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          style={{ color }}
        />
        <button type="button" className="role-delete" onClick={() => void remove()}>
          Delete
        </button>
      </div>
      <div className="role-perms">
        {PERMISSION_INFO.map((info) => (
          <label key={info.flag} title={info.description}>
            <input
              type="checkbox"
              checked={(permissions & info.flag) !== 0}
              onChange={() => toggle(info.flag)}
            />
            {info.label}
          </label>
        ))}
      </div>
      {dirty && (
        <button
          type="button"
          className="primary role-save"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      )}
    </div>
  );
}

function MemberRoles({
  serverId,
  member,
  roles,
  onError,
}: {
  serverId: string;
  member: Member;
  roles: PublicRole[];
  onError: (message: string) => void;
}) {
  const held = new Set(member.roleIds?.[serverId] || []);

  async function toggle(roleId: string, add: boolean) {
    try {
      await apiFetch("/api/roles/assign", {
        method: "POST",
        body: JSON.stringify({ serverId, userId: member.id, roleId, add }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not assign role.");
    }
  }

  return (
    <div className="assign-row">
      <strong>{member.displayName}</strong>
      <div className="assign-chips">
        {roles.map((role) => {
          const on = held.has(role.id);
          return (
            <button
              type="button"
              key={role.id}
              className={`assign-chip ${on ? "on" : ""}`}
              style={on ? { borderColor: role.color, color: role.color } : undefined}
              onClick={() => void toggle(role.id, !on)}
            >
              {role.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
