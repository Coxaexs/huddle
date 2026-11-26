"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Trophy,
  UserPlus,
} from "lucide-react";
import type {
  BirthdayEntry,
  CommunityBotConfig,
  CommunityWarning,
  CustomCommand,
  Giveaway,
  ReactionPanelItem,
  ReactionPanelMode,
  ReactionPanelStyle,
  ReactionRolePanel,
  RecurringTimer,
  SavedEmbed,
  ShopItem,
  SupportTicket,
  TicketPanel,
  WarnEscalationRule,
} from "@/lib/community-bot/types";
import { apiFetch, basePath } from "../../lib/client";
import {
  CustomCommandsPanel,
  EmbedBuilderPanel,
  GiveawaysPanel,
  ServerLogsPanel,
  StarboardPanel,
  TicketingPanel,
  TimersPanel,
} from "./phase2-panels";
import {
  BirthdaysPanel,
  EconomyPanel,
  ServerStatsPanel,
  TempVoicePanel,
} from "./phase3-panels";
import "./dashboard.css";

interface ChannelOpt {
  id: string;
  name: string;
  kind: string;
}

interface RoleOpt {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface MemberOpt {
  id: string;
  username: string;
  displayName: string;
}

interface DashboardPayload {
  server: { id: string; name: string; icon: string; color: string; iconUrl: string | null };
  config: CommunityBotConfig;
  channels: ChannelOpt[];
  roles: RoleOpt[];
  members: MemberOpt[];
  reactionPanels: ReactionRolePanel[];
  warnings: CommunityWarning[];
  customCommands: CustomCommand[];
  savedEmbeds: SavedEmbed[];
  timers: RecurringTimer[];
  giveaways: Giveaway[];
  ticketPanels: TicketPanel[];
  tickets: SupportTicket[];
  shopItems: ShopItem[];
  birthdays: BirthdayEntry[];
  stats: {
    memberCount: number;
    rankedMembers: number;
    totalXp: number;
    totalWarnings: number;
  };
}

type SectionId =
  | "overview"
  | "levels"
  | "welcome"
  | "reaction-roles"
  | "moderation"
  | "custom-commands"
  | "embeds"
  | "timers"
  | "giveaways"
  | "starboard"
  | "ticketing"
  | "logs"
  | "economy"
  | "birthdays"
  | "temp-voice"
  | "server-stats";

export function CommunityBotDashboard({ serverId }: { serverId: string }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [draft, setDraft] = useState<CommunityBotConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<SectionId>("overview");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  // Reaction Role editor state
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [panelChannelId, setPanelChannelId] = useState("");
  const [panelTitle, setPanelTitle] = useState("Pick your roles");
  const [panelDesc, setPanelDesc] = useState("Click a button below to claim or remove a role.");
  const [panelColor, setPanelColor] = useState("#6366f1");
  const [panelMode, setPanelMode] = useState<ReactionPanelMode>("normal");
  const [panelStyle, setPanelStyle] = useState<ReactionPanelStyle>("buttons");
  const [panelItems, setPanelItems] = useState<ReactionPanelItem[]>([]);
  const [panelBusy, setPanelBusy] = useState(false);

  // Manual warn form state
  const [warnUserId, setWarnUserId] = useState("");
  const [warnReason, setWarnReason] = useState("");
  const [warnSearch, setWarnSearch] = useState("");

  const flash = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<DashboardPayload>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot`,
      );
      setData(res);
      setDraft(res.config);
      setDirty(false);
      const firstText = res.channels.find((c) => c.kind === "text" || c.kind === "announcement");
      if (firstText && !panelChannelId) setPanelChannelId(firstText.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Community Bot dashboard.");
    }
  }, [serverId, panelChannelId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDraft(updater: (prev: CommunityBotConfig) => CommunityBotConfig) {
    setDraft((prev) => {
      if (!prev) return prev;
      setDirty(true);
      return updater(prev);
    });
  }

  async function saveChanges() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ config: CommunityBotConfig }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot`,
        {
          method: "PUT",
          body: JSON.stringify({
            enabled: draft.enabled,
            botName: draft.botName,
            botAvatar: draft.botAvatar,
            botColor: draft.botColor,
            plugins: draft.plugins,
          }),
        },
      );
      setDraft(res.config);
      setData((prev) => (prev ? { ...prev, config: res.config } : prev));
      setDirty(false);
      flash("Settings saved!");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not save settings.", true);
    } finally {
      setSaving(false);
    }
  }

  async function resetServerXp() {
    if (!window.confirm("Reset ALL XP and levels for every member in this server? This cannot be undone.")) {
      return;
    }
    try {
      await apiFetch(`/api/servers/${encodeURIComponent(serverId)}/community-bot/xp`, {
        method: "POST",
        body: JSON.stringify({ action: "reset-server" }),
      });
      flash("Server XP has been reset.");
      void load();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not reset XP.", true);
    }
  }

  function loadPanelIntoEditor(panel: ReactionRolePanel) {
    setEditingPanelId(panel.id);
    setPanelChannelId(panel.channelId);
    setPanelTitle(panel.title);
    setPanelDesc(panel.description);
    setPanelColor(panel.color);
    setPanelMode(panel.mode);
    setPanelStyle(panel.style);
    setPanelItems(panel.items);
  }

  function resetPanelEditor() {
    setEditingPanelId(null);
    setPanelTitle("Pick your roles");
    setPanelDesc("Click a button below to claim or remove a role.");
    setPanelColor("#6366f1");
    setPanelMode("normal");
    setPanelStyle("buttons");
    setPanelItems([]);
  }

  async function saveAndPublishPanel(action: "save" | "publish") {
    if (!panelChannelId) {
      flash("Choose a target text channel first.", true);
      return;
    }
    setPanelBusy(true);
    try {
      const res = await apiFetch<{ panels: ReactionRolePanel[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/reaction-panels`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            id: editingPanelId || undefined,
            channelId: panelChannelId,
            title: panelTitle,
            description: panelDesc,
            color: panelColor,
            mode: panelMode,
            style: panelStyle,
            items: panelItems,
          }),
        },
      );
      setData((prev) => (prev ? { ...prev, reactionPanels: res.panels } : prev));
      resetPanelEditor();
      flash(action === "publish" ? "Reaction role panel published to channel!" : "Panel saved.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to save panel.", true);
    } finally {
      setPanelBusy(false);
    }
  }

  async function removePanel(panelId: string) {
    if (!window.confirm("Delete this reaction role panel?")) return;
    try {
      const res = await apiFetch<{ panels: ReactionRolePanel[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/reaction-panels?panelId=${encodeURIComponent(panelId)}`,
        { method: "DELETE" },
      );
      setData((prev) => (prev ? { ...prev, reactionPanels: res.panels } : prev));
      if (editingPanelId === panelId) resetPanelEditor();
      flash("Panel deleted.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to delete panel.", true);
    }
  }

  async function handleIssueWarn() {
    if (!warnUserId) {
      flash("Pick a member to warn.", true);
      return;
    }
    try {
      const res = await apiFetch<{ warnings: CommunityWarning[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/warnings`,
        {
          method: "POST",
          body: JSON.stringify({ userId: warnUserId, reason: warnReason || "No reason provided" }),
        },
      );
      setData((prev) => (prev ? { ...prev, warnings: res.warnings } : prev));
      setWarnReason("");
      flash("Warning issued.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not issue warning.", true);
    }
  }

  async function handleDeleteWarn(warningId: string) {
    try {
      const res = await apiFetch<{ warnings: CommunityWarning[] }>(
        `/api/servers/${encodeURIComponent(serverId)}/community-bot/warnings?warningId=${encodeURIComponent(warningId)}`,
        { method: "DELETE" },
      );
      setData((prev) => (prev ? { ...prev, warnings: res.warnings } : prev));
      flash("Warning removed.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not remove warning.", true);
    }
  }

  if (error) {
    return (
      <div className="cb-lb-page">
        <div className="cb-lb-wrap">
          <div className="cb-card">
            <h2>Community Bot Dashboard</h2>
            <p className="cb-card-sub">{error}</p>
            <a className="cb-btn cb-btn-secondary" href={basePath || "/"}>
              <ArrowLeft size={15} /> Back to Hoffle
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !draft) {
    return (
      <div className="cb-lb-page">
        <div className="cb-lb-wrap">
          <div className="cb-card">Loading dashboard…</div>
        </div>
      </div>
    );
  }

  const textChannels = data.channels.filter((c) => c.kind === "text" || c.kind === "announcement");
  const lbUrl = `${basePath}/leaderboard/${encodeURIComponent(serverId)}`;

  function toggleInList(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  return (
    <div className="cb-shell">
      {toast && (
        <div className={`cb-toast ${toast.isError ? "is-error" : ""}`}>{toast.text}</div>
      )}

      {/* Sidebar */}
      <aside className="cb-sidebar">
        <div className="cb-brand">
          <div className="cb-brand-avatar" style={{ background: draft.botColor }}>
            {draft.botAvatar}
          </div>
          <div className="cb-brand-meta">
            <h2>{draft.botName}</h2>
            <p>{data.server.name}</p>
          </div>
        </div>

        <div className="cb-master-toggle">
          <span>Bot Enabled</span>
          <label className="cb-switch">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) =>
                updateDraft((p) => ({ ...p, enabled: e.target.checked }))
              }
            />
            <span className="cb-switch-track" />
          </label>
        </div>

        <nav className="cb-nav">
          <span className="cb-nav-label">Dashboard</span>
          <button
            type="button"
            className={`cb-nav-btn ${section === "overview" ? "is-active" : ""}`}
            onClick={() => setSection("overview")}
          >
            <Sparkles size={16} /> Plugins Overview
          </button>

          <span className="cb-nav-label">Active Plugins</span>
          <button
            type="button"
            className={`cb-nav-btn ${section === "levels" ? "is-active" : ""}`}
            onClick={() => setSection("levels")}
          >
            <Trophy size={16} /> Levels &amp; XP
            <span className={`cb-nav-dot ${draft.plugins.levels.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "welcome" ? "is-active" : ""}`}
            onClick={() => setSection("welcome")}
          >
            <UserPlus size={16} /> Welcome &amp; Goodbye
            <span className={`cb-nav-dot ${draft.plugins.welcome.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "reaction-roles" ? "is-active" : ""}`}
            onClick={() => setSection("reaction-roles")}
          >
            🎭 Reaction Roles
            <span className={`cb-nav-dot ${draft.plugins.reactionRoles.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "moderation" ? "is-active" : ""}`}
            onClick={() => setSection("moderation")}
          >
            <ShieldAlert size={16} /> Moderator &amp; Warns
            <span className={`cb-nav-dot ${draft.plugins.moderation.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "custom-commands" ? "is-active" : ""}`}
            onClick={() => setSection("custom-commands")}
          >
            ⚡ Custom Commands
            <span className={`cb-nav-dot ${draft.plugins.customCommands.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "embeds" ? "is-active" : ""}`}
            onClick={() => setSection("embeds")}
          >
            🧱 Embed Builder
            <span className={`cb-nav-dot ${draft.plugins.embeds.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "timers" ? "is-active" : ""}`}
            onClick={() => setSection("timers")}
          >
            ⏱️ Timers
            <span className={`cb-nav-dot ${draft.plugins.timers.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "giveaways" ? "is-active" : ""}`}
            onClick={() => setSection("giveaways")}
          >
            🎁 Giveaways
            <span className={`cb-nav-dot ${draft.plugins.giveaways.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "starboard" ? "is-active" : ""}`}
            onClick={() => setSection("starboard")}
          >
            ⭐ Starboard
            <span className={`cb-nav-dot ${draft.plugins.starboard.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "ticketing" ? "is-active" : ""}`}
            onClick={() => setSection("ticketing")}
          >
            🎫 Ticketing
            <span className={`cb-nav-dot ${draft.plugins.ticketing.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "logs" ? "is-active" : ""}`}
            onClick={() => setSection("logs")}
          >
            📜 Server Logs
            <span className={`cb-nav-dot ${draft.plugins.logs.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "economy" ? "is-active" : ""}`}
            onClick={() => setSection("economy")}
          >
            🪙 Economy &amp; Shop
            <span className={`cb-nav-dot ${draft.plugins.economy.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "birthdays" ? "is-active" : ""}`}
            onClick={() => setSection("birthdays")}
          >
            🎂 Birthdays
            <span className={`cb-nav-dot ${draft.plugins.birthdays.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "temp-voice" ? "is-active" : ""}`}
            onClick={() => setSection("temp-voice")}
          >
            🎙️ Temp Voice
            <span className={`cb-nav-dot ${draft.plugins.tempVoice.enabled ? "" : "is-off"}`} />
          </button>
          <button
            type="button"
            className={`cb-nav-btn ${section === "server-stats" ? "is-active" : ""}`}
            onClick={() => setSection("server-stats")}
          >
            📊 Server Stats
            <span className={`cb-nav-dot ${draft.plugins.serverStats.enabled ? "" : "is-off"}`} />
          </button>

          <span className="cb-nav-label">Quick Links</span>
          <a className="cb-nav-btn" href={lbUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Public Leaderboard
          </a>
          <a className="cb-nav-btn" href={basePath || "/"}>
            <ArrowLeft size={15} /> Back to Hoffle
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="cb-main">
        {/* OVERVIEW */}
        {section === "overview" && (
          <>
            <header className="cb-header">
              <div>
                <h1>{draft.botName} Dashboard</h1>
                <p>MEE6-style community management, leveling, welcome cards, reaction roles, and moderation for {data.server.name}.</p>
              </div>
              <a className="cb-btn cb-btn-secondary" href={lbUrl} target="_blank" rel="noreferrer">
                <Trophy size={15} /> View Leaderboard
              </a>
            </header>

            <div className="cb-stats-row">
              <div className="cb-stat-card">
                <span>Members</span>
                <strong>{data.stats.memberCount.toLocaleString()}</strong>
              </div>
              <div className="cb-stat-card">
                <span>Ranked Members</span>
                <strong>{data.stats.rankedMembers.toLocaleString()}</strong>
              </div>
              <div className="cb-stat-card">
                <span>Total Server XP</span>
                <strong>{data.stats.totalXp.toLocaleString()}</strong>
              </div>
              <div className="cb-stat-card">
                <span>Warnings Issued</span>
                <strong>{data.stats.totalWarnings.toLocaleString()}</strong>
              </div>
            </div>

            <div className="cb-card">
              <h2>Bot Identity</h2>
              <p className="cb-card-sub">Customize how your Community Bot appears in chat embeds and announcements.</p>
              <div className="cb-grid-3">
                <div className="cb-field">
                  <label>Bot Name</label>
                  <input
                    className="cb-input"
                    value={draft.botName}
                    maxLength={40}
                    onChange={(e) => updateDraft((p) => ({ ...p, botName: e.target.value }))}
                  />
                </div>
                <div className="cb-field">
                  <label>Emoji Avatar</label>
                  <input
                    className="cb-input"
                    value={draft.botAvatar}
                    maxLength={8}
                    onChange={(e) => updateDraft((p) => ({ ...p, botAvatar: e.target.value }))}
                  />
                </div>
                <div className="cb-field">
                  <label>Accent Color</label>
                  <input
                    type="color"
                    className="cb-input"
                    style={{ height: 39, padding: 4 }}
                    value={draft.botColor}
                    onChange={(e) => updateDraft((p) => ({ ...p, botColor: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <h2 style={{ fontSize: 17, margin: "24px 0 12px" }}>Plugins</h2>
            <div className="cb-plugin-grid">
              {/* Levels */}
              <article className="cb-plugin-card">
                <div className="cb-plugin-head">
                  <div className="cb-plugin-title">
                    <span className="cb-plugin-icon">🏆</span>
                    <h3>Levels &amp; XP</h3>
                  </div>
                  <label className="cb-switch">
                    <input
                      type="checkbox"
                      checked={draft.plugins.levels.enabled}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          plugins: { ...p.plugins, levels: { ...p.plugins.levels, enabled: e.target.checked } },
                        }))
                      }
                    />
                    <span className="cb-switch-track" />
                  </label>
                </div>
                <p className="cb-plugin-desc">
                  Reward active members with XP, level-up messages, automatic role rewards, `/rank`, `/levels`, and a public web leaderboard.
                </p>
                <div className="cb-plugin-foot">
                  <span className="cb-badge">Active</span>
                  <button type="button" className="cb-btn cb-btn-secondary" onClick={() => setSection("levels")}>
                    Configure
                  </button>
                </div>
              </article>

              {/* Welcome */}
              <article className="cb-plugin-card">
                <div className="cb-plugin-head">
                  <div className="cb-plugin-title">
                    <span className="cb-plugin-icon">👋</span>
                    <h3>Welcome &amp; Goodbye</h3>
                  </div>
                  <label className="cb-switch">
                    <input
                      type="checkbox"
                      checked={draft.plugins.welcome.enabled}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          plugins: { ...p.plugins, welcome: { ...p.plugins.welcome, enabled: e.target.checked } },
                        }))
                      }
                    />
                    <span className="cb-switch-track" />
                  </label>
                </div>
                <p className="cb-plugin-desc">
                  Greet newcomers with custom welcome cards, auto-assign starter roles on join, and announce departures.
                </p>
                <div className="cb-plugin-foot">
                  <span className="cb-badge">Active</span>
                  <button type="button" className="cb-btn cb-btn-secondary" onClick={() => setSection("welcome")}>
                    Configure
                  </button>
                </div>
              </article>

              {/* Reaction Roles */}
              <article className="cb-plugin-card">
                <div className="cb-plugin-head">
                  <div className="cb-plugin-title">
                    <span className="cb-plugin-icon">🎭</span>
                    <h3>Reaction Roles</h3>
                  </div>
                  <label className="cb-switch">
                    <input
                      type="checkbox"
                      checked={draft.plugins.reactionRoles.enabled}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          plugins: {
                            ...p.plugins,
                            reactionRoles: { ...p.plugins.reactionRoles, enabled: e.target.checked },
                          },
                        }))
                      }
                    />
                    <span className="cb-switch-track" />
                  </label>
                </div>
                <p className="cb-plugin-desc">
                  Build interactive button or emoji role panels with Normal, Unique (only 1), Reverse, and Drop modes.
                </p>
                <div className="cb-plugin-foot">
                  <span className="cb-badge">{data.reactionPanels.length} panels</span>
                  <button type="button" className="cb-btn cb-btn-secondary" onClick={() => setSection("reaction-roles")}>
                    Configure
                  </button>
                </div>
              </article>

              {/* Moderation */}
              <article className="cb-plugin-card">
                <div className="cb-plugin-head">
                  <div className="cb-plugin-title">
                    <span className="cb-plugin-icon">🛡️</span>
                    <h3>Moderator &amp; Warnings</h3>
                  </div>
                  <label className="cb-switch">
                    <input
                      type="checkbox"
                      checked={draft.plugins.moderation.enabled}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          plugins: { ...p.plugins, moderation: { ...p.plugins.moderation, enabled: e.target.checked } },
                        }))
                      }
                    />
                    <span className="cb-switch-track" />
                  </label>
                </div>
                <p className="cb-plugin-desc">
                  Track member infractions (`/warn`, `/infractions`, `/clear-warns`, `/clear`), mod-log channel, and automatic timeout/kick/ban escalation.
                </p>
                <div className="cb-plugin-foot">
                  <span className="cb-badge">{data.warnings.length} warns</span>
                  <button type="button" className="cb-btn cb-btn-secondary" onClick={() => setSection("moderation")}>
                    Configure
                  </button>
                </div>
              </article>

              {/* Phase 2 Active Plugins */}
              {(
                [
                  {
                    key: "customCommands",
                    sec: "custom-commands",
                    icon: "⚡",
                    name: "Custom Commands",
                    desc: "Create custom !commands with text, embeds, and automatic role actions.",
                    badge: `${data.customCommands.length} cmds`,
                  },
                  {
                    key: "embeds",
                    sec: "embeds",
                    icon: "🧱",
                    name: "Embed Builder",
                    desc: "Visual WYSIWYG embed composer to post and update rich cards in any channel.",
                    badge: `${data.savedEmbeds.length} saved`,
                  },
                  {
                    key: "timers",
                    sec: "timers",
                    icon: "⏱️",
                    name: "Timers",
                    desc: "Schedule recurring announcements and reminders in any channel.",
                    badge: `${data.timers.length} timers`,
                  },
                  {
                    key: "giveaways",
                    sec: "giveaways",
                    icon: "🎁",
                    name: "Giveaways",
                    desc: "Timed giveaways with one-click entry buttons, role gating, and rerolls.",
                    badge: `${data.giveaways.length} hosted`,
                  },
                  {
                    key: "starboard",
                    sec: "starboard",
                    icon: "⭐",
                    name: "Starboard",
                    desc: "Highlight popular messages in a starboard channel when they hit N reactions.",
                    badge: `${draft.plugins.starboard.emoji} ≥ ${draft.plugins.starboard.threshold}`,
                  },
                  {
                    key: "ticketing",
                    sec: "ticketing",
                    icon: "🎫",
                    name: "Ticketing",
                    desc: "Support ticket panels with one-click open, claim, and close threads.",
                    badge: `${data.tickets.filter((t) => t.status === "open").length} open`,
                  },
                  {
                    key: "logs",
                    sec: "logs",
                    icon: "📜",
                    name: "Server Logs",
                    desc: "Stream message edits, deletes, joins, and leaves to a dedicated log channel.",
                    badge: draft.plugins.logs.enabled ? "Active" : "Off",
                  },
                  {
                    key: "economy",
                    sec: "economy",
                    icon: "🪙",
                    name: "Economy & Shop",
                    desc: "Server currency (/daily, /work, /pay, /richest) and a custom Role Shop (/shop, /buy).",
                    badge: `${data.shopItems.length} items`,
                  },
                  {
                    key: "birthdays",
                    sec: "birthdays",
                    icon: "🎂",
                    name: "Birthdays",
                    desc: "Automated birthday announcements and optional birthday role (/birthday MM-DD).",
                    badge: `${data.birthdays.length} saved`,
                  },
                  {
                    key: "tempVoice",
                    sec: "temp-voice",
                    icon: "🎙️",
                    name: "Temp Voice Channels",
                    desc: "Join-to-create personal voice rooms that auto-delete once everyone leaves.",
                    badge: draft.plugins.tempVoice.enabled ? "Active" : "Off",
                  },
                  {
                    key: "serverStats",
                    sec: "server-stats",
                    icon: "📊",
                    name: "Server Stats",
                    desc: "Auto-updating member, online, and channel counter channels.",
                    badge: draft.plugins.serverStats.enabled ? "Active" : "Off",
                  },
                ] as const
              ).map((pl) => (
                <article key={pl.key} className="cb-plugin-card">
                  <div className="cb-plugin-head">
                    <div className="cb-plugin-title">
                      <span className="cb-plugin-icon">{pl.icon}</span>
                      <h3>{pl.name}</h3>
                    </div>
                    <label className="cb-switch">
                      <input
                        type="checkbox"
                        checked={draft.plugins[pl.key].enabled}
                        onChange={(e) =>
                          updateDraft((p) => ({
                            ...p,
                            plugins: {
                              ...p.plugins,
                              [pl.key]: { ...p.plugins[pl.key], enabled: e.target.checked },
                            },
                          }))
                        }
                      />
                      <span className="cb-switch-track" />
                    </label>
                  </div>
                  <p className="cb-plugin-desc">{pl.desc}</p>
                  <div className="cb-plugin-foot">
                    <span className="cb-badge">{pl.badge}</span>
                    <button type="button" className="cb-btn cb-btn-secondary" onClick={() => setSection(pl.sec)}>
                      Configure
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {/* LEVELS & XP */}
        {section === "levels" && (
          <>
            <header className="cb-header">
              <div>
                <h1>🏆 Levels &amp; XP</h1>
                <p>Configure XP gain, level-up announcements, role rewards, and leaderboard appearance.</p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <a className="cb-btn cb-btn-secondary" href={lbUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} /> Leaderboard
                </a>
                <button type="button" className="cb-btn cb-btn-danger" onClick={() => void resetServerXp()}>
                  Reset All XP
                </button>
              </div>
            </header>

            <div className="cb-card">
              <h2>XP Accrual &amp; Rate</h2>
              <p className="cb-card-sub">Every message off cooldown awards random XP between Min and Max, multiplied by the server multiplier.</p>
              <div className="cb-grid-3">
                <div className="cb-field">
                  <label>Min XP per message</label>
                  <input
                    type="number"
                    className="cb-input"
                    min={1}
                    max={500}
                    value={draft.plugins.levels.minXp}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: { ...p.plugins, levels: { ...p.plugins.levels, minXp: Number(e.target.value) || 15 } },
                      }))
                    }
                  />
                </div>
                <div className="cb-field">
                  <label>Max XP per message</label>
                  <input
                    type="number"
                    className="cb-input"
                    min={1}
                    max={1000}
                    value={draft.plugins.levels.maxXp}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: { ...p.plugins, levels: { ...p.plugins.levels, maxXp: Number(e.target.value) || 25 } },
                      }))
                    }
                  />
                </div>
                <div className="cb-field">
                  <label>Cooldown (seconds)</label>
                  <input
                    type="number"
                    className="cb-input"
                    min={5}
                    max={600}
                    value={draft.plugins.levels.cooldownSec}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: { ...p.plugins, levels: { ...p.plugins.levels, cooldownSec: Number(e.target.value) || 60 } },
                      }))
                    }
                  />
                </div>
                <div className="cb-field">
                  <label>XP Multiplier (0.25x – 5x)</label>
                  <input
                    type="number"
                    step={0.25}
                    min={0.25}
                    max={5}
                    className="cb-input"
                    value={draft.plugins.levels.multiplier}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: { ...p.plugins, levels: { ...p.plugins.levels, multiplier: Number(e.target.value) || 1 } },
                      }))
                    }
                  />
                </div>
                <div className="cb-field">
                  <label>Rank Card Accent Color</label>
                  <input
                    type="color"
                    className="cb-input"
                    style={{ height: 39, padding: 4 }}
                    value={draft.plugins.levels.rankCardColor}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: { ...p.plugins, levels: { ...p.plugins.levels, rankCardColor: e.target.value } },
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="cb-card">
              <h2>Level-Up Announcements</h2>
              <p className="cb-card-sub">Variables: <code>{"{user}"}</code>, <code>{"{username}"}</code>, <code>{"{level}"}</code>, <code>{"{xp}"}</code>, <code>{"{server}"}</code></p>
              <div className="cb-grid-2">
                <div className="cb-field">
                  <label>Announcement Mode</label>
                  <select
                    className="cb-select"
                    value={draft.plugins.levels.announceMode}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: {
                          ...p.plugins,
                          levels: { ...p.plugins.levels, announceMode: e.target.value as CommunityBotConfig["plugins"]["levels"]["announceMode"] },
                        },
                      }))
                    }
                  >
                    <option value="current">Current channel</option>
                    <option value="channel">Specific channel</option>
                    <option value="off">Disabled (silent)</option>
                  </select>
                </div>
                {draft.plugins.levels.announceMode === "channel" && (
                  <div className="cb-field">
                    <label>Announcement Channel</label>
                    <select
                      className="cb-select"
                      value={draft.plugins.levels.announceChannelId || ""}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          plugins: {
                            ...p.plugins,
                            levels: { ...p.plugins.levels, announceChannelId: e.target.value || null },
                          },
                        }))
                      }
                    >
                      <option value="">Select channel…</option>
                      {textChannels.map((c) => (
                        <option key={c.id} value={c.id}>#{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="cb-field">
                <label>Level-Up Message</label>
                <textarea
                  className="cb-textarea"
                  value={draft.plugins.levels.levelUpMessage}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      plugins: { ...p.plugins, levels: { ...p.plugins.levels, levelUpMessage: e.target.value } },
                    }))
                  }
                />
              </div>
            </div>

            <div className="cb-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <h2>Role Rewards</h2>
                  <p className="cb-card-sub" style={{ marginBottom: 0 }}>Automatically grant roles when members reach a target level.</p>
                </div>
                <button
                  type="button"
                  className="cb-btn cb-btn-secondary"
                  disabled={!data.roles.length}
                  onClick={() =>
                    updateDraft((p) => ({
                      ...p,
                      plugins: {
                        ...p.plugins,
                        levels: {
                          ...p.plugins.levels,
                          roleRewards: [
                            ...p.plugins.levels.roleRewards,
                            { level: 5, roleId: data.roles[0]?.id || "" },
                          ],
                        },
                      },
                    }))
                  }
                >
                  <Plus size={14} /> Add Reward
                </button>
              </div>

              <div className="cb-check-row" style={{ marginBottom: 12 }}>
                <span>Stack role rewards (keep previous level roles instead of replacing them)</span>
                <label className="cb-switch">
                  <input
                    type="checkbox"
                    checked={draft.plugins.levels.stackRoleRewards}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: { ...p.plugins, levels: { ...p.plugins.levels, stackRoleRewards: e.target.checked } },
                      }))
                    }
                  />
                  <span className="cb-switch-track" />
                </label>
              </div>

              {draft.plugins.levels.roleRewards.map((rr, idx) => (
                <div key={idx} className="cb-row-item">
                  <span style={{ fontSize: 13 }}>At Level</span>
                  <input
                    type="number"
                    className="cb-input"
                    style={{ width: 84 }}
                    min={1}
                    max={500}
                    value={rr.level}
                    onChange={(e) =>
                      updateDraft((p) => {
                        const next = [...p.plugins.levels.roleRewards];
                        next[idx] = { ...next[idx], level: Number(e.target.value) || 1 };
                        return { ...p, plugins: { ...p.plugins, levels: { ...p.plugins.levels, roleRewards: next } } };
                      })
                    }
                  />
                  <span style={{ fontSize: 13 }}>grant</span>
                  <select
                    className="cb-select"
                    style={{ flex: 1, minWidth: 160 }}
                    value={rr.roleId}
                    onChange={(e) =>
                      updateDraft((p) => {
                        const next = [...p.plugins.levels.roleRewards];
                        next[idx] = { ...next[idx], roleId: e.target.value };
                        return { ...p, plugins: { ...p.plugins, levels: { ...p.plugins.levels, roleRewards: next } } };
                      })
                    }
                  >
                    {data.roles.map((r) => (
                      <option key={r.id} value={r.id}>@{r.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="cb-btn cb-btn-danger"
                    onClick={() =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: {
                          ...p.plugins,
                          levels: {
                            ...p.plugins.levels,
                            roleRewards: p.plugins.levels.roleRewards.filter((_, i) => i !== idx),
                          },
                        },
                      }))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="cb-card">
              <h2>No-XP Channels &amp; Roles</h2>
              <p className="cb-card-sub">Click channels or roles to exclude them from earning XP.</p>
              <div className="cb-field">
                <label>Ignored Channels</label>
                <div className="cb-chips">
                  {textChannels.map((c) => {
                    const sel = draft.plugins.levels.ignoredChannelIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`cb-chip ${sel ? "is-selected" : ""}`}
                        onClick={() =>
                          updateDraft((p) => ({
                            ...p,
                            plugins: {
                              ...p.plugins,
                              levels: {
                                ...p.plugins.levels,
                                ignoredChannelIds: toggleInList(p.plugins.levels.ignoredChannelIds, c.id),
                              },
                            },
                          }))
                        }
                      >
                        #{c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="cb-field" style={{ marginTop: 14 }}>
                <label>Ignored Roles</label>
                <div className="cb-chips">
                  {data.roles.map((r) => {
                    const sel = draft.plugins.levels.ignoredRoleIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`cb-chip ${sel ? "is-selected" : ""}`}
                        onClick={() =>
                          updateDraft((p) => ({
                            ...p,
                            plugins: {
                              ...p.plugins,
                              levels: {
                                ...p.plugins.levels,
                                ignoredRoleIds: toggleInList(p.plugins.levels.ignoredRoleIds, r.id),
                              },
                            },
                          }))
                        }
                      >
                        <span style={{ color: r.color || "#a5b4fc" }}>●</span> {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* WELCOME & GOODBYE */}
        {section === "welcome" && (
          <>
            <header className="cb-header">
              <div>
                <h1>👋 Welcome, Goodbye &amp; Auto-Roles</h1>
                <p>Greet new members with custom messages, auto-assign roles on join, and announce departures.</p>
              </div>
            </header>

            <div className="cb-card">
              <h2>Welcome Message</h2>
              <p className="cb-card-sub">Variables: <code>{"{user}"}</code>, <code>{"{username}"}</code>, <code>{"{server}"}</code>, <code>{"{memberCount}"}</code></p>
              <div className="cb-grid-2">
                <div className="cb-field">
                  <label>Welcome Channel</label>
                  <select
                    className="cb-select"
                    value={draft.plugins.welcome.joinChannelId || ""}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: { ...p.plugins, welcome: { ...p.plugins.welcome, joinChannelId: e.target.value || null } },
                      }))
                    }
                  >
                    <option value="">Disabled (no channel message)</option>
                    {textChannels.map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="cb-field">
                  <label>Embed Card Title</label>
                  <input
                    className="cb-input"
                    value={draft.plugins.welcome.joinBannerText}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: { ...p.plugins, welcome: { ...p.plugins.welcome, joinBannerText: e.target.value } },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="cb-field">
                <label>Welcome Message Text</label>
                <textarea
                  className="cb-textarea"
                  value={draft.plugins.welcome.joinMessage}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      plugins: { ...p.plugins, welcome: { ...p.plugins.welcome, joinMessage: e.target.value } },
                    }))
                  }
                />
              </div>

              <div className="cb-grid-2">
                <div className="cb-check-row">
                  <span>Send as rich embed card</span>
                  <label className="cb-switch">
                    <input
                      type="checkbox"
                      checked={draft.plugins.welcome.joinUseEmbed}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          plugins: { ...p.plugins, welcome: { ...p.plugins.welcome, joinUseEmbed: e.target.checked } },
                        }))
                      }
                    />
                    <span className="cb-switch-track" />
                  </label>
                </div>
                <div className="cb-field">
                  <label>Embed Accent Color</label>
                  <input
                    type="color"
                    className="cb-input"
                    style={{ height: 39, padding: 4 }}
                    value={draft.plugins.welcome.joinEmbedColor}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: { ...p.plugins, welcome: { ...p.plugins.welcome, joinEmbedColor: e.target.value } },
                      }))
                    }
                  />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, color: "#8f98b0", display: "block", marginBottom: 6 }}>Live Preview</label>
                <div
                  className="cb-preview-embed"
                  style={{ borderLeftColor: draft.plugins.welcome.joinEmbedColor }}
                >
                  {draft.plugins.welcome.joinUseEmbed && (
                    <h4>{draft.plugins.welcome.joinBannerText || `Welcome to ${data.server.name}!`}</h4>
                  )}
                  <p>
                    {draft.plugins.welcome.joinMessage
                      .replace(/\{user\}/g, "@alex")
                      .replace(/\{username\}/g, "Alex")
                      .replace(/\{server\}/g, data.server.name)
                      .replace(/\{memberCount\}/g, String(data.stats.memberCount + 1))}
                  </p>
                </div>
              </div>
            </div>

            <div className="cb-card">
              <h2>Auto-Roles on Join</h2>
              <p className="cb-card-sub">Automatically give these roles to every member who joins the server.</p>
              <div className="cb-chips">
                {data.roles.length === 0 && <span className="cb-card-sub">Create roles in Server Settings → Roles first.</span>}
                {data.roles.map((r) => {
                  const sel = draft.plugins.welcome.autoRoleIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`cb-chip ${sel ? "is-selected" : ""}`}
                      onClick={() =>
                        updateDraft((p) => ({
                          ...p,
                          plugins: {
                            ...p.plugins,
                            welcome: {
                              ...p.plugins.welcome,
                              autoRoleIds: toggleInList(p.plugins.welcome.autoRoleIds, r.id),
                            },
                          },
                        }))
                      }
                    >
                      <span style={{ color: r.color || "#a5b4fc" }}>●</span> {r.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="cb-card">
              <div className="cb-check-row" style={{ paddingTop: 0 }}>
                <div>
                  <h2>Goodbye Message</h2>
                  <p className="cb-card-sub" style={{ marginBottom: 0 }}>Post a message when a member leaves the server.</p>
                </div>
                <label className="cb-switch">
                  <input
                    type="checkbox"
                    checked={draft.plugins.welcome.leaveEnabled}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: { ...p.plugins, welcome: { ...p.plugins.welcome, leaveEnabled: e.target.checked } },
                      }))
                    }
                  />
                  <span className="cb-switch-track" />
                </label>
              </div>

              {draft.plugins.welcome.leaveEnabled && (
                <div style={{ marginTop: 14 }}>
                  <div className="cb-field">
                    <label>Goodbye Channel</label>
                    <select
                      className="cb-select"
                      value={draft.plugins.welcome.leaveChannelId || ""}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          plugins: { ...p.plugins, welcome: { ...p.plugins.welcome, leaveChannelId: e.target.value || null } },
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
                    <label>Goodbye Text</label>
                    <textarea
                      className="cb-textarea"
                      value={draft.plugins.welcome.leaveMessage}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          plugins: { ...p.plugins, welcome: { ...p.plugins.welcome, leaveMessage: e.target.value } },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* REACTION ROLES */}
        {section === "reaction-roles" && (
          <>
            <header className="cb-header">
              <div>
                <h1>🎭 Reaction Roles</h1>
                <p>Create button or emoji self-role panels and publish them straight into any channel.</p>
              </div>
              {editingPanelId && (
                <button type="button" className="cb-btn cb-btn-secondary" onClick={resetPanelEditor}>
                  New Panel
                </button>
              )}
            </header>

            <div className="cb-card">
              <h2>{editingPanelId ? "Edit Reaction Role Panel" : "Create Reaction Role Panel"}</h2>
              <p className="cb-card-sub">Members click buttons or emoji reactions on the posted message to toggle roles.</p>

              <div className="cb-grid-3">
                <div className="cb-field">
                  <label>Target Channel</label>
                  <select
                    className="cb-select"
                    value={panelChannelId}
                    onChange={(e) => setPanelChannelId(e.target.value)}
                  >
                    <option value="">Select channel…</option>
                    {textChannels.map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="cb-field">
                  <label>Mode</label>
                  <select
                    className="cb-select"
                    value={panelMode}
                    onChange={(e) => setPanelMode(e.target.value as ReactionPanelMode)}
                  >
                    <option value="normal">Normal (toggle any)</option>
                    <option value="unique">Unique (only 1 role per panel)</option>
                    <option value="reverse">Reverse (removes on click)</option>
                    <option value="drop">Drop (remove-only)</option>
                  </select>
                </div>
                <div className="cb-field">
                  <label>Interaction Style</label>
                  <select
                    className="cb-select"
                    value={panelStyle}
                    onChange={(e) => setPanelStyle(e.target.value as ReactionPanelStyle)}
                  >
                    <option value="buttons">Buttons (recommended)</option>
                    <option value="reactions">Emoji Reactions</option>
                  </select>
                </div>
              </div>

              <div className="cb-grid-2">
                <div className="cb-field">
                  <label>Panel Title</label>
                  <input
                    className="cb-input"
                    value={panelTitle}
                    onChange={(e) => setPanelTitle(e.target.value)}
                  />
                </div>
                <div className="cb-field">
                  <label>Embed Color</label>
                  <input
                    type="color"
                    className="cb-input"
                    style={{ height: 39, padding: 4 }}
                    value={panelColor}
                    onChange={(e) => setPanelColor(e.target.value)}
                  />
                </div>
              </div>

              <div className="cb-field">
                <label>Description</label>
                <textarea
                  className="cb-textarea"
                  value={panelDesc}
                  onChange={(e) => setPanelDesc(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 8px" }}>
                <strong style={{ fontSize: 13.5 }}>Role Options ({panelItems.length}/25)</strong>
                <button
                  type="button"
                  className="cb-btn cb-btn-secondary"
                  disabled={!data.roles.length || panelItems.length >= 25}
                  onClick={() =>
                    setPanelItems((prev) => [
                      ...prev,
                      {
                        id: `rr_${Date.now().toString(36)}`,
                        roleId: data.roles[0]?.id || "",
                        label: data.roles[0]?.name || "Role",
                        emoji: "✨",
                        buttonStyle: 2,
                      },
                    ])
                  }
                >
                  <Plus size={14} /> Add Role Option
                </button>
              </div>

              {panelItems.map((item, idx) => (
                <div key={item.id} className="cb-row-item">
                  <input
                    className="cb-input"
                    style={{ width: 64 }}
                    placeholder="Emoji"
                    value={item.emoji}
                    onChange={(e) =>
                      setPanelItems((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, emoji: e.target.value } : x)),
                      )
                    }
                  />
                  <input
                    className="cb-input"
                    style={{ flex: 1, minWidth: 120 }}
                    placeholder="Button label"
                    value={item.label}
                    onChange={(e) =>
                      setPanelItems((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)),
                      )
                    }
                  />
                  <select
                    className="cb-select"
                    style={{ flex: 1, minWidth: 140 }}
                    value={item.roleId}
                    onChange={(e) =>
                      setPanelItems((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, roleId: e.target.value } : x)),
                      )
                    }
                  >
                    {data.roles.map((r) => (
                      <option key={r.id} value={r.id}>@{r.name}</option>
                    ))}
                  </select>
                  {panelStyle === "buttons" && (
                    <select
                      className="cb-select"
                      style={{ width: 115 }}
                      value={item.buttonStyle}
                      onChange={(e) =>
                        setPanelItems((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, buttonStyle: Number(e.target.value) as 1 | 2 | 3 | 4 } : x,
                          ),
                        )
                      }
                    >
                      <option value={1}>Blurple</option>
                      <option value={2}>Gray</option>
                      <option value={3}>Green</option>
                      <option value={4}>Red</option>
                    </select>
                  )}
                  <button
                    type="button"
                    className="cb-btn cb-btn-danger"
                    onClick={() => setPanelItems((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="cb-btn cb-btn-primary"
                  disabled={panelBusy || panelItems.length === 0}
                  onClick={() => void saveAndPublishPanel("publish")}
                >
                  <Send size={14} /> {editingPanelId ? "Save & Update Message" : "Publish to Channel"}
                </button>
                <button
                  type="button"
                  className="cb-btn cb-btn-secondary"
                  disabled={panelBusy}
                  onClick={() => void saveAndPublishPanel("save")}
                >
                  Save Draft
                </button>
              </div>
            </div>

            <div className="cb-card">
              <h2>Existing Panels ({data.reactionPanels.length})</h2>
              {data.reactionPanels.length === 0 ? (
                <p className="cb-card-sub" style={{ marginBottom: 0 }}>No reaction role panels created yet.</p>
              ) : (
                data.reactionPanels.map((p) => {
                  const ch = data.channels.find((c) => c.id === p.channelId);
                  return (
                    <div key={p.id} className="cb-row-item" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>{p.title}</strong>
                        <div style={{ fontSize: 12.5, color: "#9aa2b8" }}>
                          #{ch?.name || p.channelId} · {p.mode} · {p.style} · {p.items.length} roles ·{" "}
                          {p.messageId ? "Published" : "Draft"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="cb-btn cb-btn-secondary" onClick={() => loadPanelIntoEditor(p)}>
                          Edit
                        </button>
                        <button type="button" className="cb-btn cb-btn-danger" onClick={() => void removePanel(p.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* MODERATION & WARNINGS */}
        {section === "moderation" && (
          <>
            <header className="cb-header">
              <div>
                <h1>🛡️ Moderator &amp; Warnings</h1>
                <p>Configure mod-log output, automatic warning escalation, and review member infractions.</p>
              </div>
            </header>

            <div className="cb-card">
              <h2>Moderation Settings</h2>
              <div className="cb-field">
                <label>Mod-Log Channel</label>
                <select
                  className="cb-select"
                  value={draft.plugins.moderation.modLogChannelId || ""}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      plugins: {
                        ...p.plugins,
                        moderation: { ...p.plugins.moderation, modLogChannelId: e.target.value || null },
                      },
                    }))
                  }
                >
                  <option value="">Disabled</option>
                  {textChannels.map((c) => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 8px" }}>
                <div>
                  <strong style={{ fontSize: 14 }}>Auto-Escalation Rules</strong>
                  <p className="cb-card-sub" style={{ marginBottom: 0 }}>Automatically timeout, kick, or ban when a member reaches X warnings.</p>
                </div>
                <button
                  type="button"
                  className="cb-btn cb-btn-secondary"
                  onClick={() =>
                    updateDraft((p) => ({
                      ...p,
                      plugins: {
                        ...p.plugins,
                        moderation: {
                          ...p.plugins.moderation,
                          escalations: [
                            ...p.plugins.moderation.escalations,
                            {
                              warns: (p.plugins.moderation.escalations.at(-1)?.warns ?? 2) + 1,
                              action: "timeout",
                              durationMin: 60,
                            },
                          ],
                        },
                      },
                    }))
                  }
                >
                  <Plus size={14} /> Add Rule
                </button>
              </div>

              {draft.plugins.moderation.escalations.map((rule, idx) => (
                <div key={idx} className="cb-row-item">
                  <span style={{ fontSize: 13 }}>At</span>
                  <input
                    type="number"
                    className="cb-input"
                    style={{ width: 72 }}
                    min={1}
                    max={50}
                    value={rule.warns}
                    onChange={(e) =>
                      updateDraft((p) => {
                        const next = [...p.plugins.moderation.escalations];
                        next[idx] = { ...next[idx], warns: Number(e.target.value) || 1 };
                        return { ...p, plugins: { ...p.plugins, moderation: { ...p.plugins.moderation, escalations: next } } };
                      })
                    }
                  />
                  <span style={{ fontSize: 13 }}>warnings →</span>
                  <select
                    className="cb-select"
                    style={{ width: 130 }}
                    value={rule.action}
                    onChange={(e) =>
                      updateDraft((p) => {
                        const next = [...p.plugins.moderation.escalations];
                        const action = e.target.value as WarnEscalationRule["action"];
                        next[idx] = {
                          ...next[idx],
                          action,
                          durationMin: action === "timeout" ? next[idx].durationMin ?? 30 : undefined,
                        };
                        return { ...p, plugins: { ...p.plugins, moderation: { ...p.plugins.moderation, escalations: next } } };
                      })
                    }
                  >
                    <option value="timeout">Timeout</option>
                    <option value="kick">Kick</option>
                    <option value="ban">Ban</option>
                  </select>
                  {rule.action === "timeout" && (
                    <>
                      <input
                        type="number"
                        className="cb-input"
                        style={{ width: 88 }}
                        min={1}
                        max={40320}
                        value={rule.durationMin ?? 30}
                        onChange={(e) =>
                          updateDraft((p) => {
                            const next = [...p.plugins.moderation.escalations];
                            next[idx] = { ...next[idx], durationMin: Number(e.target.value) || 30 };
                            return { ...p, plugins: { ...p.plugins, moderation: { ...p.plugins.moderation, escalations: next } } };
                          })
                        }
                      />
                      <span style={{ fontSize: 13 }}>minutes</span>
                    </>
                  )}
                  <button
                    type="button"
                    className="cb-btn cb-btn-danger"
                    style={{ marginLeft: "auto" }}
                    onClick={() =>
                      updateDraft((p) => ({
                        ...p,
                        plugins: {
                          ...p.plugins,
                          moderation: {
                            ...p.plugins.moderation,
                            escalations: p.plugins.moderation.escalations.filter((_, i) => i !== idx),
                          },
                        },
                      }))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="cb-card">
              <h2>Issue Warning</h2>
              <div className="cb-row-item">
                <select
                  className="cb-select"
                  style={{ flex: 1, minWidth: 160 }}
                  value={warnUserId}
                  onChange={(e) => setWarnUserId(e.target.value)}
                >
                  <option value="">Select member…</option>
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>{m.displayName} (@{m.username})</option>
                  ))}
                </select>
                <input
                  className="cb-input"
                  style={{ flex: 2, minWidth: 200 }}
                  placeholder="Reason for warning…"
                  value={warnReason}
                  onChange={(e) => setWarnReason(e.target.value)}
                />
                <button type="button" className="cb-btn cb-btn-primary" onClick={() => void handleIssueWarn()}>
                  Warn
                </button>
              </div>
            </div>

            <div className="cb-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0 }}>Infractions Log ({data.warnings.length})</h2>
                <input
                  className="cb-input"
                  style={{ width: 220 }}
                  placeholder="Filter by member or reason…"
                  value={warnSearch}
                  onChange={(e) => setWarnSearch(e.target.value)}
                />
              </div>
              {data.warnings
                .filter((w) => {
                  const q = warnSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    (w.displayName || "").toLowerCase().includes(q) ||
                    (w.username || "").toLowerCase().includes(q) ||
                    w.reason.toLowerCase().includes(q)
                  );
                })
                .map((w) => (
                  <div key={w.id} className="cb-row-item" style={{ justifyContent: "space-between" }}>
                    <div>
                      <strong>{w.displayName}</strong>{" "}
                      <span style={{ color: "#9aa2b8", fontSize: 12.5 }}>
                        by {w.moderatorName} · {w.createdAt.slice(0, 10)}
                      </span>
                      <div style={{ fontSize: 13.5, marginTop: 2 }}>{w.reason}</div>
                    </div>
                    <button
                      type="button"
                      className="cb-btn cb-btn-danger"
                      onClick={() => void handleDeleteWarn(w.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              {data.warnings.length === 0 && (
                <p className="cb-card-sub" style={{ marginBottom: 0 }}>No warnings recorded in this server yet.</p>
              )}
            </div>
          </>
        )}

        {/* PHASE 2 PANELS */}
        {section === "custom-commands" && (
          <CustomCommandsPanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            textChannels={textChannels}
            roles={data.roles}
            flash={flash}
            commands={data.customCommands}
            onChange={(customCommands) => setData((p) => (p ? { ...p, customCommands } : p))}
          />
        )}
        {section === "embeds" && (
          <EmbedBuilderPanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            textChannels={textChannels}
            roles={data.roles}
            flash={flash}
            savedEmbeds={data.savedEmbeds}
            onChange={(savedEmbeds) => setData((p) => (p ? { ...p, savedEmbeds } : p))}
          />
        )}
        {section === "timers" && (
          <TimersPanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            textChannels={textChannels}
            roles={data.roles}
            flash={flash}
            timers={data.timers}
            onChange={(timers) => setData((p) => (p ? { ...p, timers } : p))}
          />
        )}
        {section === "giveaways" && (
          <GiveawaysPanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            textChannels={textChannels}
            roles={data.roles}
            flash={flash}
            giveaways={data.giveaways}
            onChange={(giveaways) => setData((p) => (p ? { ...p, giveaways } : p))}
          />
        )}
        {section === "starboard" && (
          <StarboardPanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            textChannels={textChannels}
            roles={data.roles}
            flash={flash}
          />
        )}
        {section === "ticketing" && (
          <TicketingPanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            textChannels={textChannels}
            roles={data.roles}
            flash={flash}
            ticketPanels={data.ticketPanels}
            tickets={data.tickets}
            onPanelsChange={(ticketPanels) => setData((p) => (p ? { ...p, ticketPanels } : p))}
            onTicketsChange={(tickets) => setData((p) => (p ? { ...p, tickets } : p))}
          />
        )}
        {section === "logs" && (
          <ServerLogsPanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            textChannels={textChannels}
            roles={data.roles}
            flash={flash}
          />
        )}

        {/* PHASE 3 PANELS */}
        {section === "economy" && (
          <EconomyPanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            allChannels={data.channels}
            roles={data.roles}
            flash={flash}
            shopItems={data.shopItems}
            onShopChange={(shopItems) => setData((p) => (p ? { ...p, shopItems } : p))}
          />
        )}
        {section === "birthdays" && (
          <BirthdaysPanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            allChannels={data.channels}
            roles={data.roles}
            flash={flash}
            birthdays={data.birthdays}
          />
        )}
        {section === "temp-voice" && (
          <TempVoicePanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            allChannels={data.channels}
            roles={data.roles}
            flash={flash}
          />
        )}
        {section === "server-stats" && (
          <ServerStatsPanel
            serverId={serverId}
            draft={draft}
            updateDraft={updateDraft}
            allChannels={data.channels}
            roles={data.roles}
            flash={flash}
          />
        )}
      </main>

      {/* Sticky Unsaved Changes Bar */}
      {dirty && (
        <div className="cb-save-bar">
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>You have unsaved changes</span>
          <button
            type="button"
            className="cb-btn cb-btn-secondary"
            disabled={saving}
            onClick={() => {
              setDraft(data.config);
              setDirty(false);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="cb-btn cb-btn-primary"
            disabled={saving}
            onClick={() => void saveChanges()}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
