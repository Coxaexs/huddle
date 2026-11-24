"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/client";
import { useI18n } from "../lib/i18n-context";

/**
 * Phone notifications through ntfy (https://ntfy.sh, or your own ntfy server).
 * Install the ntfy app, subscribe to a hard-to-guess topic, paste its URL here,
 * and mentions, DMs and incoming calls arrive in the background with no
 * Apple/Google push keys involved on the Hoffle side.
 */
export function PhonePushSettings() {
  const { t } = useI18n();
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
      setStatus(t("settings.ntfy.testSent"));
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
      setStatus(t("settings.ntfy.turnedOff"));
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="appearance-switch" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <span>
        <strong>{t("settings.ntfy.title")}</strong>
        <small>{t("settings.ntfy.desc")}</small>
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
        placeholder={t("settings.ntfy.tokenPlaceholder")}
        value={token}
        autoComplete="off"
        onChange={(event) => setToken(event.target.value)}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="primary" disabled={busy || !endpoint} onClick={save}>
          {saved ? t("settings.ntfy.updateTest") : t("settings.ntfy.saveTest")}
        </button>
        {!endpoint && (
          <button type="button" className="secondary" onClick={suggest}>
            {t("settings.ntfy.makeTopic")}
          </button>
        )}
        {saved && (
          <button type="button" className="secondary" disabled={busy} onClick={remove}>
            {t("settings.ntfy.turnOff")}
          </button>
        )}
      </div>
      {status && <small role="status">{status}</small>}
    </div>
  );
}
