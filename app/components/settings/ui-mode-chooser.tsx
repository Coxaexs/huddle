"use client";

import { useI18n } from "@/app/lib/i18n-context";
import { setUiMode, useUiMode } from "@/app/lib/ui-mode";

/** Settings → Appearance: simple or full interface (app/lib/ui-mode.ts). */
export function UiModeChooser() {
  const { t } = useI18n();
  const mode = useUiMode();
  return (
    <div className="ui-mode-chooser">
      <div className="ui-mode-chooser-text">
        <span className="settings-label">{t("userSettings.uiMode")}</span>
        <p className="modal-hint">{t("userSettings.uiMode.desc")}</p>
      </div>
      <div className="ui-mode-switch" role="radiogroup" aria-label={t("userSettings.uiMode")}>
        {(["simple", "full"] as const).map((id) => (
          <button
            type="button"
            role="radio"
            aria-checked={mode === id}
            key={id}
            className={mode === id ? "active" : ""}
            onClick={() => setUiMode(id)}
          >
            {t(`userSettings.uiMode.${id}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
