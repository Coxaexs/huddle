"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Monitor, MonitorOff, RefreshCw, Volume2, VolumeX } from "lucide-react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { apiFetch } from "../../lib/client";
import { useI18n } from "../../lib/i18n-context";

interface RemoteMediaEntry {
  id: string;
  participantIdentity: string;
  participantName: string;
  source: "screen" | "camera" | "screen-audio";
  track: RemoteTrack;
}

interface VoiceTokenResponse {
  enabled: boolean;
  url?: string;
  token?: string;
  reason?: string;
}

export function ScreensharePane({
  voiceChannelId,
  voiceChannelName,
  ownerSeatedInVoice,
  pairToken,
  pairedReadOnly,
}: {
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  ownerSeatedInVoice: boolean;
  pairToken: string;
  pairedReadOnly: boolean;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<RemoteMediaEntry[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const clientIdRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 12),
  );

  const collectRoomTracks = useCallback((room: Room) => {
    const next: RemoteMediaEntry[] = [];
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        const track = pub.track as RemoteTrack | undefined;
        if (!pub.isSubscribed || !track) continue;
        if (pub.source === Track.Source.ScreenShare && track.kind === Track.Kind.Video) {
          next.push({
            id: `${participant.identity}:screen`,
            participantIdentity: participant.identity,
            participantName: participant.name || participant.identity.split("|")[0],
            source: "screen",
            track,
          });
        } else if (pub.source === Track.Source.Camera && track.kind === Track.Kind.Video) {
          next.push({
            id: `${participant.identity}:camera`,
            participantIdentity: participant.identity,
            participantName: participant.name || participant.identity.split("|")[0],
            source: "camera",
            track,
          });
        } else if (pub.source === Track.Source.ScreenShareAudio && track.kind === Track.Kind.Audio) {
          next.push({
            id: `${participant.identity}:screen-audio`,
            participantIdentity: participant.identity,
            participantName: participant.name || participant.identity.split("|")[0],
            source: "screen-audio",
            track,
          });
        }
      }
    }
    setEntries(next);
  }, []);

  useEffect(() => {
    if (!voiceChannelId || !ownerSeatedInVoice) {
      setEntries([]);
      setStatus("idle");
      setError("");
      return;
    }

    let cancelled = false;
    let room: Room | null = null;

    async function connect() {
      setStatus("connecting");
      setError("");
      try {
        const qs = new URLSearchParams({
          channelId: voiceChannelId!,
          watchOnly: "1",
          connectionId: clientIdRef.current,
        });
        if (pairedReadOnly && pairToken) qs.set("pair", pairToken);
        const tokenData = await apiFetch<VoiceTokenResponse>(`/api/voice/token?${qs.toString()}`);
        if (cancelled) return;
        if (!tokenData.enabled || !tokenData.url || !tokenData.token) {
          setStatus("error");
          setError(tokenData.reason || "LiveKit streaming is not enabled on this server.");
          return;
        }

        room = new Room({ adaptiveStream: true, dynacast: true });
        const sync = () => {
          if (!cancelled && room) collectRoomTracks(room);
        };
        room.on(RoomEvent.TrackSubscribed, (_t: RemoteTrack, _p: RemoteTrackPublication, _rp: RemoteParticipant) => sync());
        room.on(RoomEvent.TrackUnsubscribed, sync);
        room.on(RoomEvent.TrackMuted, sync);
        room.on(RoomEvent.TrackUnmuted, sync);
        room.on(RoomEvent.ParticipantDisconnected, sync);
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setEntries([]);
            setStatus("idle");
          }
        });

        await room.connect(tokenData.url, tokenData.token, { autoSubscribe: true });
        if (cancelled) {
          await room.disconnect();
          return;
        }
        collectRoomTracks(room);
        setStatus("connected");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Could not connect to screenshare stream.");
        }
      }
    }

    void connect();
    return () => {
      cancelled = true;
      if (room) void room.disconnect();
    };
  }, [voiceChannelId, ownerSeatedInVoice, pairToken, pairedReadOnly, retryKey, collectRoomTracks]);

  const videoEntries = useMemo(
    () => entries.filter((e) => e.source === "screen" || e.source === "camera"),
    [entries],
  );

  const activeVideo = useMemo(() => {
    if (!videoEntries.length) return null;
    if (selectedVideoId) {
      const explicit = videoEntries.find((v) => v.id === selectedVideoId);
      if (explicit) return explicit;
    }
    return videoEntries.find((v) => v.source === "screen") || videoEntries[0];
  }, [videoEntries, selectedVideoId]);

  useEffect(() => {
    const el = videoRef.current;
    const track = activeVideo?.track;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [activeVideo]);

  const screenAudios = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.source === "screen-audio" &&
          (!activeVideo || e.participantIdentity === activeVideo.participantIdentity),
      ),
    [entries, activeVideo],
  );

  useEffect(() => {
    const host = audioHostRef.current;
    if (!host) return;
    const nodes: HTMLAudioElement[] = [];
    for (const item of screenAudios) {
      const audioEl = item.track.attach() as HTMLAudioElement;
      audioEl.muted = audioMuted;
      audioEl.autoplay = true;
      host.appendChild(audioEl);
      nodes.push(audioEl);
    }
    return () => {
      for (const item of screenAudios) item.track.detach();
      for (const node of nodes) node.remove();
    };
  }, [screenAudios, audioMuted]);

  const enterFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <div className="s2-pane">
      <div className="s2-pane-head">
        <div className="s2-bar-group">
          <Monitor size={14} style={{ color: "var(--lavender, #8b5cf6)" }} />
          <strong style={{ fontSize: 13 }}>
            {voiceChannelName ? t("s2.screen.titleNamed", { name: voiceChannelName }) : t("s2.launcher.screenshare")}
          </strong>
        </div>
        <div className="s2-bar-group">
          {screenAudios.length > 0 && (
            <button
              type="button"
              className={`s2-pill-btn ${!audioMuted ? "active" : ""}`}
              style={{ height: 24, padding: "0 8px", fontSize: 11 }}
              onClick={() => setAudioMuted((m) => !m)}
              title={audioMuted ? t("s2.screen.playAudioTitle") : t("s2.screen.muteAudioTitle")}
            >
              {audioMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
              <span>{audioMuted ? t("s2.screen.audioMuted") : t("s2.screen.audioOn")}</span>
            </button>
          )}
          {activeVideo && (
            <button
              type="button"
              className="s2-pill-btn"
              style={{ height: 24, padding: "0 8px" }}
              onClick={enterFullscreen}
              title={t("s2.screen.fullscreenVideo")}
            >
              <Maximize2 size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="s2-pane-body">
        <div ref={audioHostRef} style={{ display: "none" }} />
        {!voiceChannelId ? (
          <div className="s2-empty">
            <MonitorOff size={32} style={{ opacity: 0.55 }} />
            <p style={{ margin: 0 }}>{t("s2.screen.pickVoiceHint")}</p>
          </div>
        ) : !ownerSeatedInVoice ? (
          <div className="s2-empty">
            <MonitorOff size={32} style={{ opacity: 0.55 }} />
            <p style={{ margin: 0, maxWidth: 340 }}>
              {t("s2.screen.joinVoiceHintPrefix")} <strong>{voiceChannelName || t("s2.screen.voiceRoomFallback")}</strong> {t("s2.screen.joinVoiceHintSuffix")}
            </p>
          </div>
        ) : status === "error" ? (
          <div className="s2-empty">
            <p style={{ margin: 0, color: "#fca5a5" }}>{error}</p>
            <button
              type="button"
              className="s2-pill-btn active"
              onClick={() => setRetryKey((k) => k + 1)}
            >
              <RefreshCw size={13} /> {t("s2.screen.retryStream")}
            </button>
          </div>
        ) : activeVideo ? (
          <div className="s2-video-wrap">
            <video ref={videoRef} className="s2-video" autoPlay playsInline muted />
            <div className="s2-video-overlay">
              <div className="s2-overlay-chip">
                <span>
                  {activeVideo.source === "screen" ? t("s2.screen.sourceScreen") : t("s2.screen.sourceCamera")}: <strong>{activeVideo.participantName}</strong>
                </span>
              </div>
              {videoEntries.length > 1 && (
                <div className="s2-bar-group">
                  {videoEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`s2-pill-btn ${activeVideo.id === entry.id ? "active" : ""}`}
                      onClick={() => setSelectedVideoId(entry.id)}
                    >
                      {entry.participantName} ({entry.source === "screen" ? t("s2.screen.sourceScreen") : t("s2.screen.sourceCamShort")})
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="s2-empty">
            <Monitor size={32} style={{ opacity: 0.55 }} />
            <p style={{ margin: 0 }}>
              {status === "connecting"
                ? t("s2.screen.connecting")
                : t("s2.screen.waiting")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
