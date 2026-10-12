"use client";

import { type BackgroundMode } from "../../lib/virtual-background";
import { type ScreenShareQuality } from "../../hooks/use-voice";
import { type TableControls } from "../table-audio-menu";

export interface Sound {
  id: string;
  name: string;
  emoji: string;
  url: string;
  personal?: boolean;
}
/** The slice of the voice hook the stage needs to render and drive a call. */
export interface VoiceApi extends TableControls {
  important: boolean;
  toggleImportant: () => void;
  channelId: string | null;
  muted: boolean;
  forcedMute: boolean;
  deafened: boolean;
  /** Stage rooms: this tab's hand is up, and the way to change that. */
  handRaised: boolean;
  toggleHand: () => void;
  /** Stage rooms: put a seat on stage or take it off. Moderator-only. */
  setStageSpeaker: (connectionId: string, allowed: boolean) => void;
  /** Videos this tab stopped receiving (to save data), and the switch for it. */
  hiddenVideo: Record<string, { camera: boolean; screen: boolean }>;
  setVideoHidden: (connectionId: string, which: "camera" | "screen", hidden: boolean) => void;
  speaking: Set<string>;
  /** `kind` is set for LiveKit streams, whose ids are not the sender's. */
  remoteStreams: Array<{ connectionId: string; stream: MediaStream; kind?: "voice" | "camera" | "screen" | "tts" }>;
  peerStates: Record<string, string>;
  screenSharing: boolean;
  screenShareAudio?: boolean;
  setScreenShareAudio?: (enabled: boolean) => void;
  hasScreenAudio?: boolean;
  screenAudioMuted?: boolean;
  toggleScreenAudio?: () => void;
  screenQuality: ScreenShareQuality;
  setScreenQuality: (quality: ScreenShareQuality) => void;
  startScreenShare: (quality?: ScreenShareQuality, withAudio?: boolean, film?: boolean) => void | Promise<void>;
  screenFilm?: boolean;
  setScreenFilm?: (film: boolean) => void;
  stopScreenShare: () => void;
  cameraOn: boolean;
  cameraBackground?: BackgroundMode;
  setCameraBackground?: (mode: BackgroundMode) => void;
  cameraBlurAmount?: number;
  setCameraBlurAmount?: (amount: number) => void;
  cameraBackgroundImage?: string;
  setCameraBackgroundImage?: (imageId: string) => void;
  startCamera: () => void | Promise<void>;
  stopCamera: () => void;
  localVideos: Array<{ kind: "camera" | "screen"; stream: MediaStream }>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  leave: () => void;
  takeClip: () => Promise<Blob | null>;
  clipSeconds: number;
  streamViewers?: string[];
  signalStreamWatch?: (streamerConnectionId: string, watching: boolean) => void;
  latency?: {
    rttMs: number;
    jitterMs: number;
    packetLoss: number;
    quality: "excellent" | "good" | "poor";
  };
  isSfu?: boolean;
  micSettings?: {
    delayMs?: number;
    mode?: string;
    gainDb?: number;
    autoGain?: boolean;
    sensitivity?: number | "auto";
  };
  setMicSettings?: (settings: { delayMs?: number }) => void;
}
export interface VideoTile {
  key: string;
  stream: MediaStream;
  label: string;
  self: boolean;
  mirrored: boolean;
  connecting: boolean;
  /** Remote tiles only: whose video it is and which one, for hiding it. */
  remoteId?: string;
  videoKind?: "camera" | "screen";
  /** This viewer stopped receiving it; the sender no longer sends it here. */
  hidden?: boolean;
}