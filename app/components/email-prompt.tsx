"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "../lib/client";
import type { PublicUser } from "@/lib/users";

interface EmailPromptProps {
  onUser: (user: PublicUser) => void;
}

/**
 * Shown once to accounts made before signup asked for an email. "Skip for now"
 * stops the prompt; the address can still be added under Settings → Account.
 */
export function EmailPrompt({ onUser }: EmailPromptProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await apiFetch<{ user: PublicUser }>("/api/settings/email", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onUser(data.user);
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

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={busy || !email || !password}>
          {busy ? "One moment…" : "Save email"}
        </button>
        <button type="button" className="auth-switch" onClick={skip} disabled={busy}>
          Skip for now
        </button>
      </form>
    </div>
  );
}
