"use client";

import { useEffect } from "react";
import { useI18n } from "../lib/i18n-context";
import { installStreamerMode, useStreamerMode } from "../lib/streamer-mode";

/**
 * A small "Streamer Mode" pill by your name while the mode is on. It also
 * applies the saved setting to the page once the chat opens.
 */
export function StreamerModeBadge() {
  const { t } = useI18n();
  const { active } = useStreamerMode();
  useEffect(() => installStreamerMode(), []);
  if (!active) return null;
  return (
    <span className="streamer-badge" title={t("privacy.streamerDesc")}>
      {t("streamer.badge")}
    </span>
  );
}
