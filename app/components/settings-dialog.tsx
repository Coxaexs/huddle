"use client";

import { useEffect, useRef, useState } from "react";
import { AVATAR_COLORS, type PublicUser } from "@/lib/users";
import { apiFetch } from "../lib/client";
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
}

type Tab = "profile" | "voice" | "password" | "invites" | "appearance";
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
}: SettingsDialogProps) {
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
  const pictureRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedAccent = window.localStorage.getItem("huddle-accent");
    const savedDensity = window.localStorage.getItem("huddle-density") as Density;
    const savedBackdrop = window.localStorage.getItem("huddle-backdrop") || "";
    const savedCorners = Number(window.localStorage.getItem("huddle-corners"));
    const savedMotion = window.localStorage.getItem("huddle-motion");
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
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--lavender", accent);
    root.style.setProperty("--ui-corners", `${corners}px`);
    root.dataset.density = density;
    root.dataset.backdrop = backdrop;
    root.dataset.motion = motion ? "full" : "reduced";
    window.localStorage.setItem("huddle-accent", accent);
    window.localStorage.setItem("huddle-density", density);
    window.localStorage.setItem("huddle-backdrop", backdrop);
    window.localStorage.setItem("huddle-corners", String(corners));
    window.localStorage.setItem("huddle-motion", motion ? "full" : "reduced");
  }, [accent, corners, density, backdrop, motion]);

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
              ["voice", "Voice & Video"],
              ["password", "Password"],
              ["invites", "Invites"],
              ["appearance", "Appearance"],
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
                  className={theme === "dark" ? "active" : ""}
                  onClick={() => onTheme("dark")}
                >
                  ☾ Dark
                </button>
                <button
                  type="button"
                  className={theme === "light" ? "active" : ""}
                  onClick={() => onTheme("light")}
                >
                  ☀ Light
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
            </>
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
