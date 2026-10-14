"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";
import { apiFetch } from "../lib/client";
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
  const [stopping, setStopping] = useState(false);

  async function stop() {
    setStopping(true);
    try {
      await apiFetch("/api/recap", {
        method: "POST",
        body: JSON.stringify({ channelId: notes.postChannelId, voiceChannelId: channelId, action: "stop" }),
      });
      onNotice("📜 Session notes stopped; the recap is on its way.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not stop the notes.");
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="session-notes-banner" role="status">
      <ScrollText size={15} aria-hidden="true" />
      <span>
        <strong>Session notes on</strong> · started by {notes.startedByName}. Captions people share are kept for a
        recap.
      </span>
      <button type="button" onClick={() => void stop()} disabled={stopping}>
        {stopping ? "Stopping…" : "Stop and recap"}
      </button>
    </div>
  );
}
