"use client";

import { useEffect, useMemo, useState } from "react";
import "../developers.css";
import type { PublicApplication } from "@/lib/applications";
import { GatewayIntent } from "@/lib/discord/protocol";
import { BOT_PERMISSION_INFO } from "@/lib/permissions";
import { apiFetch, basePath } from "../lib/client";
import { SignedIn } from "./signed-in";
import { useI18n } from "../lib/i18n-context";
import type { MessageKey } from "@/lib/i18n";

const INTENTS: Array<{ flag: number; labelKey: MessageKey; helpKey: MessageKey }> = [
  { flag: GatewayIntent.MessageContent, labelKey: "dev.intent.messageContent", helpKey: "dev.intent.messageContentHelp" },
  { flag: GatewayIntent.GuildMembers, labelKey: "dev.intent.guildMembers", helpKey: "dev.intent.guildMembersHelp" },
  { flag: GatewayIntent.GuildPresences, labelKey: "dev.intent.guildPresences", helpKey: "dev.intent.guildPresencesHelp" },
];

const CATEGORIES = ["General", "Membership", "Text", "Voice"] as const;
const CATEGORY_KEYS: Record<(typeof CATEGORIES)[number], MessageKey> = {
  General: "dev.cat.General",
  Membership: "dev.cat.Membership",
  Text: "dev.cat.Text",
  Voice: "dev.cat.Voice",
};

