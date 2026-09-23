"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/client";

/**
 * Phone notifications through ntfy (https://ntfy.sh, or your own ntfy server).
 * Install the ntfy app, subscribe to a hard-to-guess topic, paste its URL here,
 * and mentions, DMs and incoming calls arrive in the background with no
 * Apple/Google push keys involved on the Hoffle side.
 */
export function PhonePushSettings() {
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ endpoint: string | null }>("/api/push/ntfy")
      .then((data) => {
        setSaved(data.endpoint);
        if (data.endpoint) setEndpoint(data.endpoint);
      })
      .catch(() => undefined);
  }, []);

  const suggest = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const topic = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
    setEndpoint(`https://ntfy.sh/hoffle-${topic.slice(0, 20)}`);
  };

  const save = async () => {
    setBusy(true);
    setStatus("");
    try {
      const data = await apiFetch<{ endpoint: string }>("/api/push/ntfy", {
        method: "PUT",
        body: JSON.stringify({ endpoint, token }),
      });
      setSaved(data.endpoint);
      setStatus("Sent a test notification — check your phone.");
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/push/ntfy", { method: "DELETE" });
      setSaved(null);
      setEndpoint("");
      setToken("");
      setStatus("Phone notifications turned off.");
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="appearance-switch" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <span>
        <strong>Phone notifications (ntfy / UnifiedPush)</strong>
        <small>
          Mentions, DMs and incoming calls, even when the app is closed. Install
          the ntfy app, subscribe to a secret topic, and paste its URL here.
          Works with ntfy.sh or your own ntfy server.
        </small>
      </span>
      <input
        type="url"
        placeholder="https://ntfy.sh/your-secret-topic"
        value={endpoint}
        spellCheck={false}
        onChange={(event) => setEndpoint(event.target.value)}
      />
      <input
        type="password"
        placeholder="Access token (only for protected topics)"
        value={token}
        autoComplete="off"
        onChange={(event) => setToken(event.target.value)}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="primary" disabled={busy || !endpoint} onClick={save}>
          {saved ? "Update & test" : "Save & test"}
        </button>
        {!endpoint && (
          <button type="button" onClick={suggest}>
            Make me a topic
          </button>
        )}
        {saved && (
          <button type="button" disabled={busy} onClick={remove}>
            Turn off
          </button>
        )}
      </div>
      {status && <small role="status">{status}</small>}
    </div>
  );
}
