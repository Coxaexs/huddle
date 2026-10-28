"use client";

import { Check, Copy, Eye, EyeOff, Power, Terminal, Trash2 } from "lucide-react";
import type { PublicServer } from "@/lib/servers";
import { ServerBot, Tab } from "./types";
import { DndSettingsPanel } from "./dnd-settings";
import { FeedsPanel } from "./feeds-settings";
import { GameServerSettingsPanel } from "./game-server-settings";
import { WebhooksPanel } from "./webhooks-settings";

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
  if (tab !== "integrations") return null;

  const has = (kind: string) => bots.some((bot) => bot.kind === kind);
  const createCustomBot = () =>
    onRequestPrompt({
      title: "Create a bot",
      message: "Give your bot a name. It gets a Discord-compatible token, so discord.py and discord.js bots run here as they are.",
      placeholder: "e.g. Trivia Bot",
      confirmText: "Create bot",
      onConfirm: (val) => {
        if (val?.trim()) void addBot(val.trim(), "custom", "🤖");
      },
    });

  const apps: Array<{
    icon: string;
    name: string;
    blurb: string;
    action: string;
    added?: boolean;
    onClick: () => void;
  }> = [
    { icon: "📰", name: "Feeds", blurb: "YouTube channels, subreddits, Bluesky, blogs and GitHub releases, posted as they come out.", action: "Follow a feed", onClick: () => goTo("integration-feeds") },
    { icon: "🪝", name: "Webhooks", blurb: "GitHub, GitLab, CI, uptime monitors, Home Assistant: anything that posts to Discord.", action: "Make a webhook", onClick: () => goTo("integration-webhooks") },
    { icon: "🎵", name: "Music Bot", blurb: "Plays songs in voice for everyone at once, with a queue, lyrics and autoplay.", action: "Add", added: has("music"), onClick: () => void addBot("Hoffle Music", "music", "🎵", "Synchronized voice audio & playback") },
    { icon: "⚔️", name: "D&D Companion", blurb: "5e spells, monsters and items in chat, and fair dice for the table.", action: "Add", added: has("dnd"), onClick: () => void addBot("D&D Companion", "dnd", "⚔️", "5e compendium and dice roller") },
    { icon: "🌉", name: "Discord Bridge", blurb: "Mirror channels with a Discord server both ways while people move over.", action: "Add", added: has("discord-bridge"), onClick: () => void addBot("Discord Bridge", "discord-bridge", "🌉", "Bidirectional Discord bridge") },
    { icon: "🤖", name: "Your own bot", blurb: "Run discord.py or discord.js bots against Hoffle with a bot token.", action: "Create", onClick: createCustomBot },
  ];

  const origin = typeof window !== "undefined" ? window.location.origin : "https://hoffle.online";

  return (
    <div className="tab-pane integrations-pane">
      <header>
        <h1 className="pane-title">Integrations</h1>
        <p className="pane-subtitle">Bring the apps and sites {server.name} already uses into its channels.</p>
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
                  <Check size={14} /> Added
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

      <section className="integration-section" id="integration-bots">
        <header className="integration-section-head">
          <h2>
            Bots <span className="integration-count">{bots.length}</span>
          </h2>
          <p>Bots added to {server.name}. A token is a password for the bot: keep it secret.</p>
        </header>
        {loadingBots ? (
          <p className="integration-empty">Loading bots…</p>
        ) : !bots.length ? (
          <p className="integration-empty">No bots yet. Add one from the top of this page.</p>
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
                    <span className={`integration-badge ${bot.enabled ? "on" : "off"}`}>{bot.enabled ? "On" : "Off"}</span>
                  </strong>
                  <p className="integration-token">
                    <code>{revealedTokens[bot.id] ? bot.token : `${bot.token.slice(0, 10)}••••••••••••`}</code>
                    <button
                      type="button"
                      className="integration-icon-btn"
                      aria-label={revealedTokens[bot.id] ? "Hide token" : "Show token"}
                      title={revealedTokens[bot.id] ? "Hide token" : "Show token"}
                      onClick={() => setRevealedTokens((prev) => ({ ...prev, [bot.id]: !prev[bot.id] }))}
                    >
                      {revealedTokens[bot.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      type="button"
                      className="integration-icon-btn"
                      aria-label={`Copy the token for ${bot.name}`}
                      title="Copy token"
                      onClick={() => {
                        void navigator.clipboard?.writeText(bot.token).then(() => setNotice(`Copied the token for ${bot.name}.`));
                      }}
                    >
                      <Copy size={14} />
                    </button>
                  </p>
                </div>
                <div className="integration-row-actions">
                  <button type="button" className="discord-btn secondary-gray" onClick={() => void toggleBot(bot)}>
                    <Power size={14} /> {bot.enabled ? "Turn off" : "Turn on"}
                  </button>
                  <button
                    type="button"
                    className="discord-btn danger-btn"
                    aria-label={`Remove ${bot.name}`}
                    title="Remove"
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

      <DndSettingsPanel serverId={server.id} onNotice={setNotice} onRequestPrompt={onRequestPrompt} />
      <GameServerSettingsPanel serverId={server.id} onNotice={setNotice} />

      <details className="integration-dev">
        <summary>
          <Terminal size={16} /> For developers: the Discord-compatible API
        </summary>
        <p>Bots and scripts talk to Hoffle the way they talk to Discord. Send a message:</p>
        <pre>{`curl -X POST "${origin}/hangout/api/v1/channels/<CHANNEL_ID>/messages" \\
  -H "Authorization: Bot <YOUR_BOT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello from my bot!"}'`}</pre>
        <p>
          Live events: a WebSocket at <code>/hangout/api/realtime</code>, or server-sent events at{" "}
          <code>/hangout/api/v1/gateway/events?token=&lt;YOUR_BOT_TOKEN&gt;</code>.
        </p>
      </details>
    </div>
  );
}
