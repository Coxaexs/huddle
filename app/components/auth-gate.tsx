"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "../lib/client";
import type { PublicUser } from "@/lib/users";

interface AuthGateProps {
  /** True when nobody has signed up yet: the first account skips the invite. */
  bootstrap: boolean;
  onSignedIn: (user: PublicUser) => void;
}

export function AuthGate({ bootstrap, onSignedIn }: AuthGateProps) {
  const [mode, setMode] = useState<"signin" | "signup">(
    bootstrap ? "signup" : "signin",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const path = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body =
        mode === "signup"
          ? { username, password, displayName, invite }
          : { username, password };
      const data = await apiFetch<{ user: PublicUser }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSignedIn(data.user);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "That did not work.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="username-gate" role="dialog" aria-modal="true">
      <form className="username-card" onSubmit={submit}>
        <span className="username-mark">h</span>
        <p className="eyebrow">
          {bootstrap ? "SET UP YOUR HUDDLE" : "WELCOME BACK"}
        </p>
        <h2>
          {mode === "signup"
            ? bootstrap
              ? "Claim this Huddle"
              : "Join with an invite"
            : "Sign in"}
        </h2>
        <p>
          {mode === "signup"
            ? bootstrap
              ? "The first account owns this Huddle and can invite everyone else."
              : "Ask a friend already inside for an invite code."
            : "Your name and messages stay on your own server."}
        </p>

        <label htmlFor="huddle-username">Username</label>
        <input
          id="huddle-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          maxLength={24}
          autoFocus
          autoComplete="username"
          placeholder="yourname"
        />

        {mode === "signup" && (
          <>
            <label htmlFor="huddle-display">Display name</label>
            <input
              id="huddle-display"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={40}
              placeholder="What friends should see"
            />
          </>
        )}

        <label htmlFor="huddle-password">Password</label>
        <input
          id="huddle-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={
            mode === "signup" ? "new-password" : "current-password"
          }
          placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
        />

        {mode === "signup" && (
          <>
            <label htmlFor="huddle-invite">
              {bootstrap ? "Setup code" : "Invite code"}
            </label>
            <input
              id="huddle-invite"
              value={invite}
              onChange={(event) => setInvite(event.target.value.toUpperCase())}
              maxLength={16}
              placeholder="ABCD1234"
            />
          </>
        )}

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={busy || !username || !password}>
          {busy
            ? "One moment…"
            : mode === "signup"
              ? "Create my account"
              : "Enter the Huddle"}
        </button>

        {!bootstrap && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError("");
            }}
          >
            {mode === "signup"
              ? "I already have an account"
              : "I have an invite code"}
          </button>
        )}
      </form>
    </div>
  );
}
