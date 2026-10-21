"use client";

import { useState } from "react";
import { Download, Upload, Copy, Sparkles } from "lucide-react";
import type { PublicServer } from "@/lib/servers";
import { apiFetch } from "../../lib/client";
import type { Tab } from "./types";

export function ServerTemplateTab({
  tab,
  server,
  onServerUpdated,
  setNotice,
}: {
  tab: Tab;
  server: PublicServer;
  onServerUpdated: () => void;
  setNotice: (msg: string) => void;
}) {
  const [discordBotToken, setDiscordBotToken] = useState("");
  const [discordGuildId, setDiscordGuildId] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [importing, setImporting] = useState(false);

  if (tab !== "template") return null;

  const exportJson = () => {
    const uncategorized = server.channels
      .filter((c) => !c.categoryId)
      .map((c) => ({ name: c.name, kind: c.kind, topic: c.topic }));
    const categories = server.categories.map((cat) => ({
      name: cat.name,
      channels: server.channels
        .filter((c) => c.categoryId === cat.id)
        .map((c) => ({ name: c.name, kind: c.kind, topic: c.topic })),
    }));
    const roles = server.roles.map((r) => ({ name: r.name, color: r.color }));
    const payload = JSON.stringify({ categories, channels: uncategorized, roles }, null, 2);
    void navigator.clipboard?.writeText(payload);
    setJsonInput(payload);
    setNotice("Copied server structure JSON to clipboard!");
  };

  const runImport = async (body: Record<string, unknown>) => {
    setImporting(true);
    try {
      const res = await apiFetch<{
        imported: { categories: number; channels: number; roles: number };
      }>(`/api/servers/${server.id}/import`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onServerUpdated();
      setNotice(
        `Imported ${res.imported.categories} categories, ${res.imported.channels} channels, and ${res.imported.roles} roles!`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="tab-pane space-y-6">
      <div>
        <h1 className="pane-title">Server Templates &amp; Data Import</h1>
        <p className="pane-subtitle">
          Import channels, categories, and roles from a Discord server, apply a starter template, or export/import a portable JSON structure.
        </p>
      </div>

      {/* Starter Templates */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-400" /> Quick Starter Templates
        </h3>
        <p className="text-xs opacity-75">
          Add a pre-built set of categories, channels, and roles to {server.name} in one click.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {[
            { id: "gaming", title: "Gaming Hangout", desc: "Announcements, clips, squad voice rooms & roles" },
            { id: "dnd", title: "D&D Campaign Hub", desc: "Lore forum, session recaps, dice chat & GM rooms" },
            { id: "study", title: "Study & Co-working", desc: "Daily goals, resource forum & quiet focus voice" },
            { id: "community", title: "Public Community", desc: "Welcome & rules, say-hi, looking-for-group, questions & a bug forum" },
          ].map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              disabled={importing}
              onClick={() => void runImport({ mode: "template", templateId: tpl.id })}
              className="p-3 rounded-lg bg-black/25 hover:bg-white/10 border border-white/10 text-left transition-colors"
            >
              <strong className="block text-xs font-semibold text-indigo-300">{tpl.title}</strong>
              <span className="block text-[11px] opacity-75 mt-1">{tpl.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Discord Server Import */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Download size={16} className="text-emerald-400" /> Import from Discord Server
        </h3>
        <p className="text-xs opacity-75">
          Mirrors a Discord server&apos;s categories, text/voice/forum/stage channels, topics, and roles directly into {server.name}.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs opacity-70 mb-1">Discord Server (Guild) ID</label>
            <input
              type="text"
              className="discord-input text-xs w-full"
              placeholder="e.g. 123456789012345678"
              value={discordGuildId}
              onChange={(e) => setDiscordGuildId(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs opacity-70 mb-1">Discord Bot Token</label>
            <input
              type="password"
              className="discord-input text-xs w-full"
              placeholder="Bot token with View Channels permission"
              value={discordBotToken}
              onChange={(e) => setDiscordBotToken(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          className="discord-btn primary-indigo text-xs"
          disabled={importing || !discordGuildId.trim() || !discordBotToken.trim()}
          onClick={() =>
            void runImport({
              mode: "discord",
              guildId: discordGuildId.trim(),
              botToken: discordBotToken.trim(),
            })
          }
        >
          {importing ? "Importing…" : "Import Discord Structure"}
        </button>
      </div>

      {/* Portable JSON Export / Import */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Upload size={16} className="text-sky-400" /> Portable JSON Template
            </h3>
            <p className="text-xs opacity-75">
              Export this server&apos;s layout to JSON or paste a template JSON to import.
            </p>
          </div>
          <button
            type="button"
            className="discord-btn text-xs inline-flex items-center gap-1.5"
            onClick={exportJson}
          >
            <Copy size={13} /> Export Current Layout
          </button>
        </div>
        <textarea
          rows={6}
          className="discord-input font-mono text-xs w-full"
          placeholder={`{
  "categories": [{ "name": "Text Channels", "channels": [{ "name": "welcome", "kind": "text" }] }],
  "roles": [{ "name": "Moderator", "color": "#5865f2" }]
}`}
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
        />
        <button
          type="button"
          className="discord-btn primary-indigo text-xs"
          disabled={importing || !jsonInput.trim()}
          onClick={() => {
            try {
              const parsed = JSON.parse(jsonInput);
              void runImport({ mode: "json", structure: parsed });
            } catch {
              setNotice("Invalid JSON template format.");
            }
          }}
        >
          {importing ? "Importing…" : "Import JSON Template"}
        </button>
      </div>
    </div>
  );
}
