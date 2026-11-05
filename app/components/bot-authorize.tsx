"use client";

import { useEffect, useState } from "react";
import "../developers.css";
import { apiFetch, basePath } from "../lib/client";
import { useI18n } from "../lib/i18n-context";
import { SignedIn } from "./signed-in";

interface Details {
  application: { id: string; name: string; avatar: string; description: string; owner: string };
  permissions: string[];
  servers: Array<{ id: string; name: string }>;
}

function AddBot() {
  const { t } = useI18n();
  const [details, setDetails] = useState<Details | null>(null);
  const [link, setLink] = useState<{ clientId: string; permissions: string } | null>(null);
  const [serverId, setServerId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get("client_id") || "";
    const permissions = params.get("permissions") || "0";
    setLink({ clientId, permissions });
    void apiFetch<Details>(
      `/api/oauth2/authorize?${new URLSearchParams({ client_id: clientId, permissions })}`,
    )
      .then((found) => {
        setDetails(found);
        setServerId(found.servers[0]?.id || "");
      })
      .catch((failure) => setError(failure instanceof Error ? failure.message : t("botAdd.failed")));
  }, [t]);

  async function authorize() {
    if (!link || !serverId) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/oauth2/authorize", {
        method: "POST",
        body: JSON.stringify({ client_id: link.clientId, guild_id: serverId, permissions: link.permissions }),
      });
      setAdded(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("botAdd.failed"));
    } finally {
      setBusy(false);
    }
  }

  if (!details) {
    return (
      <main className="dev-page">
        <section className="dev-card dev-narrow">{error ? <p className="dev-error">{error}</p> : null}</section>
      </main>
    );
  }

  const { application, permissions, servers } = details;
  return (
    <main className="dev-page">
      <section className="dev-card dev-narrow">
        <div className="dev-bot-head">
          <span className="dev-avatar" aria-hidden>
            {application.avatar}
          </span>
          <div>
            <h1>{application.name}</h1>
            <p className="dev-muted">{t("botAdd.madeBy", { name: application.owner })}</p>
          </div>
        </div>
        {application.description && <p>{application.description}</p>}

        {added ? (
          <>
            <p>{t("botAdd.added", { name: application.name })}</p>
            <a className="dev-button" href={`${basePath}/`}>
              {t("botAdd.open")}
            </a>
          </>
        ) : !servers.length ? (
          <p className="dev-error">{t("botAdd.noServers")}</p>
        ) : (
          <>
            <label className="dev-field">
              <span>{t("botAdd.server")}</span>
              <select value={serverId} onChange={(event) => setServerId(event.target.value)}>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            </label>
            <h2>{t("botAdd.canDo")}</h2>
            {permissions.length ? (
              <ul className="dev-list">
                {permissions.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : (
              <p className="dev-muted">{t("botAdd.nothing")}</p>
            )}
            <p className="dev-muted">{t("botAdd.trust")}</p>
            {error && <p className="dev-error">{error}</p>}
            <button type="button" className="dev-button" disabled={busy || !serverId} onClick={() => void authorize()}>
              {t("botAdd.authorize")}
            </button>
          </>
        )}
      </section>
    </main>
  );
}

/** Where a bot's invite link lands: pick a server, see what it asks for, add it. */
export function BotAuthorize() {
  return (
    <SignedIn>
      <AddBot />
    </SignedIn>
  );
}
