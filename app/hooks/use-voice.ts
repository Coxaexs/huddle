"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientEvent, VoiceParticipant } from "@/lib/protocol";
import { apiFetch } from "../lib/client";
import { cameraConstraints, unlockAudio } from "../lib/devices";
import { isTypingTarget, matchesCombo } from "../lib/hotkeys";
import { HEAD_RECENTER_EVENT, headTrackingPossible, type HeadTrackingStatus } from "../lib/head-tracking";
import { webcamHeadTrackingPossible } from "../lib/webcam-head-tracking";
import { privateAddress, turnOnly } from "../lib/ice";
import { SfuVoice, type SfuPublishKind, type SfuRemoteStream, type SfuStreamKind } from "../lib/sfu-voice";

export type HeadTrackingSource = "airpods" | "webcam";
export type SpatialOutput = "headphones" | "speakers";
import { nativePlatform } from "../lib/native-voice";
import { clampVoiceBitrate, VOICE_BITRATE_DEFAULT } from "@/lib/voice-quality";
import {
  MIC_STATE_EVENT,
  openMicrophone,
  readMicSettings,
  writeMicSettings,
  type MicChain,
  type MicSettings,
  type MicTelemetry,
} from "../lib/mic-chain";
import {
  playMuteSound,
  playUnmuteSound,
  playDeafenSound,
  playUndeafenSound,
  playScreenShareStartSound,
  playScreenShareStopSound,
} from "../lib/audio-cues";
import {
  createVirtualBackgroundPipeline,
  type BackgroundMode,
  type VirtualBackgroundController,
} from "../lib/virtual-background";

export type { BackgroundMode };

interface SignalPayload {
  kind: "offer" | "answer" | "candidate" | "video-pause";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  /** video-pause: which of the sender's videos this viewer does not want sent. */
  paused?: VideoPause;
}

/** A viewer's choice to stop receiving someone's camera or screen share. */
export interface VideoPause {
  camera: boolean;
  screen: boolean;
}

const NO_PAUSE: VideoPause = { camera: false, screen: false };

/** What the relay check learned, for the voice settings panel. */
export type RelayState =
  | "unknown"
  | "checking"
  | "ok"
  | "no-turn"
  | "unreachable"
  | "private";

export interface RelayStatus {
  state: RelayState;
  /** One line, written to be read by a person, not a log. */
  detail: string;
  /** The relay address the server handed us, when there was one. */
  address?: string;
  checkedAt?: number;
}

/**
 * Asks the configured TURN servers for a relay candidate, which is what ICE
 * does for two people who cannot reach each other directly.
 *
 * It has to be gathered rather than guessed: a browser finishes a handshake
 * through a relay that carries nothing, so the only honest test is to look at
 * what the relay hands back. Nothing back means it refused us or is
 * unreachable; a private address means it is advertising an address on the
 * wrong side of its own NAT, which no peer can send to.
 */
async function gatherRelay(
  servers: RTCIceServer[],
  timeoutMs = 6000,
): Promise<{ relay: { address: string; port: number } | null; error: string }> {
  const peer = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: "relay" });
  let failure = "";
  // Attached before the offer, so the first refusal is not missed.
  peer.onicecandidateerror = (event) => {
    const details = event as RTCPeerConnectionIceErrorEvent;
    failure = details.errorCode
      ? `${details.errorCode} ${details.errorText || ""}${details.url ? ` from ${details.url}` : ""}`.trim()
      : "";
  };
  try {
    peer.createDataChannel("relay-check");
    await peer.setLocalDescription(await peer.createOffer());
    return await new Promise((resolve) => {
      const finish = (relay: { address: string; port: number } | null) => {
        window.clearTimeout(timer);
        peer.onicecandidate = null;
        peer.onicegatheringstatechange = null;
        peer.onicecandidateerror = null;
        resolve({ relay, error: failure });
      };
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      peer.onicecandidate = (event) => {
        const candidate = event.candidate;
        if (!candidate || candidate.type !== "relay") return;
        finish({ address: candidate.address || "", port: candidate.port || 0 });
      };
      // Gathering can end without a relay candidate — an unreachable server
      // finishes this way — so do not sit out the full timeout.
      peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === "complete") finish(null);
      };
    });
  } catch {
    return { relay: null, error: failure };
  } finally {
    peer.close();
  }
}

interface UseVoiceOptions {
  connectionId: string | null;
  /** Bumps on every hub session, including one that resumed the same id. */
  session?: number;
  /** Every live voice room, keyed by channel id, as the hub sees them. */
  rooms: Record<string, VoiceParticipant[]>;
  send: (event: ClientEvent) => boolean;
  /** Recorder capture pages disable the unrelated rolling "Clip that!" buffer. */
  enableClips?: boolean;
  /** Each voice channel's bitrate ceiling, keyed by channel id. */
  roomBitrates?: Record<string, number>;
}

/** Screen share heights on offer, lowest first. */
export const SCREEN_RESOLUTIONS = [480, 720, 900, 1080] as const;
/** Screen share frame rates on offer, lowest first. */
export const SCREEN_FRAMERATES = [15, 24, 30, 60] as const;
export type ScreenResolution = (typeof SCREEN_RESOLUTIONS)[number];
export type ScreenFramerate = (typeof SCREEN_FRAMERATES)[number];
/** Resolution and frame rate together, e.g. "1080p30". */
export type ScreenShareQuality = `${ScreenResolution}p${ScreenFramerate}`;

/** Every combination, lowest first. */
export const SCREEN_SHARE_QUALITIES: ScreenShareQuality[] = SCREEN_RESOLUTIONS.flatMap((height) =>
  SCREEN_FRAMERATES.map((fps) => `${height}p${fps}` as ScreenShareQuality),
);

export function screenQualityParts(quality: ScreenShareQuality): {
  height: ScreenResolution;
  fps: ScreenFramerate;
} {
  const [height, fps] = quality.split("p").map(Number);
  return { height: height as ScreenResolution, fps: fps as ScreenFramerate };
}

export function makeScreenQuality(height: ScreenResolution, fps: ScreenFramerate): ScreenShareQuality {
  return `${height}p${fps}`;
}

function isScreenQuality(value: unknown): value is ScreenShareQuality {
  return SCREEN_SHARE_QUALITIES.includes(value as ScreenShareQuality);
}

/** "900p 24FPS" — for the live badge. */
export function screenQualityLabel(quality: ScreenShareQuality): string {
  const { height, fps } = screenQualityParts(quality);
  return `${height}p ${fps}FPS`;
}

/** The next resolution up at the same frame rate, wrapping round. */
export function nextScreenQuality(quality: ScreenShareQuality): ScreenShareQuality {
  const { height, fps } = screenQualityParts(quality);
  const index = SCREEN_RESOLUTIONS.indexOf(height);
  return makeScreenQuality(SCREEN_RESOLUTIONS[(index + 1) % SCREEN_RESOLUTIONS.length], fps);
}

/** Capture size for a quality: 16:9 at its height. */
function screenConstraints(quality: ScreenShareQuality) {
  const { height, fps } = screenQualityParts(quality);
  return { width: Math.round((height * 16) / 9), height, frameRate: fps };
}

/**
 * Voice bitrate for a mesh of `listeners` other connections, under the
 * channel's own ceiling (`room`, set in its settings).
 *
 * In a mesh you upload one full copy of your voice per listener, so a busy
 * room multiplies it — and a saturated uplink drops packets, which is what a
 * robotic, choppy voice actually is. So the ceiling is what a small call gets,
 * and a fuller one spends less per copy: a share of the ceiling, and never
 * more than UPLINK_BUDGET across everyone. A camera or screen share already
 * competes for the same uplink, so it counts as a crowd of its own. At the
 * default 64 kbps that is 64 / 48 / 32 kbps for 1–2 / 3–4 / 5+ listeners.
 */
const UPLINK_BUDGET = 600_000;
const CROWD_FLOOR = 32_000;

export function voiceBitrate(
  listeners: number,
  sendingVideo: boolean,
  room: number = VOICE_BITRATE_DEFAULT,
): number {
  const share = listeners >= 5 ? 0.5 : listeners >= 3 || sendingVideo ? 0.75 : 1;
  const budget = UPLINK_BUDGET / Math.max(1, listeners);
  const wanted = Math.min(room * share, budget);
  return Math.round(Math.min(room, Math.max(CROWD_FLOOR, wanted)));
}

/** Screen-share audio is music and games, so it keeps more — but not per copy in a crowd. */
export function screenAudioBitrate(listeners: number): number {
  return listeners >= 3 ? 128_000 : 256_000;
}
/** Screen-share audio through the media server: uploaded once, so it keeps its quality. */
const SFU_SCREEN_AUDIO_BITRATE = 192_000;

/** One remote person's stream. `kind` is set where the sender's stream id cannot be matched (LiveKit). */
/** /say limits: up to 200 characters at a time, queued back to back. */
export const SAY_MAX_CHARS = 200;
const SAY_MAX_SECONDS = 25;
/** Most speech that may be waiting to play, so nobody can queue minutes of it. */
const SAY_MAX_BACKLOG_SECONDS = 30;
/** Breath between queued /says. */
const SAY_GAP_SECONDS = 0.3;

export interface RemoteVoiceStream {
  connectionId: string;
  stream: MediaStream;
  kind?: SfuStreamKind;
}

/**
 * Whether this tab connects to `person` directly. A seat in the LiveKit room
 * meets other LiveKit seats there, and everyone else over the mesh.
 */
function meshWith(person: VoiceParticipant, sfu: boolean): boolean {
  return !sfu || person.bot === true || person.sfu !== true;
}

/**
 * Most other people a seat that lost LiveKit may mesh with. Past this, falling
 * back would have it upload one copy of its voice — and of a screen share —
 * per person, which nobody's uplink survives in a big room, and every LiveKit
 * seat would open a direct connection to it too. It keeps retrying LiveKit
 * instead.
 */
export const MESH_FALLBACK_MAX_PEERS = 8;
/** How long a seat waits between attempts to get back into LiveKit. */
const SFU_RETRY_MS = 5_000;

/**
 * Whether this room is too big for `self` to fall back to the mesh: more than
 * MESH_FALLBACK_MAX_PEERS other people, and the room is already on LiveKit (a
 * room with no LiveKit seats is a mesh anyway, so there is nothing to protect).
 */
export function meshFallbackBlocked(people: VoiceParticipant[], self: string | null): boolean {
  const others = people.filter((person) => person.connectionId !== self && !person.bot);
  return others.length > MESH_FALLBACK_MAX_PEERS && others.some((person) => person.sfu === true);
}

/**
 * Whether to show `person`'s camera or screen share. A stage audience seat has
 * no floor, so its video is dropped here, on every receiver: hiding the button
 * from the audience alone would not stop a modified client from publishing.
 */
export function videoAllowedFrom(person: VoiceParticipant | undefined): boolean {
  return person?.speakAllowed !== false;
}

