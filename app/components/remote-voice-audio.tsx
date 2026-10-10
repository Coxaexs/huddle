"use client";

import { useEffect, useRef } from "react";
import type { VoiceParticipant } from "@/lib/protocol";
import { SpatialAudioPlayback, personalTableLayout, type RoomShapeName } from "../lib/spatial-audio";
import type { HeardFrom } from "../lib/living-room";
import { HEAD_RECENTER_EVENT, HeadTracker, type HeadTrackingStatus } from "../lib/head-tracking";
import { WebcamHeadTracker } from "../lib/webcam-head-tracking";

export function RemoteVoiceAudio({ streams, participants, listenerId, enabled, hostId, seatOrder, seatPans, width, deafened, headTracking, headTrackingSource = "airpods", headphones = true, onHeadTracking, preferenceFor, streamPreferenceFor, livingRoom = null, tv = null, roomShape = "table", spatialOff = false }: {
  streams: Array<{ connectionId: string; stream: MediaStream; kind?: "voice" | "camera" | "screen" | "tts" }>;
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
  /** While the living room is open, where each voice is relative to you replaces the table. */
  livingRoom?: Map<string, HeardFrom> | null;
  /** Living room: the music bot plays from the TV, heard from here. */
  tv?: HeardFrom | null;
  /** Which room's reverb to use: the table's, or the Living Room theme's. */
  roomShape?: RoomShapeName;
  /** The Living Room's "spatial voices" switch is off: play everything flat, table mode included. */
  spatialOff?: boolean;
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
  useEffect(() => { playback.current?.setRoomShape(roomShape); }, [roomShape]);
  useEffect(() => {
    const seats = personalTableLayout(seatOrder, hostId, seatPans, width);
    playback.current?.update(streams.filter(({ stream }) => stream.getAudioTracks().length > 0).map(({ connectionId, stream, kind }) => {
      const person = participants.find((p) => p.connectionId === connectionId);
      const pref = person ? preferenceFor(person.id) : { volume: 1, muted: false };
      const isScreen = kind
        ? kind === "screen"
        : stream.id === person?.screenStreamId || stream.getVideoTracks().length > 0;
      const voice = person && !person.bot && !person.recorder && !isScreen;
      const music = Boolean(person?.bot && person.id === "bot:music" && !isScreen);
      const placed = music ? tv ?? undefined : spatialOff ? undefined : livingRoom?.get(connectionId);
      const tableSeat = !spatialOff && (voice || (kind === "tts" && person)) ? seats.get(connectionId) : undefined;
      const seat = placed && (music || voice || (kind === "tts" && person))
        ? { pan: placed.pan, ...placed.seat, attenuation: placed.attenuation, privacy: placed.privacy, cutoff: placed.cutoff, wet: placed.wet }
        : tableSeat && { ...tableSeat, attenuation: 1, privacy: 1, cutoff: undefined, wet: undefined };

      let volume = pref.volume;
      let muted = deafened || pref.muted || Boolean(person?.muted || person?.serverMuted);
      // /say speech is typed, so a muted mic does not silence it; a server mute does.
      if (kind === "tts") muted = deafened || pref.muted || Boolean(person?.serverMuted);

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
        pan: seat ? seat.pan ?? null : null,
        seat: seat ? { x: seat.x, y: seat.y, z: seat.z } : null,
        attenuation: seat?.attenuation,
        hrtfAttenuation: seat?.privacy,
        cutoff: seat?.cutoff,
        wet: seat?.wet,
      };
    }), !spatialOff && (enabled || Boolean(livingRoom)) || Boolean(tv));
  }, [streams, participants, listenerId, enabled, hostId, seatOrder, seatPans, width, deafened, preferenceFor, streamPreferenceFor, livingRoom, tv, spatialOff]);
  return null;
}
