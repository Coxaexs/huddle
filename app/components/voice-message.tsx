"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Send, Trash2 } from "lucide-react";

/** Longest voice message; recording stops and sends itself at this point. */
export const MAX_VOICE_MS = 5 * 60 * 1000;
const WAVEFORM_BARS = 48;

export interface VoiceClip {
  blob: Blob;
  durationMs: number;
  /** WAVEFORM_BARS levels, 0–100. */
  waveform: number[];
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"].find(
    (type) => MediaRecorder.isTypeSupported(type),
  );
}

/** Squashes the sampled levels into a fixed number of bars, scaled to 0–100. */
function toWaveform(levels: number[]): number[] {
  if (!levels.length) return Array(WAVEFORM_BARS).fill(8);
  const bars: number[] = [];
  for (let i = 0; i < WAVEFORM_BARS; i += 1) {
    const from = Math.floor((i * levels.length) / WAVEFORM_BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / WAVEFORM_BARS));
    const slice = levels.slice(from, to);
    bars.push(slice.reduce((sum, v) => sum + v, 0) / slice.length);
  }
  const peak = Math.max(...bars, 0.01);
  return bars.map((v) => Math.max(6, Math.round((v / peak) * 100)));
}

type RecorderState = "idle" | "recording" | "paused" | "sending";

/**
 * Microphone recording for voice messages: MediaRecorder for the audio plus an
 * analyser sampling the level ten times a second for the live meter and the
 * waveform that ships with the message.
 */
export function useVoiceRecorder(onSend: (clip: VoiceClip) => Promise<void>) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState("");
  const sessionRef = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    context: AudioContext;
    timer: number;
    startedAt: number;
    /** Time spent paused so far, and when the current pause began. */
    pausedTotal: number;
    pausedAt: number | null;
    chunks: Blob[];
    levels: number[];
    cancelled: boolean;
  } | null>(null);
  /** Recorded time so far, not counting pauses. */
  const recordedMs = (session: { startedAt: number; pausedTotal: number; pausedAt: number | null }) => {
    const now = performance.now();
    return now - session.startedAt - session.pausedTotal - (session.pausedAt ? now - session.pausedAt : 0);
  };
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const teardown = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    window.clearInterval(session.timer);
    session.stream.getTracks().forEach((track) => track.stop());
    void session.context.close().catch(() => undefined);
  }, []);

  const finish = useCallback(
    (send: boolean) => {
      const session = sessionRef.current;
      if (!session) return;
      session.cancelled = !send;
      if (session.recorder.state !== "inactive") session.recorder.stop();
      else teardown();
    },
    [teardown],
  );

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    setError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice messages aren't supported in this browser.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("Microphone access was blocked.");
      return;
    }
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 48000,
    });
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const session = {
      recorder,
      stream,
      context,
      timer: 0,
      startedAt: performance.now(),
      pausedTotal: 0,
      pausedAt: null as number | null,
      chunks: [] as Blob[],
      levels: [] as number[],
      cancelled: false,
    };
    sessionRef.current = session;

    recorder.ondataavailable = (event) => {
      if (event.data.size) session.chunks.push(event.data);
    };
    recorder.onstop = () => {
      const durationMs = recordedMs(session);
      teardown();
      sessionRef.current = null;
      setLevels([]);
      setElapsedMs(0);
      if (session.cancelled || durationMs < 500 || !session.chunks.length) {
        setState("idle");
        return;
      }
      const blob = new Blob(session.chunks, {
        type: (recorder.mimeType || mimeType || "audio/webm").split(";")[0],
      });
      setState("sending");
      void onSendRef
        .current({ blob, durationMs, waveform: toWaveform(session.levels) })
        .catch((sendError: unknown) =>
          setError(sendError instanceof Error ? sendError.message : "Couldn't send that voice message."),
        )
        .finally(() => setState("idle"));
    };

    session.timer = window.setInterval(() => {
      if (session.pausedAt) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const v = (sample - 128) / 128;
        sum += v * v;
      }
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 3);
      session.levels.push(level);
      setLevels((current) => [...current.slice(-39), level]);
      const elapsed = recordedMs(session);
      setElapsedMs(elapsed);
      if (elapsed >= MAX_VOICE_MS) finish(true);
    }, 100);

    recorder.start(1000);
    setState("recording");
  }, [finish, teardown]);

  const togglePause = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (session.recorder.state === "recording") {
      session.recorder.pause();
      session.pausedAt = performance.now();
      setState("paused");
    } else if (session.recorder.state === "paused") {
      session.pausedTotal += performance.now() - (session.pausedAt ?? performance.now());
      session.pausedAt = null;
      session.recorder.resume();
      setState("recording");
    }
  }, []);

  // Esc throws the recording away.
  useEffect(() => {
    if (state !== "recording" && state !== "paused") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, finish]);

  // Never leave the mic open if the composer goes away mid-recording.
  useEffect(
    () => () => {
      if (sessionRef.current) {
        sessionRef.current.cancelled = true;
        if (sessionRef.current.recorder.state !== "inactive") sessionRef.current.recorder.stop();
        teardown();
      }
    },
    [teardown],
  );

  return {
    state,
    elapsedMs,
    levels,
    error,
    clearError: () => setError(""),
    start: () => void start(),
    togglePause,
    send: () => finish(true),
    cancel: () => finish(false),
  };
}

