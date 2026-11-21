"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../../lib/i18n-context";
import { apiFetch } from "../../lib/client";
import { startSteamLink } from "../play-card";

interface SteamStatus {
  linked: boolean;
  persona: string | null;
  keyConfigured: boolean;
}

/**
 * Settings → Activities: link a Steam account for Play together, so friends
 * you let in can join your Steam games (Stardew Valley) in one click.
 */
export function SteamLinkSection() {
  const { t } = useI18n();
  const [status, setStatus] = useState<SteamStatus | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    apiFetch("/api/integrations/steam")
      .then((value) => setStatus(value as SteamStatus))
      .catch(() => undefined);

  useEffect(() => {
    void load();
    // Steam's page opens in another tab or the browser; refresh on the way back.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <div className="bg-indigo-950/20 border border-indigo-400/30 p-3 rounded-lg space-y-2">
      <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">{t("play.steam.title")}</h4>
      <p className="text-xs text-gray-400">{t("play.steam.blurb")}</p>
      {status?.linked ? (
        <div className="flex items-center justify-between gap-2 text-xs text-gray-200">
          <span>{status.persona ? t("play.steam.linkedAs", { name: status.persona }) : t("play.steam.linked")}</span>
          <button
            type="button"
            className="discord-btn secondary-gray text-xs"
            onClick={() =>
              void apiFetch("/api/integrations/steam", { method: "DELETE" })
                .then(load)
                .catch(() => setError(t("play.error")))
            }
          >
            {t("play.steam.unlink")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="discord-btn primary-indigo text-xs"
          onClick={() => void startSteamLink().catch((err) => setError(err instanceof Error ? err.message : t("play.error")))}
        >
          {t("play.action.linkSteam")}
        </button>
      )}
      {status?.linked && <p className="text-xs text-gray-400">{t("play.steam.public")}</p>}
      {status && !status.keyConfigured && <p className="text-xs text-amber-300">{t("play.steam.noKey")}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
