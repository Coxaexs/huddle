"use client";

import { useState } from "react";
import { Play, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import type {
  CommunityBotConfig,
  CustomCommand,
  EmbedFieldInput,
  Giveaway,
  RecurringTimer,
  SavedEmbed,
  SupportTicket,
  TicketPanel,
} from "@/lib/community-bot/types";
import { apiFetch } from "../../lib/client";

export interface Phase2SharedProps {
  serverId: string;
  draft: CommunityBotConfig;
  updateDraft: (updater: (prev: CommunityBotConfig) => CommunityBotConfig) => void;
  textChannels: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string; color: string }>;
  flash: (text: string, isError?: boolean) => void;
}

// ---------------------------------------------------------------------------
// 1. Custom Commands Panel
// ---------------------------------------------------------------------------

export function CustomCommandsPanel({
  serverId,
  draft,
  updateDraft,
  roles,
  flash,
  commands,
  onChange,
}: Phase2SharedProps & {
  commands: CustomCommand[];
  onChange: (next: CustomCommand[]) => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [trigger, setTrigger] = useState("");
  const [response, setResponse] = useState("");
  const [useEmbed, setUseEmbed] = useState(false);
  const [embedTitle, setEmbedTitle] = useState("");
  const [embedColor, setEmbedColor] = useState("#6366f1");
  const [grantRoleId, setGrantRoleId] = useState("");
  const [removeRoleId, setRemoveRoleId] = useState("");
  const [busy, setBusy] = useState(false);

  const prefix = draft.plugins.customCommands.prefix || "!";

  function reset() {
    setEditId(null);
    setTrigger("");
    setResponse("");
    setUseEmbed(false);
    setEmbedTitle("");
    setEmbedColor("#6366f1");
    setGrantRoleId("");
    setRemoveRoleId("");
  }

  function startEdit(c: CustomCommand) {
    setEditId(c.id);
    setTrigger(c.trigger);
    setResponse(c.response);
    setUseEmbed(c.useEmbed);
    setEmbedTitle(c.embedTitle || "");
    setEmbedColor(c.embedColor);
    setGrantRoleId(c.grantRoleId || "");
    setRemoveRoleId(c.removeRoleId || "");
  }

  async function save() {
    setBusy(true);
    try {
      const res = await apiFetch<{ customCommands: CustomCommand[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/custom-commands`,
        {
          method: "POST",
          body: JSON.stringify({
            id: editId || undefined,
            trigger,
            response,
            useEmbed,
            embedTitle: embedTitle || null,
            embedColor,
            grantRoleId: grantRoleId || null,
            removeRoleId: removeRoleId || null,
          }),
        },
      );
      onChange(res.customCommands);
      reset();
      flash("Custom command saved!");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not save command.", true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await apiFetch<{ customCommands: CustomCommand[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/custom-commands?commandId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      onChange(res.customCommands);
      if (editId === id) reset();
      flash("Command deleted.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not delete command.", true);
    }
  }

  return (
    <>
      <header className="cb-header">
        <div>
          <h1>⚡ Custom Commands</h1>
          <p>Create custom <code>{prefix}commands</code> that reply with text, embeds, or grant/remove roles.</p>
        </div>
      </header>

      <div className="cb-card">
        <h2>Command Prefix</h2>
        <div className="cb-field" style={{ maxWidth: 160 }}>
          <label>Trigger Prefix</label>
          <input
            className="cb-input"
            maxLength={4}
            value={draft.plugins.customCommands.prefix}
            onChange={(e) =>
              updateDraft((p) => ({
                ...p,
                plugins: { ...p.plugins, customCommands: { ...p.plugins.customCommands, prefix: e.target.value || "!" } },
              }))
            }
          />
        </div>
      </div>

      <div className="cb-card">
        <h2>{editId ? "Edit Command" : "Add Custom Command"}</h2>
        <p className="cb-card-sub">Variables: <code>{"{user}"}</code>, <code>{"{username}"}</code>, <code>{"{server}"}</code>, <code>{"{args}"}</code></p>
        <div className="cb-grid-2">
          <div className="cb-field">
            <label>Command Name (without prefix)</label>
            <input
              className="cb-input"
              placeholder="rules"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
            />
          </div>
          <div className="cb-check-row" style={{ alignSelf: "end" }}>
            <span>Reply as rich embed</span>
            <label className="cb-switch">
              <input type="checkbox" checked={useEmbed} onChange={(e) => setUseEmbed(e.target.checked)} />
              <span className="cb-switch-track" />
            </label>
          </div>
        </div>

        {useEmbed && (
          <div className="cb-grid-2">
            <div className="cb-field">
              <label>Embed Title</label>
              <input className="cb-input" value={embedTitle} onChange={(e) => setEmbedTitle(e.target.value)} />
            </div>
            <div className="cb-field">
              <label>Embed Color</label>
              <input type="color" className="cb-input" style={{ height: 39, padding: 4 }} value={embedColor} onChange={(e) => setEmbedColor(e.target.value)} />
            </div>
          </div>
        )}

        <div className="cb-field">
          <label>Response</label>
          <textarea
            className="cb-textarea"
            placeholder="Be kind, have fun, and check #announcements!"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
          />
        </div>

        <div className="cb-grid-2">
          <div className="cb-field">
            <label>Optional: Grant Role to Caller</label>
            <select className="cb-select" value={grantRoleId} onChange={(e) => setGrantRoleId(e.target.value)}>
              <option value="">None</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
          </div>
          <div className="cb-field">
            <label>Optional: Remove Role from Caller</label>
            <select className="cb-select" value={removeRoleId} onChange={(e) => setRemoveRoleId(e.target.value)}>
              <option value="">None</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="cb-btn cb-btn-primary" disabled={busy || !trigger.trim() || !response.trim()} onClick={() => void save()}>
            <Plus size={14} /> {editId ? "Update Command" : "Create Command"}
          </button>
          {editId && (
            <button type="button" className="cb-btn cb-btn-secondary" onClick={reset}>Cancel</button>
          )}
        </div>
      </div>

      <div className="cb-card">
        <h2>Commands ({commands.length})</h2>
        {commands.length === 0 ? (
          <p className="cb-card-sub" style={{ marginBottom: 0 }}>No custom commands yet.</p>
        ) : (
          commands.map((c) => (
            <div key={c.id} className="cb-row-item" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{prefix}{c.trigger}</strong>{" "}
                <span className="cb-badge">{c.uses} uses</span>
                <div style={{ fontSize: 12.5, color: "#9aa2b8", marginTop: 2 }}>
                  {c.response.slice(0, 120)}{c.response.length > 120 ? "…" : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="cb-btn cb-btn-secondary" onClick={() => startEdit(c)}>Edit</button>
                <button type="button" className="cb-btn cb-btn-danger" onClick={() => void remove(c.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Visual Embed Builder Panel
// ---------------------------------------------------------------------------

export function EmbedBuilderPanel({
  serverId,
  textChannels,
  flash,
  savedEmbeds,
  onChange,
}: Phase2SharedProps & {
  savedEmbeds: SavedEmbed[];
  onChange: (next: SavedEmbed[]) => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState(textChannels[0]?.id || "");
  const [name, setName] = useState("Server Announcement");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("Welcome!");
  const [description, setDescription] = useState("Write your rich embed message here.");
  const [color, setColor] = useState("#6366f1");
  const [authorName, setAuthorName] = useState("");
  const [footerText, setFooterText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const [fields, setFields] = useState<EmbedFieldInput[]>([]);
  const [busy, setBusy] = useState(false);

  function loadEmbed(e: SavedEmbed) {
    setEditId(e.id);
    setChannelId(e.channelId);
    setName(e.name);
    setContent(e.content);
    setTitle(e.embed.title || "");
    setDescription(e.embed.description || "");
    setColor(e.embed.color || "#6366f1");
    setAuthorName(e.embed.authorName || "");
    setFooterText(e.embed.footerText || "");
    setImageUrl(e.embed.imageUrl || "");
    setThumbnailUrl(e.embed.thumbnailUrl || "");
    setIncludeTimestamp(Boolean(e.embed.includeTimestamp));
    setFields(e.embed.fields || []);
  }

  async function submit(publish: boolean) {
    setBusy(true);
    try {
      const res = await apiFetch<{ savedEmbeds: SavedEmbed[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/embeds`,
        {
          method: "POST",
          body: JSON.stringify({
            id: editId || undefined,
            channelId,
            name,
            content,
            publish,
            embed: {
              title,
              description,
              color,
              authorName,
              footerText,
              imageUrl,
              thumbnailUrl,
              includeTimestamp,
              fields,
            },
          }),
        },
      );
      onChange(res.savedEmbeds);
      flash(publish ? "Embed posted to channel!" : "Embed draft saved.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not send embed.", true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await apiFetch<{ savedEmbeds: SavedEmbed[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/embeds?embedId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      onChange(res.savedEmbeds);
      if (editId === id) setEditId(null);
      flash("Saved embed deleted.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to delete.", true);
    }
  }

  return (
    <>
      <header className="cb-header">
        <div>
          <h1>🧱 Embed Builder</h1>
          <p>Design rich embeds with live preview and post or update them directly in any channel.</p>
        </div>
        {editId && (
          <button type="button" className="cb-btn cb-btn-secondary" onClick={() => setEditId(null)}>
            New Embed
          </button>
        )}
      </header>

      <div className="cb-card">
        <div className="cb-grid-3">
          <div className="cb-field">
            <label>Preset Name</label>
            <input className="cb-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="cb-field">
            <label>Target Channel</label>
            <select className="cb-select" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Select channel…</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
          <div className="cb-field">
            <label>Sidebar Color</label>
            <input type="color" className="cb-input" style={{ height: 39, padding: 4 }} value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>

        <div className="cb-field">
          <label>Message Text (optional, above embed)</label>
          <input className="cb-input" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>

        <div className="cb-grid-2">
          <div className="cb-field">
            <label>Author Header</label>
            <input className="cb-input" value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
          </div>
          <div className="cb-field">
            <label>Embed Title</label>
            <input className="cb-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>

        <div className="cb-field">
          <label>Description</label>
          <textarea className="cb-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="cb-grid-3">
          <div className="cb-field">
            <label>Image URL</label>
            <input className="cb-input" placeholder="https://…" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </div>
          <div className="cb-field">
            <label>Thumbnail URL</label>
            <input className="cb-input" placeholder="https://…" value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} />
          </div>
          <div className="cb-field">
            <label>Footer Text</label>
            <input className="cb-input" value={footerText} onChange={(e) => setFooterText(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 8px" }}>
          <strong style={{ fontSize: 13.5 }}>Fields ({fields.length}/25)</strong>
          <button
            type="button"
            className="cb-btn cb-btn-secondary"
            onClick={() => setFields((prev) => [...prev, { name: "Field", value: "Value", inline: true }])}
          >
            <Plus size={14} /> Add Field
          </button>
        </div>

        {fields.map((f, idx) => (
          <div key={idx} className="cb-row-item">
            <input
              className="cb-input"
              style={{ flex: 1 }}
              placeholder="Field name"
              value={f.name}
              onChange={(e) => setFields((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className="cb-input"
              style={{ flex: 2 }}
              placeholder="Field value"
              value={f.value}
              onChange={(e) => setFields((prev) => prev.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))}
            />
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={Boolean(f.inline)}
                onChange={(e) => setFields((prev) => prev.map((x, i) => (i === idx ? { ...x, inline: e.target.checked } : x)))}
              />
              Inline
            </label>
            <button type="button" className="cb-btn cb-btn-danger" onClick={() => setFields((prev) => prev.filter((_, i) => i !== idx))}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {/* Live Preview */}
        <div style={{ margin: "16px 0" }}>
          <label style={{ fontSize: 12, color: "#8f98b0", display: "block", marginBottom: 6 }}>Live Preview</label>
          {content && <div style={{ marginBottom: 6, fontSize: 13.5 }}>{content}</div>}
          <div className="cb-preview-embed" style={{ borderLeftColor: color }}>
            {authorName && <div style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 4 }}>{authorName}</div>}
            {title && <h4>{title}</h4>}
            {description && <p>{description}</p>}
            {fields.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 10 }}>
                {fields.map((f, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{f.name}</div>
                    <div style={{ fontSize: 12.5, color: "#cbd5e1" }}>{f.value}</div>
                  </div>
                ))}
              </div>
            )}
            {footerText && <div style={{ fontSize: 11.5, color: "#8f98b0", marginTop: 10 }}>{footerText}</div>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="cb-btn cb-btn-primary" disabled={busy || !channelId} onClick={() => void submit(true)}>
            <Send size={14} /> {editId ? "Update Sent Embed" : "Send to Channel"}
          </button>
          <button type="button" className="cb-btn cb-btn-secondary" disabled={busy || !channelId} onClick={() => void submit(false)}>
            Save Draft
          </button>
        </div>
      </div>

      <div className="cb-card">
        <h2>Saved Embeds ({savedEmbeds.length})</h2>
        {savedEmbeds.length === 0 ? (
          <p className="cb-card-sub" style={{ marginBottom: 0 }}>No saved embeds yet.</p>
        ) : (
          savedEmbeds.map((e) => (
            <div key={e.id} className="cb-row-item" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{e.name}</strong>
                <div style={{ fontSize: 12.5, color: "#9aa2b8" }}>
                  {e.messageId ? "Published" : "Draft"} · {e.embed.title || "(no title)"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="cb-btn cb-btn-secondary" onClick={() => loadEmbed(e)}>Edit</button>
                <button type="button" className="cb-btn cb-btn-danger" onClick={() => void remove(e.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Recurring Timers Panel
// ---------------------------------------------------------------------------

export function TimersPanel({
  serverId,
  textChannels,
  flash,
  timers,
  onChange,
}: Phase2SharedProps & {
  timers: RecurringTimer[];
  onChange: (next: RecurringTimer[]) => void;
}) {
  const [channelId, setChannelId] = useState(textChannels[0]?.id || "");
  const [name, setName] = useState("Daily Reminder");
  const [message, setMessage] = useState("");
  const [intervalMin, setIntervalMin] = useState(60);
  const [useEmbed, setUseEmbed] = useState(true);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await apiFetch<{ timers: RecurringTimer[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/timers`,
        {
          method: "POST",
          body: JSON.stringify({ channelId, name, message, intervalMin, useEmbed }),
        },
      );
      onChange(res.timers);
      setMessage("");
      flash("Recurring timer created!");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not create timer.", true);
    } finally {
      setBusy(false);
    }
  }

  async function runNow(id: string) {
    try {
      const res = await apiFetch<{ timers: RecurringTimer[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/timers`,
        { method: "POST", body: JSON.stringify({ action: "run-now", id }) },
      );
      onChange(res.timers);
      flash("Timer message sent!");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to send timer.", true);
    }
  }

  async function remove(id: string) {
    try {
      const res = await apiFetch<{ timers: RecurringTimer[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/timers?timerId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      onChange(res.timers);
      flash("Timer deleted.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to delete timer.", true);
    }
  }

  return (
    <>
      <header className="cb-header">
        <div>
          <h1>⏱️ Timers (Recurring Announcements)</h1>
          <p>Post repeating messages automatically on a schedule.</p>
        </div>
      </header>

      <div className="cb-card">
        <h2>New Timer</h2>
        <div className="cb-grid-3">
          <div className="cb-field">
            <label>Timer Name</label>
            <input className="cb-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="cb-field">
            <label>Channel</label>
            <select className="cb-select" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Select channel…</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
          <div className="cb-field">
            <label>Repeat Every (minutes)</label>
            <input type="number" min={5} max={43200} className="cb-input" value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value) || 60)} />
          </div>
        </div>
        <div className="cb-field">
          <label>Message</label>
          <textarea className="cb-textarea" placeholder="Don't forget to check our community events!" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <div className="cb-check-row">
          <span>Post as embed</span>
          <label className="cb-switch">
            <input type="checkbox" checked={useEmbed} onChange={(e) => setUseEmbed(e.target.checked)} />
            <span className="cb-switch-track" />
          </label>
        </div>
        <button type="button" className="cb-btn cb-btn-primary" style={{ marginTop: 12 }} disabled={busy || !channelId || !message.trim()} onClick={() => void create()}>
          <Plus size={14} /> Create Timer
        </button>
      </div>

      <div className="cb-card">
        <h2>Active Timers ({timers.length})</h2>
        {timers.length === 0 ? (
          <p className="cb-card-sub" style={{ marginBottom: 0 }}>No timers configured yet.</p>
        ) : (
          timers.map((t) => {
            const ch = textChannels.find((c) => c.id === t.channelId);
            return (
              <div key={t.id} className="cb-row-item" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{t.name}</strong>{" "}
                  <span className="cb-badge">every {t.intervalMin}m</span>
                  <div style={{ fontSize: 12.5, color: "#9aa2b8" }}>
                    #{ch?.name || t.channelId} · {t.message.slice(0, 100)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="cb-btn cb-btn-secondary" onClick={() => void runNow(t.id)}>
                    <Play size={13} /> Send Now
                  </button>
                  <button type="button" className="cb-btn cb-btn-danger" onClick={() => void remove(t.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Giveaways Panel
// ---------------------------------------------------------------------------

export function GiveawaysPanel({
  serverId,
  textChannels,
  roles,
  flash,
  giveaways,
  onChange,
}: Phase2SharedProps & {
  giveaways: Giveaway[];
  onChange: (next: Giveaway[]) => void;
}) {
  const [channelId, setChannelId] = useState(textChannels[0]?.id || "");
  const [prize, setPrize] = useState("");
  const [description, setDescription] = useState("");
  const [winnerCount, setWinnerCount] = useState(1);
  const [durationMin, setDurationMin] = useState(1440);
  const [requiredRoleId, setRequiredRoleId] = useState("");
  const [busy, setBusy] = useState(false);

  async function launch() {
    setBusy(true);
    try {
      const res = await apiFetch<{ giveaways: Giveaway[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/giveaways`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "create",
            channelId,
            prize,
            description,
            winnerCount,
            durationMin,
            requiredRoleId: requiredRoleId || null,
          }),
        },
      );
      onChange(res.giveaways);
      setPrize("");
      setDescription("");
      flash("🎉 Giveaway launched!");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not launch giveaway.", true);
    } finally {
      setBusy(false);
    }
  }

  async function act(giveawayId: string, action: "end" | "reroll") {
    try {
      const res = await apiFetch<{ giveaways: Giveaway[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/giveaways`,
        { method: "POST", body: JSON.stringify({ action, giveawayId }) },
      );
      onChange(res.giveaways);
      flash(action === "reroll" ? "🔄 New winner(s) rolled!" : "🎉 Giveaway ended!");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Action failed.", true);
    }
  }

  return (
    <>
      <header className="cb-header">
        <div>
          <h1>🎁 Giveaways</h1>
          <p>Host interactive one-click giveaways with automatic winner picking and rerolls.</p>
        </div>
      </header>

      <div className="cb-card">
        <h2>Launch Giveaway</h2>
        <div className="cb-grid-2">
          <div className="cb-field">
            <label>Prize</label>
            <input className="cb-input" placeholder="Steam Gift Card / VIP Role…" value={prize} onChange={(e) => setPrize(e.target.value)} />
          </div>
          <div className="cb-field">
            <label>Channel</label>
            <select className="cb-select" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Select channel…</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="cb-grid-3">
          <div className="cb-field">
            <label>Winners</label>
            <input type="number" min={1} max={20} className="cb-input" value={winnerCount} onChange={(e) => setWinnerCount(Number(e.target.value) || 1)} />
          </div>
          <div className="cb-field">
            <label>Duration (minutes)</label>
            <input type="number" min={1} max={43200} className="cb-input" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value) || 60)} />
          </div>
          <div className="cb-field">
            <label>Required Role (optional)</label>
            <select className="cb-select" value={requiredRoleId} onChange={(e) => setRequiredRoleId(e.target.value)}>
              <option value="">Anyone can enter</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>@{r.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="cb-field">
          <label>Description (optional)</label>
          <textarea className="cb-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <button type="button" className="cb-btn cb-btn-primary" disabled={busy || !channelId || !prize.trim()} onClick={() => void launch()}>
          <Send size={14} /> Start Giveaway
        </button>
      </div>

      <div className="cb-card">
        <h2>Giveaways ({giveaways.length})</h2>
        {giveaways.length === 0 ? (
          <p className="cb-card-sub" style={{ marginBottom: 0 }}>No giveaways yet.</p>
        ) : (
          giveaways.map((g) => (
            <div key={g.id} className="cb-row-item" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>🎉 {g.prize}</strong>{" "}
                <span className="cb-badge">{g.ended ? "Ended" : "Live"}</span>
                <div style={{ fontSize: 12.5, color: "#9aa2b8" }}>
                  {g.entryCount} entries · {g.winnerCount} winner{g.winnerCount === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {!g.ended ? (
                  <button type="button" className="cb-btn cb-btn-secondary" onClick={() => void act(g.id, "end")}>
                    End Now
                  </button>
                ) : (
                  <button type="button" className="cb-btn cb-btn-secondary" onClick={() => void act(g.id, "reroll")}>
                    <RefreshCw size={13} /> Reroll
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Starboard Panel
// ---------------------------------------------------------------------------

export function StarboardPanel({ draft, updateDraft, textChannels }: Phase2SharedProps) {
  const sb = draft.plugins.starboard;
  return (
    <>
      <header className="cb-header">
        <div>
          <h1>⭐ Starboard</h1>
          <p>Highlight the server's best messages automatically when they reach a reaction threshold.</p>
        </div>
      </header>
      <div className="cb-card">
        <div className="cb-grid-3">
          <div className="cb-field">
            <label>Starboard Channel</label>
            <select
              className="cb-select"
              value={sb.channelId || ""}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, starboard: { ...p.plugins.starboard, channelId: e.target.value || null } },
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
            <label>Reaction Emoji</label>
            <input
              className="cb-input"
              value={sb.emoji}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, starboard: { ...p.plugins.starboard, emoji: e.target.value || "⭐" } },
                }))
              }
            />
          </div>
          <div className="cb-field">
            <label>Minimum Reactions</label>
            <input
              type="number"
              min={1}
              max={100}
              className="cb-input"
              value={sb.threshold}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, starboard: { ...p.plugins.starboard, threshold: Number(e.target.value) || 3 } },
                }))
              }
            />
          </div>
        </div>
        <div className="cb-check-row">
          <span>Allow members to star their own messages</span>
          <label className="cb-switch">
            <input
              type="checkbox"
              checked={sb.allowSelfStar}
              onChange={(e) =>
                updateDraft((p) => ({
                  ...p,
                  plugins: { ...p.plugins, starboard: { ...p.plugins.starboard, allowSelfStar: e.target.checked } },
                }))
              }
            />
            <span className="cb-switch-track" />
          </label>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 6. Ticketing Panel
// ---------------------------------------------------------------------------

export function TicketingPanel({
  serverId,
  textChannels,
  flash,
  ticketPanels,
  tickets,
  onPanelsChange,
  onTicketsChange,
}: Phase2SharedProps & {
  ticketPanels: TicketPanel[];
  tickets: SupportTicket[];
  onPanelsChange: (next: TicketPanel[]) => void;
  onTicketsChange: (next: SupportTicket[]) => void;
}) {
  const [channelId, setChannelId] = useState(textChannels[0]?.id || "");
  const [title, setTitle] = useState("Support Tickets");
  const [description, setDescription] = useState("Need help from staff? Click the button below to open a ticket.");
  const [buttonLabel, setButtonLabel] = useState("Open Ticket");
  const [welcomeMessage, setWelcomeMessage] = useState("Thanks for reaching out! Describe your issue below and staff will help shortly.");
  const [busy, setBusy] = useState(false);

  async function publishPanel() {
    setBusy(true);
    try {
      const res = await apiFetch<{ ticketPanels: TicketPanel[]; tickets: SupportTicket[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/tickets`,
        {
          method: "POST",
          body: JSON.stringify({ action: "create-panel", channelId, title, description, buttonLabel, welcomeMessage }),
        },
      );
      onPanelsChange(res.ticketPanels);
      onTicketsChange(res.tickets);
      flash("🎫 Ticket panel published!");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not publish panel.", true);
    } finally {
      setBusy(false);
    }
  }

  async function closeTicket(ticketId: string) {
    try {
      const res = await apiFetch<{ tickets: SupportTicket[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/tickets`,
        { method: "POST", body: JSON.stringify({ action: "close-ticket", ticketId }) },
      );
      onTicketsChange(res.tickets);
      flash("Ticket closed.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not close ticket.", true);
    }
  }

  async function deletePanel(panelId: string) {
    try {
      const res = await apiFetch<{ ticketPanels: TicketPanel[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/tickets?panelId=${encodeURIComponent(panelId)}`,
        { method: "DELETE" },
      );
      onPanelsChange(res.ticketPanels);
      flash("Ticket panel removed.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not delete panel.", true);
    }
  }

  return (
    <>
      <header className="cb-header">
        <div>
          <h1>🎫 Ticketing</h1>
          <p>Publish support ticket panels so members can open claimable support threads with one click.</p>
        </div>
      </header>

      <div className="cb-card">
        <h2>Publish Ticket Panel</h2>
        <div className="cb-grid-3">
          <div className="cb-field">
            <label>Channel</label>
            <select className="cb-select" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Select channel…</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
          <div className="cb-field">
            <label>Panel Title</label>
            <input className="cb-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="cb-field">
            <label>Button Label</label>
            <input className="cb-input" value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} />
          </div>
        </div>
        <div className="cb-field">
          <label>Panel Description</label>
          <textarea className="cb-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="cb-field">
          <label>Ticket Welcome Message</label>
          <textarea className="cb-textarea" value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} />
        </div>
        <button type="button" className="cb-btn cb-btn-primary" disabled={busy || !channelId} onClick={() => void publishPanel()}>
          <Send size={14} /> Publish Ticket Panel
        </button>
      </div>

      <div className="cb-card">
        <h2>Tickets ({tickets.length})</h2>
        {tickets.length === 0 ? (
          <p className="cb-card-sub" style={{ marginBottom: 0 }}>No tickets opened yet.</p>
        ) : (
          tickets.map((t) => (
            <div key={t.id} className="cb-row-item" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{t.subject}</strong>{" "}
                <span className="cb-badge">{t.status === "open" ? "🟢 Open" : "🔒 Closed"}</span>
                <div style={{ fontSize: 12.5, color: "#9aa2b8" }}>
                  Opened by {t.openerName} {t.claimerName ? `· Claimed by ${t.claimerName}` : ""} · {t.createdAt.slice(0, 10)}
                </div>
              </div>
              {t.status === "open" && (
                <button type="button" className="cb-btn cb-btn-danger" onClick={() => void closeTicket(t.id)}>
                  Close
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {ticketPanels.length > 0 && (
        <div className="cb-card">
          <h2>Published Panels ({ticketPanels.length})</h2>
          {ticketPanels.map((p) => (
            <div key={p.id} className="cb-row-item" style={{ justifyContent: "space-between" }}>
              <strong>{p.title}</strong>
              <button type="button" className="cb-btn cb-btn-danger" onClick={() => void deletePanel(p.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 7. Server Logs Panel
// ---------------------------------------------------------------------------

export function ServerLogsPanel({ draft, updateDraft, textChannels }: Phase2SharedProps) {
  const lg = draft.plugins.logs;
  const toggles: Array<{ key: keyof typeof lg; label: string }> = [
    { key: "logMessageDelete", label: "Message Deleted" },
    { key: "logMessageEdit", label: "Message Edited (before & after)" },
    { key: "logMemberJoin", label: "Member Joined" },
    { key: "logMemberLeave", label: "Member Left" },
    { key: "logModActions", label: "Moderation Actions" },
  ];

  return (
    <>
      <header className="cb-header">
        <div>
          <h1>📜 Server Logs</h1>
          <p>Stream real-time audit embeds for message edits, deletes, joins, and leaves into a log channel.</p>
        </div>
      </header>
      <div className="cb-card">
        <div className="cb-field">
          <label>Log Channel</label>
          <select
            className="cb-select"
            value={lg.channelId || ""}
            onChange={(e) =>
              updateDraft((p) => ({
                ...p,
                plugins: { ...p.plugins, logs: { ...p.plugins.logs, channelId: e.target.value || null } },
              }))
            }
          >
            <option value="">Select channel…</option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>#{c.name}</option>
            ))}
          </select>
        </div>
        {toggles.map((item) => (
          <div key={item.key} className="cb-check-row">
            <span>{item.label}</span>
            <label className="cb-switch">
              <input
                type="checkbox"
                checked={Boolean(lg[item.key])}
                onChange={(e) =>
                  updateDraft((p) => ({
                    ...p,
                    plugins: { ...p.plugins, logs: { ...p.plugins.logs, [item.key]: e.target.checked } },
                  }))
                }
              />
              <span className="cb-switch-track" />
            </label>
          </div>
        ))}
      </div>
    </>
  );
}
