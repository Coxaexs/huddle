"use client";

import { useEffect, useMemo, useState } from "react";
import "../developers.css";
import type { PublicApplication } from "@/lib/applications";
import { GatewayIntent } from "@/lib/discord/protocol";
import { PERMISSION_INFO } from "@/lib/permissions";
import { apiFetch, basePath } from "../lib/client";
import { SignedIn } from "./signed-in";

const INTENTS = [
  { flag: GatewayIntent.MessageContent, label: "Message Content", help: "Read what people write. Without it, messages reach your bot blank." },
  { flag: GatewayIntent.GuildMembers, label: "Server Members", help: "See the full member list and who joins and leaves." },
  { flag: GatewayIntent.GuildPresences, label: "Presence", help: "See who is online." },
];

const CATEGORIES = ["General", "Membership", "Text", "Voice"] as const;

function failed(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** The calculator: tick what the bot needs, get the link servers add it with. */
function InviteLink({ app }: { app: PublicApplication }) {
  const [permissions, setPermissions] = useState(app.defaultPermissions);
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const query = new URLSearchParams({ client_id: app.id, permissions: String(permissions), scope: "bot" });
    return `${origin}${basePath}/oauth2/authorize?${query}`;
  }, [app.id, permissions]);

  return (
    <section className="dev-card">
      <h2>Invite link</h2>
      <p className="dev-muted">Tick what your bot needs. Servers see this list before they add it, and it gets nothing else.</p>
      {CATEGORIES.map((category) => (
        <fieldset key={category} className="dev-permissions">
          <legend>{category}</legend>
          {PERMISSION_INFO.filter((info) => info.category === category).map((info) => (
            <label key={info.flag} title={info.description}>
              <input
                type="checkbox"
                checked={Boolean(permissions & info.flag)}
                onChange={(event) =>
                  setPermissions((current) => (event.target.checked ? current | info.flag : current & ~info.flag))
                }
              />
              <span>{info.label}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <p className="dev-muted">
        Permissions number: <code>{permissions}</code>
      </p>
      <div className="dev-copy">
        <input readOnly value={url} aria-label="Invite link" onFocus={(event) => event.target.select()} />
        <button
          type="button"
          className="dev-button"
          onClick={() =>
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </section>
  );
}

function BotSettings({
  app,
  firstToken,
  onChange,
  onBack,
}: {
  app: PublicApplication;
  firstToken: string;
  onChange: (next: PublicApplication | null) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(app.name);
  const [avatar, setAvatar] = useState(app.avatar);
  const [description, setDescription] = useState(app.description);
  const [token, setToken] = useState(firstToken);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(changes: Record<string, unknown>) {
    setError("");
    setSaved(false);
    try {
      const { application } = await apiFetch<{ application: PublicApplication }>(`/api/applications/${app.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      onChange(application);
      setSaved(true);
    } catch (failure) {
      setError(failed(failure, "That did not save."));
    }
  }

  async function resetToken() {
    if (!window.confirm("Reset the token? The old one stops working straight away.")) return;
    setError("");
    try {
      const result = await apiFetch<{ token: string }>(`/api/applications/${app.id}/token`, { method: "POST" });
      setToken(result.token);
    } catch (failure) {
      setError(failed(failure, "The token could not be reset."));
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${app.name}? It leaves all ${app.servers} servers it is in.`)) return;
    try {
      await apiFetch(`/api/applications/${app.id}`, { method: "DELETE" });
      onChange(null);
    } catch (failure) {
      setError(failed(failure, "The bot could not be deleted."));
    }
  }

  return (
    <>
      <button type="button" className="dev-link" onClick={onBack}>
        ← All bots
      </button>
      {error && <p className="dev-error">{error}</p>}

      <section className="dev-card">
        <h2>General</h2>
        <label className="dev-field">
          <span>Name</span>
          <input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="dev-field">
          <span>Icon (one emoji)</span>
          <input value={avatar} maxLength={8} onChange={(event) => setAvatar(event.target.value)} />
        </label>
        <label className="dev-field">
          <span>Description</span>
          <textarea value={description} maxLength={400} rows={3} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button type="button" className="dev-button" onClick={() => void save({ name, avatar, description })}>
          Save
        </button>
        {saved && <span className="dev-muted"> Saved.</span>}
        <p className="dev-muted">
          Application id: <code>{app.id}</code> · in {app.servers} {app.servers === 1 ? "server" : "servers"}
        </p>
      </section>

      <section className="dev-card">
        <h2>Bot token</h2>
        <p className="dev-muted">The password your bot signs in with. It is shown once, so save it now and keep it secret.</p>
        {token ? (
          <div className="dev-copy">
            <input readOnly value={token} aria-label="Bot token" onFocus={(event) => event.target.select()} />
            <button type="button" className="dev-button" onClick={() => void navigator.clipboard?.writeText(token)}>
              Copy
            </button>
          </div>
        ) : null}
        <button type="button" className="dev-button secondary" onClick={() => void resetToken()}>
          Reset token
        </button>
      </section>

      <section className="dev-card">
        <h2>Bot settings</h2>
        <label className="dev-toggle">
          <input type="checkbox" checked={app.public} onChange={(event) => void save({ public: event.target.checked })} />
          <span>
            <strong>Public bot</strong>
            <small>Anyone with the invite link can add it. Turn this off and only you can.</small>
          </span>
        </label>
        <h3>Privileged intents</h3>
        {INTENTS.map((intent) => (
          <label key={intent.flag} className="dev-toggle">
            <input
              type="checkbox"
              checked={Boolean(app.intents & intent.flag)}
              onChange={(event) =>
                void save({ intents: event.target.checked ? app.intents | intent.flag : app.intents & ~intent.flag })
              }
            />
            <span>
              <strong>{intent.label}</strong>
              <small>{intent.help}</small>
            </span>
          </label>
        ))}
      </section>

      <InviteLink app={app} />

      {app.deletable && (
        <section className="dev-card">
          <h2>Delete this bot</h2>
          <button type="button" className="dev-button danger" onClick={() => void remove()}>
            Delete bot
          </button>
        </section>
      )}
    </>
  );
}

function Portal() {
  const [apps, setApps] = useState<PublicApplication[] | null>(null);
  const [openId, setOpenId] = useState("");
  const [firstToken, setFirstToken] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<{ applications: PublicApplication[] }>("/api/applications")
      .then((data) => setApps(data.applications))
      .catch((failure) => setError(failed(failure, "Your bots could not be loaded.")));
  }, []);

  async function create() {
    setError("");
    try {
      const { application, token } = await apiFetch<{ application: PublicApplication; token: string }>(
        "/api/applications",
        { method: "POST", body: JSON.stringify({ name }) },
      );
      setApps((current) => [...(current || []), application]);
      setFirstToken(token);
      setOpenId(application.id);
      setName("");
    } catch (failure) {
      setError(failed(failure, "The bot could not be made."));
    }
  }

  const open = apps?.find((app) => app.id === openId);
  return (
    <main className="dev-page">
      <div className="dev-column">
        <header className="dev-header">
          <a href={`${basePath}/`}>Hoffle</a>
          <h1>Developer Portal</h1>
          <p className="dev-muted">
            Make a bot, run it anywhere, and share its invite link. Bots use the same API as Discord bots, so discord.py
            and discord.js work.
          </p>
        </header>

        {open ? (
          <BotSettings
            key={open.id}
            app={open}
            firstToken={firstToken}
            onBack={() => {
              setOpenId("");
              setFirstToken("");
            }}
            onChange={(next) => {
              if (!next) {
                setApps((current) => (current || []).filter((app) => app.id !== open.id));
                setOpenId("");
                return;
              }
              setApps((current) => (current || []).map((app) => (app.id === next.id ? next : app)));
            }}
          />
        ) : (
          <>
            {error && <p className="dev-error">{error}</p>}
            <section className="dev-card">
              <h2>New bot</h2>
              <div className="dev-copy">
                <input
                  value={name}
                  maxLength={32}
                  placeholder="Bot name"
                  aria-label="Bot name"
                  onChange={(event) => setName(event.target.value)}
                />
                <button type="button" className="dev-button" disabled={!name.trim()} onClick={() => void create()}>
                  Create
                </button>
              </div>
            </section>
            <section className="dev-card">
              <h2>Your bots</h2>
              {!apps ? null : !apps.length ? (
                <p className="dev-muted">No bots yet.</p>
              ) : (
                <ul className="dev-bots">
                  {apps.map((app) => (
                    <li key={app.id}>
                      <button type="button" onClick={() => setOpenId(app.id)}>
                        <span className="dev-avatar small" aria-hidden>
                          {app.avatar}
                        </span>
                        <span>
                          <strong>{app.name}</strong>
                          <small>
                            {app.servers} {app.servers === 1 ? "server" : "servers"}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export function DeveloperPortal() {
  return (
    <SignedIn>
      <Portal />
    </SignedIn>
  );
}
