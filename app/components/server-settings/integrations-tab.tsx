"use client";

import { Check, Copy, Eye, EyeOff, Power, Terminal, Trash2 } from "lucide-react";
import type { PublicServer } from "@/lib/servers";
import { basePath } from "../../lib/client";
import { ServerBot, Tab } from "./types";
import { DndSettingsPanel } from "./dnd-settings";
import { FeedsPanel } from "./feeds-settings";
import { GameServerSettingsPanel } from "./game-server-settings";
import { WebhooksPanel } from "./webhooks-settings";
import { DiscordBridgePanel } from "./discord-bridge-settings";
import { useI18n } from "../../lib/i18n-context";
import type { MessageKey } from "@/lib/i18n";

/** Jumps to a panel further down and puts the cursor in its first box. */
function goTo(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  section.classList.add("is-flashing");
  window.setTimeout(() => section.classList.remove("is-flashing"), 1400);
  window.setTimeout(() => section.querySelector<HTMLInputElement>("input:not(.webhook-avatar-input)")?.focus({ preventScroll: true }), 450);
}

export function ServerIntegrationsTab({
  tab,
  server,
  onRequestPrompt,
  onRequestConfirm,
  addBot,
  creatingBot,
  bots,
  loadingBots,
  revealedTokens,
  setRevealedTokens,
  setNotice,
  toggleBot,
  removeBot,
}: {
  tab: Tab;
  server: PublicServer;
  onRequestPrompt: (options: { title: string; message?: string; defaultValue?: string; placeholder?: string; confirmText?: string; onConfirm: (val?: string) => void; }) => void;
  onRequestConfirm: (options: { title: string; message?: string; isDanger?: boolean; confirmText?: string; onConfirm: () => void }) => void;
  addBot: (name: string, kind?: string, avatar?: string, description?: string) => Promise<void>;
  creatingBot: boolean;
  bots: ServerBot[];
  loadingBots: boolean;
  revealedTokens: Record<string, boolean>;
  setRevealedTokens: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  toggleBot: (bot: ServerBot) => Promise<void>;
  removeBot: (bot: ServerBot) => Promise<void>;
}) {
  const { t } = useI18n();
  const tk = (key: string, vars?: Record<string, string | number>) => t(key as MessageKey, vars);
  if (tab !== "integrations") return null;

  const has = (kind: string) => bots.some((bot) => bot.kind === kind);
  const apps: Array<{
    icon: string;
    name: string;
    blurb: string;
    action: string;
    added?: boolean;
    onClick: () => void;
  }> = [
    { icon: "📰", name: tk("intg.app.feeds"), blurb: tk("intg.app.feeds.blurb"), action: tk("intg.app.feeds.action"), onClick: () => goTo("integration-feeds") },
    { icon: "🪝", name: tk("intg.app.hooks"), blurb: tk("intg.app.hooks.blurb"), action: tk("intg.app.hooks.action"), onClick: () => goTo("integration-webhooks") },
    { icon: "⚔️", name: tk("intg.app.dnd"), blurb: tk("intg.app.dnd.blurb"), action: tk("intg.app.add"), added: has("dnd"), onClick: () => void addBot("D&D Companion", "dnd", "⚔️", "5e compendium and dice roller") },
    { icon: "🌉", name: tk("intg.app.bridge"), blurb: tk("intg.app.bridge.blurb"), action: tk("intg.app.bridge.action"), onClick: () => goTo("integration-discord-bridge") },
    { icon: "🤖", name: tk("intg.app.ownBot"), blurb: tk("intg.app.ownBot.blurb"), action: tk("intg.open"), onClick: () => window.open(`${basePath}/developers`, "_blank", "noopener") },
  ];

  const origin = typeof window !== "undefined" ? window.location.origin : "https://hoffle.online";

  return (
    <div className="tab-pane integrations-pane">
      <header>
        <h1 className="pane-title">{tk("intg.title")}</h1>
        <p className="pane-subtitle">{tk("intg.subtitle", { server: server.name })}</p>
      </header>

      <div className="integration-apps">
        {apps.map((app) => (
          <article key={app.name} className={`integration-app ${app.added ? "is-added" : ""}`}>
            <span className="integration-app-icon" aria-hidden>
              {app.icon}
            </span>
            <div className="integration-app-text">
              <h3>{app.name}</h3>
              <p>{app.blurb}</p>
            </div>
            <button
              type="button"
              className={`discord-btn ${app.added ? "secondary-gray" : "primary-indigo"}`}
              disabled={app.added || creatingBot}
              onClick={app.onClick}
            >
              {app.added ? (
                <>
                  <Check size={14} /> {tk("intg.added")}
                </>
              ) : (
                app.action
              )}
            </button>
          </article>
        ))}
      </div>

      <FeedsPanel serverId={server.id} onNotice={setNotice} onRequestConfirm={onRequestConfirm} />
      <WebhooksPanel serverId={server.id} onNotice={setNotice} onRequestConfirm={onRequestConfirm} />
      <DiscordBridgePanel serverId={server.id} serverName={server.name} onNotice={setNotice} onRequestConfirm={onRequestConfirm} />

      <section className="integration-section" id="integration-bots">
        <header className="integration-section-head">
          <h2>
            {tk("intg.bots.title")} <span className="integration-count">{bots.length}</span>
          </h2>
          <p>{tk("intg.bots.desc", { server: server.name })}</p>
        </header>
        {loadingBots ? (
          <p className="integration-empty">{tk("intg.bots.loading")}</p>
        ) : !bots.length ? (
          <p className="integration-empty">{tk("intg.bots.none")}</p>
        ) : (
          <ul className="integration-list">
            {bots.map((bot) => (
              <li key={bot.id} className={`integration-row ${bot.enabled ? "" : "is-off"}`}>
                <span className="integration-row-icon" aria-hidden>
                  {bot.avatar || "🤖"}
                </span>
                <div className="integration-row-main">
                  <strong>
                    {bot.name}{" "}
                    <span className={`integration-badge ${bot.enabled ? "on" : "off"}`}>{bot.enabled ? tk("intg.bots.on") : tk("intg.bots.off")}</span>
                  </strong>
                  {bot.applicationId ? (
                    <p className="integration-token">{tk("intg.bots.viaInvite")}</p>
                  ) : (
                  <p className="integration-token">
                    <code>{revealedTokens[bot.id] ? bot.token : `${bot.token.slice(0, 10)}••••••••••••`}</code>
                    <button
                      type="button"
                      className="integration-icon-btn"
                      aria-label={revealedTokens[bot.id] ? tk("intg.bots.hideToken") : tk("intg.bots.showToken")}
                      title={revealedTokens[bot.id] ? tk("intg.bots.hideToken") : tk("intg.bots.showToken")}
                      onClick={() => setRevealedTokens((prev) => ({ ...prev, [bot.id]: !prev[bot.id] }))}
                    >
                      {revealedTokens[bot.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      type="button"
                      className="integration-icon-btn"
                      aria-label={tk("intg.bots.copyTokenFor", { name: bot.name })}
                      title={tk("intg.bots.copyToken")}
                      onClick={() => {
                        void navigator.clipboard?.writeText(bot.token).then(() => setNotice(tk("intg.bots.copiedToken", { name: bot.name })));
                      }}
                    >
                      <Copy size={14} />
                    </button>
                  </p>
                  )}
                </div>
                <div className="integration-row-actions">
                  <button type="button" className="discord-btn secondary-gray" onClick={() => void toggleBot(bot)}>
                    <Power size={14} /> {bot.enabled ? tk("intg.bots.turnOff") : tk("intg.bots.turnOn")}
                  </button>
                  <button
                    type="button"
                    className="discord-btn danger-btn"
                    aria-label={tk("intg.bots.removeNamed", { name: bot.name })}
                    title={tk("intg.remove")}
                    onClick={() => void removeBot(bot)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DndSettingsPanel serverId={server.id} roles={server.roles} onNotice={setNotice} onRequestPrompt={onRequestPrompt} />
      <GameServerSettingsPanel serverId={server.id} onNotice={setNotice} />

      <details className="integration-dev">
        <summary>
          <Terminal size={16} /> {tk("intg.dev.summary")}
        </summary>
        <p>{tk("intg.dev.send")}</p>
        <pre>{`curl -X POST "${origin}/hangout/api/v10/channels/<CHANNEL_ID>/messages" \\
  -H "Authorization: Bot <YOUR_BOT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello from my bot!"}'`}</pre>
        <p>
          {tk("intg.dev.gatewayA")} <code>/hangout/api/gateway</code>{tk("intg.dev.gatewayB")}
        </p>
      </details>
    </div>
  );
}
