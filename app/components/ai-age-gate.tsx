"use client";

import { useEffect, useState } from "react";
import { onAiAgeQuestion } from "../lib/ai-fetch";
import { useI18n } from "../lib/i18n-context";

/** Asks whether you are 18 or older the first time you use an AI feature. */
export function AiAgeGate() {
  const { t } = useI18n();
  const [reply, setReply] = useState<((adult: boolean) => void) | null>(null);

  useEffect(() => onAiAgeQuestion((next) => setReply(() => next)), []);

  if (!reply) return null;
  const answer = (adult: boolean) => {
    setReply(null);
    reply(adult);
  };
  return (
    <div className="username-gate" role="dialog" aria-modal="true" aria-labelledby="ai-age-title">
      <div className="username-card">
        <span className="username-mark">h</span>
        <h2 id="ai-age-title">{t("ai.ageTitle")}</h2>
        <p>{t("ai.ageBody")}</p>
        <button type="button" onClick={() => answer(true)}>
          {t("ai.ageYes")}
        </button>
        <button type="button" onClick={() => answer(false)}>
          {t("ai.ageNo")}
        </button>
      </div>
    </div>
  );
}
