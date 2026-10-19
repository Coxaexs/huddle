"use client";

import { useEffect, useState } from "react";
import { DM_POLICIES, type DmPolicy } from "@/lib/dm-policy";
import { apiFetch } from "../../lib/client";
import { useI18n } from "../../lib/i18n-context";
import { setStreamerSetting, useStreamerMode, type StreamerSetting } from "../../lib/streamer-mode";

const STREAMER_SETTINGS: StreamerSetting[] = ["off", "auto", "on"];

/** Who can start a conversation with you, and Streamer Mode. */
export function PrivacyTab() {
  const { t } = useI18n();
  const [dmPolicy, setDmPolicy] = useState<DmPolicy | null>(null);
  const [status, setStatus] = useState("");
  const streamer = useStreamerMode();

  useEffect(() => {
    let live = true;
    apiFetch<{ dmPolicy: DmPolicy }>("/api/settings/privacy")
      .then((data) => live && setDmPolicy(data.dmPolicy))
      .catch(() => live && setDmPolicy("everyone"));
    return () => {
      live = false;
    };
  }, []);

  const chooseDmPolicy = async (next: DmPolicy) => {
    const previous = dmPolicy;
    setDmPolicy(next);
    setStatus("");
    try {
      await apiFetch("/api/settings/privacy", { method: "PATCH", body: JSON.stringify({ dmPolicy: next }) });
      setStatus(t("privacy.saved"));
    } catch (error) {
      setDmPolicy(previous);
      setStatus(error instanceof Error ? error.message : t("privacy.failed"));
    }
  };

  return (
    <>
      <section className="profile-studio-section">
        <h3 className="profile-studio-section-title">{t("privacy.dmTitle")}</h3>
        <p className="modal-hint">{t("privacy.dmDesc")}</p>
        <div role="radiogroup" aria-label={t("privacy.dmTitle")} style={{ display: "grid", gap: "8px" }}>
          {DM_POLICIES.map((policy) => (
            <label key={policy} className="appearance-switch">
              <span>
                <strong>{t(`privacy.dm.${policy}`)}</strong>
              </span>
              <input
                type="radio"
                name="dm-policy"
                checked={dmPolicy === policy}
                disabled={dmPolicy === null}
                onChange={() => void chooseDmPolicy(policy)}
              />
            </label>
          ))}
        </div>
        {status && <p className="modal-hint" role="status">{status}</p>}
      </section>

      <section className="profile-studio-section">
        <h3 className="profile-studio-section-title">
          {t("privacy.streamerTitle")}{" "}
          {streamer.active && <span className="streamer-badge">{t("streamer.badge")}</span>}
        </h3>
        <p className="modal-hint">{t("privacy.streamerDesc")}</p>
        <div role="radiogroup" aria-label={t("privacy.streamerTitle")} style={{ display: "grid", gap: "8px" }}>
          {STREAMER_SETTINGS.map((value) => (
            <label key={value} className="appearance-switch">
              <span>
                <strong>{t(`privacy.streamer.${value}`)}</strong>
              </span>
              <input
                type="radio"
                name="streamer-mode"
                checked={streamer.setting === value}
                onChange={() => setStreamerSetting(value)}
              />
            </label>
          ))}
        </div>
      </section>
    </>
  );
}
