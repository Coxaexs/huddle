"use client";

import { useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import type {
  BirthdayEntry,
  CommunityBotConfig,
  ShopItem,
} from "@/lib/community-bot/types";
import { apiFetch } from "../../lib/client";

export interface Phase3SharedProps {
  serverId: string;
  draft: CommunityBotConfig;
  updateDraft: (updater: (prev: CommunityBotConfig) => CommunityBotConfig) => void;
  allChannels: Array<{ id: string; name: string; kind: string }>;
  roles: Array<{ id: string; name: string; color: string }>;
  flash: (text: string, isError?: boolean) => void;
}

// ---------------------------------------------------------------------------
// 1. Economy & Role Shop Panel
// ---------------------------------------------------------------------------

export function EconomyPanel({
  serverId,
  draft,
  updateDraft,
  roles,
  flash,
  shopItems,
  onShopChange,
}: Phase3SharedProps & {
  shopItems: ShopItem[];
  onShopChange: (next: ShopItem[]) => void;
}) {
  const ec = draft.plugins.economy;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("👑");
  const [price, setPrice] = useState(500);
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);

  async function addItem() {
    setBusy(true);
    try {
      const res = await apiFetch<{ shopItems: ShopItem[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/shop`,
        {
          method: "POST",
          body: JSON.stringify({ name, description, emoji, price, roleId: roleId || null }),
        },
      );
      onShopChange(res.shopItems);
      setName("");
      setDescription("");
      flash("Shop item added!");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not add item.", true);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    try {
      const res = await apiFetch<{ shopItems: ShopItem[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/shop?itemId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      onShopChange(res.shopItems);
      flash("Item removed from shop.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to delete item.", true);
    }
  }

  return (
    <>
      <header className="cb-header">
        <div>
          <h1>🪙 Economy &amp; Role Shop</h1>
          <p>Server currency with <code>/balance</code>, <code>/daily</code>, <code>/work</code>, <code>/pay</code>, <code>/shop</code>, <code>/buy</code>, and <code>/richest</code>.</p>
        </div>
      </header>

      <div className="cb-card">
        <h2>Currency &amp; Rewards</h2>
        <div className="cb-grid-3">
          <div className="cb-field">
            <label>Currency Name</label>
            <input
              className="cb-input"
              value={ec.currencyName}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, economy: { ...p.plugins.economy, currencyName: e.target.value } },
                }))
              }
            />
          </div>
          <div className="cb-field">
            <label>Currency Emoji</label>
            <input
              className="cb-input"
              value={ec.currencyEmoji}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, economy: { ...p.plugins.economy, currencyEmoji: e.target.value } },
                }))
              }
            />
          </div>
          <div className="cb-field">
            <label>Starting Balance</label>
            <input
              type="number"
              className="cb-input"
              min={0}
              value={ec.startingBalance}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, economy: { ...p.plugins.economy, startingBalance: Number(e.target.value) || 0 } },
                }))
              }
            />
          </div>
          <div className="cb-field">
            <label>/daily Reward</label>
            <input
              type="number"
              className="cb-input"
              min={1}
              value={ec.dailyAmount}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, economy: { ...p.plugins.economy, dailyAmount: Number(e.target.value) || 250 } },
                }))
              }
            />
          </div>
          <div className="cb-field">
            <label>/work Min – Max</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                className="cb-input"
                min={1}
                value={ec.workMin}
                onChange={(e) =>
                  updateDraft((p) => ({
                    ...p,
                    plugins: { ...p.plugins, economy: { ...p.plugins.economy, workMin: Number(e.target.value) || 40 } },
                  }))
                }
              />
              <input
                type="number"
                className="cb-input"
                min={1}
                value={ec.workMax}
                onChange={(e) =>
                  updateDraft((p) => ({
                    ...p,
                    plugins: { ...p.plugins, economy: { ...p.plugins.economy, workMax: Number(e.target.value) || 120 } },
                  }))
                }
              />
            </div>
          </div>
          <div className="cb-field">
            <label>/work Cooldown (minutes)</label>
            <input
              type="number"
              className="cb-input"
              min={1}
              value={ec.workCooldownMin}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, economy: { ...p.plugins.economy, workCooldownMin: Number(e.target.value) || 30 } },
                }))
              }
            />
          </div>
        </div>
      </div>

      <div className="cb-card">
        <h2>Role Shop ({shopItems.length} items)</h2>
        <p className="cb-card-sub">Members buy these items with <code>/buy &lt;name&gt;</code> to unlock roles or perks.</p>
        <div className="cb-grid-3">
          <div className="cb-field">
            <label>Item Name</label>
            <input className="cb-input" placeholder="VIP Role" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="cb-field">
            <label>Emoji</label>
            <input className="cb-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          </div>
          <div className="cb-field">
            <label>Price ({ec.currencyName})</label>
            <input type="number" min={1} className="cb-input" value={price} onChange={(e) => setPrice(Number(e.target.value) || 100)} />
          </div>
        </div>
        <div className="cb-grid-2">
          <div className="cb-field">
            <label>Description</label>
            <input className="cb-input" placeholder="Unlocks the VIP badge & color" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="cb-field">
            <label>Role to Grant on Purchase (optional)</label>
            <select className="cb-select" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">None (cosmetic item)</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" className="cb-btn cb-btn-primary" disabled={busy || !name.trim()} onClick={() => void addItem()}>
          <Plus size={14} /> Add Shop Item
        </button>

        <div style={{ marginTop: 16 }}>
          {shopItems.map((item) => {
            const role = roles.find((r) => r.id === item.roleId);
            return (
              <div key={item.id} className="cb-row-item" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{item.emoji} {item.name}</strong>{" "}
                  <span className="cb-badge">{ec.currencyEmoji} {item.price.toLocaleString()}</span>
                  {role && <span className="cb-badge" style={{ marginLeft: 6 }}>@{role.name}</span>}
                  {item.description && (
                    <div style={{ fontSize: 12.5, color: "#9aa2b8", marginTop: 2 }}>{item.description}</div>
                  )}
                </div>
                <button type="button" className="cb-btn cb-btn-danger" onClick={() => void removeItem(item.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Birthdays Panel
// ---------------------------------------------------------------------------

export function BirthdaysPanel({
  draft,
  updateDraft,
  allChannels,
  roles,
  birthdays,
}: Phase3SharedProps & { birthdays: BirthdayEntry[] }) {
  const bd = draft.plugins.birthdays;
  const textChannels = allChannels.filter((c) => c.kind === "text" || c.kind === "announcement");
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <>
      <header className="cb-header">
        <div>
          <h1>🎂 Birthdays</h1>
          <p>Members register with <code>/birthday MM-DD</code> and receive automated wishes + an optional birthday role.</p>
        </div>
      </header>
      <div className="cb-card">
        <div className="cb-grid-2">
          <div className="cb-field">
            <label>Announcement Channel</label>
            <select
              className="cb-select"
              value={bd.channelId || ""}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, birthdays: { ...p.plugins.birthdays, channelId: e.target.value || null } },
                }))
              }
            >
              <option value="">Select channel…</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
          <div className="cb-field">
            <label>Birthday Role (optional)</label>
            <select
              className="cb-select"
              value={bd.birthdayRoleId || ""}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, birthdays: { ...p.plugins.birthdays, birthdayRoleId: e.target.value || null } },
                }))
              }
            >
              <option value="">None</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="cb-field">
          <label>Birthday Message</label>
          <textarea
            className="cb-textarea"
            value={bd.message}
            onChange={(e) =>
              updateDraft((p) => ({
                ...p,
                plugins: { ...p.plugins, birthdays: { ...p.plugins.birthdays, message: e.target.value } },
              }))
            }
          />
        </div>
      </div>

      <div className="cb-card">
        <h2>Registered Birthdays ({birthdays.length})</h2>
        {birthdays.length === 0 ? (
          <p className="cb-card-sub" style={{ marginBottom: 0 }}>No members have set their birthday yet.</p>
        ) : (
          birthdays.map((b) => (
            <div key={b.userId} className="cb-row-item" style={{ justifyContent: "space-between" }}>
              <strong>{b.displayName}</strong>
              <span className="cb-badge">🎂 {months[b.month]} {b.day}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Temporary Voice Channels Panel
// ---------------------------------------------------------------------------

export function TempVoicePanel({ draft, updateDraft, allChannels }: Phase3SharedProps) {
  const tv = draft.plugins.tempVoice;
  const voiceChannels = allChannels.filter((c) => c.kind === "voice");

  return (
    <>
      <header className="cb-header">
        <div>
          <h1>🎙️ Temporary Voice Channels</h1>
          <p>When someone joins the selected &ldquo;Join to Create&rdquo; voice channel, HoffBot spawns a personal voice room and deletes it once empty.</p>
        </div>
      </header>
      <div className="cb-card">
        <div className="cb-grid-2">
          <div className="cb-field">
            <label>&ldquo;Join to Create&rdquo; Voice Channel</label>
            <select
              className="cb-select"
              value={tv.creatorChannelId || ""}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, tempVoice: { ...p.plugins.tempVoice, creatorChannelId: e.target.value || null } },
                }))
              }
            >
              <option value="">Disabled</option>
              {voiceChannels.map((c) => (
                <option key={c.id} value={c.id}>🔊 {c.name}</option>
              ))}
            </select>
          </div>
          <div className="cb-field">
            <label>Room Name Template (<code>{"{username}"}</code>)</label>
            <input
              className="cb-input"
              value={tv.nameTemplate}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, tempVoice: { ...p.plugins.tempVoice, nameTemplate: e.target.value } },
                }))
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Server Stats Channels Panel
// ---------------------------------------------------------------------------

export function ServerStatsPanel({
  serverId,
  draft,
  updateDraft,
  allChannels,
  flash,
}: Phase3SharedProps) {
  const ss = draft.plugins.serverStats;
  const [syncing, setSyncing] = useState(false);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await apiFetch<{ updated: number }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/stats-sync`,
        { method: "POST" },
      );
      flash(`Synced ${res.updated} stat channel${res.updated === 1 ? "" : "s"}!`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not sync stats.", true);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <header className="cb-header">
        <div>
          <h1>📊 Server Stats Channels</h1>
          <p>Automatically rename counter channels with live member, online, and channel counts. Remember to Save Changes before syncing.</p>
        </div>
        <button type="button" className="cb-btn cb-btn-primary" disabled={syncing} onClick={() => void syncNow()}>
          <RefreshCw size={14} /> {syncing ? "Syncing…" : "Sync Stats Now"}
        </button>
      </header>

      <div className="cb-card">
        <div className="cb-grid-2">
          <div className="cb-field">
            <label>Member Count Channel</label>
            <select
              className="cb-select"
              value={ss.memberCountChannelId || ""}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, serverStats: { ...p.plugins.serverStats, memberCountChannelId: e.target.value || null } },
                }))
              }
            >
              <option value="">Disabled</option>
              {allChannels.map((c) => (
                <option key={c.id} value={c.id}>{c.kind === "voice" ? "🔊" : "#"} {c.name}</option>
              ))}
            </select>
          </div>
          <div className="cb-field">
            <label>Member Count Format (<code>{"{count}"}</code>)</label>
            <input
              className="cb-input"
              value={ss.memberCountTemplate}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, serverStats: { ...p.plugins.serverStats, memberCountTemplate: e.target.value } },
                }))
              }
            />
          </div>

          <div className="cb-field">
            <label>Online Count Channel</label>
            <select
              className="cb-select"
              value={ss.onlineCountChannelId || ""}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, serverStats: { ...p.plugins.serverStats, onlineCountChannelId: e.target.value || null } },
                }))
              }
            >
              <option value="">Disabled</option>
              {allChannels.map((c) => (
                <option key={c.id} value={c.id}>{c.kind === "voice" ? "🔊" : "#"} {c.name}</option>
              ))}
            </select>
          </div>
          <div className="cb-field">
            <label>Online Count Format</label>
            <input
              className="cb-input"
              value={ss.onlineCountTemplate}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, serverStats: { ...p.plugins.serverStats, onlineCountTemplate: e.target.value } },
                }))
              }
            />
          </div>

          <div className="cb-field">
            <label>Channel Count Channel</label>
            <select
              className="cb-select"
              value={ss.channelCountChannelId || ""}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, serverStats: { ...p.plugins.serverStats, channelCountChannelId: e.target.value || null } },
                }))
              }
            >
              <option value="">Disabled</option>
              {allChannels.map((c) => (
                <option key={c.id} value={c.id}>{c.kind === "voice" ? "🔊" : "#"} {c.name}</option>
              ))}
            </select>
          </div>
          <div className="cb-field">
            <label>Channel Count Format</label>
            <input
              className="cb-input"
              value={ss.channelCountTemplate}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, serverStats: { ...p.plugins.serverStats, channelCountTemplate: e.target.value } },
                }))
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}
