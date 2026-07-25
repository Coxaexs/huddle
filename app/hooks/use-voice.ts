"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent, VoiceParticipant } from "@/lib/protocol";
import { apiFetch } from "../lib/client";

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
    encoding.dtx = "disabled";
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
  const [deafened, setDeafened] = useState(false);
  /** Muted for everyone by someone else; you cannot undo it yourself. */
  const [forcedMute, setForcedMuteState] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<
    Array<{ connectionId: string; stream: MediaStream }>
  >([]);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenQuality, setScreenQuality] =
    useState<ScreenShareQuality>("1080p30");
  const [error, setError] = useState("");

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef(new Map<string, AnalyserNode>());
  const channelIdRef = useRef<string | null>(null);
  const participantCountRef = useRef(0);
  channelIdRef.current = channelId;

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
        if (["failed", "closed"].includes(peer.connectionState)) {
          closePeer(remoteId);
        }
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

  const stopScreenShare = useCallback(() => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    const trackIds = new Set(stream.getTracks().map((track) => track.id));
    stream.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenSharing(false);
    for (const [remoteId, peer] of peersRef.current) {
      for (const sender of peer.getSenders()) {
        if (sender.track && trackIds.has(sender.track.id)) peer.removeTrack(sender);
      }
      void negotiatePeer(remoteId, peer).catch(() => closePeer(remoteId));
    }
  }, [closePeer, negotiatePeer]);

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
    [negotiatePeer, screenQuality, stopScreenShare],
  );

  const leave = useCallback(() => {
    playRoomTone("leave");
    stopScreenShare();
    for (const remoteId of [...peersRef.current.keys()]) closePeer(remoteId);
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    analysersRef.current.clear();
    setRemoteStreams([]);
    setSpeaking(new Set());
    setChannelId(null);
    send({ t: "voice-leave" });
  }, [closePeer, playRoomTone, send, stopScreenShare]);

  const join = useCallback(
    async (nextChannelId: string) => {
      setError("");
      if (channelIdRef.current === nextChannelId) {
        leave();
        return;
      }
      if (channelIdRef.current) leave();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
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
    screenSharing,
    screenQuality,
    setScreenQuality,
    startScreenShare,
    stopScreenShare,
    error,
    setError,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    handleSignal,
  };
}
