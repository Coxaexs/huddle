"use client";

import { Mic, Megaphone, Hand, MicOff, Volume2, Volume1, VolumeX, Monitor, Maximize2, Minimize2, Users, EyeOff, Eye, Activity } from "lucide-react";
import type { VoiceParticipant } from "@/lib/protocol";
import { Avatar } from "../avatar";
import { VoiceConnectionModal } from "../chat/voice-connection-modal";
import { VoiceApi, VideoTile } from "./types";
import { TileVideo, VideoSurface } from "./tiles";
import { useRef } from "react";
import { useProfileStyles, voiceTileClasses } from "../../lib/profile-style";

export function StageBody({
  joined,
  channelName,
  onJoin,
  onExit,
  viewMode,
  participants,
  selfSpeaking,
  speakingIds,
  connectionId,
  seatTime,
  focused,
  theater,
  windowFull,
  showFocusBar,
  focusMainRef,
  handleFocusMainMouseMove,
  handleFocusMainMouseLeave,
  isFullscreen,
  setFocusedKey,
  streamerName,
  handleFocusBarMouseEnter,
  handleFocusBarMouseLeave,
  streamPreferenceFor,
  focusedPerson,
  onToggleStreamMute,
  onSetStreamVolume,
  voice,
  showViewersPopover,
  setShowViewersPopover,
  setShowLatencyPopover,
  activeStreamViewers,
  showLatencyPopover,
  hideTile,
  toggleTheater,
  toggleFullscreen,
  videoTiles,
  self,
  focusedKey,
  onOpenParticipantMenu,
  wrapperRef,
}: {
  joined: boolean | undefined;
  channelName: string;
  onJoin: (() => void) | undefined;
  onExit: (() => void) | undefined;
  viewMode: "grid" | "table" | "map";
  participants: VoiceParticipant[];
  selfSpeaking: (person: VoiceParticipant) => boolean;
  speakingIds: Set<string>;
  connectionId: string | null;
  seatTime: (person: VoiceParticipant, className: string) => React.JSX.Element | null;
  focused: VideoTile | null;
  theater: boolean;
  windowFull: boolean;
  showFocusBar: boolean;
  focusMainRef: React.RefObject<HTMLDivElement | null>;
  handleFocusMainMouseMove: () => void;
  handleFocusMainMouseLeave: () => void;
  isFullscreen: boolean;
  setFocusedKey: React.Dispatch<React.SetStateAction<string | null>>;
  streamerName: string;
  handleFocusBarMouseEnter: () => void;
  handleFocusBarMouseLeave: () => void;
  streamPreferenceFor: ((streamId: string, userId?: string) => { volume: number; muted: boolean; }) | undefined;
  focusedPerson: VoiceParticipant | null | undefined;
  onToggleStreamMute: ((streamId: string, userId: string | undefined) => void) | undefined;
  onSetStreamVolume: ((streamId: string, userId: string | undefined, volume: number) => void) | undefined;
  voice: VoiceApi;
  showViewersPopover: boolean;
  setShowViewersPopover: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLatencyPopover: React.Dispatch<React.SetStateAction<boolean>>;
  activeStreamViewers: { connectionId: string; displayName: string; avatar: string; avatarUrl?: string | null; color: string; }[];
  showLatencyPopover: boolean;
  hideTile: (tile: VideoTile, hidden: boolean) => void;
  toggleTheater: () => void;
  toggleFullscreen: () => void;
  videoTiles: VideoTile[];
  self: VoiceParticipant | null;
  focusedKey: string | null;
  onOpenParticipantMenu: ((event: React.MouseEvent, participant: VoiceParticipant) => void) | undefined;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const styleOf = useProfileStyles();
  // Join flourishes are for people arriving while you watch, not for everyone
  // already seated when the stage opens.
  const seated = useRef<Set<string> | null>(null);
  if (seated.current === null) seated.current = new Set(participants.map((p) => p.connectionId));
  const tileStyle = (person: VoiceParticipant) => {
    const style = styleOf(person.id);
    const classes = voiceTileClasses(
      seated.current!.has(person.connectionId) && style ? { ...style, entrance: undefined } : style,
    );
    const ring = style?.themeColors?.[0] || style?.nameColors?.[0] || person.color;
    return { className: classes, style: { "--vr-color": ring } as React.CSSProperties };
  };
  return (
    <div className="voice-stage-body">
      {!joined ? (
        <div className="voice-join-prompt">
          <div className="voice-join-icon"><Volume2 size={30} /></div>
          <strong>You're viewing {channelName}</strong>
          <p>
            Join the room to talk, share your camera, and take part in
            activities. You'll be asked to allow your microphone.
          </p>
          <button type="button" className="join-call-button" onClick={onJoin}>
            <Mic size={16} /> Join voice
          </button>
          <button type="button" className="voice-join-exit" onClick={onExit}>
            Back to chat
          </button>
        </div>
      ) : viewMode === "table" ? (
        <div className="voice-table-scene">
          <p className="voice-table-heading">VOICE TABLE</p>
          <div className="voice-table-wrapper">
            <div className="voice-table-ring">
              <div className="voice-table-surface">
                <div className="voice-table-center-divider" />
              </div>
            </div>
            {participants.map((p, i) => {
              const isSpeaking = selfSpeaking(p);
              // Seats spread evenly round the table, however many there are
              // (eight fixed spots stacked everyone after the eighth).
              const angle = (i / Math.max(1, participants.length)) * Math.PI * 2 - Math.PI / 2;
              const pos = {
                left: `${50 + Math.cos(angle) * 42}%`,
                top: `${50 + Math.sin(angle) * 42}%`,
                transform: "translate(-50%, -50%)",
              };
              return (
                <div
                  key={p.connectionId}
                  className="voice-table-seat"
                  style={pos as React.CSSProperties}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <Avatar
                      className={`table-seat-avatar ${isSpeaking ? "is-speaking" : ""}`}
                      avatar={p.avatar}
                      avatarUrl={p.avatarUrl}
                      color={p.color}
                    />
                    <span className="table-seat-name">
                      {p.connectionId === connectionId ? "You" : p.displayName}
                    </span>
                    {seatTime(p, "table-seat-time")}
                    {isSpeaking && (
                      <span className="text-[10px] text-[var(--lavender)] font-bold">speaking</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="voice-table-note">
            Everyone at the table hears each other equally. Move away to create distance.
          </p>
        </div>
      ) : focused ? (
        <div className={`voice-focus ${theater ? "theater" : ""}`}>
          <div
            className={`voice-focus-main ${windowFull ? "window-full" : ""} ${!showFocusBar ? "is-hidden-cursor" : ""}`}
            ref={focusMainRef}
            onMouseMove={handleFocusMainMouseMove}
            onMouseLeave={handleFocusMainMouseLeave}
            onClick={() => {
              if (!isFullscreen && !windowFull) setFocusedKey(null);
            }}
            title={isFullscreen || windowFull ? undefined : "Click to return to the grid"}
          >
            <VideoSurface stream={focused.stream} mirrored={focused.mirrored} />

            {/* Discord-style bottom-left pill on the video (Screenshot 3) */}
            <div
              className={`voice-video-streamer-pill ${!showFocusBar ? "is-hidden" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Monitor size={14} className="text-white/90" />
              <span>{streamerName}</span>
            </div>

            {/* Video control overlays */}
            <div
              className={`voice-focus-bar ${!showFocusBar ? "is-hidden" : ""}`}
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={handleFocusBarMouseEnter}
              onMouseLeave={handleFocusBarMouseLeave}
            >
              <span className="voice-live-badge-red text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#ed4245] text-white">LIVE</span>
              <span className="voice-focus-stream-title truncate max-w-[200px]">{streamerName}'s Screen</span>

              {/* Watcher Stream Audio Volume Slider */}
              {focused.videoKind === "screen" && !focused.self && (
                (() => {
                  const pref = streamPreferenceFor ? streamPreferenceFor(focused.stream.id, focusedPerson?.id) : { volume: 100, muted: false };
                  return (
                    <div
                      className="voice-focus-volume flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="hover:text-[var(--lavender)] transition-colors p-0.5 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStreamMute?.(focused.stream.id, focusedPerson?.id);
                        }}
                        title={pref.muted ? "Unmute stream audio" : `Stream audio: ${pref.volume}% (Click to mute)`}
                      >
                        {pref.muted || pref.volume === 0 ? (
                          <VolumeX size={14} className="text-rose-400" />
                        ) : pref.volume < 50 ? (
                          <Volume1 size={14} />
                        ) : (
                          <Volume2 size={14} />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        step={1}
                        value={pref.muted ? 0 : pref.volume}
                        onChange={(e) => {
                          e.stopPropagation();
                          onSetStreamVolume?.(focused.stream.id, focusedPerson?.id, Number(e.target.value));
                        }}
                        className="w-16 accent-[var(--lavender)] h-1 cursor-pointer"
                        title={`Stream volume: ${pref.muted ? "Muted" : `${pref.volume}%`}`}
                      />
                      <span className="text-[10px] font-mono w-7 text-right select-none text-white/90">
                        {pref.muted ? "0%" : `${pref.volume}%`}
                      </span>
                    </div>
                  );
                })()
              )}

              {/* Streamer Mute Own Stream Audio Button */}
              {focused.videoKind === "screen" && focused.self && (
                <button
                  type="button"
                  className={`voice-focus-full ${voice.screenAudioMuted ? "text-amber-400" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    voice.toggleScreenAudio?.();
                  }}
                  title={voice.screenAudioMuted ? "Unmute stream audio" : "Mute stream audio"}
                >
                  {voice.screenAudioMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
              )}

              {/* Stream Viewers Popover Button */}
              {focused.videoKind === "screen" && (
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`voice-focus-full flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 hover:bg-black/75 border border-white/10 text-white transition-all text-xs font-medium cursor-pointer ${showViewersPopover ? "bg-white/20" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowViewersPopover((prev) => !prev);
                      setShowLatencyPopover(false);
                    }}
                    title="Stream Viewers"
                  >
                    <Eye size={14} className="text-emerald-400" />
                    <span>{activeStreamViewers.length}</span>
                  </button>

                  {showViewersPopover && (
                    <div
                      className="absolute top-full mt-2 right-0 w-64 bg-[#1e1f22]/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl p-3 z-50 flex flex-col gap-2.5 text-white animate-in fade-in zoom-in-95 duration-150"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <Eye size={14} className="text-emerald-400" />
                          <span>Stream Viewers</span>
                        </div>
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                          {activeStreamViewers.length}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        {activeStreamViewers.length === 0 ? (
                          <div className="text-xs text-white/50 text-center py-3">
                            Nobody is watching right now
                          </div>
                        ) : (
                          activeStreamViewers.map((viewer) => (
                            <div
                              key={viewer.connectionId}
                              className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar
                                  className="w-6 h-6 text-[10px]"
                                  avatar={viewer.avatar || "avatar-1"}
                                  avatarUrl={viewer.avatarUrl}
                                  color={viewer.color}
                                />
                                <span className="text-xs font-semibold truncate">
                                  {viewer.displayName}
                                </span>
                              </div>
                              <span className="text-[10px] text-emerald-400 font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 shrink-0">
                                Watching
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Screenshare & Connection Latency Button */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`voice-focus-full flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 hover:bg-black/75 border border-white/10 text-white transition-all text-xs font-mono font-medium cursor-pointer ${showLatencyPopover ? "bg-white/20" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLatencyPopover((prev) => !prev);
                    setShowViewersPopover(false);
                  }}
                  title="Stream Connection & Latency"
                >
                  <Activity
                    size={13}
                    className={
                      voice.latency?.quality === "poor"
                        ? "text-rose-400"
                        : voice.latency?.quality === "good"
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }
                  />
                  <span>{voice.latency?.rttMs ? `${Math.round(voice.latency.rttMs)}ms` : "—"}</span>
                </button>

                {showLatencyPopover && (
                  <VoiceConnectionModal
                    onClose={() => setShowLatencyPopover(false)}
                    latency={voice.latency}
                    micSettings={voice.micSettings}
                    onMicSettingsChange={voice.setMicSettings}
                    serverNodeName={voice.isSfu ? "c-ams08-f0224067" : "p2p-mesh-node"}
                    isSfu={voice.isSfu}
                    streamStats={
                      focused.videoKind === "screen"
                        ? {
                            resolution: voice.screenQuality || "1080p30",
                            viewersCount: activeStreamViewers.length,
                          }
                        : undefined
                    }
                    defaultTab={focused.videoKind === "screen" ? "stream" : "voice"}
                    className="absolute top-full mt-2 right-0 z-50 shadow-2xl"
                  />
                )}
              </div>

              {focused.remoteId && (
                <button
                  type="button"
                  className="voice-focus-full"
                  onClick={(event) => {
                    event.stopPropagation();
                    hideTile(focused, true);
                  }}
                  title="Stop receiving this video (saves data)"
                >
                  <EyeOff size={15} />
                </button>
              )}
              {!isFullscreen && !windowFull && (
                <button
                  type="button"
                  className={`voice-focus-full ${theater ? "active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleTheater();
                  }}
                  aria-label={theater ? "Show people" : "Hide people"}
                  title={theater ? "Show people" : "Hide people"}
                >
                  <Users size={15} />
                </button>
              )}
              <button
                type="button"
                className="voice-focus-full"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFullscreen();
                }}
                aria-label={isFullscreen || windowFull ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen || windowFull ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          </div>

          {/* Bottom filmstrip with participant tiles and active screenshare (Screenshot 3) */}
          <div className="voice-filmstrip">
            {videoTiles.map((tile) => {
              const isStreamerSpeaking = tile.remoteId ? speakingIds.has(tile.remoteId) : speakingIds.has("self");
              const tilePerson = tile.remoteId ? participants.find((p) => p.connectionId === tile.remoteId) : self;
              const tileName = tilePerson?.displayName || (tile.self ? "You" : tile.label);
              return (
                <button
                  type="button"
                  key={tile.key}
                  className={`film-tile video-film-tile ${tile.key === focusedKey ? "active" : ""} ${isStreamerSpeaking ? "is-speaking" : ""}`}
                  onClick={() => setFocusedKey(tile.key)}
                >
                  <div className="film-video-wrap">
                    <TileVideo tile={tile} onHide={hideTile} />
                  </div>
                  <span className="film-live-pill">LIVE</span>
                  {tile.videoKind === "screen" && (
                    <span className="film-viewers-pill" title={`${tile.self ? (voice.streamViewers?.length || 0) : 1} viewers`}>
                      <Eye size={10} />
                      <span>{tile.self ? (voice.streamViewers?.length || 0) : 1}</span>
                    </span>
                  )}
                  <span className="film-tile-label truncate">
                    <Monitor size={11} className="inline mr-1" />
                    {tileName}
                  </span>
                </button>
              );
            })}

            {participants.map((person) => {
              const isSpeaking = selfSpeaking(person);
              return (
                <div
                  className={`film-tile avatar-film ${isSpeaking ? "is-speaking" : ""} ${tileStyle(person).className}`}
                  style={tileStyle(person).style}
                  key={`a:${person.connectionId}`}
                  onContextMenu={(event) => {
                    if (person.connectionId === connectionId) return;
                    onOpenParticipantMenu?.(event, person);
                  }}
                >
                  <div className="avatar-film-center">
                    <Avatar
                      className={`film-avatar ${isSpeaking ? "is-speaking" : ""}`}
                      avatar={person.avatar}
                      avatarUrl={person.avatarUrl}
                      color={person.color}
                    />
                  </div>
                  <div className="film-person-footer">
                    {person.muted && !person.bot && (
                      <MicOff size={11} className="film-person-muted-icon" />
                    )}
                    <span className="film-person-name truncate">
                      {person.connectionId === connectionId ? "You" : person.displayName}
                    </span>
                  </div>
                  {seatTime(person, "film-voice-time")}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          ref={wrapperRef}
          className={`voice-grid tiles-${Math.min(
            videoTiles.length + participants.length,
            6,
          )}`}
        >
          {videoTiles.map((tile) => (
            <figure
              key={tile.key}
              className={`stage-tile video-tile ${tile.connecting ? "tile-connecting" : ""}`}
              onClick={() => !tile.hidden && setFocusedKey(tile.key)}
              title={tile.hidden ? undefined : "Click to focus"}
            >
              <TileVideo tile={tile} onHide={hideTile} />
              {tile.videoKind === "screen" && (
                <span className="film-viewers-pill" title={`${tile.self ? (voice.streamViewers?.length || 0) : 1} viewers`}>
                  <Eye size={10} />
                  <span>{tile.self ? (voice.streamViewers?.length || 0) : 1}</span>
                </span>
              )}
              <figcaption>
                <span className="tile-live">
                  <span className="live-dot" /> {tile.label}
                </span>
              </figcaption>
            </figure>
          ))}

          {participants.map((person) => {
            const speaking = selfSpeaking(person);
            return (
              <figure
                key={person.connectionId}
                className={`stage-tile avatar-tile ${speaking ? "is-speaking" : ""} ${tileStyle(person).className}`}
                style={tileStyle(person).style}
                onContextMenu={(event) => {
                  if (person.connectionId === connectionId) return;
                  onOpenParticipantMenu?.(event, person);
                }}
              >
                <div className="avatar-tile-inner">
                  <Avatar
                    className="stage-avatar"
                    avatar={person.avatar}
                    avatarUrl={person.avatarUrl}
                    color={person.color}
                  />
                </div>
                <figcaption>
                  <span>
                    {person.connectionId === connectionId
                      ? "You"
                      : person.displayName}
                  </span>
                  {seatTime(person, "tile-voice-time")}
                  {person.important && !person.muted && !person.serverMuted && <span className="table-dm-badge" title="Speaking important"><Megaphone size={13} /> Important</span>}
                  {person.muted && !person.bot && (
                    <span
                      className="tile-muted"
                      title={person.serverMuted ? "Muted for everyone" : "Muted"}
                    >
                      <MicOff size={14} />
                    </span>
                  )}
                  {person.handRaised && (
                    // Shown next to the mute badge rather than replacing it:
                    // a hand up is always accompanied by a mute, so the two
                    // together are what "wants the floor" looks like.
                    <span className="tile-hand" title="Raised hand">
                      <Hand size={14} />
                    </span>
                  )}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