function failed(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** The calculator: tick what the bot needs, get the link servers add it with. */
function InviteLink({ app }: { app: PublicApplication }) {
  const { t } = useI18n();
  const [permissions, setPermissions] = useState(app.defaultPermissions);
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const query = new URLSearchParams({ client_id: app.id, permissions: String(permissions), scope: "bot" });
    return `${origin}${basePath}/oauth2/authorize?${query}`;
  }, [app.id, permissions]);

  return (
    <section className="dev-card">
      <h2>{t("dev.inviteTitle")}</h2>
      <p className="dev-muted">{t("dev.inviteSub")}</p>
      {CATEGORIES.map((category) => (
        <fieldset key={category} className="dev-permissions">
          <legend>{t(CATEGORY_KEYS[category])}</legend>
          {BOT_PERMISSION_INFO.filter((info) => info.category === category).map((info) => (
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
        {t("dev.permissionsNumber")} <code>{permissions}</code>
      </p>
      <div className="dev-copy">
        <input readOnly value={url} aria-label={t("dev.inviteAria")} onFocus={(event) => event.target.select()} />
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
          {copied ? t("dev.copied") : t("dev.copy")}
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
  const { t } = useI18n();
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
      setError(failed(failure, t("dev.saveError")));
    }
  }

  async function resetToken() {
    if (!window.confirm(t("dev.resetTokenConfirm"))) return;
    setError("");
    try {
      const result = await apiFetch<{ token: string }>(`/api/applications/${app.id}/token`, { method: "POST" });
      setToken(result.token);
    } catch (failure) {
      setError(failed(failure, t("dev.resetTokenError")));
    }
  }

  async function remove() {
    if (!window.confirm(t("dev.deleteConfirm", { name: app.name, count: app.servers }))) return;
    try {
      await apiFetch(`/api/applications/${app.id}`, { method: "DELETE" });
      onChange(null);
    } catch (failure) {
      setError(failed(failure, t("dev.deleteError")));
    }
  }

  return (
    <>
      <button type="button" className="dev-link" onClick={onBack}>
        {t("dev.allBots")}
      </button>
      {error && <p className="dev-error">{error}</p>}

      <section className="dev-card">
        <h2>{t("dev.generalTitle")}</h2>
        <label className="dev-field">
          <span>{t("dev.nameLabel")}</span>
          <input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="dev-field">
          <span>{t("dev.iconLabel")}</span>
          <input value={avatar} maxLength={8} onChange={(event) => setAvatar(event.target.value)} />
        </label>
        <label className="dev-field">
          <span>{t("dev.descLabel")}</span>
          <textarea value={description} maxLength={400} rows={3} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button type="button" className="dev-button" onClick={() => void save({ name, avatar, description })}>
          {t("common.save")}
        </button>
        {saved && <span className="dev-muted">{t("dev.savedNotice")}</span>}
        <p className="dev-muted">
          {t("dev.appId")} <code>{app.id}</code> · {app.servers === 1 ? t("dev.inServersSingle") : t("dev.inServersPlural", { count: app.servers })}
        </p>
      </section>

      <section className="dev-card">
        <h2>{t("dev.tokenTitle")}</h2>
        <p className="dev-muted">{t("dev.tokenSub")}</p>
        {token ? (
          <div className="dev-copy">
            <input readOnly value={token} aria-label={t("dev.tokenAria")} onFocus={(event) => event.target.select()} />
            <button type="button" className="dev-button" onClick={() => void navigator.clipboard?.writeText(token)}>
              {t("dev.copy")}
            </button>
          </div>
        ) : null}
        <button type="button" className="dev-button secondary" onClick={() => void resetToken()}>
          {t("dev.resetTokenBtn")}
        </button>
      </section>

      <section className="dev-card">
        <h2>{t("dev.settingsTitle")}</h2>
        <label className="dev-toggle">
          <input type="checkbox" checked={app.public} onChange={(event) => void save({ public: event.target.checked })} />
          <span>
            <strong>{t("dev.publicBot")}</strong>
            <small>{t("dev.publicBotHelp")}</small>
          </span>
        </label>
        <label className="dev-toggle">
          <input type="checkbox" checked={app.player} onChange={(event) => void save({ player: event.target.checked })} />
          <span>
            <strong>{t("dev.roomPlayer")}</strong>
            <small>{t("dev.roomPlayerHelp")}</small>
          </span>
        </label>
        <h3>{t("dev.privilegedIntents")}</h3>
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
              <strong>{t(intent.labelKey)}</strong>
              <small>{t(intent.helpKey)}</small>
            </span>
          </label>
        ))}
      </section>

      <InviteLink app={app} />

      {app.deletable && (
        <section className="dev-card">
          <h2>{t("dev.deleteSectionTitle")}</h2>
          <button type="button" className="dev-button danger" onClick={() => void remove()}>
            {t("dev.deleteBotBtn")}
          </button>
        </section>
      )}
    </>
  );
}

function Portal() {
  const { t } = useI18n();
  const [apps, setApps] = useState<PublicApplication[] | null>(null);
  const [openId, setOpenId] = useState("");
  const [firstToken, setFirstToken] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<{ applications: PublicApplication[] }>("/api/applications")
      .then((data) => setApps(data.applications))
      .catch((failure) => setError(failed(failure, t("dev.loadError"))));
  }, [t]);

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
      setError(failed(failure, t("dev.createError")));
    }
  }

  const open = apps?.find((app) => app.id === openId);
  return (
    <main className="dev-page">
      <div className="dev-column">
        <header className="dev-header">
          <a href={`${basePath}/`}>Hoffle</a>
          <h1>{t("dev.portalTitle")}</h1>
          <p className="dev-muted">
            {t("dev.portalSub")}
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
              <h2>{t("dev.newBotTitle")}</h2>
              <div className="dev-copy">
                <input
                  value={name}
                  maxLength={32}
                  placeholder={t("dev.botNamePlaceholder")}
                  aria-label={t("dev.botNamePlaceholder")}
                  onChange={(event) => setName(event.target.value)}
                />
                <button type="button" className="dev-button" disabled={!name.trim()} onClick={() => void create()}>
                  {t("dev.createBtn")}
                </button>
              </div>
            </section>
            <section className="dev-card">
              <h2>{t("dev.yourBotsTitle")}</h2>
              {!apps ? null : !apps.length ? (
                <p className="dev-muted">{t("dev.noBots")}</p>
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
                            {app.servers === 1 ? t("dev.serversSingle") : t("dev.serversPlural", { count: app.servers })}
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
