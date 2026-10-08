"use client";

import {
  MusicHistoryCard,
  MusicQueueCard,
  MusicSearchCard,
  MusicSettingsCard,
  MusicStatsCard,
  type MusicSettings,
} from "../music-cards";
import type { Message } from "../../lib/chat/types";

/** Message kinds the music bot answers with a card. */
export const MUSIC_CARD_KINDS: ReadonlySet<string> = new Set([
  "music-settings",
  "music-stats",
  "music-queue",
  "music-history",
  "music-search",
]);

/**
 * The music bot's card for a message of one of MUSIC_CARD_KINDS. Its buttons
 * run music commands in the voice room the card belongs to; without one, the
 * card is shown disabled.
 */
export function MusicPayloadCard({
  kind,
  payload,
  onCommand,
}: {
  kind: string;
  payload: NonNullable<Message["payload"]>;
  onCommand: (command: string) => Promise<MusicSettings | void>;
}) {
  const disabled = !payload.voiceChannelId;
  switch (kind) {
    case "music-settings":
      return (
        <MusicSettingsCard
          settings={payload}
          disabled={disabled}
          onCommand={onCommand}
        />
      );
    case "music-stats":
      return (
        <MusicStatsCard
          wrapped={payload.wrapped}
          label={payload.label}
          plays={payload.plays}
          unique={payload.unique}
          hours={payload.hours}
          topSongs={payload.topSongs}
          topRequesters={payload.topRequesters}
          topArtist={payload.topArtist}
          topGenre={payload.topGenre}
          peakHour={payload.peakHour}
          streakDays={payload.streakDays}
          personality={payload.personality}
          disabled={disabled}
          onCommand={onCommand}
        />
      );
    case "music-queue":
      return (
        <MusicQueueCard
          currentTrack={payload.currentTrack}
          queue={payload.queue}
          totalTracks={payload.totalTracks}
          disabled={disabled}
          onCommand={onCommand}
        />
      );
    case "music-history":
      return <MusicHistoryCard history={payload.history} disabled={disabled} onCommand={onCommand} />;
    case "music-search":
      return (
        <MusicSearchCard
          query={payload.query}
          track={typeof payload.track === "object" ? payload.track : undefined}
          disabled={disabled}
          onCommand={onCommand}
        />
      );
    default:
      return null;
  }
}

/** Editing a message in place: Enter saves, Shift+Enter is a new line, Esc cancels. */
export function MessageEditor({
  value,
  onChange,
  onCancel,
  onSave,
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="message-edit">
      <textarea
        value={value}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSave();
          }
        }}
      />
      <div className="message-edit-hint">
        Enter to save · Esc to cancel
      </div>
    </div>
  );
}
