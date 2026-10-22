"use client";

import { useState, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import type { PublicUser } from "@/lib/users";
import { apiFetch } from "../lib/client";
import { useI18n } from "../lib/i18n-context";
import { Hoffy } from "./hoffy";

const LATER_KEY = "hoffle-guest-later";

/**
 * A guest (joined with just a name, app/api/auth/guest) is one cleared cookie
 * away from losing everything. This bar says so, and saves the account with a
 * username and password when they're ready.
 */
export function GuestBanner({ user, onSaved }: { user: PublicUser; onSaved: (user: PublicUser) => void }) {
  const { t } = useI18n();
  const [later, setLater] = useState(() => {
    try {
      return sessionStorage.getItem(LATER_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!user.isGuest) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch<{ user: PublicUser }>("/api/auth/claim", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password, email: email.trim() }),
      });
      setOpen(false);
      onSaved(data.user);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("guest.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!later && !open && (
        <div className="guest-bar" role="status">
          <span>{t("guest.bar")}</span>
          <button type="button" className="guest-bar-save" onClick={() => setOpen(true)}>{t("guest.save")}</button>
          <button
            type="button"
            className="guest-bar-later"
            aria-label={t("guest.later")}
            onClick={() => {
              setLater(true);
              try {
                sessionStorage.setItem(LATER_KEY, "1");
              } catch {}
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {open && (
        <div className="custom-dialog-backdrop" onClick={() => setOpen(false)}>
          <form className="forward-dialog-card guest-save-card" onSubmit={save} onClick={(event) => event.stopPropagation()}>
            <Hoffy size={64} face="happy" pose="wave" motion="wave" id="hoffy-guest" />
            <h3 className="forward-dialog-title">{t("guest.saveTitle")}</h3>
            <p className="forward-dialog-subtitle">{t("guest.saveLead")}</p>
            <label htmlFor="guest-username">{t("gate.label.username")}</label>
            <input id="guest-username" className="forward-comment-input" value={username} maxLength={24} autoFocus
              autoComplete="username" onChange={(event) => setUsername(event.target.value)} placeholder={t("gate.placeholder.username")} />
            <label htmlFor="guest-password">{t("gate.label.password")}</label>
            <input id="guest-password" className="forward-comment-input" type="password" value={password}
              autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} placeholder={t("gate.placeholder.newPassword")} />
            <label htmlFor="guest-email">{t("gate.label.email")}</label>
            <input id="guest-email" className="forward-comment-input" type="email" value={email} maxLength={254}
              autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder={t("gate.placeholder.email")} />
            {error && <p className="auth-error">{error}</p>}
            <div className="forward-dialog-footer">
              <button type="button" className="forward-btn-cancel" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
              <button type="submit" className="forward-btn-submit" disabled={busy || !username.trim() || password.length < 8}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                {t("guest.save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
