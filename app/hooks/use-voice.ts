"use client";

/**
 * Huddle voice, powered by a self-hosted LiveKit SFU.
 *
 * This replaces the old WebRTC mesh (see use-voice-mesh.ts). A mesh behind
 * carrier-grade NAT relays everything through the TURN server, which is both
 * O(N²) heavy on the home uplink and fragile — one failed peer pair silences a
 * single person. An SFU gives every client exactly one reliable uplink, and its
 * selective forwarding (simulcast/dynacast) carries far less than a fully
 * relayed mesh.
 *
 * The exported `useVoice` keeps the exact same signature and return shape as
 * the mesh version, so the two consumers (app/chat-shell.tsx and the D&D
 * production studio) need no changes at all.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent } from "@/lib/protocol";
import { apiFetch } from "../lib/client";
import {
  cameraConstraints,
  microphoneConstraints,
  unlockAudio,
} from "../lib/devices";
import { isTypingTarget, matchesCombo } from "../lib/hotkeys";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type TrackPublication,
} from "livekit-client";

export type ScreenShareQuality = "720p30" | "1080p30" | "1080p60";

const SCREEN_SHARE_CONSTRAINTS: Record<
  ScreenShareQuality,
  { width: number; height: number; frameRate: number }
> = {
  "720p30": { width: 1280, height: 720, frameRate: 30 },
  "1080p30": { width: 1920, height: 1080, frameRate: 30 },
  "1080p60": { width: 1920, height: 1080, frameRate: 60 },
};

/** Per-uplink bitrate caps. In an SFU these directly bound relayed bandwidth. */
const CAMERA_ENCODING = { maxBitrate: 600_000, maxFramerate: 30 };
const SCREEN_ENCODING: Record<
  ScreenShareQuality,
  { maxBitrate: number; maxFramerate: number }
> = {
  "720p30": { maxBitrate: 2_500_000, maxFramerate: 30 },
  "1080p30": { maxBitrate: 4_000_000, maxFramerate: 30 },
  "1080p60": { maxBitrate: 6_000_000, maxFramerate: 60 },
};

/** How much of the room "Clip that!" keeps buffered. */
const CLIP_SECONDS = 30;

interface UseVoiceOptions {
  connectionId: string | null;
  /** Every live voice room, keyed by channel id, as the hub sees them. */
  rooms: Record<string, import("@/lib/protocol").VoiceParticipant[]>;
  send: (event: ClientEvent) => boolean;
  /** Recorder capture pages disable the unrelated rolling "Clip that!" buffer. */
  enableClips?: boolean;
}

/** A single remote participant's surfaced stream (audio or one video source). */
export interface RemoteStream {
  connectionId: string;
  stream: MediaStream;
  /** Video sources travel as their own stream so tiles can label camera/screen. */
  kind?: "camera" | "screen";
}

