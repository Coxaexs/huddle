"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { apiFetch } from "../lib/client";
import type { PublicUser } from "@/lib/users";

interface AuthGateProps {
  /** True when nobody has signed up yet: the first account skips the invite. */
  bootstrap: boolean;
  /** `defaultTheme` is the invite's starting theme id, on signup only. */
  onSignedIn: (user: PublicUser, defaultTheme?: string | null) => void;
}

export function AuthGate({ bootstrap, onSignedIn }: AuthGateProps) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(
    bootstrap ? "signup" : "signin",
  );
  const [resetToken, setResetToken] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // A password reset mail links back here with ?reset=<token>.
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("reset");
    if (!token) return;
    setResetToken(token);
    setMode("reset");
    url.searchParams.delete("reset");
    window.history.replaceState(null, "", url.toString());
  }, []);

  function switchMode(next: typeof mode) {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        await apiFetch("/api/auth/forgot", {
          method: "POST",
          body: JSON.stringify({ identifier: username }),
        });
        setNotice(
          "If that account has an email, a reset link is on its way. It works for one hour.",
        );
        return;
      }
      if (mode === "reset") {
        const data = await apiFetch<{ user: PublicUser }>("/api/auth/reset", {
          method: "POST",
          body: JSON.stringify({ token: resetToken, password }),
        });
        onSignedIn(data.user);
        return;
      }
      const path = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body =
        mode === "signup"
          ? { username, password, email, displayName, invite }
          : { username, password };
      const data = await apiFetch<{
        user: PublicUser;
        defaultTheme?: string | null;
      }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSignedIn(data.user, data.defaultTheme || null);
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
          {bootstrap ? "SET UP YOUR HOFFLE" : "WELCOME BACK"}
        </p>
        <h2>
          {mode === "forgot"
            ? "Forgot your password?"
            : mode === "reset"
              ? "Choose a new password"
              : mode === "signup"
            ? bootstrap
              ? "Claim this Hoffle"
              : "Join with an invite"
            : "Sign in"}
        </h2>
        <p>
          {mode === "forgot"
            ? "Enter your username or email and we'll mail you a reset link."
            : mode === "reset"
              ? "This signs you out everywhere else."
              : mode === "signup"
            ? bootstrap
              ? "The first account owns this Hoffle and can invite everyone else."
              : "Ask a friend already inside for an invite code."
            : "Your name and messages stay on your own server."}
        </p>

        {mode !== "reset" && (
          <>
            <label htmlFor="huddle-username">
              {mode === "forgot" ? "Username or email" : "Username"}
            </label>
            <input
              id="huddle-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              maxLength={mode === "forgot" ? 254 : 24}
              autoFocus
              autoComplete={mode === "forgot" ? "email" : "username"}
              placeholder={mode === "forgot" ? "yourname or you@example.com" : "yourname"}
            />
          </>
        )}

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
            <label htmlFor="huddle-email">Email (optional)</label>
            <input
              id="huddle-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              autoComplete="email"
              placeholder="For password resets; we mail a code to confirm"
            />
          </>
        )}

        {mode !== "forgot" && (
          <>
            <label htmlFor="huddle-password">
              {mode === "reset" ? "New password" : "Password"}
            </label>
            <input
              id="huddle-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus={mode === "reset"}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              placeholder={mode === "signin" ? "••••••••" : "At least 8 characters"}
            />
          </>
        )}

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
        {notice && <p className="modal-hint">{notice}</p>}

        <button
          type="submit"
          disabled={
            busy ||
            (mode === "forgot"
              ? !username
              : mode === "reset"
                ? !password
                : !username || !password)
          }
        >
          {busy
            ? "One moment…"
            : mode === "forgot"
              ? "Send reset link"
              : mode === "reset"
                ? "Save and sign in"
                : mode === "signup"
                  ? "Create my account"
                  : "Enter the Huddle"}
        </button>

        {mode === "signin" && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => switchMode("forgot")}
          >
            I forgot my password
          </button>
        )}

        {(mode === "forgot" || mode === "reset") && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => switchMode("signin")}
          >
            Back to sign in
          </button>
        )}

        {!bootstrap && (mode === "signin" || mode === "signup") && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup"
              ? "I already have an account"
              : "I have an invite code"}
          </button>
        )}

        {mode === "signup" && !bootstrap && (
          <div className="auth-request-try">
            <p className="auth-request-try-hint">Need an invite or want early access?</p>
            <a
              href="mailto:info@hoffle.online?subject=Requesting%20a%20try%20for%20Hoffle&body=Hello%20Hoffle%20Team%2C%0D%0A%0D%0AI%20would%20like%20to%20request%20access%20to%20try%20out%20Hoffle!%0D%0A%0D%0AThank%20you!"
              className="auth-request-try-link"
            >
              <Mail size={14} className="text-[var(--lavender)]" />
              <span>Mail us at info@hoffle.online to request a try</span>
            </a>
          </div>
        )}
      </form>
    </div>
  );
}
