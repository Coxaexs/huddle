"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { apiFetch } from "../lib/client";
import { extractInviteCodeFromUrl } from "../lib/chat/invites";
import type { PublicUser } from "@/lib/users";
import { TUTORIAL_PENDING_KEY } from "./welcome-tutorial";
import { SITE } from "./site-chrome";
import { rememberTermsAccepted } from "./terms-consent";

interface AuthGateProps {
  /** True when nobody has signed up yet: the first account skips the invite. */
  bootstrap: boolean;
  /** An admin switched open signup on: "Create account" needs no invite code. */
  openSignup?: boolean;
  /** Cloudflare Turnstile site key; when set, open signup shows the challenge. */
  turnstileSiteKey?: string | null;
  /** `defaultTheme` is the invite's starting theme id, on signup only. */
  onSignedIn: (user: PublicUser, defaultTheme?: string | null) => void;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<TurnstileApi | null> {
  const existing = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () =>
      resolve((window as unknown as { turnstile?: TurnstileApi }).turnstile ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

export function AuthGate({ bootstrap, openSignup = false, turnstileSiteKey = null, onSignedIn }: AuthGateProps) {
  const open = openSignup && !bootstrap;
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(
    bootstrap || open ? "signup" : "signin",
  );
  // With open signup on, "signup" is Create account; this is the Invite code tab.
  const [haveInvite, setHaveInvite] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeFailed, setChallengeFailed] = useState(false);
  const challengeBox = useRef<HTMLDivElement | null>(null);
  const challengeWidget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const showInviteField = bootstrap || !open || haveInvite;
  const needsChallenge = open && !haveInvite && mode === "signup" && Boolean(turnstileSiteKey);
  const [resetToken, setResetToken] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // A password reset mail links back here with ?reset=<token>.
  // An invite link directs here with ?invite=<code>, ?code=<code>, or ?<code>.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const token = url.searchParams.get("reset");
      if (token) {
        setResetToken(token);
        setMode("reset");
        url.searchParams.delete("reset");
        window.history.replaceState(null, "", url.toString());
        return;
      }

      const inviteCode = extractInviteCodeFromUrl(window.location.search || window.location.href);
      if (inviteCode) {
        setInvite(inviteCode);
        setHaveInvite(true);
        setMode("signup");
        setNotice(`Invite code applied: ${inviteCode}`);

        void apiFetch<{
          valid: boolean;
          error?: string;
          server?: { name: string } | null;
          inviter?: { displayName: string } | null;
        }>(`/api/invites/resolve?code=${encodeURIComponent(inviteCode)}`)
          .then((res) => {
            if (!res.valid) {
              setError(res.error || "This invite code is invalid or has expired.");
              setNotice("");
            } else if (res.server) {
              setNotice(
                `This invite is for server "${res.server.name}". Account invites are required to register, but you can sign in if you already have an account.`,
              );
            } else if (res.inviter?.displayName) {
              setNotice(
                `${res.inviter.displayName} invited you! Choose your username to join.`,
              );
            }
          })
          .catch(() => undefined);
      }
    } catch {
      // ignore
    }
  }, []);

  // The challenge lives only on the open Create account tab; leaving the tab
  // removes it, and coming back renders a fresh one.
  useEffect(() => {
    if (!needsChallenge || !turnstileSiteKey) return;
    let cancelled = false;
    void loadTurnstile().then((api) => {
      if (cancelled) return;
      if (!api || !challengeBox.current) {
        setChallengeFailed(true);
        return;
      }
      const id = api.render(challengeBox.current, {
        sitekey: turnstileSiteKey,
        callback: (token) => setChallengeToken(token),
        "expired-callback": () => setChallengeToken(""),
        "error-callback": () => setChallengeToken(""),
      });
      challengeWidget.current = { api, id };
    });
    return () => {
      cancelled = true;
      const widget = challengeWidget.current;
      challengeWidget.current = null;
      setChallengeToken("");
      try {
        widget?.api.remove(widget.id);
      } catch {
        // Already gone.
      }
    };
  }, [needsChallenge, turnstileSiteKey]);

  function switchMode(next: typeof mode) {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
  }

  function pickTab(tab: "create" | "signin" | "invite") {
    switchMode(tab === "signin" ? "signin" : "signup");
    setHaveInvite(tab === "invite");
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
          ? {
              username,
              password,
              email,
              displayName,
              // Create account on an open Huddle sends no code at all.
              invite: showInviteField ? invite : "",
              ...(needsChallenge ? { turnstileToken: challengeToken } : {}),
            }
          : { username, password };
      const data = await apiFetch<{
        user: PublicUser;
        defaultTheme?: string | null;
      }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (mode === "signup") {
        rememberTermsAccepted();
        // A brand-new account gets the welcome tutorial once it is in.
        try {
          window.localStorage.setItem(TUTORIAL_PENDING_KEY, "1");
        } catch {
          // Storage blocked: the tutorial is still in Settings.
        }
        // Clean invite parameters from URL so that subsequent chat-shell checks don't treat this used code as an expired server invite
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("invite");
          url.searchParams.delete("code");
          url.searchParams.delete("servercode");
          if (url.search && !url.search.includes("=")) {
            url.search = "";
          }
          window.history.replaceState(null, "", url.toString());
        } catch {
          // ignore
        }
      }
      onSignedIn(data.user, data.defaultTheme || null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "That did not work.",
      );
      // A challenge token works once; ask for a new one.
      if (needsChallenge) {
        setChallengeToken("");
        try {
          challengeWidget.current?.api.reset(challengeWidget.current.id);
        } catch {
          // The widget is gone; reopening the tab renders another.
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="username-gate" role="dialog" aria-modal="true">
      <form className="username-card" onSubmit={submit}>
        <span className="username-mark">h</span>
        <p className="eyebrow">
          {bootstrap ? "SET UP YOUR HOFFLE" : mode === "signup" ? "WELCOME TO HOFFLE" : "WELCOME BACK"}
        </p>
        <h2>
          {mode === "forgot"
            ? "Forgot your password?"
            : mode === "reset"
              ? "Choose a new password"
              : mode === "signup"
            ? bootstrap
              ? "Claim this Hoffle"
              : open && !haveInvite
                ? "Create your account"
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
              : open && !haveInvite
                ? "Pick a name and a password. No invite needed."
                : "Ask a friend already inside for an invite code."
            : "Your name and messages stay on your own server."}
        </p>

        {open && (mode === "signin" || mode === "signup") && (
          <div className="auth-tabs" role="tablist" aria-label="How to get in">
            {(
              [
                ["create", "Create account"],
                ["signin", "Sign in"],
                ["invite", "Invite code"],
              ] as const
            ).map(([tab, label]) => {
              const active =
                tab === "signin" ? mode === "signin" : mode === "signup" && haveInvite === (tab === "invite");
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`auth-tab${active ? " active" : ""}`}
                  onClick={() => pickTab(tab)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

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

        {mode === "signup" && showInviteField && (
          <>
            <label htmlFor="huddle-invite">
              {bootstrap ? "Setup code" : "Invite code"}
            </label>
            <input
              id="huddle-invite"
              value={invite}
              onChange={(event) => setInvite(event.target.value.toUpperCase())}
              maxLength={32}
              placeholder="ABCD1234"
            />
          </>
        )}

        {needsChallenge && (
          <>
            <div ref={challengeBox} className="auth-challenge" />
            {challengeFailed && (
              <p className="auth-error">
                The robot check could not load. Check your connection, or use an invite code instead.
              </p>
            )}
          </>
        )}

        {mode === "signup" && (
          <label className="auth-agree">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            <span>
              I agree to the{" "}
              <a href={`${SITE}/terms`} target="_blank" rel="noopener noreferrer">Terms of Use</a> and{" "}
              <a href={`${SITE}/privacy`} target="_blank" rel="noopener noreferrer">Privacy Policy</a>. Hoffle has zero
              tolerance for abusive users and objectionable content.
            </span>
          </label>
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
                : !username || !password || (needsChallenge && !challengeToken) || (mode === "signup" && !agreed))
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
                  : "Sign in"}
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

        {!bootstrap && !open && (mode === "signin" || mode === "signup") && (
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

        {mode === "signup" && !bootstrap && !open && (
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
        {mode === "signin" && (
          <p className="auth-legal">
            <a href={`${SITE}/terms`} target="_blank" rel="noopener noreferrer">Terms</a>
            <span aria-hidden> · </span>
            <a href={`${SITE}/privacy`} target="_blank" rel="noopener noreferrer">Privacy</a>
          </p>
        )}
      </form>
    </div>
  );
}