export function useVoice({
  connectionId,
  rooms,
  send,
  enableClips = true,
}: UseVoiceOptions) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  /** Push-to-talk: when on, the mic is open only while the PTT key is held. */
  const [pushToTalk, setPushToTalkState] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem("huddle-ptt") === "on",
  );
  const [pttKey, setPttKeyState] = useState(
    () =>
      (typeof window !== "undefined" &&
        window.localStorage.getItem("huddle-ptt-key")) ||
      "Space",
  );
  const [pttHeld, setPttHeld] = useState(false);
  const [muteKey, setMuteKeyState] = useState(
    () =>
      (typeof window !== "undefined" &&
        window.localStorage.getItem("huddle-mute-key")) ||
      "Ctrl+Shift+KeyM",
  );
  const [deafenKey, setDeafenKeyState] = useState(
    () =>
      (typeof window !== "undefined" &&
        window.localStorage.getItem("huddle-deafen-key")) ||
      "Ctrl+Shift+KeyD",
  );
  const [deafened, setDeafened] = useState(false);
  /** Muted for everyone by someone else; you cannot undo it yourself. */
  const [forcedMute, setForcedMuteState] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [screenSharing, setScreenSharing] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  /** Your own video, so you can see what everyone else is seeing. */
  const [localVideos, setLocalVideos] = useState<
    Array<{ kind: "camera" | "screen"; stream: MediaStream }>
  >([]);
  const [screenQuality, setScreenQuality] =
    useState<ScreenShareQuality>("1080p30");
  const [error, setError] = useState("");
  /** Per-participant connection state, so tiles can say "connecting". */
  const [peerStates, setPeerStates] = useState<Record<string, string>>({});

  const roomRef = useRef<Room | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  /** `${identity}:${source}` -> surfaced stream for the UI. */
  const remoteStreamsRef = useRef(new Map<string, RemoteStream>());
  const channelIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const participantCountRef = useRef(0);
  const connectionIdRef = useRef(connectionId);
  connectionIdRef.current = connectionId;
  // "Clip that!": a rolling buffer of the last CLIP_SECONDS of the room.
  const clipRecorderRef = useRef<MediaRecorder | null>(null);
  const clipChunksRef = useRef<Array<{ at: number; data: Blob }>>([]);
  const clipMixRef = useRef<{
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
    sources: Map<string, MediaStreamAudioSourceNode>;
  } | null>(null);
  channelIdRef.current = channelId;

  const applyRemoteStreams = useCallback(() => {
    setRemoteStreams([...remoteStreamsRef.current.values()]);
  }, []);

  const playRoomTone = useCallback((kind: "join" | "leave") => {
    try {
      audioContextRef.current ||= new AudioContext();
      const context = audioContextRef.current;
      void context.resume();
      const start = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.09, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      gain.connect(context.destination);
      const notes = kind === "join" ? [520, 700] : [620, 410];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(start + index * 0.055);
        oscillator.stop(start + 0.11 + index * 0.055);
      });
    } catch {
      // Voice remains usable when Web Audio is unavailable.
    }
  }, []);

  /** Creates the LiveKit Room once and wires the SFU media events. */
  const ensureRoom = useCallback(() => {
    if (roomRef.current) return roomRef.current;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        publication: TrackPublication,
        participant: RemoteParticipant,
      ) => {
        const identity = participant.identity;
        const key = `${identity}:${publication.source}`;
        const existing = remoteStreamsRef.current.get(key);
        if (existing) {
          // A new encoding for an already-surfaced track: keep the same
          // MediaStream object so <audio>/<video> elements do not remount.
          if (
            !existing.stream
              .getTracks()
              .some((t) => t.id === track.mediaStreamTrack.id)
          ) {
            existing.stream.addTrack(track.mediaStreamTrack);
          }
        } else {
          const kind =
            publication.source === Track.Source.Camera
              ? "camera"
              : publication.source === Track.Source.ScreenShare
                ? "screen"
                : undefined;
          const stream =
            track.mediaStream ?? new MediaStream([track.mediaStreamTrack]);
          remoteStreamsRef.current.set(key, {
            connectionId: identity,
            stream,
            kind,
          });
        }
        setPeerStates((current) => ({
          ...current,
          [identity]: "connected",
        }));
        applyRemoteStreams();
      },
    );

    room.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      const key = `${participant.identity}:${publication.source}`;
      const entry = remoteStreamsRef.current.get(key);
      if (entry) {
        try {
          entry.stream.getTracks().forEach((t) => t.stop());
        } catch {
          // Ignore dispose errors.
        }
        remoteStreamsRef.current.delete(key);
        applyRemoteStreams();
      }
    });

    room.on(RoomEvent.ParticipantConnected, (participant) => {
      setPeerStates((current) => ({
        ...current,
        [participant.identity]: "connecting",
      }));
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      const identity = participant.identity;
      for (const key of [...remoteStreamsRef.current.keys()]) {
        if (key.startsWith(`${identity}:`)) {
          const entry = remoteStreamsRef.current.get(key);
          try {
            entry?.stream.getTracks().forEach((t) => t.stop());
          } catch {
            // Ignore dispose errors.
          }
          remoteStreamsRef.current.delete(key);
        }
      }
      setPeerStates((current) => {
        const next = { ...current };
        delete next[identity];
        return next;
      });
      applyRemoteStreams();
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const next = new Set<string>();
      for (const speaker of speakers) {
        next.add(
          speaker.identity === connectionIdRef.current
            ? "self"
            : speaker.identity,
        );
      }
      setSpeaking(next);
    });

    room.on(RoomEvent.Disconnected, () => {
      remoteStreamsRef.current.clear();
      applyRemoteStreams();
      setSpeaking(new Set());
      setPeerStates({});
    });

    return room;
  }, [applyRemoteStreams]);

  // Central mic gate: the published track is live only when not force-muted and
  // either (push-to-talk held) or (not muted).
  useEffect(() => {
    const on = !forcedMute && (pushToTalk ? pttHeld : !muted);
    if (roomRef.current) {
      const lp = roomRef.current.localParticipant;
      const mic = lp?.audioTrackPublications
        ? [...lp.audioTrackPublications.values()][0]
        : undefined;
      const track = mic?.track?.mediaStreamTrack;
      if (track) track.enabled = on;
    }
    localStreamRef.current
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = on));
  }, [channelId, pushToTalk, pttHeld, muted, forcedMute]);

  // Push-to-talk keyboard binding (works while the window is focused; the
  // desktop app relays a global hotkey to pttPress/pttRelease below).
  useEffect(() => {
    if (!pushToTalk || !channelId) return;
    const down = (event: KeyboardEvent) => {
      if (event.code === pttKey && !event.repeat) {
        event.preventDefault();
        setPttHeld(true);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === pttKey) setPttHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      setPttHeld(false);
    };
  }, [pushToTalk, channelId, pttKey]);



  useEffect(() => {
    if (!channelId) {
      participantCountRef.current = 0;
      return;
    }
    const count = (rooms[channelId] || []).filter((person) => !person.bot).length;
    const previous = participantCountRef.current;
    if (previous && count !== previous) {
      playRoomTone(count > previous ? "join" : "leave");
    }
    participantCountRef.current = count;
  }, [channelId, rooms, playRoomTone]);

  /**
   * Keeps a rolling recording of the room so "Clip that!" can hand back the
   * last half-minute. Everyone's audio is mixed through one AudioContext.
   */
  useEffect(() => {
    if (!channelId || !enableClips) return;
    let cancelled = false;

    const start = () => {
      try {
        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        const sources = new Map<string, MediaStreamAudioSourceNode>();
        clipMixRef.current = { context, destination, sources };

        const attach = (id: string, stream: MediaStream) => {
          if (sources.has(id) || !stream.getAudioTracks().length) return;
          try {
            const source = context.createMediaStreamSource(stream);
            source.connect(destination);
            sources.set(id, source);
          } catch {
            // A stream that refuses to connect just misses the clip.
          }
        };
        if (localStreamRef.current) attach("self", localStreamRef.current);

        const tracks: MediaStreamTrack[] = [...destination.stream.getAudioTracks()];
        const screenVideo = screenStreamRef.current?.getVideoTracks()[0];
        if (screenVideo) tracks.push(screenVideo);

        const recorder = new MediaRecorder(new MediaStream(tracks), {
          mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
            ? "video/webm;codecs=vp8,opus"
            : "audio/webm",
          bitsPerSecond: 1_500_000,
        });
        recorder.ondataavailable = (event) => {
          if (!event.data.size) return;
          const now = Date.now();
          clipChunksRef.current.push({ at: now, data: event.data });
          const cutoff = now - CLIP_SECONDS * 1000;
          while (
            clipChunksRef.current.length > 1 &&
            clipChunksRef.current[0].at < cutoff
          ) {
            clipChunksRef.current.shift();
          }
        };
        recorder.start(1000);
        clipRecorderRef.current = recorder;
      } catch {
        // Clipping is a nicety; a browser that refuses just does not offer it.
      }
    };

    const timer = window.setTimeout(() => !cancelled && start(), 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      try {
        clipRecorderRef.current?.stop();
      } catch {
        // Already stopped.
      }
      clipRecorderRef.current = null;
      clipChunksRef.current = [];
      void clipMixRef.current?.context.close().catch(() => undefined);
      clipMixRef.current = null;
    };
  }, [channelId, enableClips]);

  // Remote people joining mid-call get folded into the clip mix.
  useEffect(() => {
    if (!enableClips) return;
    const mix = clipMixRef.current;
    if (!mix) return;
    for (const { connectionId: id, stream } of remoteStreams) {
      if (mix.sources.has(id) || !stream.getAudioTracks().length) continue;
      try {
        const source = mix.context.createMediaStreamSource(stream);
        source.connect(mix.destination);
        mix.sources.set(id, source);
      } catch {
        // Skip a stream the context will not take.
      }
    }
  }, [enableClips, remoteStreams]);

  /** Hands back the buffered clip as a file, or null when there is nothing. */
  const takeClip = useCallback(async (): Promise<Blob | null> => {
    const recorder = clipRecorderRef.current;
    if (!recorder) return null;
    try {
      recorder.requestData();
    } catch {
      // Some browsers only emit on the timeslice; the buffer still works.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    const chunks = clipChunksRef.current.map((entry) => entry.data);
    if (!chunks.length) return null;
    return new Blob(chunks, { type: recorder.mimeType || "video/webm" });
  }, []);

  const setPushToTalk = useCallback((enabled: boolean) => {
    setPushToTalkState(enabled);
    window.localStorage.setItem("huddle-ptt", enabled ? "on" : "off");
    if (!enabled) setPttHeld(false);
  }, []);
  const setPttKey = useCallback((code: string) => {
    setPttKeyState(code);
    window.localStorage.setItem("huddle-ptt-key", code);
  }, []);
  const pttPress = useCallback(() => setPttHeld(true), []);
  const pttRelease = useCallback(() => setPttHeld(false), []);
  const setMuteKey = useCallback((combo: string) => {
    setMuteKeyState(combo);
    window.localStorage.setItem("huddle-mute-key", combo);
  }, []);
  const setDeafenKey = useCallback((combo: string) => {
    setDeafenKeyState(combo);
    window.localStorage.setItem("huddle-deafen-key", combo);
  }, []);

  const announceVideo = useCallback(() => {
    send({
      t: "voice-state",
      cameraStreamId: cameraStreamRef.current?.id || null,
      screenStreamId: screenStreamRef.current?.id || null,
    });
  }, [send]);

  const leave = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      try {
        room.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    playRoomTone("leave");
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamsRef.current.clear();
    applyRemoteStreams();
    setSpeaking(new Set());
    setPeerStates({});
    channelIdRef.current = null;
    setChannelId(null);
    setLocalVideos([]);
    setScreenSharing(false);
    setCameraOn(false);
    send({ t: "voice-leave" });
  }, [applyRemoteStreams, playRoomTone, send]);

  const join = useCallback(
    async (nextChannelId: string) => {
      setError("");
      // Re-selecting the room you are already in is a no-op: the stage view owns
      // "leave" now (an explicit Disconnect button).
      if (channelIdRef.current === nextChannelId) return;
      if (channelIdRef.current) leave();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: microphoneConstraints(),
        });
        // Joining is a real gesture, which is the only moment a phone will let
        // us start playing everyone else's audio.
        unlockAudio();
        localStreamRef.current = stream;
        setMuted(false);
        setDeafened(false);
        channelIdRef.current = nextChannelId;
        setChannelId(nextChannelId);
        participantCountRef.current = Math.max(
          1,
          (rooms[nextChannelId] || []).filter((person) => !person.bot).length +
            1,
        );
        send({ t: "voice-join", channelId: nextChannelId });
        playRoomTone("join");

        const room = ensureRoom();
        try {
          const joinInfo = await apiFetch<{
            configured: boolean;
            url?: string;
            token?: string;
          }>(
            `/api/voice/livekit-token?room=${encodeURIComponent(
              nextChannelId,
            )}&identity=${encodeURIComponent(
              connectionId || "",
            )}&name=${encodeURIComponent(connectionId || "")}`,
          );
          if (!joinInfo.configured || !joinInfo.url || !joinInfo.token) {
            setError(
              "Voice server is not configured yet — tell whoever runs the server to set LIVEKIT_URL.",
            );
            await leave();
            return;
          }
          await room.connect(joinInfo.url, joinInfo.token, {
            autoSubscribe: true,
          });
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            await room.localParticipant.publishTrack(audioTrack, {
              source: Track.Source.Microphone,
            });
          }
        } catch {
          setError("Could not connect to the voice server. Try again.");
          try {
            room.disconnect();
          } catch {
            // Ignore.
          }
          await leave();
        }
      } catch {
        setError(
          "Microphone access was blocked. Allow it in your browser settings to join voice.",
        );
      }
    },
    [connectionId, ensureRoom, leave, playRoomTone, rooms, send],
  );

  /** Applied when someone server-mutes you: the microphone actually stops. */
  const setForcedMute = useCallback((next: boolean) => {
    setForcedMuteState(next);
    if (next) {
      if (roomRef.current) {
        const lp = roomRef.current.localParticipant;
        const mic = lp?.audioTrackPublications
          ? [...lp.audioTrackPublications.values()][0]
          : undefined;
        const track = mic?.track?.mediaStreamTrack;
        if (track) track.enabled = false;
      }
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      setMuted(true);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (forcedMute) return;
    const next = !muted;
    if (roomRef.current) {
      const lp = roomRef.current.localParticipant;
      const mic = lp?.audioTrackPublications
        ? [...lp.audioTrackPublications.values()][0]
        : undefined;
      const track = mic?.track?.mediaStreamTrack;
      if (track) track.enabled = !next;
    }
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
    send({ t: "voice-state", muted: next });
  }, [forcedMute, muted, send]);

  const toggleDeafen = useCallback(() => {
    const next = !deafened;
    setDeafened(next);
    // Deafening also mutes you, the way Discord does it.
    if (next && !muted) {
      toggleMute();
    }
    send({ t: "voice-state", deafened: next, muted: next ? true : muted });
  }, [deafened, muted, send, toggleMute]);

  const stopCamera = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOn(false);
    announceVideo();
    const room = roomRef.current;
    if (room) {
      for (const track of stream.getTracks()) {
        void room.localParticipant.unpublishTrack(track, false);
      }
    }
    setLocalVideos((current) =>
      current.filter((entry) => entry.kind !== "camera"),
    );
  }, [announceVideo]);

  const startCamera = useCallback(async () => {
    if (!channelIdRef.current) {
      setError("Join a voice channel before turning your camera on.");
      return;
    }
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraConstraints(),
      });
      cameraStreamRef.current = stream;
      setCameraOn(true);
      announceVideo();
      stream.getVideoTracks()[0]?.addEventListener("ended", stopCamera, {
        once: true,
      });
      setLocalVideos((current) => [
        ...current.filter((entry) => entry.kind !== "camera"),
        { kind: "camera", stream },
      ]);
      const room = roomRef.current;
      const videoTrack = stream.getVideoTracks()[0];
      if (room && videoTrack) {
        await room.localParticipant.publishTrack(videoTrack, {
          source: Track.Source.Camera,
          videoEncoding: CAMERA_ENCODING,
        });
      }
    } catch (cameraError) {
      if ((cameraError as DOMException)?.name !== "NotAllowedError") {
        setError("Your camera could not start. Another app may be using it.");
      } else {
        setError("Camera access was blocked. Allow it in your browser settings.");
      }
    }
  }, [announceVideo, stopCamera]);

  const stopScreenShare = useCallback(() => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenSharing(false);
    announceVideo();
    const room = roomRef.current;
    if (room) {
      for (const track of stream.getTracks()) {
        void room.localParticipant.unpublishTrack(track, false);
      }
    }
    setLocalVideos((current) =>
      current.filter((entry) => entry.kind !== "screen"),
    );
  }, [announceVideo]);

  const startScreenShare = useCallback(
    async (quality: ScreenShareQuality = screenQuality) => {
      if (!channelIdRef.current) {
        setError("Join a voice channel before sharing your screen.");
        return;
      }
      stopScreenShare();
      try {
        const profile = SCREEN_SHARE_CONSTRAINTS[quality];
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: profile.width, max: profile.width },
            height: { ideal: profile.height, max: profile.height },
            frameRate: { ideal: profile.frameRate, max: profile.frameRate },
          },
          audio: true,
        });
        screenStreamRef.current = stream;
        setScreenQuality(quality);
        setScreenSharing(true);
        announceVideo();
        stream.getVideoTracks()[0].addEventListener("ended", stopScreenShare, {
          once: true,
        });
        setLocalVideos((current) => [
          ...current.filter((entry) => entry.kind !== "screen"),
          { kind: "screen", stream },
        ]);
        const room = roomRef.current;
        if (room) {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            await room.localParticipant.publishTrack(videoTrack, {
              source: Track.Source.ScreenShare,
              screenShareEncoding: SCREEN_ENCODING[quality],
            });
          }
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            await room.localParticipant.publishTrack(audioTrack, {
              source: Track.Source.ScreenShareAudio,
            });
          }
        }
      } catch (shareError) {
        if ((shareError as DOMException)?.name !== "NotAllowedError") {
          setError(
            "Screen sharing could not start. Try a lower quality setting.",
          );
        }
      }
    },
    [announceVideo, screenQuality, stopScreenShare],
  );

  /**
   * Swaps the microphone without dropping the call: the old published track is
   * removed and the new one takes its place, so nobody hears a reconnect.
   */
  const switchMicrophone = useCallback(async () => {
    if (!localStreamRef.current) return;
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
        audio: microphoneConstraints(),
      });
      const track = replacement.getAudioTracks()[0];
      if (!track) return;
      track.enabled = !muted;

      const oldStream = localStreamRef.current;
      const oldTracks = oldStream.getAudioTracks();
      oldTracks.forEach((oldTrack) => oldTrack.stop());
      localStreamRef.current = new MediaStream([track]);

      const room = roomRef.current;
      if (room) {
        for (const oldTrack of oldTracks) {
          await room.localParticipant
            .unpublishTrack(oldTrack, false)
            .catch(() => undefined);
        }
        await room.localParticipant.publishTrack(track, {
          source: Track.Source.Microphone,
        });
      }
    } catch {
      setError("That microphone could not be opened.");
    }
  }, [muted]);

  /** Per-person volume for the right-click member menu (0..1). */
  const setParticipantVolume = useCallback(
    (targetConnectionId: string, volume: number) => {
      const room = roomRef.current;
      const remote = room?.remoteParticipants?.get(targetConnectionId);
      remote?.setVolume(volume);
    },
    [],
  );

  /** The hub may still forward mesh signals; an SFU room ignores them. */
  const handleSignal = useCallback((_from: string, _data: unknown) => {
    // Signaling now goes browser <-> LiveKit directly, not through the hub.
  }, []);

  /**
   * Mute and deafen shortcuts. They only apply while you are in a room, and
   * never while you are typing. On the desktop app the global accelerator is
   * swallowed by Electron before it reaches here.
   */
  useEffect(() => {
    if (!channelId) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (muteKey && matchesCombo(event, muteKey)) {
        event.preventDefault();
        toggleMute();
        return;
      }
      if (deafenKey && matchesCombo(event, deafenKey)) {
        event.preventDefault();
        toggleDeafen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channelId, muteKey, deafenKey, toggleMute, toggleDeafen]);

  useEffect(() => () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    try {
      roomRef.current?.disconnect();
    } catch {
      // Already disconnected.
    }
    roomRef.current = null;
    void audioContextRef.current?.close();
  }, []);

  return {
    channelId,
    muted,
    forcedMute,
    setForcedMute,
    deafened,
    speaking,
    remoteStreams,
    peerStates,
    screenSharing,
    screenQuality,
    setScreenQuality,
    startScreenShare,
    stopScreenShare,
    cameraOn,
    startCamera,
    stopCamera,
    switchMicrophone,
    localVideos,
    error,
    setError,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    handleSignal,
    setParticipantVolume,
    takeClip,
    clipSeconds: CLIP_SECONDS,
    pushToTalk,
    pttKey,
    pttHeld,
    muteKey,
    deafenKey,
    setMuteKey,
    setDeafenKey,
    setPushToTalk,
    setPttKey,
    pttPress,
    pttRelease,
  };
}
