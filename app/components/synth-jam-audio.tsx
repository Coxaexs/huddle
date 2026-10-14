"use client";

import { useEffect, useRef } from "react";
import { cleanSynthPlay } from "@/lib/gesture-synth";
import type { ClientEvent } from "@/lib/protocol";
import { attachJamSender, clearSeats, hearSeat, jamEngine, jamSeats, sweepSeats } from "../lib/synth-jam";

/**
 * Plays everyone's Gesture Synth while you are in a voice room, whichever
 * channel you are looking at, and lends the activity panel the hub so your own
 * hands reach the others. Renders nothing.
 */
export function SynthJamAudio({
  channelId,
  send,
  deafened,
  preferenceFor,
  serverNow,
}: {
  channelId: string;
  send: (event: ClientEvent) => boolean;
  deafened: boolean;
  /** The hub's clock: everyone's rhythm runs on a beat grid laid on it. */
  serverNow: () => number;
  /** The listener's own volume and mute for that person, as for their voice. */
  preferenceFor: (userId: string) => { volume: number; muted: boolean };
}) {
  const preferenceRef = useRef(preferenceFor);
  preferenceRef.current = preferenceFor;

  useEffect(() => {
    jamEngine.setDeafened(deafened);
  }, [deafened]);

  useEffect(() => {
    jamEngine.setClock(serverNow);
    return () => jamEngine.setClock(null);
  }, [serverNow]);

  useEffect(() => {
    for (const seat of jamSeats()) {
      if (!seat.userId) continue;
      const pref = preferenceFor(seat.userId);
      hearSeat(seat, pref.muted ? 0 : pref.volume);
    }
  }, [preferenceFor]);

  useEffect(() => {
    attachJamSender((play) => send({ t: "synth", ...play }));
    const onSynth = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (detail?.channelId !== channelId || typeof detail.connectionId !== "string") return;
      const play = cleanSynthPlay(detail.play);
      if (!play) return;
      const userId = typeof detail.userId === "string" ? detail.userId : "";
      const preference = preferenceRef.current(userId);
      hearSeat(
        {
          connectionId: detail.connectionId,
          userId,
          name: typeof detail.displayName === "string" && detail.displayName ? detail.displayName : "Someone",
          play,
        },
        preference.muted ? 0 : preference.volume,
      );
    };
    window.addEventListener("huddle-synth", onSynth);
    const sweep = window.setInterval(() => sweepSeats(), 500);
    return () => {
      window.removeEventListener("huddle-synth", onSynth);
      window.clearInterval(sweep);
      attachJamSender(null);
      clearSeats();
    };
  }, [channelId, send]);

  return null;
}