export type VoiceRecorder = ReturnType<typeof useVoiceRecorder>;

/** Replaces the composer while recording: timer, live meter, cancel and send. */
export function VoiceRecordingBar({ recorder }: { recorder: VoiceRecorder }) {
  const bars = [...Array(Math.max(0, 40 - recorder.levels.length)).fill(0), ...recorder.levels];
  const sending = recorder.state === "sending";
  const paused = recorder.state === "paused";
  return (
    <div className="voice-recording-bar" role="group" aria-label="Recording a voice message">
      <button
        type="button"
        className="voice-recording-cancel"
        onClick={recorder.cancel}
        disabled={sending}
        aria-label="Discard recording"
        title="Discard (Esc)"
      >
        <Trash2 size={16} />
      </button>
      <span
        className={`voice-recording-dot ${sending ? "sending" : paused ? "paused" : ""}`}
      />
      <span className="voice-recording-time">
        {sending ? "Sending…" : formatDuration(recorder.elapsedMs)}
      </span>
      {paused && <span className="voice-recording-paused">Paused</span>}
      <div className="voice-recording-meter" aria-hidden="true">
        {bars.map((level, index) => (
          <i key={index} style={{ height: `${Math.max(8, level * 100)}%` }} />
        ))}
      </div>
      <button
        type="button"
        className="voice-recording-cancel voice-recording-pause"
        onClick={recorder.togglePause}
        disabled={sending}
        aria-label={paused ? "Resume recording" : "Pause recording"}
        title={paused ? "Resume" : "Pause"}
      >
        {paused ? <Mic size={16} /> : <Pause size={16} />}
      </button>
      <button
        type="button"
        className="send-button"
        onClick={recorder.send}
        disabled={sending}
        aria-label="Send voice message"
      >
        <Send size={15} />
      </button>
    </div>
  );
}

export function VoiceRecordButton({
  recorder,
  disabled,
}: {
  recorder: VoiceRecorder;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="send-button voice-record-button"
      onClick={recorder.start}
      disabled={disabled}
      aria-label="Record a voice message"
      title="Record a voice message"
    >
      <Mic size={16} />
    </button>
  );
}

/** Only one voice message plays at a time. */
let nowPlaying: HTMLAudioElement | null = null;

const SPEEDS = [1, 1.5, 2];

/** Playback for a voice message: play/pause, a seekable waveform, and speed. */
export function VoiceMessagePlayer({
  src,
  durationMs,
  waveform,
}: {
  src: string;
  durationMs?: number;
  waveform?: number[];
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [mediaDuration, setMediaDuration] = useState(0);
  // Recorded webm often reports an Infinity duration, so trust the sender's.
  const total =
    durationMs && durationMs > 0
      ? durationMs / 1000
      : Number.isFinite(mediaDuration)
        ? mediaDuration
        : 0;
  const bars =
    Array.isArray(waveform) && waveform.length
      ? waveform.slice(0, 96).map((v) => Math.max(6, Math.min(100, Number(v) || 0)))
      : Array(WAVEFORM_BARS).fill(30);
  const progress = total ? Math.min(1, position / total) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio && nowPlaying === audio) nowPlaying = null;
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (nowPlaying && nowPlaying !== audio) nowPlaying.pause();
      nowPlaying = audio;
      audio.playbackRate = speed;
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  function seek(event: React.PointerEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !total) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * total;
    setPosition(audio.currentTime);
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  return (
    <div className={`voice-message ${playing ? "playing" : ""}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setMediaDuration(event.currentTarget.duration)}
      />
      <button
        type="button"
        className="voice-message-toggle"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <div
        className="voice-message-wave"
        onPointerDown={seek}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(position)}
        tabIndex={0}
        onKeyDown={(event) => {
          const audio = audioRef.current;
          if (!audio || !total) return;
          if (event.key === "ArrowRight") audio.currentTime = Math.min(total, audio.currentTime + 5);
          if (event.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
        }}
      >
        {bars.map((height, index) => (
          <i
            key={index}
            className={index / bars.length < progress ? "played" : ""}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <span className="voice-message-time">
        {formatDuration((playing || position > 0 ? position : total) * 1000)}
      </span>
      <button
        type="button"
        className="voice-message-speed"
        onClick={cycleSpeed}
        aria-label={`Playback speed ${speed}x`}
      >
        {speed}×
      </button>
    </div>
  );
}
