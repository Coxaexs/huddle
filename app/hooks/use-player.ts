"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playbackPosition, type PlayerState } from "@/lib/protocol";
import { registerMedia, unregisterMedia } from "../lib/devices";

interface UsePlayerOptions {
  /** The player for the voice room you are actually sitting in, if any. */
  state: PlayerState | null;
  serverNow: () => number;
  deafened: boolean;
  onEnded: (trackId: string) => void;
  /** True while the real server-side bot is publishing WebRTC audio. */
  streamed?: boolean;
}

/** Re-seek the element when it drifts further than this from the hub clock. */
const DRIFT_TOLERANCE_MS = 1500;
/** Four silent PCM samples. Playing it from a click unlocks this media element. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA";

/**
 * Plays the room's track locally, kept on the hub's clock.
 *
 * Nobody streams audio to anybody: every listener plays the same source and is
 * nudged back to the shared position, so a seek by one person moves everyone.
 */
export function usePlayer({
  state,
  serverNow,
  deafened,
  onEnded,
  streamed = false,
}: UsePlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackIdRef = useRef<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [position, setPosition] = useState(0);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      // No crossOrigin: the media hosts do not send CORS headers, and asking
      // for them makes the request fail outright.
      audioRef.current = audio;
      // Joins the shared registry: follows the chosen speaker, and one screen
      // tap can unlock it along with everyone's voice on a phone.
      registerMedia(audio);
    }
    return audioRef.current;
  }, []);

  const attempt = useCallback((audio: HTMLAudioElement) => {
    audio
      .play()
      .then(() => setBlocked(false))
      // Autoplay policy: needs one click before sound is allowed.
      .catch(() => setBlocked(true));
  }, []);

  // Track changes: load the new source and drop in at the shared position.
  useEffect(() => {
    const track = state?.track || null;
    if (!track || streamed) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      }
      trackIdRef.current = null;
      setBlocked(false);
      setPosition(0);
      return;
    }

    const audio = ensureAudio();
    if (trackIdRef.current !== track.id) {
      trackIdRef.current = track.id;
      audio.src = track.audioUrl;
      audio.currentTime = playbackPosition(state!, serverNow()) / 1000;
      if (!state!.paused) attempt(audio);
    }
  }, [state, serverNow, ensureAudio, attempt, streamed]);

  // Pause/resume and volume follow the room.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state?.track || streamed) return;
    audio.volume = deafened ? 0 : Math.max(0, Math.min(1, state.volume / 100));
    if (state.paused && !audio.paused) {
      audio.pause();
    } else if (!state.paused && audio.paused) {
      audio.currentTime = playbackPosition(state, serverNow()) / 1000;
      attempt(audio);
    }
  }, [state, deafened, serverNow, attempt, streamed]);

  // Ticks the visible position and corrects drift against the hub clock.
  useEffect(() => {
    if (!state?.track) return;
    const tick = () => {
      const expected = playbackPosition(state, serverNow());
      setPosition(expected);

      const audio = audioRef.current;
      if (!audio || state.paused || audio.paused || audio.seeking) return;
      const actual = audio.currentTime * 1000;
      if (Math.abs(actual - expected) > DRIFT_TOLERANCE_MS) {
        audio.currentTime = expected / 1000;
      }
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [state, serverNow]);

  // End of track: tell the hub, which decides what plays next.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handler = () => {
      if (trackIdRef.current) onEnded(trackIdRef.current);
    };
    audio.addEventListener("ended", handler);
    return () => audio.removeEventListener("ended", handler);
  }, [onEnded, state?.track?.id]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      unregisterMedia(audioRef.current);
      audioRef.current = null;
    },
    [],
  );

  /** Called from a click, which is what the autoplay policy wants. */
  const unblock = useCallback(() => {
    if (streamed) return;
    const audio = audioRef.current;
    if (!audio || !state?.track) return;
    audio.currentTime = playbackPosition(state, serverNow()) / 1000;
    attempt(audio);
  }, [state, serverNow, attempt, streamed]);

  /**
   * Prime the permanent room audio element while a join/play click is still on
   * the browser's user-activation stack. The real source may arrive seconds
   * later from the hub; reusing this unlocked element lets it start normally.
   */
  const prime = useCallback(() => {
    if (streamed) return;
    const audio = ensureAudio();
    if (state?.track) {
      audio.currentTime = playbackPosition(state, serverNow()) / 1000;
      attempt(audio);
      return;
    }

    audio.src = SILENT_WAV;
    const silentSource = audio.src;
    audio
      .play()
      .then(() => {
        setBlocked(false);
        // Do not clear a real track if hub state arrived while the promise was
        // resolving.
        if (audio.src === silentSource) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
      })
      .catch(() => setBlocked(true));
  }, [ensureAudio, state, serverNow, attempt, streamed]);

  return { position, blocked, unblock, prime };
}
