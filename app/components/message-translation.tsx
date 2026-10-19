"use client";

import { LOCALES } from "@/lib/i18n";
import { useI18n } from "../lib/i18n-context";
import { hideTranslation, useTranslation } from "../lib/message-translate";

/** The translation asked for from the message menu, under the original text. */
export function MessageTranslation({ messageId }: { messageId: string }) {
  const { t } = useI18n();
  const state = useTranslation(messageId);
  if (!state) return null;
  if (state.status === "loading") {
    return <div className="message-translation" role="status">{t("translate.working")}</div>;
  }
  const hide = (
    <button type="button" onClick={() => hideTranslation(messageId)}>
      {t("translate.hide")}
    </button>
  );
  if (state.status === "error") {
    return (
      <div className="message-translation" role="alert">
        {state.error || t("translate.failed")}
        <small>{hide}</small>
      </div>
    );
  }
  const language = LOCALES.find((entry) => entry.code === state.to)?.name || state.to;
  return (
    <div className="message-translation" lang={state.to}>
      {state.text}
      <small>
        <span>{t("translate.label", { language })}</span>
        {hide}
      </small>
    </div>
  );
}
