"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/client";
import type { DndSettings } from "@/lib/dnd-rules";

/**
 * Server Settings → Integrations: the server's D&D settings. Which books
 * /spell and /monster read by default, homebrew entries, and the music a
 * battlemap switches the call to when the GM starts or ends combat.
 */
export function DndSettingsPanel({
  serverId,
  onNotice,
  onRequestPrompt,
}: {
  serverId: string;
  onNotice: (text: string) => void;
  onRequestPrompt: (options: {
    title: string;
    message?: string;
    placeholder?: string;
    confirmText?: string;
    onConfirm: (value?: string) => void;
  }) => void;
}) {
  const [settings, setSettings] = useState<DndSettings | null>(null);
  const [combatMusic, setCombatMusic] = useState("");
  const [exploreMusic, setExploreMusic] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DndSettings>(`/api/integrations/dnd/settings?serverId=${encodeURIComponent(serverId)}`)
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        setCombatMusic(data.combatMusic);
        setExploreMusic(data.exploreMusic);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  async function save(change: Record<string, unknown>, done: string) {
    setSaving(true);
    try {
      const data = await apiFetch<DndSettings & { imported?: { added: number; skipped: number } }>(
        "/api/integrations/dnd/settings",
        { method: "POST", body: JSON.stringify({ serverId, ...change }) },
      );
      setSettings(data);
      onNotice(
        data.imported
          ? `Imported ${data.imported.added} homebrew ${data.imported.added === 1 ? "entry" : "entries"}${
              data.imported.skipped ? ` (${data.imported.skipped} without a name or kind skipped)` : ""
            }.`
          : done,
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not save the D&D settings.");
    } finally {
      setSaving(false);
    }
  }

  function importHomebrew() {
    onRequestPrompt({
      title: "Import homebrew",
      message:
        'Paste a JSON list. Each entry needs "name", "kind" (spell, monster, condition, item, feat, race or class) and "description"; "level", "school", "type" and "source" are optional. /spell <name> then finds it.',
      placeholder: '[{ "name": "Sunfire Blade", "kind": "spell", "level": 2, "description": "…" }]',
      confirmText: "Import",
      onConfirm: (value) => {
        if (!value?.trim()) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(value);
        } catch {
          onNotice("That is not valid JSON.");
          return;
        }
        void save({ homebrew: Array.isArray(parsed) ? parsed : [parsed] }, "Homebrew imported.");
      },
    });
  }

  if (!settings) return null;
  const musicChanged = combatMusic !== settings.combatMusic || exploreMusic !== settings.exploreMusic;
  return (
    <section className="dnd-settings">
      <h2>D&amp;D</h2>

      <div className="dnd-settings-row">
        <div>
          <strong>Rules for lookups</strong>
          <p>What /spell and /monster show by default. Adding 2014 or 2024 to a lookup still picks one.</p>
        </div>
        <div className="dnd-settings-toggle" role="group" aria-label="Rules edition">
          {(["2014", "2024"] as const).map((edition) => (
            <button
              key={edition}
              type="button"
              className={`discord-btn ${settings.edition === edition ? "primary-indigo" : "secondary"}`}
              aria-pressed={settings.edition === edition}
              disabled={saving}
              onClick={() => void save({ edition }, `Lookups now use the ${edition} rules.`)}
            >
              {edition === "2014" ? "2014 SRD" : "2024 rules"}
            </button>
          ))}
        </div>
      </div>

      <div className="dnd-settings-row stacked">
        <div>
          <strong>Combat music</strong>
          <p>
            When the GM starts combat on a battlemap (or takes the first turn), the call&apos;s music switches to this, and
            back when combat ends. A playlist link or a search; leave empty to keep the music as it is.
          </p>
        </div>
        <label>
          <span>Combat</span>
          <input value={combatMusic} onChange={(e) => setCombatMusic(e.target.value)} placeholder="e.g. epic battle music" maxLength={300} />
        </label>
        <label>
          <span>Exploration</span>
          <input value={exploreMusic} onChange={(e) => setExploreMusic(e.target.value)} placeholder="e.g. tavern ambience" maxLength={300} />
        </label>
        <button
          type="button"
          className="discord-btn primary-indigo"
          disabled={saving || !musicChanged}
          onClick={() => void save({ combatMusic, exploreMusic }, "Combat music saved.")}
        >
          Save music
        </button>
      </div>

      <div className="dnd-settings-row">
        <div>
          <strong>Homebrew</strong>
          <p>
            {settings.homebrew.length
              ? `${settings.homebrew.length} ${settings.homebrew.length === 1 ? "entry" : "entries"}; lookups find them before the books.`
              : "Your own spells, monsters and items, found by the same lookups."}
          </p>
        </div>
        <div className="dnd-settings-toggle">
          <button type="button" className="discord-btn secondary" disabled={saving} onClick={importHomebrew}>
            Import JSON
          </button>
          {settings.homebrew.length > 0 && (
            <button
              type="button"
              className="discord-btn secondary"
              disabled={saving}
              onClick={() => void save({ clearHomebrew: true }, "Homebrew cleared.")}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
