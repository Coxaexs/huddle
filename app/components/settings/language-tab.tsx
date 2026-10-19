"use client";

import { LanguagePicker } from "../language-picker";
import { useI18n } from "../../lib/i18n-context";

/** Settings → Language: the interface language, remembered per device. */
export function LanguageTab() {
  const { t } = useI18n();
  return (
    <div className="account-settings">
      <section className="profile-studio-section">
        <h3 className="profile-studio-section-title">{t("settings.language")}</h3>
        <p className="modal-hint">{t("settings.language.description")}</p>
        <LanguagePicker />
        <p className="modal-hint">{t("settings.language.detected")}</p>
        <p className="modal-hint">{t("settings.language.partialNote")}</p>
      </section>
    </div>
  );
}
