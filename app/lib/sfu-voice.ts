"use client";

import type { ScreenShareQuality } from "../hooks/use-voice";
import {
  Room,
  RoomEvent,
  Track,
  VideoPreset,
  DisconnectReason,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublishOptions,
} from "livekit-client";

/**
 * Voice through the LiveKit media server.
 *
 * The mesh makes every person upload one copy of everything per listener, which
 * is what caps a room at about eight and a screen share at a handful of
 * viewers. Here each person uploads once and the server fans it out. This file
 * only moves media; who is in the room, muted, sharing and so on still comes
 * from the hub, exactly as it does for the mesh.
 */

export type SfuStreamKind = "voice" | "camera" | "screen";

export interface SfuRemoteStream {
  /** The hub connection id this media belongs to, as the identity claims it. */
  connectionId: string;
  /** The authenticated user behind the identity, to check against the roster. */
  userId: string;
  kind: SfuStreamKind;
  stream: MediaStream;
}

export type SfuPublishKind = "mic" | "camera" | "screen" | "screen-audio";

/** The token route's identity: `<userId>|<connectionId>`, user half server-set. */
export function parseSfuIdentity(identity: string): { userId: string; connectionId: string } | null {
  const bar = identity.lastIndexOf("|");
  if (bar <= 0 || bar === identity.length - 1) return null;
  return { userId: identity.slice(0, bar), connectionId: identity.slice(bar + 1) };
}

function kindOf(source: Track.Source): SfuStreamKind | null {
  switch (source) {
    case Track.Source.Microphone:
      return "voice";
    case Track.Source.Camera:
      return "camera";
    case Track.Source.ScreenShare:
    case Track.Source.ScreenShareAudio:
      return "screen";
    default:
      return null;
  }
}

/**
 * Upload ceilings for a screen share. The sender pays for the top layer plus a
 * small one; the server hands the small one to anyone whose link cannot take
 * the full picture, so one slow viewer no longer drags the sharer down.
 */
export const SCREEN_ENCODINGS: Record<
  ScreenShareQuality,
  { maxBitrate: number; maxFramerate: number; low: VideoPreset }
> = {
  "720p30": { maxBitrate: 2_000_000, maxFramerate: 30, low: new VideoPreset(640, 360, 400_000, 15) },
  // The film settings keep 24 fps on the small layer too: a slow viewer gets
  // a softer picture, not a choppy one.
  "900p24": { maxBitrate: 2_500_000, maxFramerate: 24, low: new VideoPreset(960, 540, 700_000, 24) },
  "900p30": { maxBitrate: 3_000_000, maxFramerate: 30, low: new VideoPreset(960, 540, 700_000, 15) },
  "1080p24": { maxBitrate: 3_500_000, maxFramerate: 24, low: new VideoPreset(1280, 720, 1_000_000, 24) },
  "1080p30": { maxBitrate: 4_000_000, maxFramerate: 30, low: new VideoPreset(1280, 720, 1_000_000, 15) },
  "1080p60": { maxBitrate: 6_000_000, maxFramerate: 60, low: new VideoPreset(1280, 720, 1_200_000, 30) },
};

export interface SfuHandlers {
  /** The full set of remote streams, whenever it changes. */
  onStreams: (streams: SfuRemoteStream[]) => void;
  /** A remote microphone arrived: for the speaking meter and jitter tuning. */
  onVoice: (connectionId: string, stream: MediaStream, receiver: RTCRtpReceiver | undefined) => void;
  /** The connection is gone for good — not a reconnect, not our own leave. */
  onLost: () => void;
  /** Whether this tab asked not to receive someone's camera or screen. */
  isHidden: (connectionId: string, kind: "camera" | "screen") => boolean;
}

export class SfuVoice {
  readonly room: Room;
  private readonly tracks = new Map<string, MediaStreamTrack[]>();
  private readonly streams = new Map<string, SfuRemoteStream>();
  private leaving = false;

