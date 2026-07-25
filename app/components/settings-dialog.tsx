"use client";

import { useEffect, useState } from "react";
import { AVATAR_COLORS, type PublicUser } from "@/lib/users";
import { apiFetch } from "../lib/client";

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
}

type Tab = "profile" | "password" | "invites" | "appearance";

export function SettingsDialog({
  user,
  theme,
  onTheme,
  onUser,
  onClose,
  onSignOut,
}: SettingsDialogProps) {
  const [tab, setTab] = useState<Tab>("profile");
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatar, setAvatar] = useState(user.avatar);
  const [color, setColor] = useState(user.color);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

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
        body: JSON.stringify({ displayName, avatar, color }),
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

              <div className="avatar-preview">
                <span className="member-avatar" style={{ background: color }}>
                  {avatar || displayName.slice(0, 1).toUpperCase()}
                </span>
                <span>{displayName || user.username}</span>
              </div>

              <button type="button" className="primary" onClick={saveProfile}>
                Save profile
              </button>
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
