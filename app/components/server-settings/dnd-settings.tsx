"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/client";
import { useI18n } from "../../lib/i18n-context";
import type { MessageKey } from "@/lib/i18n";
import type { DndSettings } from "@/lib/dnd-rules";
import type { PublicRole } from "@/lib/servers";
import { GAME_SYSTEM_EVENT } from "../../lib/game-system";

/**
 * Server Settings → Integrations: the server's tabletop settings. Which game
 * the table plays (D&D 5e or Vampire: The Masquerade V5), which books
 * /spell and /monster read by default, homebrew entries, and the music a
 * battlemap switches the call to when the GM starts or ends combat.
 */
export function DndSettingsPanel({
  serverId,
  roles = [],
  onNotice,
  onRequestPrompt,
}: {
  serverId: string;
  roles?: PublicRole[];
  onNotice: (text: string) => void;
  onRequestPrompt: (options: {
    title: string;
    message?: string;
    placeholder?: string;
    confirmText?: string;
    onConfirm: (value?: string) => void;
  }) => void;
}) {
  const { t } = useI18n();
  const tk = (key: string, vars?: Record<string, string | number>) => t(key as MessageKey, vars);
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
      // An open tabletop in this tab switches sheets at once.
      window.dispatchEvent(new CustomEvent(GAME_SYSTEM_EVENT, { detail: { serverId, system: data.system } }));
      onNotice(
        data.imported
          ? data.imported.skipped
            ? tk("intg.dnd.importedSkipped", { added: data.imported.added, skipped: data.imported.skipped })
            : data.imported.added === 1
              ? tk("intg.dnd.importedOne")
              : tk("intg.dnd.imported", { added: data.imported.added })
          : done,
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : tk("intg.dnd.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function importHomebrew() {
    onRequestPrompt({
      title: tk("intg.dnd.importTitle"),
      message: tk("intg.dnd.importBody"),
      placeholder: '[{ "name": "Sunfire Blade", "kind": "spell", "level": 2, "description": "…" }]',
      confirmText: tk("intg.dnd.import"),
      onConfirm: (value) => {
        if (!value?.trim()) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(value);
        } catch {
          onNotice(tk("intg.dnd.badJson"));
          return;
        }
        void save({ homebrew: Array.isArray(parsed) ? parsed : [parsed] }, tk("intg.dnd.importDone"));
      },
    });
  }

  if (!settings) return null;
  const musicChanged = combatMusic !== settings.combatMusic || exploreMusic !== settings.exploreMusic;
  return (
    <section className="dnd-settings">
      <h2>{tk("intg.dnd.title")}</h2>

      <div className="dnd-settings-row">
        <div>
          <strong>{tk("intg.dnd.system")}</strong>
          <p>{tk("intg.dnd.systemDesc")}</p>
        </div>
        <div className="dnd-settings-toggle" role="group" aria-label={tk("intg.dnd.system")}>
          {(["dnd5e", "vtm5"] as const).map((system) => (
            <button
              key={system}
              type="button"
              className={`discord-btn ${settings.system === system ? "primary-indigo" : "secondary"}`}
              aria-pressed={settings.system === system}
              disabled={saving}
              onClick={() => void save({ system }, system === "vtm5" ? tk("intg.dnd.nowVtm") : tk("intg.dnd.nowDnd"))}
            >
              {system === "dnd5e" ? "D&D 5e" : "Vampire V5"}
            </button>
          ))}
        </div>
      </div>

      <div className="dnd-settings-row">
        <div>
          <strong>{tk("intg.dnd.gmRole")}</strong>
          <p>{tk("intg.dnd.gmRoleDesc")}</p>
        </div>
        <div className="dnd-settings-toggle">
          <select
            className="discord-input text-xs"
            aria-label={tk("intg.dnd.gmRole")}
            disabled={saving}
            value={settings.gmRoleId || ""}
            onChange={(e) => void save({ gmRoleId: e.target.value || null }, tk("intg.dnd.gmRoleSaved"))}
          >
            <option value="">{tk("intg.dnd.gmRoleDefault")}</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                @{role.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="dnd-settings-row">
        <div>
          <strong>{tk("intg.dnd.rules")}</strong>
          <p>{tk("intg.dnd.rulesDesc")}</p>
        </div>
        <div className="dnd-settings-toggle" role="group" aria-label={tk("intg.dnd.rulesEdition")}>
          {(["2014", "2024"] as const).map((edition) => (
            <button
              key={edition}
              type="button"
              className={`discord-btn ${settings.edition === edition ? "primary-indigo" : "secondary"}`}
              aria-pressed={settings.edition === edition}
              disabled={saving}
              onClick={() => void save({ edition }, tk("intg.dnd.rulesNow", { edition }))}
            >
              {edition === "2014" ? tk("intg.dnd.srd2014") : tk("intg.dnd.rules2024")}
            </button>
          ))}
        </div>
      </div>

      <div className="dnd-settings-row stacked">
        <div>
          <strong>{tk("intg.dnd.music")}</strong>
          <p>{tk("intg.dnd.musicDesc")}</p>
        </div>
        <label>
          <span>{tk("intg.dnd.combat")}</span>
          <input value={combatMusic} onChange={(e) => setCombatMusic(e.target.value)} placeholder={tk("intg.dnd.combatPh")} maxLength={300} />
        </label>
        <label>
          <span>{tk("intg.dnd.explore")}</span>
          <input value={exploreMusic} onChange={(e) => setExploreMusic(e.target.value)} placeholder={tk("intg.dnd.explorePh")} maxLength={300} />
        </label>
        <button
          type="button"
          className="discord-btn primary-indigo"
          disabled={saving || !musicChanged}
          onClick={() => void save({ combatMusic, exploreMusic }, tk("intg.dnd.musicSaved"))}
        >
          {tk("intg.dnd.saveMusic")}
        </button>
      </div>

      <div className="dnd-settings-row">
        <div>
          <strong>{tk("intg.dnd.homebrew")}</strong>
          <p>
            {settings.homebrew.length
              ? settings.homebrew.length === 1
                ? tk("intg.dnd.homebrewOne")
                : tk("intg.dnd.homebrewCount", { count: settings.homebrew.length })
              : tk("intg.dnd.homebrewEmpty")}
          </p>
        </div>
        <div className="dnd-settings-toggle">
          <button type="button" className="discord-btn secondary" disabled={saving} onClick={importHomebrew}>
            {tk("intg.dnd.importJson")}
          </button>
          {settings.homebrew.length > 0 && (
            <button
              type="button"
              className="discord-btn secondary"
              disabled={saving}
              onClick={() => void save({ clearHomebrew: true }, tk("intg.dnd.cleared"))}
            >
              {tk("intg.clear")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
