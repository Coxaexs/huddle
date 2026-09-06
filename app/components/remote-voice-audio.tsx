"use client";

import { useEffect, useRef } from "react";
import type { VoiceParticipant } from "@/lib/protocol";
import { SpatialAudioPlayback, personalTableLayout } from "../lib/spatial-audio";

export function RemoteVoiceAudio({ streams, participants, listenerId, enabled, hostId, seatOrder, seatPans, width, deafened, preferenceFor }: {
  streams: Array<{ connectionId: string; stream: MediaStream }>;
  participants: VoiceParticipant[];
  listenerId: string | null;
  enabled: boolean;
  hostId: string;
  seatOrder: string[];
  seatPans: Record<string, number>;
  width: number;
  deafened: boolean;
  preferenceFor: (userId: string) => { volume: number; muted: boolean };
}) {
  const playback = useRef<SpatialAudioPlayback | null>(null);
  useEffect(() => {
    playback.current = new SpatialAudioPlayback();
    return () => { playback.current?.dispose(); playback.current = null; };
  }, []);
  useEffect(() => {
    const seats = personalTableLayout(seatOrder, hostId, seatPans, width);
    playback.current?.update(streams.filter(({ stream }) => stream.getAudioTracks().length > 0).map(({ connectionId, stream }) => {
      const person = participants.find((p) => p.connectionId === connectionId);
      const pref = person ? preferenceFor(person.id) : { volume: 1, muted: false };
      const voice = person && !person.bot && !person.recorder && stream.id !== person.screenStreamId && !stream.getVideoTracks().length;
      return {
        key: `${connectionId}:${stream.id}`, stream,
        important: Boolean(voice && person.important && !person.muted && !person.serverMuted),
        volume: pref.volume, muted: deafened || pref.muted,
        pan: voice ? seats.get(connectionId)?.pan ?? null : null,
      };
    }), enabled);
  }, [streams, participants, listenerId, enabled, hostId, seatOrder, seatPans, width, deafened, preferenceFor]);
  return null;
}
