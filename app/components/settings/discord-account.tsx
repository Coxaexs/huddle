"use client";

import { Check, Copy, Link2, RefreshCw, Unlink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/client";

interface AccountState {
  link: { discordUserId: string; discordName: string | null; linkedAt: string } | null;
  code: { code: string; expiresAt: string } | null;
  available: boolean;
  botName: string | null;
}

/**
 * Settings → Profile → Connections → Discord. Linking makes what you write on
 * a bridged Discord server show as you here, and what you write here show
 * under your Discord name there (lib/discord-accounts.ts).
 */
export function DiscordAccountLink() {
  const [state, setState] = useState<AccountState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const call = useCallback(async (init?: RequestInit) => {
    setError("");
    try {
      setState(await apiFetch<AccountState>("/api/settings/discord", init));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    void call();
  }, [call]);

  // While a code is waiting, look every few seconds for it being used.
  useEffect(() => {
    if (!state?.code || state.link) return;
    const timer = window.setInterval(() => void call(), 4000);
    return () => window.clearInterval(timer);
  }, [state?.code, state?.link, call]);

  const run = async (init: RequestInit) => {
    setBusy(true);
    await call(init);
    setBusy(false);
  };

  if (!state) return null;
  const command = state.code ? `/hoffle-account link code:${state.code.code}` : "";

  return (
    <div className="pe-field discord-account-link">
      <div className="pe-field-head">
        <span>Discord account</span>
      </div>
      {state.link ? (
        <div className="discord-account-row">
          <span className="discord-account-badge" aria-hidden>
            <Link2 size={14} />
          </span>
          <div className="discord-account-text">
            <strong>{state.link.discordName || "Your Discord account"}</strong>
            <small>
              Linked {new Date(state.link.linkedAt).toLocaleDateString()}. What you write in bridged channels shows as you on
              both sides.
            </small>
          </div>
          <button type="button" className="pe-btn" disabled={busy} onClick={() => void run({ method: "DELETE" })}>
            <Unlink size={14} /> Unlink
          </button>
        </div>
      ) : state.code ? (
        <div className="discord-account-steps">
          <p className="pe-field-hint">
            In any Discord server with the {state.botName ? <strong>{state.botName}</strong> : "Hoffle"} bot (or a DM with it),
            run:
          </p>
          <div className="discord-account-command">
            <code>{command}</code>
            <button
              type="button"
              className="pe-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(command).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="pe-field-hint">
            Waiting for it… The code works for 15 minutes.{" "}
            <button type="button" className="pe-link-btn" disabled={busy} onClick={() => void run({ method: "POST" })}>
              <RefreshCw size={12} /> New code
            </button>
          </p>
        </div>
      ) : (
        <div className="discord-account-row">
          <div className="discord-account-text">
            <small>
              On a server bridged with Discord, link your accounts so your Discord messages, reactions and typing show as
              you here, and your Hoffle messages show under your Discord name there.
            </small>
          </div>
          <button
            type="button"
            className="pe-btn pe-btn-primary"
            disabled={busy || !state.available}
            title={state.available ? undefined : "The Discord bridge isn't running on this Hoffle."}
            onClick={() => void run({ method: "POST" })}
          >
            <Link2 size={14} /> Link Discord
          </button>
        </div>
      )}
      {error && <p className="pe-field-hint discord-account-error">{error}</p>}
    </div>
  );
}