/** LiveKit's address and a token for one room, or null when this instance has none. */
async function sfuGrant(
  channelId: string,
  connectionId: string,
): Promise<{ url: string; token: string } | null> {
  try {
    const data = await apiFetch<{ enabled?: boolean; url?: string; token?: string }>(
      `/api/voice/token?channelId=${encodeURIComponent(channelId)}&connectionId=${encodeURIComponent(connectionId)}`,
    );
    return data.enabled && data.url && data.token ? { url: data.url, token: data.token } : null;
  } catch {
    return null;
  }
}

/** How much of the room "Clip that!" keeps buffered. */
const CLIP_SECONDS = 30;

/** Signals held for a seat the roster has not shown yet; older ones are dropped. */
const EARLY_SIGNAL_LIMIT = 50;

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
    // Ask the OS/router to put voice ahead of screen share and camera packets.
    encoding.priority = "high";
    encoding.networkPriority = "high";
  }
  await sender.setParameters(parameters).catch(() => undefined);
}

/**
 * iOS (Safari, and the app's WKWebView) interrupts every AudioContext of a page
 * that leaves the screen. iPadOS reports itself as a Mac, hence the touch check.
 */
function interruptsHiddenAudio(): boolean {
  if (nativePlatform() === "ios") return true;
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

/**
 * Target for incoming audio's jitter buffer. Chrome's adaptive default often
 * idles at 80+ ms; 30 ms was tried and was too tight for Wi-Fi, where it made
 * NetEq constantly stretch and squeeze speech to keep up — a warbly,
 * "phone line" voice. 60 ms still sits below the default.
 */
const AUDIO_JITTER_TARGET_MS = 60;

/**
 * Opus parameters the default negotiation leaves loose: in-band FEC so a lost
 * packet is rebuilt from its neighbour, no DTX, and 10 ms packets when the far
 * side accepts them. Applied to every Opus payload type in the description.
 */
function tuneOpusSdp<T extends RTCSessionDescriptionInit>(description: T): T {
  if (!description.sdp) return description;
  const opus = [...description.sdp.matchAll(/a=rtpmap:(\d+) opus\/48000/gi)].map((m) => m[1]);
  let sdp = description.sdp;
  for (const pt of opus) {
    sdp = sdp.replace(new RegExp(`a=fmtp:${pt} ([^\r\n]*)`, "g"), (_line, params: string) => {
      const map = new Map(params.split(";").filter(Boolean).map((kv) => {
        const [k, v = ""] = kv.trim().split("=");
        return [k, v] as const;
      }));
      map.set("useinbandfec", "1");
      map.set("usedtx", "0");
      map.set("minptime", "10");
      return `a=fmtp:${pt} ${[...map].map(([k, v]) => `${k}=${v}`).join(";")}`;
    });
  }
  return { ...description, sdp };
}

/**
 * Voice: through the LiveKit media server when this instance has one, and
 * peer-to-peer meshed otherwise.
 *
 * In the mesh everyone connects directly to everyone else and the hub only
 * carries the handshake. Who calls whom is decided by comparing connection
 * ids, which keeps both sides from offering at the same time.
 *
 * With LiveKit, two seats that both announced `sfu` meet only there; the mesh
 * still reaches everyone else — the music bot, an older client, or a seat
 * whose LiveKit connection failed — so a mixed room never splits in two.
 */
export function useVoice({
  connectionId,
  session = 0,
  rooms,
  send,
  enableClips = true,
  roomBitrates,
}: UseVoiceOptions) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const roomBitrate = clampVoiceBitrate(channelId ? roomBitrates?.[channelId] : undefined);
  /** For peers set up inside callbacks, which would otherwise see a stale value. */
  const roomBitrateRef = useRef(roomBitrate);
  roomBitrateRef.current = roomBitrate;
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  /**
   * Stage rooms only: this tab's hand is up, asking for the floor. Purely a
   * signal to the hosts — it never changes whether the mic is live, which stays
   * governed by `muted`.
   */
  const [handRaised, setHandRaised] = useState(false);
  const [tableMode, setTableModeState] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("huddle-table-mode") === "on"; }
    catch { return false; }
  });
  const [tableHostId, setTableHostId] = useState("");
  // Head tracking only works in the desktop shell, so remember the wish, not the result.
  const [headTracking, setHeadTrackingState] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("huddle-head-tracking") === "on"; }
    catch { return false; }
  });
  const [headTrackingStatus, setHeadTrackingStatus] = useState<{ status: HeadTrackingStatus; live: boolean }>(
    { status: "unsupported", live: false },
  );
  // Resolved after mount so the server and the first client render agree.
  const [headTrackingOffered, setHeadTrackingOffered] = useState(false);
  const [airpodsOffered, setAirpodsOffered] = useState(false);
  useEffect(() => {
    const airpods = headTrackingPossible();
    setAirpodsOffered(airpods);
    setHeadTrackingOffered(airpods || webcamHeadTrackingPossible());
  }, []);
  // Null until chosen: then AirPods where the desktop shell can read them, else the webcam.
  // An explicit AirPods choice is honoured everywhere and never falls back to the camera.
  const [storedHeadTrackingSource, setHeadTrackingSourceState] = useState<HeadTrackingSource | null>(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("huddle-head-tracking-source") : null;
      return stored === "webcam" || stored === "airpods" ? stored : null;
    } catch { return null; }
  });
  const headTrackingSource: HeadTrackingSource = storedHeadTrackingSource ?? (airpodsOffered ? "airpods" : "webcam");
  const setHeadTrackingSource = useCallback((source: HeadTrackingSource) => {
    setHeadTrackingSourceState(source);
    setHeadTrackingStatus({ status: "unsupported", live: false });
    try { localStorage.setItem("huddle-head-tracking-source", source); } catch { /* Session only. */ }
  }, []);
  const [spatialOutput, setSpatialOutputState] = useState<SpatialOutput>(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("huddle-spatial-output") === "speakers" ? "speakers" : "headphones"; }
    catch { return "headphones"; }
  });
  const setSpatialOutput = useCallback((output: SpatialOutput) => {
    setSpatialOutputState(output);
    try { localStorage.setItem("huddle-spatial-output", output); } catch { /* Session only. */ }
  }, []);
  const [tableSeatPans, setTableSeatPans] = useState<Record<string, number>>({});
  const [tableWidth, setTableWidth] = useState(1);
  // Share one observed join order between the preview and actual playback.
  const tableOrderRef = useRef<{ channelId: string | null; ids: string[] }>({ channelId: null, ids: [] });
  if (tableOrderRef.current.channelId !== channelId) tableOrderRef.current = { channelId, ids: [] };
  const tableIds = (channelId ? rooms[channelId] ?? [] : [])
    .filter((p) => !p.bot && !p.recorder && p.connectionId !== connectionId).map((p) => p.connectionId);
  const tableSeatOrder = tableOrderRef.current.ids.filter((id) => tableIds.includes(id));
  for (const id of tableIds) if (!tableSeatOrder.includes(id)) tableSeatOrder.push(id);
  tableOrderRef.current.ids = tableSeatOrder;
  const setHeadTracking = useCallback((enabled: boolean) => {
    setHeadTrackingState(enabled);
    if (!enabled) setHeadTrackingStatus({ status: "unsupported", live: false });
    try { localStorage.setItem("huddle-head-tracking", enabled ? "on" : "off"); } catch { /* Session only. */ }
  }, []);
  const onHeadTracking = useCallback((status: HeadTrackingStatus, live: boolean) => {
    setHeadTrackingStatus({ status, live });
  }, []);
  const recenterHead = useCallback(() => {
    window.dispatchEvent(new Event(HEAD_RECENTER_EVENT));
  }, []);
  const setTableMode = useCallback((enabled: boolean) => {
    setTableModeState(enabled);
    try { localStorage.setItem("huddle-table-mode", enabled ? "on" : "off"); } catch { /* Session only. */ }
  }, []);
  useEffect(() => {
    setTableHostId("");
    setTableSeatPans({});
  }, [channelId]);
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
  /** Toggle shortcuts, stored as `Ctrl+Shift+KeyM` style combos. */
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
  const deafenedRef = useRef(false);
  deafenedRef.current = deafened;
  /** Muted for everyone by someone else; you cannot undo it yourself. */
  const [forcedMute, setForcedMuteState] = useState(false);
  // Use the server's echoed state so failed sends/reconnects cannot leave a stale toggle.
  const important = Boolean(channelId && connectionId && rooms[channelId]?.find(
    (person) => person.connectionId === connectionId,
  )?.important);
  const toggleImportant = useCallback(() => {
    if (!channelId || muted || deafened || forcedMute) return;
    send({ t: "voice-state", important: !important });
  }, [channelId, muted, deafened, forcedMute, important, send]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<
    Array<{ connectionId: string; stream: MediaStream }>
  >([]);
  /** Media from the LiveKit room, before it is checked against the roster. */
  const [sfuStreams, setSfuStreams] = useState<SfuRemoteStream[]>([]);
  /** This seat is in the LiveKit room (or joining it). */
  const [sfuMode, setSfuMode] = useState(false);
  const sfuModeRef = useRef(false);
  const sfuRef = useRef<SfuVoice | null>(null);
  /** Pending retry of a lost LiveKit connection in a room too big to mesh. */
  const sfuRetryTimerRef = useRef<number | undefined>(undefined);
  /** Set once connectSfu exists; dropToMesh is declared before it. */
  const retrySfuRef = useRef<() => void>(() => undefined);
  /**
   * Everything remote, mesh and LiveKit together. A LiveKit identity is only
   * believed when the roster has that connection under the same user: the
   * token route fixes the user half, so nobody can appear as someone else.
   */
  const roster = channelId ? rooms[channelId] : undefined;
  const allRemoteStreams = useMemo((): RemoteVoiceStream[] => {
    const trusted = sfuStreams.filter((entry) => {
      const person = (roster || []).find(
        (seat) =>
          seat.connectionId === entry.connectionId &&
          (seat.id === entry.userId || (seat.recorder === true && entry.userId === "recorder")),
      );
      if (!person) return false;
      return (entry.kind !== "camera" && entry.kind !== "screen") || videoAllowedFrom(person);
    });
    const meshed = remoteStreams.filter((entry) => {
      const person = (roster || []).find((seat) => seat.connectionId === entry.connectionId);
      if (!person) return false;
      return entry.stream.getVideoTracks().length === 0 || videoAllowedFrom(person);
    });
    return [
      ...meshed,
      ...trusted.map(({ connectionId: id, stream, kind }) => ({ connectionId: id, stream, kind })),
    ];
  }, [remoteStreams, sfuStreams, roster]);
  const [screenSharing, setScreenSharing] = useState(false);
  const clipRemoteStreamsRef = useRef(allRemoteStreams);
  clipRemoteStreamsRef.current = allRemoteStreams;
  const [screenShareAudio, setScreenShareAudioState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("huddle:screenshare-audio") !== "false";
  });
  const [screenAudioMuted, setScreenAudioMuted] = useState(false);
  const [hasScreenAudio, setHasScreenAudio] = useState(false);

  const setScreenShareAudio = useCallback((enabled: boolean) => {
    setScreenShareAudioState(enabled);
    try {
      localStorage.setItem("huddle:screenshare-audio", String(enabled));
    } catch {}
  }, []);

  const toggleScreenAudio = useCallback(() => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const nextEnabled = !audioTracks[0].enabled;
    audioTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setScreenAudioMuted(!nextEnabled);
  }, []);

  const [cameraOn, setCameraOn] = useState(false);
  /** Your own video, so you can see what everyone else is seeing. */
  const [localVideos, setLocalVideos] = useState<
    Array<{ kind: "camera" | "screen"; stream: MediaStream }>
  >([]);
  const [screenQuality, setScreenQualityState] = useState<ScreenShareQuality>(() => {
    if (typeof window === "undefined") return "1080p30";
    try {
      const saved = localStorage.getItem("huddle:screenshare-quality");
      return isScreenQuality(saved) ? saved : "1080p30";
    } catch {
      return "1080p30";
    }
  });
  const setScreenQuality = useCallback((quality: ScreenShareQuality) => {
    setScreenQualityState(quality);
    try {
      localStorage.setItem("huddle:screenshare-quality", quality);
    } catch {}
  }, []);
  const screenQualityRef = useRef(screenQuality);
  screenQualityRef.current = screenQuality;
  /**
   * Film mode: smooth motion over crisp text. The encoder drops resolution
   * before frames, and slow viewers get a softer picture rather than a choppy one.
   */
  const [screenFilm, setScreenFilmState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("huddle:screenshare-film") === "true";
    } catch {
      return false;
    }
  });
  const setScreenFilm = useCallback((enabled: boolean) => {
    setScreenFilmState(enabled);
    try {
      localStorage.setItem("huddle:screenshare-film", String(enabled));
    } catch {}
  }, []);
  const screenFilmRef = useRef(screenFilm);
  screenFilmRef.current = screenFilm;
  const [micSettings, setMicSettingsState] = useState<MicSettings>(() =>
    readMicSettings(),
  );
  const [error, setError] = useState("");
  /** Per-peer RTCPeerConnection state, so tiles can say "connecting". */
  const [peerStates, setPeerStates] = useState<Record<string, string>>({});
  /** Connections actually receiving us, which is what the uplink pays for. */
  const listenerCount = Object.values(peerStates).filter((state) => state === "connected").length;

  /**
   * The input chain. `localStreamRef` below holds its *processed* output, which
   * is what peers receive; the raw microphone is only reachable through here,
   * so this is also the only thing that can release the device.
   */
  const micChainRef = useRef<MicChain | null>(null);
  /**
   * Whether the microphone should currently be live, mirrored from the gate
   * effect below. A new track starts enabled, and nothing re-runs that effect
   * when one is swapped in, so a replacement has to be told directly — without
   * this, changing your microphone quietly undoes a server mute.
   */
  const micGateRef = useRef(true);
  /**
   * A copy of the raw microphone that goes on the wire instead of the processed
   * track while its Web Audio graph is not running — which a phone may do to a
   * hidden app, and without this, switching apps would silently mute you. It
   * is strictly a stand-in: the raw capture has no auto-gain or gate, so the
   * room hears you noticeably quieter on it.
   */
  const backgroundMicRef = useRef<MediaStreamTrack | null>(null);
  /** Every track that mute, deafen and push-to-talk must switch together. */
  const micTracks = useCallback(
    (): MediaStreamTrack[] => [
      ...(localStreamRef.current?.getAudioTracks() || []),
      ...(backgroundMicRef.current ? [backgroundMicRef.current] : []),
    ],
    [],
  );
  /**
   * Level readings arrive twenty times a second. Holding them in state would
   * re-render the whole app at 20 Hz, so they live in a ref and the meters that
   * want them subscribe for themselves.
   */
  const micTelemetryRef = useRef<MicTelemetry | null>(null);
  const micListenersRef = useRef(new Set<(telemetry: MicTelemetry) => void>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const rawCameraStreamRef = useRef<MediaStream | null>(null);
  const cameraBgPipelineRef = useRef<VirtualBackgroundController | null>(null);
  const [cameraBackground, setCameraBackgroundState] = useState<BackgroundMode>(() => {
    if (typeof localStorage === "undefined") return "none";
    return (localStorage.getItem("huddle_camera_bg") as BackgroundMode) || "none";
  });
  const cameraBackgroundRef = useRef<BackgroundMode>(cameraBackground);
  cameraBackgroundRef.current = cameraBackground;

  const [cameraBlurAmount, setCameraBlurAmountState] = useState<number>(() => {
    if (typeof localStorage === "undefined") return 14;
    const v = parseInt(localStorage.getItem("huddle_camera_blur_amount") || "14", 10);
    return isNaN(v) ? 14 : Math.max(4, Math.min(36, v));
  });
  const cameraBlurAmountRef = useRef<number>(cameraBlurAmount);
  cameraBlurAmountRef.current = cameraBlurAmount;

  const [cameraBackgroundImage, setCameraBackgroundImageState] = useState<string>(() => {
    if (typeof localStorage === "undefined") return "preset:cyberpunk";
    return localStorage.getItem("huddle_camera_bg_image") || "preset:cyberpunk";
  });
  const cameraBackgroundImageRef = useRef<string>(cameraBackgroundImage);
  cameraBackgroundImageRef.current = cameraBackgroundImage;
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  /**
   * Videos each remote viewer asked us not to send them. Enforced at the
   * sender (encodings switched off), so the bytes really stop — hiding the
   * picture on the viewer's side alone would still spend their data.
   */
  const pausedByPeerRef = useRef(new Map<string, VideoPause>());
  /** Videos this tab asked each remote person to stop sending. */
  const [hiddenVideo, setHiddenVideoState] = useState<Record<string, VideoPause>>({});
  const hiddenVideoRef = useRef(hiddenVideo);
  hiddenVideoRef.current = hiddenVideo;
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
  /** Signals that arrived before this tab finished joining. */
  const earlySignalsRef = useRef<Array<{ from: string; raw: unknown; at: number }>>(
    [],
  );
  /**
   * The hub connection id this tab last announced itself with. When the socket
   * reconnects (a laptop lid, a wifi blip) the hub has already dropped the old
   * connection from the room, so the join has to be announced again with the
   * new id — otherwise this tab sits in voice locally while being invisible to
   * everyone else.
   */
  const announcedConnectionRef = useRef<string | null>(null);
  /** The hub session that announcement went out on. */
  const announcedSessionRef = useRef(0);
  /** When each peer connection was (re)built, so the watchdog can spot stalls. */
  const peerSinceRef = useRef(new Map<string, number>());
  /** Latest roster, readable from the watchdog without re-subscribing. */
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  /** Lets the replay effect call the handler without depending on its identity. */
  const handleSignalRef = useRef<(from: string, raw: unknown) => void>(() => {});
  /** Bumped by every join and leave; a join that is no longer the latest bails. */
  const joinSeqRef = useRef(0);
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
    micGateRef.current = on;
    micTracks().forEach((track) => (track.enabled = on));
    void sfuRef.current?.setMicMuted(!on);
  }, [channelId, pushToTalk, pttHeld, muted, forcedMute, micTracks, sfuMode]);

  // Re-spend the uplink whenever the room or what we send changes: see
  // voiceBitrate. Encoder bitrate changes apply live, without renegotiating.
  const sendingVideo = cameraOn || screenSharing;
  useEffect(() => {
    if (!channelId) return;
    const voice = voiceBitrate(listenerCount, sendingVideo, roomBitrate);
    const screen = new Set(screenStreamRef.current?.getAudioTracks() || []);
    for (const peer of peersRef.current.values()) {
      for (const sender of peer.getSenders()) {
        if (sender.track?.kind !== "audio") continue;
        const bitrate = screen.has(sender.track) ? screenAudioBitrate(listenerCount) : voice;
        void tuneAudioSender(sender, bitrate);
      }
    }
    // Through the media server the voice is uploaded once, whoever listens,
    // so it keeps the channel's full ceiling.
    const sfuMic = sfuRef.current?.micSender();
    if (sfuMic) void tuneAudioSender(sfuMic, roomBitrate);
  }, [channelId, listenerCount, sendingVideo, roomBitrate, sfuMode]);

  /**
   * Follow the server's view of this seat's microphone.
   *
   * The hub decides who may be heard in a stage, and refuses to record a seat
   * without the floor as unmuted. A client that skipped its own auto-mute would
   * otherwise sit there with a live microphone whose audio every peer is
   * already dropping, so adopt the server's answer instead.
   *
   * Scoped to `speakAllowed === false` on purpose. Only there is the mismatch
   * unresolvable — everywhere else the server will agree with us once the
   * broadcast catches up, and re-muting would fight the user's own click.
   */
  useEffect(() => {
    if (!channelId) return;
    const mine = (rooms[channelId] || []).find(
      (person) => person.connectionId === connectionId,
    );
    if (!mine) return;
    if (mine.speakAllowed !== false || !mine.muted || muted) return;
    setMuted(true);
  }, [rooms, channelId, connectionId, muted]);

  // Errors are meant to be noticed, not to linger: a one-off network blip or
  // a blocked camera must not leave a scary banner up until the next join.
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 8000);
    return () => window.clearTimeout(timer);
  }, [error]);

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
    // Desktop shell: the key is watched system-wide and relayed as press and
    // release, so PTT keeps working while you're in a game.
    const relay = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      if (action === "ptt-down") setPttHeld(true);
      else if (action === "ptt-up") setPttHeld(false);
    };
    const shell = (
      window as unknown as {
        huddle?: { setPushToTalkKey?: (code: string) => Promise<boolean> };
      }
    ).huddle;
    void shell?.setPushToTalkKey?.(pttKey);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("huddle-hotkey", relay);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("huddle-hotkey", relay);
      void shell?.setPushToTalkKey?.("");
      setPttHeld(false);
    };
  }, [pushToTalk, channelId, pttKey]);

  /**
   * Keeps a rolling recording of the room so "Clip that!" can hand back the
   * last half-minute. Everyone's audio is mixed through one AudioContext; when
   * someone is sharing a screen, that video rides along too.
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
        // Everyone already in the room, too: the effect below only adds
        // streams that arrive later.
        for (const { connectionId: id, stream, kind } of clipRemoteStreamsRef.current) {
          attach(kind ? `${id}:${kind}` : id, stream);
        }

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
  }, [channelId, enableClips, screenSharing]);

  // Remote people joining mid-call get folded into the clip mix.
  useEffect(() => {
    if (!enableClips) return;
    const mix = clipMixRef.current;
    if (!mix) return;
    for (const { connectionId: id, stream, kind } of allRemoteStreams) {
      const key = kind ? `${id}:${kind}` : id;
      if (mix.sources.has(key) || !stream.getAudioTracks().length) continue;
      try {
        const source = mix.context.createMediaStreamSource(stream);
        source.connect(mix.destination);
        mix.sources.set(key, source);
      } catch {
        // Skip a stream the context will not take.
      }
    }
  }, [enableClips, allRemoteStreams]);

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

  const [relay, setRelay] = useState<RelayStatus>({
    state: "unknown",
    detail: "Not checked yet. Join a voice room to test the relay.",
  });
  /** Bumped when the ICE configuration arrives, so the check can wait for it. */
  const [iceGeneration, setIceGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    /**
     * The relay list decides whether people behind strict networks can be heard
     * at all. A failed fetch used to leave this tab on public STUN with nothing
     * to show for it, so retry, and say so in the console where a self-hoster
     * will look.
     */
    const load = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const data = await apiFetch<{
            iceServers: RTCIceServer[];
            source?: string;
            note?: string;
          }>("/api/voice/ice");
          if (cancelled) return;
          if (data.iceServers?.length) iceServersRef.current = data.iceServers;
          if (data.source !== "configured") {
            console.warn(
              `Huddle voice: ${data.note || "no TURN server is configured."}`,
            );
          }
          setIceGeneration((current) => current + 1);
          return;
        } catch (error) {
          if (attempt === 2) {
            console.warn(
              "Huddle voice: the ICE server list did not load; sticking to public STUN.",
              error,
            );
          } else {
            await new Promise((resolve) =>
              window.setTimeout(resolve, 750 * (attempt + 1)),
            );
          }
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Gathers a relay candidate and reports what came back. Worth doing because
   * every way a relay fails is silent: calls connect, and then one pair hears
   * nothing while everyone else is fine.
   */
  const checkRelay = useCallback(async () => {
    const turn = turnOnly(iceServersRef.current);
    if (!turn.length) {
      setRelay({
        state: "no-turn",
        detail:
          "No TURN server is configured. Voice still works for most people, but anyone behind a strict network will not be able to hear everyone.",
        checkedAt: Date.now(),
      });
      return;
    }

    setRelay({ state: "checking", detail: "Asking the relay for an address…" });
    const { relay: granted, error } = await gatherRelay(turn);
    if (!granted) {
      setRelay({
        state: "unreachable",
        detail: `The relay did not answer${
          error ? ` (${error})` : ""
        }. Until it does, people behind strict networks cannot reach each other.`,
        checkedAt: Date.now(),
      });
      // A configured relay that does not answer is a misconfiguration someone
      // has to fix, and the only clue otherwise is a friend who cannot hear
      // another friend. A relay that was never configured is a documented
      // default, so that one stays in the panel rather than nagging.
      setError(
        "Your voice relay is not answering, so friends on strict networks cannot hear each other. Check the TURN server and the ports it needs.",
      );
      return;
    }

    const address = `${granted.address}:${granted.port}`;
    const bad = privateAddress(granted.address);
    if (bad) {
      setRelay({
        state: "private",
        detail: `The relay handed out ${address}, which is ${bad}. Its external-ip does not match its public address, so no peer can reach it.`,
        address,
        checkedAt: Date.now(),
      });
      setError(
        "Your voice relay handed out a private address, so nobody can connect through it. Set external-ip in the coturn config.",
      );
      return;
    }

    setRelay({
      state: "ok",
      detail: `Relay reachable at ${address}.`,
      address,
      checkedAt: Date.now(),
    });
  }, []);

  // The answer changes with the network, so ask once per call rather than once
  // per page: a laptop that moved to another wifi is a different question.
  useEffect(() => {
    if (!channelId || !iceGeneration) return;
    void checkRelay();
  }, [channelId, iceGeneration, checkRelay]);

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
        if (peak > 8) loud.add(id.replace(/:tts$/, ""));
      }
      // Your own tile reads the input chain instead of a second analyser: it
      // already decided whether this is speech, and it decided on the audio
      // everyone else is actually receiving. Mute and push-to-talk live further
      // downstream than the chain does, so ask the track whether it is actually
      // sending rather than trusting the level alone.
      const own = micTelemetryRef.current;
      const sending = localStreamRef.current?.getAudioTracks()[0]?.enabled;
      if (sending && own && own.gateOpen && own.outputDb > -50) loud.add("self");
      const say = ttsOutRef.current;
      if (say && say.context.currentTime < say.endsAt) loud.add("self");
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

  /**
   * Opens the microphone with the saved input settings and wires its telemetry
   * up. The caller owns the returned chain and must stop it.
   */
  const openMicChain = useCallback(async (): Promise<MicChain> => {
    const chain = await openMicrophone();
    chain.onTelemetry((telemetry) => {
      micTelemetryRef.current = telemetry;
      for (const listener of micListenersRef.current) listener(telemetry);
    });
    return chain;
  }, []);

  /** Lets the settings meters watch the live input without re-rendering the app. */
  const subscribeMicTelemetry = useCallback(
    (listener: (telemetry: MicTelemetry) => void) => {
      micListenersRef.current.add(listener);
      return () => {
        micListenersRef.current.delete(listener);
      };
    },
    [],
  );

  /**
   * Changes an input setting mid-call. These go straight into the running
   * worklet: rebuilding the track instead would renegotiate every peer, and the
   * room would hear a dropout every time someone nudged a slider.
   */
  const setMicSettings = useCallback((next: Partial<MicSettings>) => {
    const before = readMicSettings();
    const merged = writeMicSettings(next);
    setMicSettingsState(merged);
    micChainRef.current?.update(next);
    // Echo cancellation lives inside the capture itself, and browsers will not
    // reliably retune that on a running track, so it takes a fresh one. That
    // is the same swap as changing microphone: a blip, not a renegotiation.
    if (merged.echoCancellation !== before.echoCancellation && micChainRef.current) {
      void switchMicrophoneRef.current();
    }
  }, []);
  const switchMicrophoneRef = useRef<() => Promise<void>>(async () => {});

  /**
   * Switches our camera/screen senders to one peer on or off to match what that
   * peer asked for. Senders have no encodings until negotiation finishes, so
   * this is re-run after every offer/answer as well.
   */
  const applyVideoPause = useCallback(async (remoteId: string) => {
    const peer = peersRef.current.get(remoteId);
    if (!peer) return;
    const wanted = pausedByPeerRef.current.get(remoteId) || NO_PAUSE;
    const camera = cameraStreamRef.current?.getTracks() || [];
    const screen = screenStreamRef.current?.getTracks() || [];
    for (const sender of peer.getSenders()) {
      const track = sender.track;
      if (!track) continue;
      const which = camera.includes(track) ? "camera" : screen.includes(track) ? "screen" : null;
      if (!which) continue;
      const params = sender.getParameters();
      if (!params.encodings?.length) continue;
      const active = !wanted[which];
      if (params.encodings.every((encoding) => encoding.active === active)) continue;
      params.encodings = params.encodings.map((encoding) => ({ ...encoding, active }));
      await sender.setParameters(params).catch(() => undefined);
    }
  }, []);

  /** Stop (or resume) receiving one person's camera or screen share. */
  const setVideoHidden = useCallback(
    (remoteId: string, which: keyof VideoPause, hidden: boolean) => {
      const next = { ...(hiddenVideoRef.current[remoteId] || NO_PAUSE), [which]: hidden };
      hiddenVideoRef.current = { ...hiddenVideoRef.current, [remoteId]: next };
      setHiddenVideoState(hiddenVideoRef.current);
      sfuRef.current?.setHidden(remoteId, which, hidden);
      send({
        t: "signal",
        to: remoteId,
        data: { kind: "video-pause", paused: next } satisfies SignalPayload,
      });
    },
    [send],
  );

  const closePeer = useCallback((remoteId: string) => {
    const peer = peersRef.current.get(remoteId);
    peer?.close();
    peersRef.current.delete(remoteId);
    // A rebuilt connection starts sending again until the viewer re-asks,
    // which it does as soon as the new connection is up.
    pausedByPeerRef.current.delete(remoteId);
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
      peerSinceRef.current.set(remoteId, Date.now());

      for (const own of localStreamRef.current?.getTracks() || []) {
        // Someone joining while we are in the background gets the raw copy too.
        const track = own.kind === "audio" && backgroundMicRef.current ? backgroundMicRef.current : own;
        const sender = peer.addTrack(track, localStreamRef.current as MediaStream);
        if (track.kind === "audio") {
          void tuneAudioSender(sender, voiceBitrate(
            peersRef.current.size,
            Boolean(cameraStreamRef.current || screenStreamRef.current),
            roomBitrateRef.current,
          ));
        }
      }
      for (const track of screenStreamRef.current?.getTracks() || []) {
        const sender = peer.addTrack(track, screenStreamRef.current as MediaStream);
        if (track.kind === "audio") {
          void tuneAudioSender(sender, screenAudioBitrate(peersRef.current.size));
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
        if (event.track.kind === "audio") {
          // Not in every browser's typings/implementation yet; harmless where absent.
          const receiver = event.receiver as RTCRtpReceiver & { jitterBufferTarget?: number | null };
          if ("jitterBufferTarget" in receiver) {
            try { receiver.jitterBufferTarget = AUDIO_JITTER_TARGET_MS; } catch { /* unsupported */ }
          }
          watchLevel(remoteId, stream);
        }
      };

      peer.onconnectionstatechange = () => {
        setPeerStates((current) => ({
          ...current,
          [remoteId]: peer.connectionState,
        }));
        // Re-state what we don't want from them on every (re)connection.
        const hidden = hiddenVideoRef.current[remoteId];
        if (peer.connectionState === "connected" && hidden && (hidden.camera || hidden.screen)) {
          send({
            t: "signal",
            to: remoteId,
            data: { kind: "video-pause", paused: hidden } satisfies SignalPayload,
          });
        }
        if (peer.connectionState === "closed") closePeer(remoteId);
      };

      peer.onicecandidateerror = (event) => {
        // ICE reports a relay it could not use here, long before anything a
        // person could see. Without this a broken TURN server is just silence.
        const details = event as RTCPeerConnectionIceErrorEvent;
        if (!details.errorCode) return;
        console.warn(
          `Huddle voice: ICE could not use ${details.url || "a candidate"} (${details.errorCode} ${
            details.errorText || ""
          })`.trim(),
        );
      };

      peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState !== "failed") return;
        // A restart only flags the next offer: without one actually going out,
        // nothing happens on the wire at all. If we are mid-handshake there is
        // no offer to hang it on, so rebuild from scratch instead.
        if (!restartedRef.current.has(remoteId) && peer.signalingState === "stable") {
          restartedRef.current.add(remoteId);
          try {
            peer.restartIce();
          } catch {
            closePeer(remoteId);
            return;
          }
          void negotiateRef.current(remoteId, peer).catch(() => closePeer(remoteId));
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
      // Signalling can beat this tab's own join by a hair on a fast network.
      // Hold anything early and replay it once we are in the room, rather than
      // dropping it — a dropped offer means that pair never connects at all.
      //
      // Only a seat in this room may negotiate with us: answering an offer
      // attaches the microphone, so an offer from anyone else would let them
      // listen in. A seat the roster has not caught up with yet is held too and
      // replayed once it appears (see the roster effect below).
      const inRoom = (roomsRef.current[channelIdRef.current || ""] || []).some(
        (person) => person.connectionId === from,
      );
      if (!channelIdRef.current || !inRoom) {
        const held = earlySignalsRef.current;
        held.push({ from, raw, at: Date.now() });
        // Bounded, so a stream of junk signals cannot grow memory forever.
        if (held.length > EARLY_SIGNAL_LIMIT) held.splice(0, held.length - EARLY_SIGNAL_LIMIT);
        return;
      }
      const data = raw as SignalPayload;

      if (data.kind === "video-pause") {
        pausedByPeerRef.current.set(from, {
          camera: data.paused?.camera === true,
          screen: data.paused?.screen === true,
        });
        await applyVideoPause(from);
        return;
      }

      // An offer for a peer that has gone bad means the other side rebuilt the
      // connection; throw ours away so the fresh handshake can land.
      const existing = peersRef.current.get(from);
      if (
        existing &&
        data.kind === "offer" &&
        (existing.connectionState === "failed" ||
          existing.connectionState === "closed")
      ) {
        closePeer(from);
      }

      const peer = createPeer(from);

      try {
        if (data.kind === "offer" && data.description) {
          // Two tabs can offer at once — a reconnect, or the watchdog on both
          // sides deciding a pair is slow. One side has to give way, and it has
          // to be the same side every time or both keep losing: the peer with
          // the higher id plays polite and rolls its own offer back, while the
          // other keeps the offer it already sent.
          if (peer.signalingState === "have-local-offer") {
            const polite = Boolean(connectionId && connectionId > from);
            if (!polite) return;
            await peer.setLocalDescription({ type: "rollback" });
          }
          await peer.setRemoteDescription(data.description);
          for (const candidate of pendingCandidatesRef.current.get(from) || []) {
            await peer.addIceCandidate(candidate).catch(() => undefined);
          }
          pendingCandidatesRef.current.delete(from);
          const answer = tuneOpusSdp(await peer.createAnswer());
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
          await applyVideoPause(from);
        } else if (data.kind === "answer" && data.description) {
          await peer.setRemoteDescription(data.description);
          await applyVideoPause(from);
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
    [applyVideoPause, closePeer, connectionId, createPeer, send],
  );
  handleSignalRef.current = handleSignal;

  /** Builds the connection and sends the opening offer. */
  const callPeer = useCallback(
    (remoteId: string) => {
      const peer = createPeer(remoteId);
      peerSinceRef.current.set(remoteId, Date.now());
      void (async () => {
        try {
          const offer = tuneOpusSdp(await peer.createOffer());
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
    },
    [closePeer, createPeer, send],
  );

  /**
   * Leaves LiveKit and carries on over the mesh. Telling the hub is what makes
   * the LiveKit seats start calling this one directly. In a big room it stays
   * on LiveKit and retries instead (see MESH_FALLBACK_MAX_PEERS).
   */
  const dropToMesh = useCallback((reason?: string) => {
    const sfu = sfuRef.current;
    sfuRef.current = null;
    void sfu?.leave();
    setSfuStreams([]);
    if (!sfuModeRef.current) return;
    const room = channelIdRef.current;
    if (room && meshFallbackBlocked(roomsRef.current[room] || [], connectionId)) {
      // Too many people to call directly: stay a LiveKit seat, so nobody starts
      // meshing with this one, and try the server again shortly.
      window.clearTimeout(sfuRetryTimerRef.current);
      sfuRetryTimerRef.current = window.setTimeout(() => retrySfuRef.current(), SFU_RETRY_MS);
      setError("Lost the voice server. Reconnecting…");
      return;
    }
    sfuModeRef.current = false;
    setSfuMode(false);
    if (channelIdRef.current) {
      send({ t: "voice-state", sfu: false });
      if (reason) setError(reason);
    }
  }, [connectionId, send]);

  /**
   * Text-to-speech said into the call (/say). It goes out as its own track,
   * not through the mic, so it works without a microphone and while muted.
   * You hear it too, a little quieter, the way you would hear yourself talk.
   */
  const ttsOutRef = useRef<{
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
    publishedTo: SfuVoice | null;
    endsAt: number;
    playing: Set<AudioBufferSourceNode>;
  } | null>(null);
  const forcedMuteRef = useRef(false);
  forcedMuteRef.current = forcedMute;
  /** Cuts off whatever /say is still playing. */
  const stopSpeaking = useCallback(() => {
    const out = ttsOutRef.current;
    if (!out) return;
    for (const source of out.playing) {
      try { source.stop(); } catch { /* already ended */ }
    }
    out.playing.clear();
    out.endsAt = out.context.currentTime;
  }, []);
  // A moderator's server mute silences /say as well, mid-sentence included.
  // Listeners also drop a server-muted seat's /say track on their side.
  useEffect(() => {
    if (forcedMute) stopSpeaking();
  }, [forcedMute, stopSpeaking]);
  const speakIntoCall = useCallback(
    async (audio: Float32Array, sampleRate: number): Promise<"sent" | "no-call" | "no-server" | "server-muted" | "busy" | "too-long"> => {
      if (!channelIdRef.current) return "no-call";
      if (forcedMuteRef.current) return "server-muted";
      if (audio.length / sampleRate > SAY_MAX_SECONDS) return "too-long";
      const queued = ttsOutRef.current;
      // /says queue back to back, up to a cap, so nobody can talk over a room for minutes.
      if (queued && queued.endsAt - queued.context.currentTime > SAY_MAX_BACKLOG_SECONDS) return "busy";
      const sfu = sfuRef.current;
      // The mesh would need every peer connection renegotiated for one more
      // track; /say waits for the voice server instead.
      if (!sfuModeRef.current || !sfu) return "no-server";
      let out = ttsOutRef.current;
      if (!out) {
        const context = new AudioContext();
        out = { context, destination: context.createMediaStreamDestination(), publishedTo: null, endsAt: 0, playing: new Set() };
        ttsOutRef.current = out;
      }
      await out.context.resume().catch(() => undefined);
      if (out.publishedTo !== sfu) {
        await sfu.publish(out.destination.stream.getAudioTracks()[0], "tts");
        out.publishedTo = sfu;
      }
      const buffer = out.context.createBuffer(1, audio.length, sampleRate);
      buffer.copyToChannel(new Float32Array(audio), 0);
      const source = out.context.createBufferSource();
      source.buffer = buffer;
      source.connect(out.destination);
      const monitor = out.context.createGain();
      monitor.gain.value = 0.6;
      source.connect(monitor).connect(out.context.destination);
      const startAt = Math.max(
        out.context.currentTime + 0.05,
        out.endsAt > out.context.currentTime ? out.endsAt + SAY_GAP_SECONDS : 0,
      );
      const playing = out.playing;
      playing.add(source);
      source.onended = () => playing.delete(source);
      source.start(startAt);
      out.endsAt = startAt + buffer.duration;
      return "sent";
    },
    [],
  );
  useEffect(() => () => {
    void ttsOutRef.current?.context.close().catch(() => undefined);
    ttsOutRef.current = null;
  }, []);

  /** Joins the LiveKit room and puts everything this tab is sending into it. */
  const connectSfu = useCallback(
    async (grant: { url: string; token: string }) => {
      void sfuRef.current?.leave();
      const sfu = new SfuVoice({
        onStreams: (streams) => {
          if (sfuRef.current === sfu) setSfuStreams(streams);
        },
        onVoice: (remoteId, stream, receiver, kind) => {
          // /say speech lights its speaker's tile too, so everyone can see who it is.
          if (kind === "tts") {
            watchLevel(`${remoteId}:tts`, stream);
            return;
          }
          const tunable = receiver as (RTCRtpReceiver & { jitterBufferTarget?: number | null }) | undefined;
          if (tunable && "jitterBufferTarget" in tunable) {
            try { tunable.jitterBufferTarget = AUDIO_JITTER_TARGET_MS; } catch { /* unsupported */ }
          }
          watchLevel(remoteId, stream);
        },
        onLost: () => {
          if (sfuRef.current === sfu) {
            dropToMesh("Lost the voice server, so this call switched to direct connections.");
          }
        },
        isHidden: (remoteId, kind) => hiddenVideoRef.current[remoteId]?.[kind] === true,
      });
      sfuRef.current = sfu;
      try {
        await sfu.connect(grant.url, grant.token, iceServersRef.current);
      } catch {
        if (sfuRef.current === sfu) {
          dropToMesh("Could not reach the voice server, so this call uses direct connections.");
        }
        return;
      }
      if (sfuRef.current !== sfu) {
        void sfu.leave();
        return;
      }
      // A timed-out member may listen but not publish, so one refusal is not
      // a reason to give up on the room.
      const publish = (
        track: MediaStreamTrack,
        kind: SfuPublishKind,
        options?: Parameters<SfuVoice["publish"]>[2],
      ) =>
        sfu.publish(track, kind, options).catch((publishError) => {
          console.warn("Huddle voice: LiveKit would not take a track.", publishError);
        });
      const mic = backgroundMicRef.current ?? localStreamRef.current?.getAudioTracks()[0];
      if (mic) {
        await publish(mic, "mic", { bitrate: roomBitrateRef.current });
        await sfu.setMicMuted(!micGateRef.current);
      }
      for (const track of screenStreamRef.current?.getTracks() || []) {
        await (track.kind === "video"
          ? publish(track, "screen", { screen: screenQualityRef.current, film: screenFilmRef.current })
          : publish(track, "screen-audio", { bitrate: SFU_SCREEN_AUDIO_BITRATE }));
      }
      for (const track of cameraStreamRef.current?.getVideoTracks() || []) {
        await publish(track, "camera");
      }
    },
    [dropToMesh, watchLevel],
  );

  // One more go at LiveKit for a seat that lost it in a room too big to mesh.
  // A refusal goes back through dropToMesh, which schedules the next attempt,
  // or meshes after all if the room has shrunk meanwhile.
  // LiveKit only lets a seat publish when it may be heard (see the token
  // route). Brought on stage, or a server mute lifted: fetch a token that
  // allows it and reconnect, so the new speaker's microphone goes through.
  const mayPublishRef = useRef<boolean | null>(null);
  useEffect(() => {
    const mine = channelId
      ? (rooms[channelId] || []).find((person) => person.connectionId === connectionId)
      : undefined;
    const mayPublish = mine ? !mine.serverMuted && mine.speakAllowed !== false : null;
    const before = mayPublishRef.current;
    mayPublishRef.current = mayPublish;
    if (before !== false || mayPublish !== true) return;
    if (!channelId || !connectionId || !sfuModeRef.current) return;
    const room = channelId;
    void sfuGrant(room, connectionId).then((grant) => {
      if (grant && channelIdRef.current === room && sfuModeRef.current) void connectSfu(grant);
    });
  }, [rooms, channelId, connectionId, connectSfu]);

  retrySfuRef.current = () => {
    const room = channelIdRef.current;
    if (!room || !connectionId || !sfuModeRef.current || sfuRef.current) return;
    void sfuGrant(room, connectionId).then((grant) => {
      if (channelIdRef.current !== room || !sfuModeRef.current || sfuRef.current) return;
      if (grant) {
        setError("");
        void connectSfu(grant);
      } else {
        dropToMesh("Could not reach the voice server, so this call uses direct connections.");
      }
    });
  };

  /** Offer to everyone already in the room whose id sorts below ours. */
  useEffect(() => {
    if (!channelId || !connectionId) return;
    const others = (rooms[channelId] || [])
      .filter((person) => person.connectionId !== connectionId && meshWith(person, sfuMode));

    for (const person of others) {
      const remoteId = person.connectionId;
      if (peersRef.current.has(remoteId)) continue;
      // The server-side music publisher only answers offers, so listeners
      // always call it. Browser peers retain deterministic caller ordering.
      if (!person.bot && connectionId > remoteId) {
        // They place the call. Start their clock so the watchdog waits a
        // sensible while before stepping in, instead of offering instantly.
        if (!peerSinceRef.current.has(remoteId)) {
          peerSinceRef.current.set(remoteId, Date.now());
        }
        continue;
      }
      callPeer(remoteId);
    }

    for (const remoteId of peersRef.current.keys()) {
      if (!others.some((person) => person.connectionId === remoteId)) {
        closePeer(remoteId);
      }
    }
  }, [rooms, channelId, connectionId, callPeer, closePeer, sfuMode]);

  // Replay anything that arrived a moment before we were ready to handle it.
  useEffect(() => {
    if (!channelId) return;
    const roster = new Set((rooms[channelId] || []).map((person) => person.connectionId));
    const pending = earlySignalsRef.current;
    const now = Date.now();
    const ready = pending.filter((entry) => now - entry.at < 15_000 && roster.has(entry.from));
    earlySignalsRef.current = pending.filter(
      (entry) => now - entry.at < 15_000 && !roster.has(entry.from),
    );
    for (const entry of ready) void handleSignalRef.current(entry.from, entry.raw);
  }, [channelId, rooms]);

  /**
   * Re-announce the voice join whenever the hub connection id changes.
   *
   * The hub keys voice seats by connection id. When the WebSocket reconnects
   * (a laptop lid, a wifi blip) the hub has already dropped the old connection
   * from the room, so this tab is sitting in voice locally while being
   * invisible to everyone else — the classic "I'm in the room but nobody can
   * hear me, refresh fixes it" state. Sending voice-join again with the new id
   * puts the seat back. It also covers a join whose initial send failed
   * because the socket was briefly down.
   *
   * On a real reconnect everyone else rebuilds their peer against the new id,
   * so tear down our side and re-mesh immediately instead of waiting for the
   * watchdog: stale peer connections would otherwise swallow the fresh offers.
   */
  useEffect(() => {
    if (!channelId || !connectionId) return;
    const sameId = announcedConnectionRef.current === connectionId;
    if (sameId && announcedSessionRef.current === session) return;
    const wasAnnounced = announcedConnectionRef.current !== null;
    // Carry the seat's clock and state over, so a server restart does not
    // reset the call timer or unmute anyone. The hub ignores these on a
    // genuinely new seat's first join.
    const mine = wasAnnounced
      ? (roomsRef.current[channelId] || []).find(
          (person) => person.connectionId === announcedConnectionRef.current,
        )
      : undefined;
    const joined = send({
      t: "voice-join",
      channelId,
      sfu: sfuModeRef.current || undefined,
      since: mine?.joinedAt,
      muted: wasAnnounced ? mutedRef.current : undefined,
      deafened: wasAnnounced ? deafenedRef.current : undefined,
    });
    if (!joined) return;
    announcedConnectionRef.current = connectionId;
    announcedSessionRef.current = session;
    if (sameId) {
      // Resumed after a restart: same seat, same LiveKit identity, same peer
      // ids. Only the hub forgot us, so tell it what we are sharing again and
      // leave every media connection alone.
      announceVideoRef.current();
      return;
    }
    // The first announcement is meshed by the roster effect; only a reconnect
    // needs the teardown + rebuild here.
    if (!wasAnnounced) return;

    // The LiveKit identity names the old connection, which nobody can match
    // any more, so rejoin under the new one.
    if (sfuModeRef.current) {
      void sfuGrant(channelId, connectionId).then((grant) => {
        if (channelIdRef.current !== channelId || !sfuModeRef.current) return;
        if (grant) void connectSfu(grant);
        else dropToMesh("Could not rejoin the voice server, so this call uses direct connections.");
      });
    }

    for (const remoteId of [...peersRef.current.keys()]) closePeer(remoteId);
    peerSinceRef.current.clear();
    restartedRef.current.clear();

    // Re-mesh with the same caller rule the roster effect uses.
    const others = (roomsRef.current[channelId] || []).filter(
      (person) => person.connectionId !== connectionId && meshWith(person, sfuModeRef.current),
    );
    for (const person of others) {
      const remoteId = person.connectionId;
      if (!person.bot && connectionId > remoteId) {
        // They place the call; start their clock so the watchdog waits.
        peerSinceRef.current.set(remoteId, Date.now());
        continue;
      }
      callPeer(remoteId);
    }
  }, [channelId, connectionId, session, send, closePeer, callPeer, connectSfu, dropToMesh]);

  /**
   * Watchdog: a mesh call can lose a single pair — an offer that never landed,
   * or a connection that failed after a network blip — and nothing else would
   * ever rebuild it, because the roster has not changed. That is the state
   * where people say "I cannot hear them" and a refresh fixes it.
   *
   * Every few seconds, rebuild any connection that is missing, failed, or has
   * been trying for too long.
   */
  useEffect(() => {
    if (!channelId || !connectionId) return;
    const timer = window.setInterval(() => {
      const others = (roomsRef.current[channelId] || []).filter(
        (person) => person.connectionId !== connectionId && meshWith(person, sfuModeRef.current),
      );

      for (const person of others) {
        const remoteId = person.connectionId;
        const peer = peersRef.current.get(remoteId);
        // Mirrors the roster effect's rule, so both agree on who dials.
        const weCall = person.bot || connectionId <= remoteId;
        // The side that would normally place the call retries first; the other
        // waits longer, so a pair does not both re-offer at the same moment.
        const graceMs = weCall ? 8000 : 14000;
        const since = peerSinceRef.current.get(remoteId) ?? 0;

        if (!peer) {
          if (Date.now() - since > graceMs) callPeer(remoteId);
          continue;
        }

        const state = peer.connectionState;
        if (state === "connected") {
          // Healthy again: allow a future ICE restart if it drops later.
          restartedRef.current.delete(remoteId);
          peerSinceRef.current.set(remoteId, Date.now());
          continue;
        }
        if (
          state === "failed" ||
          state === "closed" ||
          Date.now() - since > graceMs * 2
        ) {
          closePeer(remoteId);
          peerSinceRef.current.set(remoteId, Date.now() - graceMs);
        }
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [channelId, connectionId, callPeer, closePeer]);

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
      const offer = tuneOpusSdp(await peer.createOffer());
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
  const announceVideoRef = useRef<() => void>(() => {});
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
  announceVideoRef.current = announceVideo;

  const stopScreenShare = useCallback(() => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    const trackIds = new Set(stream.getTracks().map((track) => track.id));
    void sfuRef.current?.unpublish(stream.getTracks());
    stream.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenSharing(false);
    setHasScreenAudio(false);
    setScreenAudioMuted(false);
    playScreenShareStopSound();
    announceVideo();
    for (const [remoteId, peer] of peersRef.current) {
      for (const sender of peer.getSenders()) {
        if (sender.track && trackIds.has(sender.track.id)) peer.removeTrack(sender);
      }
      void negotiatePeer(remoteId, peer).catch(() => closePeer(remoteId));
    }
  }, [announceVideo, closePeer, negotiatePeer]);

  const stopCamera = useCallback(() => {
    cameraBgPipelineRef.current?.stop();
    cameraBgPipelineRef.current = null;
    rawCameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    rawCameraStreamRef.current = null;
    const stream = cameraStreamRef.current;
    if (!stream) return;
    const trackIds = new Set(stream.getTracks().map((track) => track.id));
    void sfuRef.current?.unpublish(stream.getTracks());
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
      const rawStream = await navigator.mediaDevices.getUserMedia({
        video: cameraConstraints(),
      });
      rawCameraStreamRef.current = rawStream;

      let stream: MediaStream = rawStream;
      const currentBg = cameraBackgroundRef.current;
      if (currentBg !== "none") {
        const pipeline = createVirtualBackgroundPipeline(
          rawStream,
          currentBg,
          cameraBlurAmountRef.current,
          cameraBackgroundImageRef.current
        );
        cameraBgPipelineRef.current = pipeline;
        stream = pipeline.outputStream;
      }

      cameraStreamRef.current = stream;
      setCameraOn(true);
      announceVideo();
      rawStream.getVideoTracks()[0]?.addEventListener("ended", stopCamera, {
        once: true,
      });
      for (const [remoteId, peer] of peersRef.current) {
        for (const track of stream.getTracks()) peer.addTrack(track, stream);
        await negotiatePeer(remoteId, peer);
      }
      for (const track of stream.getVideoTracks()) {
        await sfuRef.current?.publish(track, "camera").catch(() => undefined);
      }
    } catch (cameraError) {
      if ((cameraError as DOMException)?.name !== "NotAllowedError") {
        setError("Your camera could not start. Another app may be using it.");
      } else {
        setError("Camera access was blocked. Allow it in your browser settings.");
      }
    }
  }, [announceVideo, negotiatePeer, stopCamera]);

  const setCameraBackground = useCallback(async (mode: BackgroundMode) => {
    setCameraBackgroundState(mode);
    cameraBackgroundRef.current = mode;
    try {
      localStorage.setItem("huddle_camera_bg", mode);
    } catch {
      // ignore
    }
    const rawStream = rawCameraStreamRef.current;
    if (!rawStream || !cameraStreamRef.current) return;

    if (cameraBgPipelineRef.current) {
      cameraBgPipelineRef.current.setMode(mode);
    } else if (mode !== "none") {
      const pipeline = createVirtualBackgroundPipeline(
        rawStream,
        mode,
        cameraBlurAmountRef.current,
        cameraBackgroundImageRef.current
      );
      cameraBgPipelineRef.current = pipeline;
      const newTrack = pipeline.outputStream.getVideoTracks()[0];
      const oldTrack = cameraStreamRef.current.getVideoTracks()[0];
      cameraStreamRef.current = pipeline.outputStream;
      if (newTrack && oldTrack) {
        await sfuRef.current?.replace(oldTrack, newTrack);
        for (const peer of peersRef.current.values()) {
          for (const sender of peer.getSenders()) {
            if (sender.track && sender.track.kind === "video" && sender.track.id === oldTrack.id) {
              await sender.replaceTrack(newTrack).catch(() => undefined);
            }
          }
        }
      }
    }
  }, []);

  const setCameraBlurAmount = useCallback((amount: number) => {
    const clamped = Math.max(4, Math.min(36, amount));
    setCameraBlurAmountState(clamped);
    cameraBlurAmountRef.current = clamped;
    try {
      localStorage.setItem("huddle_camera_blur_amount", clamped.toString());
    } catch {
      // ignore
    }
    cameraBgPipelineRef.current?.setBlurAmount(clamped);
  }, []);

  const setCameraBackgroundImage = useCallback((imageId: string) => {
    setCameraBackgroundImageState(imageId);
    cameraBackgroundImageRef.current = imageId;
    try {
      localStorage.setItem("huddle_camera_bg_image", imageId);
    } catch {
      // ignore
    }
    cameraBgPipelineRef.current?.setBackgroundImage(imageId);
  }, []);

  /**
   * Swaps the microphone without dropping the call: the new track replaces the
   * old one in every peer connection, so nobody hears a reconnect.
   */
  const switchMicrophone = useCallback(async () => {
    if (!localStreamRef.current) return;
    try {
      const replacement = await openMicChain();
      const track = replacement.stream.getAudioTracks()[0];
      if (!track) {
        replacement.stop();
        return;
      }
      track.enabled = micGateRef.current;

      const sending = backgroundMicRef.current ?? localStreamRef.current.getAudioTracks()[0];
      if (sending) await sfuRef.current?.replace(sending, track);
      for (const peer of peersRef.current.values()) {
        for (const sender of peer.getSenders()) {
          if (sender.track?.kind === "audio") {
            await sender.replaceTrack(track).catch(() => undefined);
          }
        }
      }
      // The background copy belonged to the old device.
      backgroundMicRef.current?.stop();
      backgroundMicRef.current = null;
      // Stop the old chain only once the new track is live everywhere, and stop
      // the *chain* rather than the track: the raw device is inside it, and a
      // microphone nobody released is a light that never goes out.
      micChainRef.current?.stop();
      micChainRef.current = replacement;
      localStreamRef.current = replacement.stream;
      setMicSettingsState(readMicSettings());
    } catch {
      setError("That microphone could not be opened.");
    }
  }, [openMicChain]);
  switchMicrophoneRef.current = switchMicrophone;

  /**
   * The capture device actually live in this call — which, after an unplug,
   * may be the system default rather than the saved choice. Null out of a call.
   */
  const activeMicrophone = useCallback((): { deviceId: string; ended: boolean } | null => {
    const track = micChainRef.current?.raw.getAudioTracks()[0];
    if (!track) return null;
    return { deviceId: track.getSettings().deviceId || "", ended: track.readyState === "ended" };
  }, []);

  /**
   * Coming back from another app on a phone. While the browser sat in the
   * background the OS suspended every AudioContext (so the processed mic track
   * went silent), may have paused the remote audio elements, and on some
   * phones ended the microphone capture outright. None of that recovers by
   * itself, so you would be "in" the room with nobody hearing anybody.
   *
   * The seat itself is restored by useHub reconnecting and the re-announce
   * effect above; this puts the audio back.
   */
  useEffect(() => {
    if (!channelId) return;
    // Points every peer's mic sender that currently carries `from` at `to`.
    const swapMic = (from: MediaStreamTrack, to: MediaStreamTrack) => {
      const swaps: Promise<void>[] = [];
      if (sfuRef.current) swaps.push(sfuRef.current.replace(from, to));
      for (const peer of peersRef.current.values()) {
        for (const sender of peer.getSenders()) {
          if (sender.track === from) swaps.push(sender.replaceTrack(to).catch(() => undefined));
        }
      }
      return Promise.all(swaps);
    };
    // The processed track has stopped (or, on iOS, is about to): send the raw
    // microphone, which the OS keeps capturing, instead. You lose auto-gain,
    // RNNoise and the gate meanwhile.
    const toRawMic = () => {
      const chain = micChainRef.current;
      const processed = localStreamRef.current?.getAudioTracks()[0];
      const raw = chain?.raw.getAudioTracks()[0];
      if (backgroundMicRef.current || !chain?.processing || !processed) return;
      if (!raw || raw.readyState === "ended") return;
      const copy = raw.clone();
      copy.enabled = micGateRef.current;
      backgroundMicRef.current = copy;
      void swapMic(processed, copy);
    };
    // Back again: return to the processed track, but only once its graph is
    // actually running, or we would trade a working mic for a silent one.
    const toProcessedMic = () => {
      const copy = backgroundMicRef.current;
      const processed = localStreamRef.current?.getAudioTracks()[0];
      if (!copy || !processed || !micChainRef.current?.live) return;
      backgroundMicRef.current = null;
      processed.enabled = copy.enabled;
      void swapMic(copy, processed).then(() => copy.stop());
    };
    const wakeAudio = () => {
      micChainRef.current?.resume();
      void audioContextRef.current?.resume().catch(() => undefined);
      void clipMixRef.current?.context.resume().catch(() => undefined);
      unlockAudio();
      toProcessedMic();
      // resume() settles asynchronously; look again once it has had a moment.
      window.setTimeout(toProcessedMic, 300);
    };
    // Only iOS has to be pre-empted: WebKit interrupts a hidden page's audio
    // and may not run this script again until it is back, so the swap has to
    // happen on the way out. Everywhere else the processed track keeps flowing
    // in the background (Android's foreground service keeps the whole page
    // alive), and swapping anyway is what made you drop in volume the moment
    // you switched apps. There, the raw mic only stands in for a graph that
    // has actually stopped, which the chain announces.
    const leaving = () => {
      if (interruptsHiddenAudio()) toRawMic();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") leaving();
    };
    const onMicState = () => {
      if (micChainRef.current?.live) toProcessedMic();
      else toRawMic();
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      wakeAudio();
      // Playback may still be refused until a real touch, so take the first one.
      window.addEventListener("pointerdown", wakeAudio, { once: true, capture: true });
      const raw = micChainRef.current?.raw.getAudioTracks()[0];
      if (raw && raw.readyState === "ended") void switchMicrophone();
    };
    if (document.visibilityState === "hidden") leaving();
    document.addEventListener("visibilitychange", onHidden);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", leaving);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener(MIC_STATE_EVENT, onMicState);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", leaving);
      window.removeEventListener(MIC_STATE_EVENT, onMicState);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("pointerdown", wakeAudio, { capture: true });
    };
  }, [channelId, switchMicrophone]);

  const startScreenShare = useCallback(
    async (quality: ScreenShareQuality = screenQuality, withAudio?: boolean, film: boolean = screenFilm) => {
      if (!channelIdRef.current) {
        setError("Join a voice channel before sharing your screen.");
        return;
      }
      stopScreenShare();
      const shouldShareAudio = withAudio !== undefined ? withAudio : screenShareAudio;
      try {
        const profile = screenConstraints(quality);
        let stream: MediaStream;
        if (shouldShareAudio) {
          try {
            stream = await navigator.mediaDevices.getDisplayMedia({
              video: {
                width: { ideal: profile.width, max: profile.width },
                height: { ideal: profile.height, max: profile.height },
                frameRate: { ideal: profile.frameRate, max: profile.frameRate },
              },
              // Desktop/app audio rides along with the video. Echo cancellation
              // and friends are for voices: on game or music audio they pump and
              // smear, so they are off here.
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                // Keep hearing it yourself while it is shared.
                suppressLocalAudioPlayback: false,
                // Leave this page's own playback (everyone's voices) out of
                // system audio, or the room hears itself. Chromium only.
                restrictOwnAudio: true,
              } as MediaTrackConstraints,
              // Chromium hints: offer "Share system audio" for whole screens and
              // pre-tick the audio box for tabs. Ignored where unsupported.
              systemAudio: "include",
              windowAudio: "system",
            } as DisplayMediaStreamOptions);
          } catch (audioErr) {
            if ((audioErr as DOMException)?.name === "NotAllowedError") {
              throw audioErr;
            }
            try {
              stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                  width: { ideal: profile.width, max: profile.width },
                  height: { ideal: profile.height, max: profile.height },
                  frameRate: { ideal: profile.frameRate, max: profile.frameRate },
                },
                audio: true,
              });
            } catch (fallbackErr) {
              if ((fallbackErr as DOMException)?.name === "NotAllowedError") {
                throw fallbackErr;
              }
              stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                  width: { ideal: profile.width, max: profile.width },
                  height: { ideal: profile.height, max: profile.height },
                  frameRate: { ideal: profile.frameRate, max: profile.frameRate },
                },
              });
            }
          }
        } else {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: profile.width, max: profile.width },
              height: { ideal: profile.height, max: profile.height },
              frameRate: { ideal: profile.frameRate, max: profile.frameRate },
            },
          });
        }
        // Tells the encoder what it is looking at: a film wants smooth motion,
        // a desktop wants legible text. Applies to the mesh as well.
        const video = stream.getVideoTracks()[0];
        if (video) video.contentHint = film ? "motion" : "detail";
        screenStreamRef.current = stream;
        setScreenQuality(quality);
        setScreenFilm(film);
        setScreenSharing(true);
        const audioTracks = stream.getAudioTracks();
        setHasScreenAudio(audioTracks.length > 0);
        setScreenAudioMuted(false);
        playScreenShareStartSound();
        // Publishes the stream id and puts it in your own view.
        announceVideo();
        stream.getVideoTracks()[0].addEventListener("ended", stopScreenShare, {
          once: true,
        });
        for (const [remoteId, peer] of peersRef.current) {
          for (const track of stream.getTracks()) {
            const sender = peer.addTrack(track, stream);
            if (track.kind === "audio") {
              await tuneAudioSender(sender, screenAudioBitrate(peersRef.current.size));
            }
          }
          await negotiatePeer(remoteId, peer);
        }
        for (const track of stream.getTracks()) {
          await sfuRef.current
            ?.publish(
              track,
              track.kind === "video" ? "screen" : "screen-audio",
              { screen: quality, film, bitrate: SFU_SCREEN_AUDIO_BITRATE },
            )
            .catch(() => undefined);
        }
      } catch (shareError) {
        if ((shareError as DOMException)?.name !== "NotAllowedError") {
          setError("Screen sharing could not start. Try a lower quality setting.");
        }
      }
    },
    [announceVideo, negotiatePeer, screenFilm, screenQuality, screenShareAudio, setScreenFilm, setScreenQuality, stopScreenShare],
  );

  // Sent back to a stage audience: everyone else already drops this seat's
  // video (videoAllowedFrom), so stop sending it rather than stream to nobody.
  useEffect(() => {
    if (!channelId || (!screenSharing && !cameraOn)) return;
    const mine = (rooms[channelId] || []).find((person) => person.connectionId === connectionId);
    if (!mine || videoAllowedFrom(mine)) return;
    if (screenSharing) stopScreenShare();
    if (cameraOn) stopCamera();
  }, [rooms, channelId, connectionId, screenSharing, cameraOn, stopScreenShare, stopCamera]);

  const leave = useCallback(() => {
    joinSeqRef.current += 1;
    playRoomTone("leave");
    // First, so the screen and camera below are not unpublished one by one.
    const sfu = sfuRef.current;
    sfuRef.current = null;
    void sfu?.leave();
    window.clearTimeout(sfuRetryTimerRef.current);
    sfuModeRef.current = false;
    setSfuMode(false);
    setSfuStreams([]);
    stopScreenShare();
    stopCamera();
    for (const remoteId of [...peersRef.current.keys()]) closePeer(remoteId);
    // Stopping the chain releases the raw capture too. Stopping only the tracks
    // on localStreamRef would leave the microphone open forever.
    micChainRef.current?.stop();
    micChainRef.current = null;
    backgroundMicRef.current?.stop();
    backgroundMicRef.current = null;
    micTelemetryRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    analysersRef.current.clear();
    peerSinceRef.current.clear();
    earlySignalsRef.current = [];
    announcedConnectionRef.current = null;
    setRemoteStreams([]);
    hiddenVideoRef.current = {};
    setHiddenVideoState({});
    setSpeaking(new Set());
    // A raised hand belongs to the room you raised it in, so it does not follow
    // you into the next one.
    setHandRaised(false);
    channelIdRef.current = null;
    setChannelId(null);
    setLocalVideos([]);
    send({ t: "voice-leave" });
  }, [closePeer, playRoomTone, send, stopCamera, stopScreenShare]);

  const join = useCallback(
    async (nextChannelId: string, options?: { startMuted?: boolean }) => {
      setError("");
      // Re-selecting the room you are already in is a no-op: the stage view owns
      // "leave" now (an explicit Disconnect button), so a click never drops you.
      if (channelIdRef.current === nextChannelId) return;
      if (channelIdRef.current) leave();
      // Two quick joins race through the awaits below; only the latest may
      // finish, and a superseded one must release the microphone it opened.
      const attempt = ++joinSeqRef.current;

      try {
        const chain = await openMicChain();
        if (attempt !== joinSeqRef.current) {
          chain.stop();
          return;
        }
        // Joining is a real gesture, which is the only moment a phone will let
        // us start playing everyone else's audio.
        unlockAudio();
        // LiveKit or mesh is decided before entering the room, so neither this
        // tab nor anyone else starts meshing with a seat about to be in
        // LiveKit. The identity carries the hub connection, so without one
        // there would be nothing to match the media to.
        const grant = connectionId ? await sfuGrant(nextChannelId, connectionId) : null;
        if (attempt !== joinSeqRef.current) {
          chain.stop();
          return;
        }
        // No LiveKit right now, but the room is too big to mesh into: take a
        // LiveKit seat anyway and keep trying, rather than have everyone call us.
        const awaitSfu =
          grant === null && meshFallbackBlocked(rooms[nextChannelId] || [], connectionId);
        sfuModeRef.current = grant !== null || awaitSfu;
        setSfuMode(grant !== null || awaitSfu);
        micChainRef.current = chain;
        // Peers get the processed track; the raw capture stays inside the chain.
        localStreamRef.current = chain.stream;
        // A stage opens you in the audience. The central mic gate further down
        // keys off this state, so setting it here is what actually keeps the
        // microphone closed rather than merely showing a muted icon.
        const startMuted = options?.startMuted === true;
        setMuted(startMuted);
        setDeafened(false);
        // Set the ref before announcing the join. React updates it on the next
        // render, which can lose a race with the first offer coming back.
        channelIdRef.current = nextChannelId;
        setChannelId(nextChannelId);
        participantCountRef.current = Math.max(
          1,
          (rooms[nextChannelId] || []).filter((person) => !person.bot).length + 1,
        );
        // Record which connection id we announced with. If the send fails (the
        // socket is briefly down) the ref stays unset, and the re-announce
        // effect below fires the join again once a connection id exists.
        if (send({ t: "voice-join", channelId: nextChannelId, sfu: grant || awaitSfu ? true : undefined })) {
          announcedConnectionRef.current = connectionId;
        }
        if (grant) void connectSfu(grant);
        else if (awaitSfu) {
          setError("Could not reach the voice server. Retrying…");
          window.clearTimeout(sfuRetryTimerRef.current);
          sfuRetryTimerRef.current = window.setTimeout(() => retrySfuRef.current(), SFU_RETRY_MS);
        }
        // Tell the room about the opening mute, or it would list this seat as
        // "on stage" until the user touched a control.
        if (startMuted) send({ t: "voice-state", muted: true });
        playRoomTone("join");
      } catch {
        setError(
          "Microphone access was blocked. Allow it in your browser settings to join voice.",
        );
      }
    },
    [connectionId, connectSfu, leave, openMicChain, playRoomTone, rooms, send],
  );

  /** Applied when someone server-mutes you: the microphone actually stops. */
  const setForcedMute = useCallback((next: boolean) => {
    setForcedMuteState(next);
    if (next) {
      micTracks().forEach((track) => {
        track.enabled = false;
      });
      setMuted(true);
    }
  }, [micTracks]);

  const toggleMute = useCallback(() => {
    if (forcedMute) return;
    const next = !muted;
    micTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
    if (next) {
      playMuteSound();
    } else {
      playUnmuteSound();
    }
    // When unmuting while deafened, also undeafen (matching Discord behavior)
    if (!next && deafened) {
      setDeafened(false);
      playUndeafenSound();
      // Taking the floor answers your own request, so the hand comes down.
      setHandRaised(false);
      send({ t: "voice-state", muted: false, deafened: false, handRaised: false });
    } else {
      if (!next) setHandRaised(false);
      send({ t: "voice-state", muted: next, ...(next ? {} : { handRaised: false }) });
    }
  }, [forcedMute, muted, deafened, handRaised, send, micTracks]);

  /**
   * Raise or lower this tab's hand in a stage room.
   *
   * Deliberately refuses while unmuted: if the mic is already live you have the
   * floor, so there is nothing to ask for, and a raised hand next to a speaking
   * person reads as a bug.
   */
  const toggleHand = useCallback(() => {
    if (!channelId || forcedMute) return;
    if (!handRaised && !muted && !deafened) return;
    const next = !handRaised;
    setHandRaised(next);
    send({ t: "voice-state", handRaised: next });
  }, [channelId, forcedMute, handRaised, muted, deafened, send]);

  /**
   * Move a stage seat on or off the stage.
   *
   * The hub re-checks the caller's permission, so a client that calls this
   * without MUTE_MEMBERS is ignored rather than obeyed.
   */
  const setStageSpeaker = useCallback(
    (targetConnectionId: string, allowed: boolean) => {
      send({ t: "stage-speaker", connectionId: targetConnectionId, allowed });
    },
    [send],
  );

  const toggleDeafen = useCallback(() => {
    const next = !deafened;
    setDeafened(next);
    if (next) {
      playDeafenSound();
    } else {
      playUndeafenSound();
    }
    // Deafening also mutes you, the way Discord does it.
    if (next && !muted) {
      micTracks().forEach((track) => {
        track.enabled = false;
      });
      setMuted(true);
    }
    send({ t: "voice-state", deafened: next, muted: next ? true : muted });
  }, [deafened, muted, send, micTracks]);

  const setMuteKey = useCallback((combo: string) => {
    setMuteKeyState(combo);
    window.localStorage.setItem("huddle-mute-key", combo);
  }, []);
  const setDeafenKey = useCallback((combo: string) => {
    setDeafenKeyState(combo);
    window.localStorage.setItem("huddle-deafen-key", combo);
  }, []);

  /**
   * Mute and deafen shortcuts. They only apply while you are in a room, and
   * never while you are typing, so a single-key combo cannot fire mid-message.
   * On the desktop app the global accelerator is swallowed by Electron before
   * it reaches here, so the two cannot both fire for one press.
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
    void sfuRef.current?.leave();
    sfuRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
    void audioContextRef.current?.close();
  }, []);

  return {
    important,
    toggleImportant,
    tableSeatOrder,
    tableSeatPans,
    setTableSeatPans,
    tableWidth,
    setTableWidth,
    headTracking,
    setHeadTracking,
    headTrackingOffered,
    airpodsOffered,
    headTrackingSource,
    setHeadTrackingSource,
    spatialOutput,
    setSpatialOutput,
    headTrackingStatus,
    onHeadTracking,
    recenterHead,
    tableMode,
    setTableMode,
    tableHostId,
    setTableHostId,
    channelId,
    muted,
    forcedMute,
    setForcedMute,
    deafened,
    /** Stage rooms only: this tab wants the floor. */
    handRaised,
    toggleHand,
    /** Videos this tab chose not to receive, by connection id. */
    hiddenVideo,
    setVideoHidden,
    /** Stage rooms: move a seat on or off the stage. Moderator-only, rechecked by the hub. */
    setStageSpeaker,
    speaking,
    remoteStreams: allRemoteStreams,
    /** This seat's media goes through the LiveKit server rather than the mesh. */
    sfuMode,
    peerStates,
    screenSharing,
    screenShareAudio,
    setScreenShareAudio,
    hasScreenAudio,
    screenAudioMuted,
    toggleScreenAudio,
    screenQuality,
    setScreenQuality,
    screenFilm,
    setScreenFilm,
    startScreenShare,
    stopScreenShare,
    cameraOn,
    cameraBackground,
    setCameraBackground,
    cameraBlurAmount,
    setCameraBlurAmount,
    cameraBackgroundImage,
    setCameraBackgroundImage,
    startCamera,
    stopCamera,
    switchMicrophone,
    activeMicrophone,
    micSettings,
    setMicSettings,
    subscribeMicTelemetry,
    localVideos,
    error,
    setError,
    /** What the relay check found, and a way to ask again. */
    relay,
    recheckRelay: checkRelay,
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
    muteKey,
    deafenKey,
    setMuteKey,
    setDeafenKey,
    setPushToTalk,
    setPttKey,
    pttPress,
    pttRelease,
    /** /say: speaks synthesized audio into the call as this seat. */
    speakIntoCall,
    /** Cuts off this seat's /say mid-sentence (an admin's /ttsstop). */
    stopSpeaking,
    /** Whether another /say fits in the queue (checked before spending CPU on it). */
    canSpeak: () => {
      const out = ttsOutRef.current;
      return !out || out.endsAt - out.context.currentTime <= SAY_MAX_BACKLOG_SECONDS;
    },
  };
}
