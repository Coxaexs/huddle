/**
 * Session notes: /recap start in a call keeps the room's live captions (the
 * lines people already choose to share, see use-live-captions), and when the
 * notes stop, or the call has been empty for a couple of minutes, the AI
 * writes a recap of the session into the channel /recap start was typed in,
 * with the full transcript attached as a text file.
 *
 * The hub holds the state (lib/hub.ts); everything here is plain functions so
 * the recap itself can be tested without a hub.
 */
import { askAi, aiConfigured, type AiKeys } from "./ai";
import type { StoredMessage } from "./storage";

export interface SessionNotesState {
  startedAt: number;
  startedBy: string;
  startedByName: string;
  /** The text channel the recap is posted to. */
  postChannelId: string;
  /** When the room last became empty; the notes end NOTES_GRACE_MS later. */
  emptySince?: number | null;
}

export interface NoteLine {
  at: number;
  name: string;
  text: string;
}

/** Room storage is chunked so no single value grows past a few dozen KB. */
export const NOTES_CHUNK = 100;
export const NOTES_MAX_LINES = 4000;
/** An empty room keeps its notes this long, so a dropped connection is not the end of the session. */
export const NOTES_GRACE_MS = 2 * 60_000;
/** Below this there is nothing to recap. */
const MIN_LINES = 3;
/** What the AI is given; the attachment always has everything. */
const MAX_PROMPT_CHARS = 60_000;

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "[mm:ss] Name: text", one line per caption, timed from the start. */
export function transcriptText(lines: NoteLine[], startedAt: number): string {
  return lines.map((line) => `[${clock(line.at - startedAt)}] ${line.name}: ${line.text}`).join("\n");
}

/** The most recent part of the transcript that fits the prompt budget. */
export function promptTranscript(transcript: string, limit = MAX_PROMPT_CHARS): string {
  if (transcript.length <= limit) return transcript;
  const cut = transcript.slice(transcript.length - limit);
  return `(earlier lines left out)\n${cut.slice(cut.indexOf("\n") + 1)}`;
}

export function recapPrompt(transcript: string, roomName: string, durationMs: number): string {
  return [
    `These are the live captions of a voice session in "${roomName}" (${clock(durationMs)} long),`,
    "usually a tabletop RPG night between friends. Captions are machine-made, so expect",
    "misheard words; never quote a garbled line as fact.",
    "",
    "Write a recap the group can read before next session:",
    "- 2 or 3 sentences on what happened, in order",
    "- Fights and big moments (crits, deaths, clever plays), if any",
    "- Decisions the group made, and loot, NPCs or places worth remembering",
    "- Open threads or plans for next time",
    "Short bullets, plain text, no headings. Skip any section that would be empty.",
    "Name who did what. Report only what the captions say: no dramatising, no guessed",
    "causes or outcomes, and nothing that is not in the captions.",
    "",
    "Captions (oldest first):",
    transcript,
  ].join("\n");
}

export interface RecapDeps {
  db: D1Database;
  uploads?: R2Bucket;
  keys: AiKeys;
  /** Delivers the new message live. */
  publish: (channelId: string, message: unknown) => Promise<void> | void;
  /** Builds the client shape of a stored row (publicMessage). */
  toPublic: (row: StoredMessage) => unknown;
  ask?: typeof askAi;
  now?: number;
}

/**
 * Posts the recap for a finished session. Returns false when there was too
 * little to recap or the post channel is gone; the AI being down or unset
 * still posts the transcript.
 */
export async function postSessionRecap(
  deps: RecapDeps,
  state: SessionNotesState,
  lines: NoteLine[],
  roomName: string,
): Promise<boolean> {
  if (lines.length < MIN_LINES) return false;
  const channel = await deps.db
    .prepare("SELECT name FROM channels WHERE id = ?")
    .bind(state.postChannelId)
    .first<{ name: string }>();
  if (!channel) return false;

  const now = deps.now ?? Date.now();
  const durationMs = (lines[lines.length - 1]?.at ?? now) - state.startedAt;
  const transcript = transcriptText(lines, state.startedAt);
  const speakers = [...new Set(lines.map((line) => line.name))];

  let summary = "";
  if (aiConfigured(deps.keys)) {
    try {
      const answer = await (deps.ask ?? askAi)(deps.keys, [], recapPrompt(promptTranscript(transcript), roomName, durationMs));
      summary = answer.text.trim();
    } catch {
      // The transcript below still goes up.
    }
  }

  let attachmentKey: string | null = null;
  if (deps.uploads) {
    const stamp = new Date(state.startedAt).toISOString().slice(0, 10);
    attachmentKey = `${crypto.randomUUID()}--session-notes-${stamp}.txt`;
    try {
      await deps.uploads.put(attachmentKey, new TextEncoder().encode(transcript + "\n"), {
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
        customMetadata: { uploader: state.startedBy },
      });
    } catch {
      attachmentKey = null;
    }
  }

  const header = `📜 Session recap · ${roomName} · ${clock(durationMs)} · ${speakers.join(", ")}`;
  const body = summary
    ? summary
    : attachmentKey
      ? "No AI is set up here, so there is no summary; the full transcript is attached."
      : promptTranscript(transcript, 3500);
  const row: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channel.name,
    channel_id: state.postChannelId,
    user_id: null,
    author: "Session notes",
    avatar: "📜",
    color: "#b8a6ff",
    content: `${header}\n\n${body}`.slice(0, 7900),
    attachment_key: attachmentKey,
    is_bot: 1,
    created_at: new Date(now).toISOString(),
  };
  await deps.db
    .prepare(
      `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key, is_bot, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .bind(row.id, row.channel, row.channel_id, row.author, row.avatar, row.color, row.content, row.attachment_key, row.created_at)
    .run();
  await deps.publish(state.postChannelId, deps.toPublic(row));
  return true;
}
