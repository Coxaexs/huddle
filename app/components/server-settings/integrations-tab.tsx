"use client";

import { Trash2, Plus, Copy, Power, Terminal } from "lucide-react";
import type { PublicServer } from "@/lib/servers";
import { ServerBot, Tab } from "./types";

export function ServerIntegrationsTab({
  tab,
  server,
  onRequestPrompt,
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
  return (
    <>
      {tab === "integrations" && (
          <div className="tab-pane integrations-pane">
            <div className="bans-search-row">
              <div>
                <h1 className="pane-title">Bots & Integrations</h1>
                <p className="pane-subtitle">
                  Add music bots, D&D companions, Discord bridges, or custom Discord-compatible bots to {server.name}.
                </p>
              </div>
              <button
                type="button"
                className="discord-btn primary-indigo"
                onClick={() => {
                  onRequestPrompt({
                    title: "Create Custom Bot",
                    message: "Give your bot a name. A unique Discord-compatible bot token will be generated.",
                    placeholder: "e.g. Trivia Bot",
                    confirmText: "Create Bot",
                    onConfirm: (val) => {
                      if (val?.trim()) void addBot(val.trim(), "custom", "🤖");
                    },
                  });
                }}
                disabled={creatingBot}
              >
                <Plus size={16} style={{ marginRight: 6 }} /> Create Bot Integration
              </button>
            </div>

            {/* Quick-Add Built-in Bot Templates */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              <div style={{ background: "#2b2d31", border: "1px solid #3f4147", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>🎵</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: "#fff" }}>Hoffle Music Bot</h3>
                    <span style={{ fontSize: 12, color: "#949ba4" }}>Voice Audio & Synchronized Playback</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#dbdee1", margin: "8px 0 14px 0", lineHeight: 1.4 }}>
                  Streams YouTube / audio into voice channels with synchronized playback, lyrics, autoplay, and smart queue.
                </p>
                <button
                  type="button"
                  className="discord-btn secondary"
                  style={{ width: "100%" }}
                  onClick={() => void addBot("Hoffle Music", "music", "🎵", "Synchronized voice audio & playback")}
                >
                  Add Music Bot to Server
                </button>
              </div>

              <div style={{ background: "#2b2d31", border: "1px solid #3f4147", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>⚔️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: "#fff" }}>D&D 5e Bot</h3>
                    <span style={{ fontSize: 12, color: "#949ba4" }}>SRD Compendium & Dice Roller</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#dbdee1", margin: "8px 0 14px 0", lineHeight: 1.4 }}>
                  Look up 5e spells, monsters, items, conditions and roll cryptographic dice directly in chat channels.
                </p>
                <button
                  type="button"
                  className="discord-btn secondary"
                  style={{ width: "100%" }}
                  onClick={() => void addBot("D&D Companion", "dnd", "⚔️", "5e compendium and dice roller")}
                >
                  Add D&D Bot to Server
                </button>
              </div>

              <div style={{ background: "#2b2d31", border: "1px solid #3f4147", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>🌉</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: "#fff" }}>Discord Bridge</h3>
                    <span style={{ fontSize: 12, color: "#949ba4" }}>Bidirectional Discord &lt;-&gt; Hoffle Sync</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#dbdee1", margin: "8px 0 14px 0", lineHeight: 1.4 }}>
                  Sync channels bidirectionally with your Discord server. Forwards chat, embeds, and attachments.
                </p>
                <button
                  type="button"
                  className="discord-btn secondary"
                  style={{ width: "100%" }}
                  onClick={() => void addBot("Discord Bridge", "discord-bridge", "🌉", "Bidirectional Discord bridge")}
                >
                  Add Discord Bridge to Server
                </button>
              </div>
            </div>

            {/* Active Bots List */}
            <h2 style={{ fontSize: 16, color: "#fff", marginTop: 24, marginBottom: 8 }}>Installed Bots ({bots.length})</h2>
            {loadingBots ? (
              <p className="pane-subtitle">Loading installed bots…</p>
            ) : !bots.length ? (
              <div className="empty-illustration-box">
                <p>No bots installed on {server.name} yet. Add one above or create a custom bot!</p>
              </div>
            ) : (
              <ul className="invite-list" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 0, listStyle: "none" }}>
                {bots.map((bot) => (
                  <li
                    key={bot.id}
                    style={{
                      background: "#2b2d31",
                      border: "1px solid #3f4147",
                      borderRadius: 8,
                      padding: "14px 18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ fontSize: 24 }}>{bot.avatar || "🤖"}</span>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ color: "#fff", fontSize: 15 }}>{bot.name}</strong>
                          <span
                            style={{
                              fontSize: 10,
                              textTransform: "uppercase",
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: bot.enabled ? "#23a55a" : "#ed4245",
                              color: "#fff",
                              fontWeight: 700,
                            }}
                          >
                            {bot.enabled ? "ACTIVE" : "DISABLED"}
                          </span>
                          <span style={{ fontSize: 12, color: "#949ba4" }}>{bot.kind}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <code style={{ fontSize: 12, background: "#1e1f22", padding: "2px 6px", borderRadius: 4, color: "#00a8fc" }}>
                            {revealedTokens[bot.id] ? bot.token : `${bot.token.slice(0, 10)}••••••••••••••••`}
                          </code>
                          <button
                            type="button"
                            className="discord-btn"
                            style={{ padding: "2px 8px", fontSize: 12 }}
                            onClick={() => {
                              setRevealedTokens((prev) => ({ ...prev, [bot.id]: !prev[bot.id] }));
                            }}
                          >
                            {revealedTokens[bot.id] ? "Hide" : "Reveal"}
                          </button>
                          <button
                            type="button"
                            className="discord-btn secondary"
                            style={{ padding: "2px 8px", fontSize: 12 }}
                            onClick={() => {
                              void navigator.clipboard?.writeText(bot.token).then(() => {
                                setNotice(`Copied bot token for ${bot.name}.`);
                              });
                            }}
                          >
                            <Copy size={12} style={{ marginRight: 4 }} /> Copy Token
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        className="discord-btn secondary"
                        onClick={() => void toggleBot(bot)}
                        title={bot.enabled ? "Disable Bot" : "Enable Bot"}
                      >
                        <Power size={14} style={{ marginRight: 4 }} /> {bot.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="discord-btn danger-btn"
                        onClick={() => void removeBot(bot)}
                        title="Remove Bot"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Developer Quick Reference */}
            <div style={{ background: "#1e1f22", border: "1px solid #3f4147", borderRadius: 8, padding: 18, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#5865f2" }}>
                <Terminal size={18} />
                <h3 style={{ margin: 0, fontSize: 15, color: "#fff" }}>Discord-Compatible Bot API</h3>
              </div>
              <p style={{ fontSize: 13, color: "#949ba4", margin: "0 0 10px 0" }}>
                Connect your custom bots or Discord bot code to Hoffle by sending standard HTTP requests:
              </p>
              <pre style={{ margin: 0, padding: 12, background: "#111214", borderRadius: 6, fontSize: 12, color: "#dbdee1", overflowX: "auto" }}>
{`# Send a message to a channel:
curl -X POST "\${typeof window !== "undefined" ? window.location.origin : "https://chat.hoffle.online"}/hangout/api/v1/channels/<CHANNEL_ID>/messages" \\
  -H "Authorization: Bot <YOUR_BOT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello from my self-hosted bot!"}'

# Real-time event gateway:
# Connect via WebSocket to: /hangout/api/realtime
# Or stream SSE events: /hangout/api/v1/gateway/events?token=<YOUR_BOT_TOKEN>`}
              </pre>
            </div>
          </div>
        )}
    </>
  );
}
