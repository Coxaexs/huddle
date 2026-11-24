"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";
import { apiFetch } from "../lib/client";
import { useI18n } from "../lib/i18n-context";
import type { SessionNotesState } from "@/lib/session-notes";

/**
 * Shown to everyone in a call that is keeping session notes (/recap start),
 * so nobody's captions are kept without them knowing.
 */
export function SessionNotesBanner({
  channelId,
  notes,
  onNotice,
}: {
  channelId: string;
  notes: SessionNotesState;
  onNotice: (text: string) => void;
}) {
  const { t } = useI18n();
  const [stopping, setStopping] = useState(false);

  async function stop() {
    setStopping(true);
    try {
      await apiFetch("/api/recap", {
        method: "POST",
        body: JSON.stringify({ channelId: notes.postChannelId, voiceChannelId: channelId, action: "stop" }),
      });
      onNotice(t("chat.notes.stopped"));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t("chat.notes.stopFailed"));
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="session-notes-banner" role="status">
      <ScrollText size={15} aria-hidden="true" />
      <span>
        <strong>{t("chat.notes.active")}</strong> · {t("chat.notes.startedBy", { name: notes.startedByName })}
      </span>
      <button type="button" onClick={() => void stop()} disabled={stopping}>
        {stopping ? t("chat.notes.stopping") : t("chat.notes.stopAndRecap")}
      </button>
    </div>
  );
}
