/** /record setup | start | pause | resume | marker <name> | scene <scene> | stop | status */
import { apiFetch } from "../../client";
import type { RecordingState } from "@/lib/protocol";

export interface RecordContext {
  /** Session recording is switched on for this Huddle. */
  enabled: boolean;
  voiceChannelId: string | null;
  /** Live recordings by voice room, from the hub. */
  recordings: Record<string, RecordingState>;
  notify: (text: string) => void;
  /** Opens a voice room's stage (where the recording setup lives). */
  openStage: (channelId: string) => void;
}

export async function runRecordCommand(value: string, ctx: RecordContext): Promise<void> {
  const { enabled, voiceChannelId, recordings, notify, openStage } = ctx;
  if (!enabled) {
    notify("Session recording is disabled on this Huddle.");
    return;
  }
  if (!voiceChannelId) {
    notify("Join the voice room you want to record first.");
    return;
  }
  const [subcommand = "status", ...rest] = value.split(/\s+/);
  const recording = recordings[voiceChannelId] || null;
  if (subcommand === "setup") {
    window.dispatchEvent(new CustomEvent("huddle-recording-setup"));
    openStage(voiceChannelId);
    return;
  }
  if (subcommand === "status") {
    notify(
      recording
        ? `${recording.title}: ${recording.status.replace("-", " ")} · ${recording.consents.filter((entry) => entry.decision === "accepted").length}/${recording.consents.length} consented.`
        : "No recording is active in this room.",
    );
    return;
  }
  if (!recording) {
    notify("No recording is active. Use /record setup first.");
    return;
  }
  const action =
    subcommand === "start" ||
      subcommand === "pause" ||
      subcommand === "resume" ||
      subcommand === "stop"
      ? subcommand
      : subcommand === "marker"
        ? "marker"
        : subcommand === "scene"
          ? "scene"
          : null;
  if (!action) {
    notify(
      "Use /record setup, start, pause, resume, marker <name>, scene <scene>, stop, or status.",
    );
    return;
  }
  try {
    await apiFetch("/api/recordings", {
      method: "POST",
      body: JSON.stringify({
        action,
        sessionId: recording.id,
        ...(action === "marker"
          ? { name: rest.join(" ") || "Marker", kind: "chapter" }
          : {}),
        ...(action === "scene" ? { scene: rest[0] } : {}),
      }),
    });
  } catch (error) {
    notify(
      error instanceof Error ? error.message : "Recording command failed.",
    );
  }
  return;
}
