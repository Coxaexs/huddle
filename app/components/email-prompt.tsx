"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../lib/client";
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
      setError(failure instanceof Error ? failure.message : "Could not save your email.");
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
      setError(failure instanceof Error ? failure.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="username-gate" role="dialog" aria-modal="true">
      <form className="username-card" onSubmit={save}>
        <span className="username-mark">h</span>
        <p className="eyebrow">ONE QUICK THING</p>
        {pending ? (
          <>
            <h2>Check your mail</h2>
            <p>
              We sent a 6-digit code to <strong>{pending}</strong>. Enter it to
              finish adding the address.
            </p>

            <label htmlFor="email-prompt-code">Code</label>
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
            <h2>Add an email</h2>
            <p>
              If you ever forget your password, we'll send a reset link here. It is
              never shown to anyone else.
            </p>

            <label htmlFor="email-prompt-email">Email</label>
            <input
              id="email-prompt-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              autoFocus
              autoComplete="email"
              placeholder="you@example.com"
            />

            <label htmlFor="email-prompt-password">Password to confirm</label>
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
              {busy ? "One moment…" : "Verify"}
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
              Use another address or resend
            </button>
          </>
        ) : (
          <button type="submit" disabled={busy || !email || !password}>
            {busy ? "One moment…" : "Send code"}
          </button>
        )}
        <button type="button" className="auth-switch" onClick={skip} disabled={busy}>
          Skip for now
        </button>
      </form>
    </div>
  );
}
