"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Megaphone, X } from "lucide-react";
import { apiFetch } from "../lib/client";
import { useI18n } from "@/app/lib/i18n-context";

interface FollowInfo {
  follows: Array<{ channelId: string; channelName: string; serverId: string; serverName: string }>;
  targets: Array<{ serverId: string; serverName: string; channels: Array<{ id: string; name: string }> }>;
}

/**
 * Follow an announcement channel into one of your own servers' channels, and
 * see or stop the follows you already set up (lib/channel-follows.ts).
 */
export function FollowChannelDialog({
  channelId,
  channelName,
  onClose,
}: {
  channelId: string;
  channelName: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [info, setInfo] = useState<FollowInfo | null>(null);
  const [serverId, setServerId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = async () => {
    try {
      const data = await apiFetch<FollowInfo>(`/api/channels/${encodeURIComponent(channelId)}/follows`);
      setInfo(data);
      setServerId((current) => current || data.targets[0]?.serverId || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("follow.loadFailed"));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const server = info?.targets.find((entry) => entry.serverId === serverId);
  useEffect(() => {
    setTargetId(server?.channels[0]?.id || "");
  }, [server]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const follow = async () => {
    if (!targetId || busy) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/follows`, {
        method: "POST",
        body: JSON.stringify({ targetChannelId: targetId }),
      });
      const target = server?.channels.find((channel) => channel.id === targetId);
      setDone(t("follow.done", { channel: channelName, target: `${server?.serverName} › #${target?.name ?? ""}` }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("follow.failed"));
    } finally {
      setBusy(false);
    }
  };

  const stop = async (target: string) => {
    setBusy(true);
    setError("");
    try {
      await apiFetch(
        `/api/channels/${encodeURIComponent(channelId)}/follows?target=${encodeURIComponent(target)}`,
        { method: "DELETE" },
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("follow.failed"));
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <div className="custom-dialog-backdrop" onClick={onClose}>
      <div
        className="forward-dialog-card follow-dialog-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-dialog-title"
      >
        <div className="forward-dialog-header">
          <div className="flex items-center gap-2">
            <div className="forward-header-icon-wrap">
              <Megaphone size={18} className="text-[var(--lavender)]" />
            </div>
            <div>
              <h3 id="follow-dialog-title" className="forward-dialog-title">
                {t("follow.title", { channel: channelName })}
              </h3>
              <p className="forward-dialog-subtitle">{t("follow.body")}</p>
            </div>
          </div>
          <button type="button" className="forward-dialog-close" onClick={onClose} aria-label={t("common.close")}>
            <X size={16} />
          </button>
        </div>

        <div className="follow-dialog-body">
          {!info && !error && <p className="follow-dialog-note">{t("follow.loading")}</p>}
          {info && info.targets.length === 0 && <p className="follow-dialog-note">{t("follow.none")}</p>}
          {info && info.targets.length > 0 && (
            <div className="follow-dialog-pick">
              <label>
                <span>{t("follow.server")}</span>
                <select value={serverId} onChange={(event) => setServerId(event.target.value)}>
                  {info.targets.map((entry) => (
                    <option key={entry.serverId} value={entry.serverId}>
                      {entry.serverName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("follow.channel")}</span>
                <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                  {server?.channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      #{channel.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="forward-btn-submit" disabled={!targetId || busy} onClick={() => void follow()}>
                {t("follow.submit")}
              </button>
            </div>
          )}
          {done && (
            <p className="follow-dialog-done" role="status">
              {done}
            </p>
          )}
          {error && (
            <p className="follow-dialog-error" role="alert">
              {error}
            </p>
          )}
          {info && info.follows.length > 0 && (
            <div className="follow-dialog-list">
              <h4>{t("follow.following")}</h4>
              <ul>
                {info.follows.map((entry) => (
                  <li key={entry.channelId}>
                    <span>
                      {entry.serverName} › #{entry.channelName}
                    </span>
                    <button type="button" disabled={busy} onClick={() => void stop(entry.channelId)}>
                      {t("follow.stop")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(dialog, document.body);
}
