"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent, VoiceParticipant } from "@/lib/protocol";
import { apiFetch } from "../lib/client";
import {
  cameraConstraints,
  microphoneConstraints,
  unlockAudio,
} from "../lib/devices";

interface SignalPayload {
  kind: "offer" | "answer" | "candidate";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface UseVoiceOptions {
  connectionId: string | null;
  /** Every live voice room, keyed by channel id, as the hub sees them. */
  rooms: Record<string, VoiceParticipant[]>;
  send: (event: ClientEvent) => boolean;
}

export type ScreenShareQuality = "720p30" | "1080p30" | "1080p60";

const SCREEN_SHARE_CONSTRAINTS: Record<
  ScreenShareQuality,
  { width: number; height: number; frameRate: number }
> = {
  "720p30": { width: 1280, height: 720, frameRate: 30 },
  "1080p30": { width: 1920, height: 1080, frameRate: 30 },
  "1080p60": { width: 1920, height: 1080, frameRate: 60 },
};

const VOICE_BITRATE = 128_000;
const SCREEN_AUDIO_BITRATE = 256_000;
/** How much of the room "Clip that!" keeps buffered. */
const CLIP_SECONDS = 30;

async function tuneAudioSender(
  sender: RTCRtpSender,
  maxBitrate: number,
): Promise<void> {
  if (sender.track?.kind !== "audio") return;
  const parameters = sender.getParameters();
  if (!parameters.encodings.length) parameters.encodings = [{}];
  for (const encoding of parameters.encodings) {
    encoding.maxBitrate = maxBitrate;
    // Discontinuous transmission is useful for telephony, but its repeated
    // noise-floor switching is distracting in a persistent friends' room.
    // Not in the DOM typings yet, but implemented where it matters.
    (encoding as RTCRtpEncodingParameters & { dtx?: string }).dtx = "disabled";
  }
  await sender.setParameters(parameters).catch(() => undefined);
}

/**
 * Peer-to-peer voice, meshed.
 *
 * A Huddle voice room is a handful of friends, so everyone connects directly to
 * everyone else and the hub only carries the handshake. Who calls whom is
 * decided by comparing connection ids, which keeps both sides from offering at
 * the same time.
 */
export function useVoice({ connectionId, rooms, send }: UseVoiceOptions) {
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
  const [deafened, setDeafened] = useState(false);
  /** Muted for everyone by someone else; you cannot undo it yourself. */
  const [forcedMute, setForcedMuteState] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<
    Array<{ connectionId: string; stream: MediaStream }>
  >([]);
  const [screenSharing, setScreenSharing] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  /** Your own video, so you can see what everyone else is seeing. */
  const [localVideos, setLocalVideos] = useState<
    Array<{ kind: "camera" | "screen"; stream: MediaStream }>
  >([]);
  const [screenQuality, setScreenQuality] =
    useState<ScreenShareQuality>("1080p30");
  const [error, setError] = useState("");
  /** Per-peer RTCPeerConnection state, so tiles can say "connecting". */
  const [peerStates, setPeerStates] = useState<Record<string, string>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef(new Map<string, AnalyserNode>());
  const channelIdRef = useRef<string | null>(null);
  const restartedRef = useRef(new Set<string>());
  const negotiateRef = useRef<
    (remoteId: string, peer: RTCPeerConnection) => Promise<void>
  >(async () => {});
  const participantCountRef = useRef(0);
  // "Clip that!": a rolling buffer of the last CLIP_SECONDS of the room.
  const clipRecorderRef = useRef<MediaRecorder | null>(null);
  const clipChunksRef = useRef<Array<{ at: number; data: Blob }>>([]);
  const clipMixRef = useRef<{
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
    sources: Map<string, MediaStreamAudioSourceNode>;
  } | null>(null);
  channelIdRef.current = channelId;

  // Central mic gate: the track is live only when not force-muted and either
  // (push-to-talk held) or (not muted). Runs after any of those change so it
  // reconciles the direct track toggles elsewhere.
  useEffect(() => {
    const on = !forcedMute && (pushToTalk ? pttHeld : !muted);
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

  /**
   * Keeps a rolling recording of the room so "Clip that!" can hand back the
   * last half-minute. Everyone's audio is mixed through one AudioContext; when
   * someone is sharing a screen, that video rides along too.
   */
  useEffect(() => {
    if (!channelId) return;
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
          // Drop anything older than the window.
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

    // Give the mic a moment to exist before wiring the mix.
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
  }, [channelId]);

  // Remote people joining mid-call get folded into the clip mix.
  useEffect(() => {
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
  }, [remoteStreams]);

  /** Hands back the buffered clip as a file, or null when there is nothing. */
  const takeClip = useCallback(async (): Promise<Blob | null> => {
    const recorder = clipRecorderRef.current;
    if (!recorder) return null;
    // Flush whatever is pending so the clip ends at "now".
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

  useEffect(() => {
    apiFetch<{ iceServers: RTCIceServer[] }>("/api/voice/ice")
      .then((data) => {
        if (data.iceServers?.length) iceServersRef.current = data.iceServers;
      })
      .catch(() => undefined);
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

  /** Watches a stream's level so the UI can show who is talking. */
  const watchLevel = useCallback((id: string, stream: MediaStream) => {
    try {
      audioContextRef.current ||= new AudioContext();
      const context = audioContextRef.current;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analysersRef.current.set(id, analyser);
    } catch {
      // Level metering is cosmetic; ignore browsers that refuse.
    }
  }, []);

  useEffect(() => {
    if (!channelId) return;
    const buffer = new Uint8Array(256);
    const timer = window.setInterval(() => {
      const loud = new Set<string>();
      for (const [id, analyser] of analysersRef.current.entries()) {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (const sample of buffer) peak = Math.max(peak, Math.abs(sample - 128));
        if (peak > 8) loud.add(id);
      }
      setSpeaking((current) => {
        if (
          current.size === loud.size &&
          [...loud].every((id) => current.has(id))
        ) {
          return current;
        }
        return loud;
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, [channelId]);

  const closePeer = useCallback((remoteId: string) => {
    const peer = peersRef.current.get(remoteId);
    peer?.close();
    peersRef.current.delete(remoteId);
    restartedRef.current.delete(remoteId);
    setPeerStates((current) => {
      const next = { ...current };
      delete next[remoteId];
      return next;
    });
    pendingCandidatesRef.current.delete(remoteId);
    analysersRef.current.delete(remoteId);
    setRemoteStreams((current) =>
      current.filter((entry) => entry.connectionId !== remoteId),
    );
  }, []);

  const createPeer = useCallback(
    (remoteId: string) => {
      const existing = peersRef.current.get(remoteId);
      if (existing) return existing;

      const peer = new RTCPeerConnection({
        iceServers: iceServersRef.current,
      });
      peersRef.current.set(remoteId, peer);

      for (const track of localStreamRef.current?.getTracks() || []) {
        const sender = peer.addTrack(track, localStreamRef.current as MediaStream);
        if (track.kind === "audio") {
          void tuneAudioSender(sender, VOICE_BITRATE);
        }
      }
      for (const track of screenStreamRef.current?.getTracks() || []) {
        const sender = peer.addTrack(track, screenStreamRef.current as MediaStream);
        if (track.kind === "audio") {
          void tuneAudioSender(sender, SCREEN_AUDIO_BITRATE);
        }
      }
      for (const track of cameraStreamRef.current?.getTracks() || []) {
        peer.addTrack(track, cameraStreamRef.current as MediaStream);
      }

      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        send({
          t: "signal",
          to: remoteId,
          data: {
            kind: "candidate",
            candidate: event.candidate.toJSON(),
          } satisfies SignalPayload,
        });
      };

      peer.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        setRemoteStreams((current) => {
          const exists = current.some(
            (entry) =>
              entry.connectionId === remoteId && entry.stream.id === stream.id,
          );
          return exists ? current : [...current, { connectionId: remoteId, stream }];
        });
        if (event.track.kind === "audio") watchLevel(remoteId, stream);
      };

      peer.onconnectionstatechange = () => {
        setPeerStates((current) => ({
          ...current,
          [remoteId]: peer.connectionState,
        }));
        if (peer.connectionState === "closed") closePeer(remoteId);
      };

      peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState !== "failed") return;
        // One ICE restart covers a network that changed underneath us. If that
        // does not take, say so: silence with no explanation is the worst
        // possible failure mode here.
        if (!restartedRef.current.has(remoteId)) {
          restartedRef.current.add(remoteId);
          try {
            peer.restartIce();
          } catch {
            closePeer(remoteId);
          }
          return;
        }
        setError(
          "Could not reach someone in this room. Your network is blocking the direct connection and the relay could not take over.",
        );
        closePeer(remoteId);
      };

      return peer;
    },
    [closePeer, send, watchLevel],
  );

  const handleSignal = useCallback(
    async (from: string, raw: unknown) => {
      if (!channelIdRef.current) return;
      const data = raw as SignalPayload;
      const peer = createPeer(from);

      try {
        if (data.kind === "offer" && data.description) {
          await peer.setRemoteDescription(data.description);
          for (const candidate of pendingCandidatesRef.current.get(from) || []) {
            await peer.addIceCandidate(candidate).catch(() => undefined);
          }
          pendingCandidatesRef.current.delete(from);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          send({
            t: "signal",
            to: from,
            data: { kind: "answer", description: answer } satisfies SignalPayload,
          });

          // An answer can only carry the media the offer asked for. If we are
          // already sending video that has no m-line yet — a camera or screen
          // that was live before this person arrived — it needs its own round.
          const unsent = peer
            .getTransceivers()
            .some(
              (transceiver) =>
                transceiver.sender.track &&
                transceiver.currentDirection !== "sendrecv" &&
                transceiver.currentDirection !== "sendonly",
            );
          if (unsent) {
            await negotiateRef.current(from, peer).catch(() => undefined);
          }
        } else if (data.kind === "answer" && data.description) {
          await peer.setRemoteDescription(data.description);
          for (const candidate of pendingCandidatesRef.current.get(from) || []) {
            await peer.addIceCandidate(candidate).catch(() => undefined);
          }
          pendingCandidatesRef.current.delete(from);
        } else if (data.kind === "candidate" && data.candidate) {
          if (peer.remoteDescription) {
            await peer.addIceCandidate(data.candidate).catch(() => undefined);
          } else {
            // Candidates can beat the offer; hold them until there is a target.
            const queued = pendingCandidatesRef.current.get(from) || [];
            queued.push(data.candidate);
            pendingCandidatesRef.current.set(from, queued);
          }
        }
      } catch {
        // A failed handshake drops that one peer, not the whole room.
        closePeer(from);
      }
    },
    [closePeer, createPeer, send],
  );

  /** Offer to everyone already in the room whose id sorts below ours. */
  useEffect(() => {
    if (!channelId || !connectionId) return;
    const others = (rooms[channelId] || [])
      .filter((person) => person.connectionId !== connectionId);

    for (const person of others) {
      const remoteId = person.connectionId;
      if (peersRef.current.has(remoteId)) continue;
      // The server-side music publisher only answers offers, so listeners
      // always call it. Browser peers retain deterministic caller ordering.
      if (!person.bot && connectionId > remoteId) continue;
      const peer = createPeer(remoteId);
      void (async () => {
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          send({
            t: "signal",
            to: remoteId,
            data: { kind: "offer", description: offer } satisfies SignalPayload,
          });
        } catch {
          closePeer(remoteId);
        }
      })();
    }

    for (const remoteId of peersRef.current.keys()) {
      if (!others.some((person) => person.connectionId === remoteId)) {
        closePeer(remoteId);
      }
    }
  }, [rooms, channelId, connectionId, createPeer, closePeer, send]);

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

  const negotiatePeer = useCallback(
    async (remoteId: string, peer: RTCPeerConnection) => {
      if (peer.signalingState !== "stable") return;
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      send({
        t: "signal",
        to: remoteId,
        data: { kind: "offer", description: offer } satisfies SignalPayload,
      });
    },
    [send],
  );
  negotiateRef.current = negotiatePeer;

  /** Publishes which of your streams is the camera and which is the screen. */
  const announceVideo = useCallback(() => {
    send({
      t: "voice-state",
      cameraStreamId: cameraStreamRef.current?.id || null,
      screenStreamId: screenStreamRef.current?.id || null,
    });
    setLocalVideos(
      [
        cameraStreamRef.current
          ? { kind: "camera" as const, stream: cameraStreamRef.current }
          : null,
        screenStreamRef.current
          ? { kind: "screen" as const, stream: screenStreamRef.current }
          : null,
      ].filter(Boolean) as Array<{
        kind: "camera" | "screen";
        stream: MediaStream;
      }>,
    );
  }, [send]);

  const stopScreenShare = useCallback(() => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    const trackIds = new Set(stream.getTracks().map((track) => track.id));
    stream.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenSharing(false);
    announceVideo();
    for (const [remoteId, peer] of peersRef.current) {
      for (const sender of peer.getSenders()) {
        if (sender.track && trackIds.has(sender.track.id)) peer.removeTrack(sender);
      }
      void negotiatePeer(remoteId, peer).catch(() => closePeer(remoteId));
    }
  }, [announceVideo, closePeer, negotiatePeer]);

  const stopCamera = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    const trackIds = new Set(stream.getTracks().map((track) => track.id));
    stream.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOn(false);
    announceVideo();
    for (const [remoteId, peer] of peersRef.current) {
      for (const sender of peer.getSenders()) {
        if (sender.track && trackIds.has(sender.track.id)) peer.removeTrack(sender);
      }
      void negotiatePeer(remoteId, peer).catch(() => closePeer(remoteId));
    }
  }, [announceVideo, closePeer, negotiatePeer]);

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
      for (const [remoteId, peer] of peersRef.current) {
        for (const track of stream.getTracks()) peer.addTrack(track, stream);
        await negotiatePeer(remoteId, peer);
      }
    } catch (cameraError) {
      if ((cameraError as DOMException)?.name !== "NotAllowedError") {
        setError("Your camera could not start. Another app may be using it.");
      } else {
        setError("Camera access was blocked. Allow it in your browser settings.");
      }
    }
  }, [announceVideo, negotiatePeer, stopCamera]);

  /**
   * Swaps the microphone without dropping the call: the new track replaces the
   * old one in every peer connection, so nobody hears a reconnect.
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

      for (const peer of peersRef.current.values()) {
        for (const sender of peer.getSenders()) {
          if (sender.track?.kind === "audio") {
            await sender.replaceTrack(track).catch(() => undefined);
          }
        }
      }
      localStreamRef.current.getAudioTracks().forEach((old) => old.stop());
      localStreamRef.current = replacement;
      analysersRef.current.delete("self");
      watchLevel("self", replacement);
    } catch {
      setError("That microphone could not be opened.");
    }
  }, [muted, watchLevel]);

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
        // Publishes the stream id and puts it in your own view.
        announceVideo();
        stream.getVideoTracks()[0].addEventListener("ended", stopScreenShare, {
          once: true,
        });
        for (const [remoteId, peer] of peersRef.current) {
          for (const track of stream.getTracks()) {
            const sender = peer.addTrack(track, stream);
            if (track.kind === "audio") {
              await tuneAudioSender(sender, SCREEN_AUDIO_BITRATE);
            }
          }
          await negotiatePeer(remoteId, peer);
        }
      } catch (shareError) {
        if ((shareError as DOMException)?.name !== "NotAllowedError") {
          setError("Screen sharing could not start. Try a lower quality setting.");
        }
      }
    },
    [announceVideo, negotiatePeer, screenQuality, stopScreenShare],
  );

  const leave = useCallback(() => {
    playRoomTone("leave");
    stopScreenShare();
    stopCamera();
    for (const remoteId of [...peersRef.current.keys()]) closePeer(remoteId);
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    analysersRef.current.clear();
    setRemoteStreams([]);
    setSpeaking(new Set());
    setChannelId(null);
    setLocalVideos([]);
    send({ t: "voice-leave" });
  }, [closePeer, playRoomTone, send, stopCamera, stopScreenShare]);

  const join = useCallback(
    async (nextChannelId: string) => {
      setError("");
      // Re-selecting the room you are already in is a no-op: the stage view owns
      // "leave" now (an explicit Disconnect button), so a click never drops you.
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
        watchLevel("self", stream);
        setMuted(false);
        setDeafened(false);
        setChannelId(nextChannelId);
        participantCountRef.current = Math.max(
          1,
          (rooms[nextChannelId] || []).filter((person) => !person.bot).length + 1,
        );
        send({ t: "voice-join", channelId: nextChannelId });
        playRoomTone("join");
      } catch {
        setError(
          "Microphone access was blocked. Allow it in your browser settings to join voice.",
        );
      }
    },
    [leave, playRoomTone, rooms, send, watchLevel],
  );

  /** Applied when someone server-mutes you: the microphone actually stops. */
  const setForcedMute = useCallback((next: boolean) => {
    setForcedMuteState(next);
    if (next) {
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      setMuted(true);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (forcedMute) return;
    const next = !muted;
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
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      setMuted(true);
    }
    send({ t: "voice-state", deafened: next, muted: next ? true : muted });
  }, [deafened, muted, send]);

  useEffect(() => () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
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
    takeClip,
    clipSeconds: CLIP_SECONDS,
    pushToTalk,
    pttKey,
    pttHeld,
    setPushToTalk,
    setPttKey,
    pttPress,
    pttRelease,
  };
}
