"use client";

import { useEffect, useMemo, useState } from "react";
import { comboToAccelerator } from "../../lib/hotkeys";
import { mainOverlayBridge, type OverlaySettings as Settings } from "../../lib/desktop-overlay";
import { ComboButton } from "./roles-tab";

/**
 * Activities → Game overlay. Only in the desktop app, which keeps these
 * settings itself (they are per computer, and the shortcut must work before
 * any page has loaded).
 */
export function OverlaySettings() {
  const bridge = useMemo(() => mainOverlayBridge(), []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [refused, setRefused] = useState(false);

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

  const update = (patch: { enabled?: boolean; combo?: string; accelerator?: string }) => {
    setRefused(false);
    void bridge.setSettings(patch).then((next) => {
      if (!next) return;
      setSettings(next);
      // The app keeps the old shortcut when the new one is not safe to grab everywhere.
      if (patch.combo && next.combo !== patch.combo) setRefused(true);
    });
  };

  return (
    <section className="vs-section" data-settings-anchor="overlay" data-settings-label="Game overlay">
      <h3 className="field-label">Game overlay</h3>
      <label className="appearance-switch">
        <span>
          <strong>Show Hoffle over games</strong>
          <small>
            While you play, see who is talking and new messages in a corner. Works with games in
            windowed or borderless mode.
          </small>
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
            label="Open Hoffle over everything"
            combo={settings.combo}
            onChange={(combo) => {
              const accelerator = comboToAccelerator(combo);
              if (accelerator) update({ combo, accelerator });
              else setRefused(true);
            }}
          />
          <p className="modal-hint" role="status">
            {refused
              ? "That can't be a shortcut outside Hoffle. Hold Ctrl, Alt or Shift and press a letter, number, F-key, Space or `."
              : settings.hotkeyOk
              ? `Press ${settings.shortcut} anywhere, in a game or not, for a small Hoffle with your servers, channels and call. Press it again or Esc to go back.`
              : `Another app already uses ${settings.shortcut}. Pick a different shortcut.`}
          </p>
          {settings.combo !== settings.defaultCombo && (
            <button
              type="button"
              onClick={() =>
                update({ combo: settings.defaultCombo, accelerator: comboToAccelerator(settings.defaultCombo) })
              }
            >
              Use the default shortcut
            </button>
          )}
          {settings.game && <p className="modal-hint">Playing now: {settings.game}.</p>}
        </>
      )}
    </section>
  );
}
