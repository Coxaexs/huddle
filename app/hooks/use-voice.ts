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
  const [error, setError] = useState("");

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef(new Map<string, AnalyserNode>());
  const channelIdRef = useRef<string | null>(null);
  channelIdRef.current = channelId;

  useEffect(() => {
    apiFetch<{ iceServers: RTCIceServer[] }>("/api/voice/ice")
      .then((data) => {
        if (data.iceServers?.length) iceServersRef.current = data.iceServers;
      })
      .catch(() => undefined);
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
        peer.addTrack(track, localStreamRef.current as MediaStream);
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
        setRemoteStreams((current) => [
          ...current.filter((entry) => entry.connectionId !== remoteId),
          { connectionId: remoteId, stream },
        ]);
        watchLevel(remoteId, stream);
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
      .filter((person) => !person.bot && person.connectionId !== connectionId)
      .map((person) => person.connectionId);

    for (const remoteId of others) {
      if (peersRef.current.has(remoteId)) continue;
      if (connectionId > remoteId) continue; // the other side calls us
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
      if (!others.includes(remoteId)) closePeer(remoteId);
    }
  }, [rooms, channelId, connectionId, createPeer, closePeer, send]);

  const leave = useCallback(() => {
    for (const remoteId of [...peersRef.current.keys()]) closePeer(remoteId);
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    analysersRef.current.clear();
    setRemoteStreams([]);
    setSpeaking(new Set());
    setChannelId(null);
    send({ t: "voice-leave" });
  }, [closePeer, send]);

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
        send({ t: "voice-join", channelId: nextChannelId });
      } catch {
        setError(
          "Microphone access was blocked. Allow it in your browser settings to join voice.",
        );
      }
    },
    [leave, send, watchLevel],
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
    error,
    setError,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    handleSignal,
  };
}
