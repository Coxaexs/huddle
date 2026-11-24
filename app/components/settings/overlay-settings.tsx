"use client";

import { useEffect, useMemo, useState } from "react";
import { comboLabel, comboToAccelerator, globalShortcutProblem } from "../../lib/hotkeys";
import {
  mainOverlayBridge,
  type OverlayCorner,
  type OverlaySettings as Settings,
  type OverlaySettingsPatch,
} from "../../lib/desktop-overlay";
import { useI18n } from "../../lib/i18n-context";
import { ComboButton } from "./roles-tab";

const CORNERS: Array<[OverlayCorner, string]> = [
  ["top-left", "Top left"],
  ["top-right", "Top right"],
  ["bottom-left", "Bottom left"],
  ["bottom-right", "Bottom right"],
];

/**
 * Activities → Game overlay. Only in the desktop app, which keeps these
 * settings itself (they are per computer, and the shortcut must work before
 * any page has loaded).
 */
export function OverlaySettings() {
  const { t } = useI18n();
  const bridge = useMemo(() => mainOverlayBridge(), []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [refused, setRefused] = useState("");

  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void bridge.settings().then((next) => {
      if (live) setSettings(next);
    });
    return () => {
      live = false;
    };
  }, [bridge]);

  if (!bridge || !settings) return null;

  const update = (patch: OverlaySettingsPatch) => {
    setRefused("");
    void bridge.setSettings(patch).then((next) => {
      if (!next) return;
      setSettings(next);
      // The app keeps the old shortcut when the new one is not safe to grab everywhere.
      if (patch.combo && next.combo !== patch.combo) {
        setRefused(`${comboLabel(patch.combo)} can't be used. Hold Ctrl or Alt too, and press a letter, number, symbol key or F-key.`);
      }
    });
  };

  return (
    <section className="vs-section" data-settings-anchor="overlay" data-settings-label={t("settings.overlay.title")}>
      <h3 className="field-label">{t("settings.overlay.title")}</h3>
      <label className="appearance-switch">
        <span>
          <strong>{t("settings.overlay.showOverGames")}</strong>
          <small>{t("settings.overlay.showOverGamesDesc")}</small>
        </span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
      </label>
      {settings.enabled && (
        <>
          <ComboButton
            label={t("settings.overlay.openCombo")}
            combo={settings.combo}
            onChange={(combo) => {
              const problem = globalShortcutProblem(combo);
              const label = comboLabel(combo);
              if (!problem) update({ combo, accelerator: comboToAccelerator(combo) });
              else if (problem === "modifier")
                setRefused(`${label} would get in the way of typing in other apps. Hold Ctrl or Alt (or Cmd on a Mac) too.`);
              else if (problem === "reserved")
                setRefused(`${label} is copy, paste or undo in every app. Pick another.`);
              else
                setRefused(`${label} can't be a shortcut outside Hoffle. Use a letter, number, symbol key, F-key or Space.`);
            }}
          />
          <p className="modal-hint" role="status">
            {refused
              ? refused
              : settings.hotkeyOk
              ? t("settings.overlay.active", { shortcut: settings.shortcut })
              : t("settings.overlay.conflict", { shortcut: settings.shortcut })}
          </p>
          {settings.combo !== settings.defaultCombo && (
            <button
              type="button"
              onClick={() =>
                update({ combo: settings.defaultCombo, accelerator: comboToAccelerator(settings.defaultCombo) })
              }
            >
              {t("settings.overlay.useDefault")}
            </button>
          )}
          {/* Desktop apps before 2.3.1 do not send these and cannot change them. */}
          {settings.showWhilePlaying !== undefined && (
            <label className="appearance-switch">
              <span>
                <strong>Show who&apos;s talking while you play</strong>
                <small>
                  Faces and names in a corner of the screen, plus new messages. Off, nothing shows over your
                  game and the shortcut still opens Hoffle.
                </small>
              </span>
              <input
                type="checkbox"
                checked={settings.showWhilePlaying}
                onChange={(event) => update({ showWhilePlaying: event.target.checked })}
              />
            </label>
          )}
          {settings.corner !== undefined && settings.showWhilePlaying !== false && (
            <>
              <h4 className="field-label">Corner</h4>
              <div className="appearance-choice-row vs-mode-row" role="radiogroup" aria-label="Corner">
                {CORNERS.map(([id, label]) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={settings.corner === id}
                    key={id}
                    className={settings.corner === id ? "active" : ""}
                    onClick={() => update({ corner: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          {settings.game && <p className="modal-hint">{t("settings.overlay.playingNow", { game: settings.game })}</p>}
        </>
      )}
    </section>
  );
}
