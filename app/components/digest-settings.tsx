"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/client";

type Mode = "off" | "notes" | "email";

/**
 * Settings → the weekly digest: what you missed on your servers, every
 * Sunday, in your Notes (with a push), and by email if you want.
 */
export function DigestSettings() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [hasEmail, setHasEmail] = useState(false);
  const [nextAt, setNextAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ mode: Mode; hasEmail: boolean; nextAt: string }>("/api/digest")
      .then((data) => {
        if (cancelled) return;
        setMode(data.mode);
        setHasEmail(data.hasEmail);
        setNextAt(data.nextAt);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mode) return null;

  const choose = async (next: Mode) => {
    const previous = mode;
    setMode(next);
    setStatus("");
    try {
      await apiFetch("/api/digest", { method: "POST", body: JSON.stringify({ mode: next }) });
    } catch (error) {
      setMode(previous);
      setStatus(error instanceof Error ? error.message : "Could not save that.");
    }
  };

  const preview = async () => {
    setBusy(true);
    setStatus("");
    try {
      const result = await apiFetch<{ sent: boolean; reason?: string }>("/api/digest", {
        method: "POST",
        body: JSON.stringify({ preview: true }),
      });
      setStatus(result.sent ? "Sent. It's in your Notes." : result.reason || "Nothing to send.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send it.");
    } finally {
      setBusy(false);
    }
  };

  const next = nextAt ? new Date(nextAt) : null;
  return (
    <div className="appearance-switch digest-settings" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <span>
        <strong>Weekly digest</strong>
        <small>
          Every Sunday: the messages people reacted to most, events coming up and who joined, on each of your servers.
          {next && mode !== "off" ? ` Next one: ${next.toLocaleString(undefined, { weekday: "long", hour: "2-digit", minute: "2-digit" })}.` : ""}
        </small>
      </span>
      <div className="digest-modes" role="radiogroup" aria-label="Weekly digest">
        {(
          [
            ["off", "Off"],
            ["notes", "In my Notes"],
            ["email", "Notes + email"],
          ] as Array<[Mode, string]>
        ).map(([value, label]) => (
          <label key={value} className={mode === value ? "active" : undefined}>
            <input
              type="radio"
              name="digest-mode"
              value={value}
              checked={mode === value}
              disabled={value === "email" && !hasEmail}
              onChange={() => void choose(value)}
            />
            {label}
          </label>
        ))}
      </div>
      {!hasEmail && <small>Add an email address to your account to get it by email.</small>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={busy} onClick={() => void preview()}>
          Send me this week's now
        </button>
      </div>
      {status && <small role="status">{status}</small>}
    </div>
  );
}
