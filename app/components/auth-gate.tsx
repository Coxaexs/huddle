"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound, Mail } from "lucide-react";
import { apiFetch } from "../lib/client";
import { tNow, tRich, useI18n } from "../lib/i18n-context";
import type { TranslatableKey, TranslateVars } from "@/lib/i18n";
import { ACCEPTED_INVITE_KEY, extractInviteCodeFromUrl } from "../lib/chat/invites";
import {
  passkeyCancelled,
  passkeySecondFactor,
  passkeysNeedBrowser,
  passkeysSupported,
  signInWithPasskey,
  signInWithPasskeyInBrowser,
  type PasskeyHandoff,
} from "../lib/passkeys";
import type { PublicUser } from "@/lib/users";
import { FIRST_RUN_KEY, type FirstRun } from "./welcome-tutorial";
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
  const { t } = useI18n();
  const open = openSignup && !bootstrap;
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(
    bootstrap || open ? "signup" : "signin",
  );
  // With open signup on, "signup" is Create account; this is the Invite code tab.
  const [haveInvite, setHaveInvite] = useState(false);
  // The invite in the link is for a server, not for an account: on an open
  // Hoffle the account is made like any other and the server joined after.
  const [serverInvite, setServerInvite] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeFailed, setChallengeFailed] = useState(false);
  const challengeBox = useRef<HTMLDivElement | null>(null);
  const challengeWidget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const showInviteField = bootstrap || !open || (haveInvite && !serverInvite);
  const needsChallenge = open && (!haveInvite || Boolean(serverInvite)) && mode === "signup" && Boolean(turnstileSiteKey);
  const [resetToken, setResetToken] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  // A notice set before the language is known (on mount) is kept as a key and
  // translated when shown.
  const [notice, setNotice] = useState<string | { key: TranslatableKey; vars?: TranslateVars }>("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Set once the password was right on an account with two-factor on.
  const [twoFactor, setTwoFactor] = useState<{ ticket: string; passkey: boolean } | null>(null);
  const [code, setCode] = useState("");
  // Read after mounting: the server render cannot know what the browser can do.
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => setCanPasskey(passkeysSupported()), []);
  // A desktop app's passkey sign-in, waiting on the system browser.
  const [handoff, setHandoff] = useState<PasskeyHandoff | null>(null);
  const handoffStop = useRef<AbortController | null>(null);
  useEffect(() => () => handoffStop.current?.abort(), []);

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
        setNotice({ key: "gate.inviteApplied", vars: { code: inviteCode } });

        void apiFetch<{
          valid: boolean;
          error?: string;
          server?: { name: string } | null;
          inviter?: { displayName: string } | null;
        }>(`/api/invites/resolve?code=${encodeURIComponent(inviteCode)}`)
          .then((res) => {
            if (!res.valid) {
              setError(res.error || tNow("gate.inviteInvalid"));
              setNotice("");
            } else if (res.server) {
              if (open) setServerInvite(inviteCode);
              setNotice({ key: open ? "gate.inviteForServerOpen" : "gate.inviteForServer", vars: { server: res.server.name } });
            } else if (res.inviter?.displayName) {
              setNotice({ key: "gate.invitedBy", vars: { name: res.inviter.displayName } });
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
        setNotice({ key: "gate.resetSent" });
        return;
      }
      if (mode === "reset") {
        const data = await apiFetch<{ user?: PublicUser; twoFactor?: { ticket: string; passkey: boolean } }>(
          "/api/auth/reset",
          { method: "POST", body: JSON.stringify({ token: resetToken, password }) },
        );
        if (data.twoFactor) {
          setTwoFactor(data.twoFactor);
          return;
        }
        if (data.user) onSignedIn(data.user);
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
        user?: PublicUser;
        defaultTheme?: string | null;
        twoFactor?: { ticket: string; passkey: boolean };
        joined?: { id: string; name: string } | null;
      }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (data.twoFactor) {
        setTwoFactor(data.twoFactor);
        setCode("");
        return;
      }
      if (!data.user) throw new Error(t("gate.failed"));
      if (mode === "signup") {
        rememberTermsAccepted();
        // A brand-new account gets the welcome tutorial once it is in.
        try {
          const firstRun: FirstRun = { invite: Boolean(serverInvite), joined: data.joined?.name ?? null };
          window.localStorage.setItem(FIRST_RUN_KEY, JSON.stringify(firstRun));
        } catch {
          // Storage blocked: the tutorial is still in Settings.
        }
        if (serverInvite) {
          // A server invite stays in the address bar so the chat shell joins
          // it once the account exists; it was seen here, so no second question.
          try {
            window.sessionStorage.setItem(ACCEPTED_INVITE_KEY, serverInvite);
          } catch {
            // The shell asks before joining instead.
          }
        } else {
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
      }
      onSignedIn(data.user, data.defaultTheme || null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : t("gate.failed"),
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

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!twoFactor) return;
    setError("");
    setBusy(true);
    try {
      const data = await apiFetch<{ user: PublicUser }>("/api/auth/two-factor", {
        method: "POST",
        body: JSON.stringify({ ticket: twoFactor.ticket, code }),
      });
      onSignedIn(data.user);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("gate.failed"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function passkeySignIn(ticket?: string) {
    setError("");
    if (passkeysNeedBrowser()) return passkeySignInInBrowser();
    setBusy(true);
    try {
      const data = ticket ? await passkeySecondFactor(ticket) : await signInWithPasskey();
      onSignedIn(data.user);
    } catch (failure) {
      if (!passkeyCancelled(failure)) {
        setError(failure instanceof Error ? failure.message : t("gate.passkeyFailed"));
      }
    } finally {
      setBusy(false);
    }
  }

  // A passkey signs in on its own, so from the two-step screen too this skips
  // the ticket and the password before it.
  async function passkeySignInInBrowser() {
    handoffStop.current?.abort();
    const stop = new AbortController();
    handoffStop.current = stop;
    setBusy(true);
    try {
      const started = await signInWithPasskeyInBrowser(stop.signal);
      setHandoff(started);
      const data = await started.done;
      onSignedIn(data.user);
    } catch (failure) {
      if (!stop.signal.aborted) setError(failure instanceof Error ? failure.message : t("gate.passkeyFailed"));
    } finally {
      if (handoffStop.current === stop) {
        handoffStop.current = null;
        setHandoff(null);
        setBusy(false);
      }
    }
  }

  if (handoff) {
    return (
      <div className="username-gate" role="dialog" aria-modal="true">
        <div className="username-card">
          <span className="username-mark">h</span>
          <p className="eyebrow">{t("gate.eyebrow.back")}</p>
          <h2>{t("gate.title.passkeyBrowser")}</h2>
          <p>{t("gate.lead.passkeyBrowser")}</p>
          <p className="auth-handoff-code" aria-label={t("gate.handoffCode")}>{handoff.code}</p>
          <button type="button" onClick={handoff.reopen}>
            {t("gate.button.openBrowserAgain")}
          </button>
          <button type="button" className="auth-switch" onClick={() => handoffStop.current?.abort()}>
            {t("gate.link.back")}
          </button>
        </div>
      </div>
    );
  }

  if (twoFactor) {
    const recovery = /[a-z]/i.test(code);
    return (
      <div className="username-gate" role="dialog" aria-modal="true">
        <form className="username-card" onSubmit={submitCode}>
          <span className="username-mark">h</span>
          <p className="eyebrow">{t("gate.eyebrow.twoStep")}</p>
          <h2>{t("gate.title.code")}</h2>
          <p>{t("gate.lead.code")}</p>
          <label htmlFor="huddle-2fa-code">{t("gate.label.code")}</label>
          <input
            id="huddle-2fa-code"
            value={code}
            onChange={(event) => setCode(event.target.value.slice(0, 12))}
            autoFocus
            autoComplete="one-time-code"
            inputMode={recovery ? "text" : "numeric"}
            placeholder="123456"
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={busy || code.replace(/[\s-]/g, "").length < 6}>
            {busy ? t("gate.busy") : t("gate.button.continue")}
          </button>
          {twoFactor.passkey && canPasskey && (
            <button type="button" className="auth-switch" disabled={busy} onClick={() => void passkeySignIn(twoFactor.ticket)}>
              <KeyRound size={14} aria-hidden /> {t("gate.button.passkeyInstead")}
            </button>
          )}
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setTwoFactor(null);
              setError("");
              switchMode("signin");
            }}
          >
            {t("gate.link.back")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="username-gate" role="dialog" aria-modal="true">
      <form className="username-card" onSubmit={submit}>
        <span className="username-mark">h</span>
        <p className="eyebrow">
          {bootstrap ? t("gate.eyebrow.setup") : mode === "signup" ? t("gate.eyebrow.welcome") : t("gate.eyebrow.back")}
        </p>
        <h2>
          {mode === "forgot"
            ? t("gate.title.forgot")
            : mode === "reset"
              ? t("gate.title.reset")
              : mode === "signup"
            ? bootstrap
              ? t("gate.title.claim")
              : open && !haveInvite
                ? t("gate.title.create")
                : t("gate.title.invite")
            : t("gate.title.signIn")}
        </h2>
        <p>
          {mode === "forgot"
            ? t("gate.lead.forgot")
            : mode === "reset"
              ? t("gate.lead.reset")
              : mode === "signup"
            ? bootstrap
              ? t("gate.lead.claim")
              : open && (!haveInvite || serverInvite)
                ? t("gate.lead.create")
                : t("gate.lead.invite")
            : t("gate.lead.signIn")}
        </p>

        {open && (mode === "signin" || mode === "signup") && (
          <div className="auth-tabs" role="tablist" aria-label={t("gate.tabs")}>
            {(
              [
                ["create", t("gate.tab.create")],
                ["signin", t("gate.tab.signIn")],
                ["invite", t("gate.tab.invite")],
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
              {mode === "forgot" ? t("gate.label.identifier") : t("gate.label.username")}
            </label>
            <input
              id="huddle-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              maxLength={mode === "forgot" ? 254 : 24}
              autoFocus
              autoComplete={mode === "forgot" ? "email" : "username"}
              placeholder={mode === "forgot" ? t("gate.placeholder.identifier") : t("gate.placeholder.username")}
            />
          </>
        )}

        {mode === "signup" && (
          <>
            <label htmlFor="huddle-display">{t("gate.label.displayName")}</label>
            <input
              id="huddle-display"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={40}
              placeholder={t("gate.placeholder.displayName")}
            />
            <label htmlFor="huddle-email">{t("gate.label.email")}</label>
            <input
              id="huddle-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              autoComplete="email"
              placeholder={t("gate.placeholder.email")}
            />
          </>
        )}

        {mode !== "forgot" && (
          <>
            <label htmlFor="huddle-password">
              {mode === "reset" ? t("gate.label.newPassword") : t("gate.label.password")}
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
              placeholder={mode === "signin" ? "••••••••" : t("gate.placeholder.newPassword")}
            />
          </>
        )}

        {mode === "signup" && showInviteField && (
          <>
            <label htmlFor="huddle-invite">
              {bootstrap ? t("gate.label.setupCode") : t("gate.label.inviteCode")}
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
              <p className="auth-error">{t("gate.robotFailed")}</p>
            )}
          </>
        )}

        {mode === "signup" && (
          <label className="auth-agree">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            <span>
              {tRich(t, "gate.agree", {
                terms: (
                  <a href={`${SITE}/terms`} target="_blank" rel="noopener noreferrer">
                    {t("gate.terms")}
                  </a>
                ),
                privacy: (
                  <a href={`${SITE}/privacy`} target="_blank" rel="noopener noreferrer">
                    {t("gate.privacy")}
                  </a>
                ),
              })}
            </span>
          </label>
        )}

        {error && <p className="auth-error">{error}</p>}
        {notice && (
          <p className="modal-hint">{typeof notice === "string" ? notice : t(notice.key, notice.vars)}</p>
        )}

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
            ? t("gate.busy")
            : mode === "forgot"
              ? t("gate.button.sendReset")
              : mode === "reset"
                ? t("gate.button.saveSignIn")
                : mode === "signup"
                  ? t("gate.button.create")
                  : t("gate.button.signIn")}
        </button>

        {mode === "signin" && canPasskey && (
          <button
            type="button"
            className="auth-passkey"
            disabled={busy}
            onClick={() => void passkeySignIn()}
          >
            <KeyRound size={16} aria-hidden /> {t("gate.button.passkey")}
          </button>
        )}

        {mode === "signin" && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => switchMode("forgot")}
          >
            {t("gate.link.forgot")}
          </button>
        )}

        {(mode === "forgot" || mode === "reset") && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => switchMode("signin")}
          >
            {t("gate.link.back")}
          </button>
        )}

        {!bootstrap && !open && (mode === "signin" || mode === "signup") && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup" ? t("gate.link.haveAccount") : t("gate.link.haveInvite")}
          </button>
        )}

        {mode === "signup" && !bootstrap && !open && (
          <div className="auth-request-try">
            <p className="auth-request-try-hint">{t("gate.requestHint")}</p>
            <a
              href="mailto:info@hoffle.online?subject=Requesting%20a%20try%20for%20Hoffle&body=Hello%20Hoffle%20Team%2C%0D%0A%0D%0AI%20would%20like%20to%20request%20access%20to%20try%20out%20Hoffle!%0D%0A%0D%0AThank%20you!"
              className="auth-request-try-link"
            >
              <Mail size={14} className="text-[var(--lavender)]" />
              <span>{t("gate.requestLink")}</span>
            </a>
          </div>
        )}
        {mode === "signin" && (
          <p className="auth-legal">
            <a href={`${SITE}/terms`} target="_blank" rel="noopener noreferrer">{t("gate.legal.terms")}</a>
            <span aria-hidden> · </span>
            <a href={`${SITE}/privacy`} target="_blank" rel="noopener noreferrer">{t("gate.legal.privacy")}</a>
          </p>
        )}
      </form>
    </div>
  );
}
