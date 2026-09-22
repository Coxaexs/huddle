"use client";

import { useEffect, useRef } from "react";
import type { VoiceParticipant } from "@/lib/protocol";
import { SpatialAudioPlayback, personalTableLayout } from "../lib/spatial-audio";
import { HEAD_RECENTER_EVENT, HeadTracker, type HeadTrackingStatus } from "../lib/head-tracking";

export function RemoteVoiceAudio({ streams, participants, listenerId, enabled, hostId, seatOrder, seatPans, width, deafened, headTracking, onHeadTracking, preferenceFor }: {
  streams: Array<{ connectionId: string; stream: MediaStream }>;
  participants: VoiceParticipant[];
  listenerId: string | null;
  enabled: boolean;
  hostId: string;
  seatOrder: string[];
  seatPans: Record<string, number>;
  width: number;
  deafened: boolean;
  headTracking: boolean;
  onHeadTracking?: (status: HeadTrackingStatus, live: boolean) => void;
  preferenceFor: (userId: string) => { volume: number; muted: boolean };
}) {
  const playback = useRef<SpatialAudioPlayback | null>(null);
  const status = useRef(onHeadTracking);
  status.current = onHeadTracking;
  useEffect(() => {
    playback.current = new SpatialAudioPlayback();
    return () => { playback.current?.dispose(); playback.current = null; };
  }, []);
  // Poses arrive tens of times a second, so they go straight to the audio graph
  // rather than through React state.
  useEffect(() => {
    if (!enabled || !headTracking) return;
    const tracker = new HeadTracker(
      (pose) => playback.current?.setHeadPose(pose),
      (available, live) => status.current?.(available, live),
    );
    const recenter = () => tracker.recenter();
    window.addEventListener(HEAD_RECENTER_EVENT, recenter);
    void tracker.start();
    return () => {
      window.removeEventListener(HEAD_RECENTER_EVENT, recenter);
      tracker.stop();
      playback.current?.setHeadPose(null);
    };
  }, [enabled, headTracking]);
  useEffect(() => {
    const seats = personalTableLayout(seatOrder, hostId, seatPans, width);
    playback.current?.update(streams.filter(({ stream }) => stream.getAudioTracks().length > 0).map(({ connectionId, stream }) => {
      const person = participants.find((p) => p.connectionId === connectionId);
      const pref = person ? preferenceFor(person.id) : { volume: 1, muted: false };
      const voice = person && !person.bot && !person.recorder && stream.id !== person.screenStreamId && !stream.getVideoTracks().length;
      const seat = voice ? seats.get(connectionId) : undefined;
      return {
        key: `${connectionId}:${stream.id}`, stream,
        important: Boolean(voice && person.important && !person.muted && !person.serverMuted),
        volume: pref.volume, muted: deafened || pref.muted,
        pan: voice ? seat?.pan ?? null : null,
        seat: seat ? { x: seat.x, y: seat.y, z: seat.z } : null,
      };
    }), enabled);
  }, [streams, participants, listenerId, enabled, hostId, seatOrder, seatPans, width, deafened, preferenceFor]);
  return null;
}
