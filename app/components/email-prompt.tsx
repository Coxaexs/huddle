"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../lib/client";
import { tRich, useI18n } from "../lib/i18n-context";
import type { PublicUser } from "@/lib/users";

interface EmailPromptProps {
  onUser: (user: PublicUser) => void;
}

/**
 * Shown to accounts without a verified email. An address only sticks once the
 * code mailed to it is typed back, so this is also where a new account lands
 * after giving one at signup. "Skip for now" stops the prompt; the address can
 * still be added under Settings → Account.
 */
export function EmailPrompt({ onUser }: EmailPromptProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ pending: string | null }>("/api/settings/email")
      .then((data) => setPending(data.pending))
      .catch(() => {});
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (pending) {
        const data = await apiFetch<{ user: PublicUser }>("/api/settings/email/verify", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        onUser(data.user);
        return;
      }
      const data = await apiFetch<{ pending: string }>("/api/settings/email", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setPassword("");
      setCode("");
      setPending(data.pending);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("emailPrompt.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setError("");
    setBusy(true);
    try {
      const data = await apiFetch<{ user: PublicUser }>("/api/settings/email-prompt", {
        method: "POST",
      });
      onUser(data.user);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("gate.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="username-gate" role="dialog" aria-modal="true">
      <form className="username-card" onSubmit={save}>
        <span className="username-mark">h</span>
        <p className="eyebrow">{t("emailPrompt.eyebrow")}</p>
        {pending ? (
          <>
            <h2>{t("emailPrompt.checkMail")}</h2>
            <p>{tRich(t, "emailPrompt.codeSent", { email: <strong>{pending}</strong> })}</p>

            <label htmlFor="email-prompt-code">{t("gate.label.code")}</label>
            <input
              id="email-prompt-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoFocus
              autoComplete="one-time-code"
              placeholder="123456"
            />
          </>
        ) : (
          <>
            <h2>{t("emailPrompt.title")}</h2>
            <p>{t("emailPrompt.about")}</p>

            <label htmlFor="email-prompt-email">{t("auth.email")}</label>
            <input
              id="email-prompt-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              autoFocus
              autoComplete="email"
              placeholder={t("emailPrompt.placeholder")}
            />

            <label htmlFor="email-prompt-password">{t("security.passwordToConfirm")}</label>
            <input
              id="email-prompt-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </>
        )}

        {error && <p className="auth-error">{error}</p>}

        {pending ? (
          <>
            <button type="submit" disabled={busy || code.length !== 6}>
              {busy ? t("gate.busy") : t("emailPrompt.verify")}
            </button>
            <button
              type="button"
              className="auth-switch"
              onClick={() => {
                setPending(null);
                setError("");
              }}
              disabled={busy}
            >
              {t("emailPrompt.another")}
            </button>
          </>
        ) : (
          <button type="submit" disabled={busy || !email || !password}>
            {busy ? t("gate.busy") : t("emailPrompt.sendCode")}
          </button>
        )}
        <button type="button" className="auth-switch" onClick={skip} disabled={busy}>
          {t("emailPrompt.skip")}
        </button>
      </form>
    </div>
  );
}
