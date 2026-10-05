"use client";

import { useEffect, useRef } from "react";
import type { VoiceParticipant } from "@/lib/protocol";
import { SpatialAudioPlayback, personalTableLayout } from "../lib/spatial-audio";
import { HEAD_RECENTER_EVENT, HeadTracker, type HeadTrackingStatus } from "../lib/head-tracking";
import { WebcamHeadTracker } from "../lib/webcam-head-tracking";

export function RemoteVoiceAudio({ streams, participants, listenerId, enabled, hostId, seatOrder, seatPans, width, deafened, headTracking, headTrackingSource = "airpods", headphones = true, onHeadTracking, preferenceFor, streamPreferenceFor }: {
  streams: Array<{ connectionId: string; stream: MediaStream; kind?: "voice" | "camera" | "screen" }>;
  participants: VoiceParticipant[];
  listenerId: string | null;
  enabled: boolean;
  hostId: string;
  seatOrder: string[];
  seatPans: Record<string, number>;
  width: number;
  deafened: boolean;
  headTracking: boolean;
  headTrackingSource?: "airpods" | "webcam";
  headphones?: boolean;
  onHeadTracking?: (status: HeadTrackingStatus, live: boolean) => void;
  preferenceFor: (userId: string) => { volume: number; muted: boolean };
  streamPreferenceFor?: (streamId: string, userId?: string) => { volume: number; muted: boolean };
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
    const Tracker = headTrackingSource === "webcam" ? WebcamHeadTracker : HeadTracker;
    const tracker = new Tracker(
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
  }, [enabled, headTracking, headTrackingSource]);
  useEffect(() => { playback.current?.setHeadphones(headphones); }, [headphones]);
  useEffect(() => {
    const seats = personalTableLayout(seatOrder, hostId, seatPans, width);
    playback.current?.update(streams.filter(({ stream }) => stream.getAudioTracks().length > 0).map(({ connectionId, stream, kind }) => {
      const person = participants.find((p) => p.connectionId === connectionId);
      const pref = person ? preferenceFor(person.id) : { volume: 1, muted: false };
      const isScreen = kind
        ? kind === "screen"
        : stream.id === person?.screenStreamId || stream.getVideoTracks().length > 0;
      const voice = person && !person.bot && !person.recorder && !isScreen;
      const seat = voice ? seats.get(connectionId) : undefined;

      let volume = pref.volume;
      let muted = deafened || pref.muted || Boolean(person?.muted || person?.serverMuted);

      if (isScreen) {
        const streamPref = streamPreferenceFor ? streamPreferenceFor(stream.id, person?.id) : null;
        volume = streamPref ? streamPref.volume : 1;
        // Screenshare audio stays audible even when the streamer mutes their microphone!
        // It only mutes if the watcher is deafened, the watcher muted this stream, or the audio tracks are disabled.
        const tracksDisabled = !stream.getAudioTracks().some((t) => t.enabled);
        muted = deafened || Boolean(streamPref?.muted) || tracksDisabled;
      }

      return {
        key: `${connectionId}:${stream.id}`, stream,
        important: Boolean(voice && person?.important && !person?.muted && !person?.serverMuted),
        volume,
        muted,
        pan: voice ? seat?.pan ?? null : null,
        seat: seat ? { x: seat.x, y: seat.y, z: seat.z } : null,
      };
    }), enabled);
  }, [streams, participants, listenerId, enabled, hostId, seatOrder, seatPans, width, deafened, preferenceFor, streamPreferenceFor]);
  return null;
}
