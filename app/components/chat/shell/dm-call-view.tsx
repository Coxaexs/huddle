"use client";

import { type PublicUser } from "@/lib/users";
import { Video, PhoneOff, Phone, VideoOff, Mic, MicOff, Headphones, HeadphoneOff, Monitor, Maximize2 } from "lucide-react";
import { playCallAnswerSound } from "../../../lib/audio-cues";
import { Avatar } from "../../avatar";
import { type DmSummary } from "../../../lib/chat/types";
import type { VoiceParticipant } from "@/lib/protocol";
import type { Dispatch, SetStateAction } from "react";
import type { HeadTrackingSource, SpatialOutput, VideoPause, RemoteVoiceStream, VoiceLatencyStats, ScreenShareQuality, RelayStatus } from "../../../hooks/use-voice";
import type { HeadTrackingStatus } from "../../../lib/head-tracking";
import type { BackgroundMode } from "../../../lib/virtual-background";
import type { MicSettings, MicTelemetry } from "../../../lib/mic-chain";

export function DmCallView({
  inDmHome,
  activeChannelId,
  dmCallView,
  dmCall,
  callDuration,
  user,
  voice,
  setStageChannelId,
  endDmCall,
  incomingDmCall,
  acceptIncomingCall,
  activeDm,
  setDmCall,
}: {
  inDmHome: boolean;
  activeChannelId: string | null;
  dmCallView: { people: VoiceParticipant[]; ringing: { id: string; displayName: string; avatar?: string; avatarUrl?: string | null; color?: string; } | null; joined: boolean; } | null;
  dmCall: { channelId: string; otherUser: { id: string; displayName: string; avatar?: string; avatarUrl?: string | null; color?: string; }; status: "calling" | "connected"; startTime: number; isVideo?: boolean; seenOther?: boolean; } | null;
  callDuration: number;
  user: PublicUser;
  voice: { important: boolean; toggleImportant: () => void; tableSeatOrder: string[]; tableSeatPans: Record<string, number>; setTableSeatPans: Dispatch<SetStateAction<Record<string, number>>>; tableWidth: number; setTableWidth: Dispatch<SetStateAction<number>>; headTracking: boolean; setHeadTracking: (enabled: boolean) => void; headTrackingOffered: boolean; airpodsOffered: boolean; headTrackingSource: HeadTrackingSource; setHeadTrackingSource: (source: HeadTrackingSource) => void; spatialOutput: SpatialOutput; setSpatialOutput: (output: SpatialOutput) => void; headTrackingStatus: { status: HeadTrackingStatus; live: boolean; }; onHeadTracking: (status: HeadTrackingStatus, live: boolean) => void; recenterHead: () => void; tableMode: boolean; setTableMode: (enabled: boolean) => void; tableHostId: string; setTableHostId: Dispatch<SetStateAction<string>>; channelId: string | null; muted: boolean; forcedMute: boolean; setForcedMute: (next: boolean) => void; deafened: boolean; handRaised: boolean; toggleHand: () => void; hiddenVideo: Record<string, VideoPause>; setVideoHidden: (remoteId: string, which: keyof VideoPause, hidden: boolean) => void; setStageSpeaker: (targetConnectionId: string, allowed: boolean) => void; speaking: Set<string>; remoteStreams: RemoteVoiceStream[]; sfuMode: boolean; peerStates: Record<string, string>; screenSharing: boolean; streamViewers: string[]; signalStreamWatch: (streamerConnectionId: string, watching: boolean) => void; latency: VoiceLatencyStats; isSfu: boolean; voiceRegion: "nl" | "de" | null; switchRegion: (targetRegion?: "nl" | "de") => Promise<void>; screenShareAudio: boolean; setScreenShareAudio: (enabled: boolean) => void; hasScreenAudio: boolean; screenAudioMuted: boolean; toggleScreenAudio: () => void; screenQuality: "480p15" | "480p24" | "480p30" | "480p60" | "720p15" | "720p24" | "720p30" | "720p60" | "900p15" | "900p24" | "900p30" | "900p60" | "1080p15" | "1080p24" | "1080p30" | "1080p60"; setScreenQuality: (quality: ScreenShareQuality) => void; screenFilm: boolean; setScreenFilm: (enabled: boolean) => void; startScreenShare: (quality?: ScreenShareQuality, withAudio?: boolean, film?: boolean) => Promise<void>; stopScreenShare: () => void; cameraOn: boolean; cameraBackground: BackgroundMode; setCameraBackground: (mode: BackgroundMode) => Promise<void>; cameraBlurAmount: number; setCameraBlurAmount: (amount: number) => void; cameraBackgroundImage: string; setCameraBackgroundImage: (imageId: string) => void; startCamera: () => Promise<void>; stopCamera: () => void; switchMicrophone: () => Promise<void>; activeMicrophone: () => { deviceId: string; ended: boolean; } | null; micSettings: MicSettings; setMicSettings: (next: Partial<MicSettings>) => void; subscribeMicTelemetry: (listener: (telemetry: MicTelemetry) => void) => () => void; localVideos: { kind: "camera" | "screen"; stream: MediaStream; }[]; error: string; setError: Dispatch<SetStateAction<string>>; relay: RelayStatus; recheckRelay: () => Promise<void>; join: (nextChannelId: string, options?: { startMuted?: boolean; }) => Promise<void>; leave: () => void; toggleMute: () => void; toggleDeafen: () => void; handleSignal: (from: string, raw: unknown) => Promise<void>; takeClip: () => Promise<Blob | null>; clipSeconds: number; pushToTalk: boolean; pttKey: string; pttHeld: boolean; muteKey: string; deafenKey: string; setMuteKey: (combo: string) => void; setDeafenKey: (combo: string) => void; setPushToTalk: (enabled: boolean) => void; setPttKey: (code: string) => void; pttPress: () => void; pttRelease: () => void; speakIntoCall: (audio: Float32Array, sampleRate: number) => Promise<"sent" | "no-call" | "no-server" | "server-muted" | "busy" | "too-long">; stopSpeaking: () => void; canSpeak: () => boolean; };
  setStageChannelId: Dispatch<SetStateAction<string | null>>;
  endDmCall: (missed?: boolean) => void;
  incomingDmCall: { channelId: string; fromUserId: string; fromDisplayName: string; fromAvatar: string; fromAvatarUrl?: string | null; isVideo?: boolean; } | null;
  acceptIncomingCall: () => void;
  activeDm: DmSummary | null;
  setDmCall: Dispatch<SetStateAction<{ channelId: string; otherUser: { id: string; displayName: string; avatar?: string; avatarUrl?: string | null; color?: string; }; status: "calling" | "connected"; startTime: number; isVideo?: boolean; seenOther?: boolean; } | null>>;
}) {
  return (
    <>
      {inDmHome && activeChannelId && dmCallView && (
                  <section
                    className={`dm-call-stage ${dmCallView.ringing ? "is-calling" : "is-connected"}`}
                    aria-label="Direct Message Call"
                  >
                    <span className="dm-call-status">
                      {dmCallView.ringing
                        ? `Calling ${dmCallView.ringing.displayName}…`
                        : dmCallView.joined && dmCall?.channelId === activeChannelId
                          ? `${Math.floor(callDuration / 60)}:${String(callDuration % 60).padStart(2, "0")}`
                          : `${dmCallView.people.length} in the call`}
                    </span>

                    {/* Everyone in the call, large and centred; a ring lights up
                        whoever is speaking. Built from the room itself, so it is
                        here whenever the call is, not only for whoever placed it. */}
                    <div className="dm-call-people">
                      {dmCallView.people.map((person) => {
                        const isSelf = person.id === user.id;
                        const speaking = voice.speaking.has(
                          isSelf ? "self" : person.connectionId,
                        );
                        const muted = isSelf ? voice.muted : person.muted;
                        return (
                          <div
                            key={person.connectionId}
                            className={`dm-call-person ${speaking ? "is-speaking" : ""} ${muted ? "is-muted" : ""}`}
                            title={person.displayName}
                          >
                            <Avatar
                              name={person.displayName}
                              avatar={person.avatar}
                              avatarUrl={person.avatarUrl}
                              color={person.color || "var(--lavender)"}
                              size={96}
                            />
                            <span className="dm-call-person-name">{isSelf ? user.displayName : person.displayName}</span>
                            {muted && (
                              <span className="dm-call-person-badge" aria-label="Muted">
                                <MicOff size={13} />
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {dmCallView.ringing && (
                        <div className="dm-call-person is-ringing" title={dmCallView.ringing.displayName}>
                          <Avatar
                            name={dmCallView.ringing.displayName}
                            avatar={dmCallView.ringing.avatar || "?"}
                            avatarUrl={dmCallView.ringing.avatarUrl}
                            color={dmCallView.ringing.color || "var(--lavender)"}
                            size={96}
                          />
                          <span className="dm-call-person-name">{dmCallView.ringing.displayName}</span>
                        </div>
                      )}
                    </div>

                    {dmCallView.joined ? (
                      <div className="dm-call-controls">
                        <div className="dm-call-group">
                          <button
                            type="button"
                            className={`dm-call-ctrl ${voice.muted ? "off" : ""}`}
                            onClick={() => voice.toggleMute()}
                            title={voice.muted ? "Unmute" : "Mute"}
                            aria-pressed={voice.muted}
                          >
                            {voice.muted ? <MicOff size={19} /> : <Mic size={19} />}
                          </button>
                          <button
                            type="button"
                            className={`dm-call-ctrl ${voice.deafened ? "off" : ""}`}
                            onClick={() => voice.toggleDeafen()}
                            title={voice.deafened ? "Undeafen" : "Deafen"}
                            aria-pressed={voice.deafened}
                          >
                            {voice.deafened ? <HeadphoneOff size={19} /> : <Headphones size={19} />}
                          </button>
                        </div>
                        <div className="dm-call-group">
                          <button
                            type="button"
                            className={`dm-call-ctrl ${voice.cameraOn ? "on" : ""}`}
                            onClick={() => (voice.cameraOn ? voice.stopCamera() : void voice.startCamera())}
                            title={voice.cameraOn ? "Turn off camera" : "Turn on camera"}
                            aria-pressed={voice.cameraOn}
                          >
                            {voice.cameraOn ? <Video size={19} /> : <VideoOff size={19} />}
                          </button>
                          <button
                            type="button"
                            className={`dm-call-ctrl ${voice.screenSharing ? "on" : ""}`}
                            onClick={() => (voice.screenSharing ? voice.stopScreenShare() : void voice.startScreenShare())}
                            title={voice.screenSharing ? "Stop sharing" : "Share screen"}
                            aria-pressed={voice.screenSharing}
                          >
                            <Monitor size={19} />
                          </button>
                          <button
                            type="button"
                            className="dm-call-ctrl"
                            onClick={() => setStageChannelId(activeChannelId)}
                            title="Open full call view"
                          >
                            <Maximize2 size={19} />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="dm-call-hangup"
                          onClick={() => endDmCall(false)}
                          title={dmCallView.ringing ? "Cancel call" : "Leave call"}
                        >
                          <PhoneOff size={21} />
                        </button>
                      </div>
                    ) : (
                      <div className="dm-call-controls">
                        <button
                          type="button"
                          className="dm-call-join"
                          onClick={() => {
                            // Joining the call you are being rung for is answering it:
                            // that also stops the ringtone and tells the caller.
                            if (incomingDmCall?.channelId === activeChannelId) {
                              acceptIncomingCall();
                              return;
                            }
                            const other = activeDm?.user;
                            if (other) {
                              setDmCall({
                                channelId: activeChannelId,
                                otherUser: other,
                                status: "connected",
                                startTime: Date.now(),
                                seenOther: dmCallView.people.some((p) => p.id === other.id),
                              });
                            }
                            playCallAnswerSound();
                            void voice.join(activeChannelId);
                          }}
                        >
                          <Phone size={18} /> Join call
                        </button>
                      </div>
                    )}
                  </section>
                )}
    </>
  );
}