  constructor(private readonly handlers: SfuHandlers) {
    this.room = new Room({
      // Adaptive stream watches elements LiveKit attached itself; ours are
      // plain <video>/<audio> fed a MediaStream, so it would see nothing on
      // screen and pause every video. Dynacast is the sender-side half and
      // works on its own: layers nobody receives are not encoded at all.
      adaptiveStream: false,
      dynacast: true,
      // The hook owns every track — the mic chain, the screen capture — and
      // stops them itself. LiveKit stopping them would kill the microphone.
      stopLocalTrackOnUnpublish: false,
      disconnectOnPageLeave: true,
    });
    const room = this.room;
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) =>
      this.added(track, publication, participant));
    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) =>
      this.removed(track, publication, participant));
    room.on(RoomEvent.ParticipantDisconnected, (participant) => this.forget(participant.identity));
    room.on(RoomEvent.Disconnected, (reason) => {
      this.tracks.clear();
      this.streams.clear();
      this.handlers.onStreams([]);
      if (!this.leaving && reason !== DisconnectReason.CLIENT_INITIATED) this.handlers.onLost();
    });
  }

  async connect(url: string, token: string, iceServers: RTCIceServer[]): Promise<void> {
    await this.room.connect(url, token, {
      autoSubscribe: true,
      // Our TURN relay, for networks that block LiveKit's own ports. The
      // server sends none of its own, so this replaces nothing.
      rtcConfig: { iceServers },
    });
  }

  /** Puts one of our tracks in the room. */
  async publish(
    track: MediaStreamTrack,
    kind: SfuPublishKind,
    options: { bitrate?: number; screen?: keyof typeof SCREEN_ENCODINGS } = {},
  ): Promise<void> {
    const enabled = track.enabled;
    let publish: TrackPublishOptions;
    if (kind === "mic") {
      publish = {
        source: Track.Source.Microphone,
        // Same reasoning as the mesh: no DTX, and redundant packets so a lost
        // one is rebuilt instead of heard.
        dtx: false,
        red: true,
        audioPreset: { maxBitrate: options.bitrate ?? 64_000, priority: "high" },
        stopMicTrackOnMute: false,
      };
    } else if (kind === "screen-audio") {
      publish = {
        source: Track.Source.ScreenShareAudio,
        dtx: false,
        red: false,
        audioPreset: { maxBitrate: options.bitrate ?? 128_000 },
      };
    } else if (kind === "screen") {
      const profile = SCREEN_ENCODINGS[options.screen ?? "1080p30"];
      publish = {
        source: Track.Source.ScreenShare,
        screenShareEncoding: { maxBitrate: profile.maxBitrate, maxFramerate: profile.maxFramerate },
        screenShareSimulcastLayers: [profile.low],
        simulcast: true,
        // A film has to stay smooth, so it gives up resolution first; a desktop
        // has to stay legible, so it gives up frames first.
        degradationPreference: profile.maxFramerate === 24 ? "maintain-framerate" : "maintain-resolution",
      };
    } else {
      publish = { source: Track.Source.Camera, simulcast: true };
    }
    await this.room.localParticipant.publishTrack(track, publish);
    // LiveKit syncs `enabled` to its own idea of mute; ours is the mic gate.
    track.enabled = enabled;
  }

  async unpublish(tracks: MediaStreamTrack[]): Promise<void> {
    for (const track of tracks) {
      const publication = this.published(track);
      if (publication?.track) {
        await this.room.localParticipant.unpublishTrack(publication.track, false).catch(() => undefined);
      }
    }
  }

  /** Swaps a published track in place, the way RTCRtpSender.replaceTrack does. */
  async replace(from: MediaStreamTrack, to: MediaStreamTrack): Promise<void> {
    const publication = this.published(from);
    if (!publication?.track) return;
    const enabled = to.enabled;
    await publication.track.replaceTrack(to, { userProvidedTrack: true }).catch(() => undefined);
    // replaceTrack re-enables the track; a muted mic has to stay muted.
    to.enabled = enabled;
  }

  /**
   * Mirrors the mic gate into LiveKit. A disabled track still sends silence,
   * and without this the server would forward every muted mic in the room to
   * everyone else — in a big room, most of the work it does.
   */
  async setMicMuted(muted: boolean): Promise<void> {
    const track = this.room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if (!track || track.isMuted === muted) return;
    await (muted ? track.mute() : track.unmute()).catch(() => undefined);
  }

  /** The RTCRtpSender carrying our microphone, for live bitrate changes. */
  micSender(): RTCRtpSender | undefined {
    return this.room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.sender;
  }

  /**
   * Stops (or resumes) the server forwarding someone's camera or screen to
   * us. The subscription stays, so the tile and its "show" button stay too.
   */
  setHidden(connectionId: string, kind: "camera" | "screen", hidden: boolean): void {
    for (const participant of this.room.remoteParticipants.values()) {
      if (parseSfuIdentity(participant.identity)?.connectionId !== connectionId) continue;
      for (const publication of participant.trackPublications.values()) {
        // A hidden screen share is silenced too, as it is in the mesh.
        if (kindOf(publication.source) !== kind) continue;
        publication.setEnabled(!hidden);
      }
    }
  }

  async leave(): Promise<void> {
    this.leaving = true;
    await this.room.disconnect(false).catch(() => undefined);
  }

  private published(track: MediaStreamTrack): LocalTrackPublication | undefined {
    for (const publication of this.room.localParticipant.trackPublications.values()) {
      if (publication.track?.mediaStreamTrack === track) return publication;
    }
    return undefined;
  }

  private key(identity: string, kind: SfuStreamKind): string {
    return `${identity}\n${kind}`;
  }

  private added(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) {
    const kind = kindOf(publication.source);
    const who = parseSfuIdentity(participant.identity);
    if (!kind || !who) return;
    if (kind !== "voice" && this.handlers.isHidden(who.connectionId, kind)) {
      publication.setEnabled(false);
    }
    const key = this.key(participant.identity, kind);
    const list = this.tracks.get(key) ?? [];
    if (!list.includes(track.mediaStreamTrack)) list.push(track.mediaStreamTrack);
    this.tracks.set(key, list);
    const stream = this.rebuild(key, who, kind);
    if (kind === "voice" && stream) this.handlers.onVoice(who.connectionId, stream, track.receiver);
    this.emit();
  }

  private removed(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) {
    const kind = kindOf(publication.source);
    const who = parseSfuIdentity(participant.identity);
    if (!kind || !who) return;
    const key = this.key(participant.identity, kind);
    this.tracks.set(key, (this.tracks.get(key) ?? []).filter((entry) => entry !== track.mediaStreamTrack));
    this.rebuild(key, who, kind);
    this.emit();
  }

  private forget(identity: string) {
    for (const key of [...this.tracks.keys()]) {
      if (key.startsWith(`${identity}\n`)) {
        this.tracks.delete(key);
        this.streams.delete(key);
      }
    }
    this.emit();
  }

  /**
   * A fresh MediaStream per change, not tracks added to the old one: the UI
   * keys off the object and would not notice a screen share's audio arriving
   * after its video.
   */
  private rebuild(
    key: string,
    who: { userId: string; connectionId: string },
    kind: SfuStreamKind,
  ): MediaStream | null {
    const tracks = this.tracks.get(key) ?? [];
    if (!tracks.length) {
      this.tracks.delete(key);
      this.streams.delete(key);
      return null;
    }
    const stream = new MediaStream(tracks);
    this.streams.set(key, { ...who, kind, stream });
    return stream;
  }

  private emit() {
    this.handlers.onStreams([...this.streams.values()]);
  }
}
