"use client";

import { Mic, Megaphone, Crown, SlidersHorizontal, MicOff, Headphones, Volume2, Volume1, VolumeX, Video, VideoOff, Monitor, Map, Sparkles, Maximize2, Minimize2, PhoneOff, X, ExternalLink, LayoutGrid, MoreHorizontal, Captions, Armchair, MessageCircleQuestionMark } from "lucide-react";
import { BUILTIN_BACKGROUND_IMAGES, type CustomBackgroundItem } from "../../lib/virtual-background";
import { ScreenShareSetup } from "../screen-share-setup";
import type { LivingRoom } from "../../hooks/use-living-room";
import { VoiceApi, VideoTile } from "./types";
import type { QaQuestion } from "@/lib/qa";
import type { CaptionLine } from "../../hooks/use-live-captions";
import { useI18n } from "@/app/lib/i18n-context";

export function StageBottomBar({
  voice,
  setTableMenuOpen,
  livingRoom,
  joined,
  stageMode,
  videoLocked,
  setCameraBgMenuOpen,
  cameraBgMenuOpen,
  cameraTab,
  setCameraTab,
  bgFileInputRef,
  handleBgUpload,
  customBgs,
  handleDeleteCustomBg,
  setScreenSharePopoverOpen,
  screenSharePopoverOpen,
  focused,
  setFocusedKey,
  videoTiles,
  activitiesOpen,
  setActivitiesOpen,
  moreMenuOpen,
  setMoreMenuOpen,
  soundboardAllowed,
  setSoundboardOpen,
  soundboardOpen,
  setQaOpen,
  qa,
  captions,
  handleViewModeChange,
  viewMode,
  onToggleBattlemap,
  qaOpen,
  onExit,
  onPopout,
  toggleFullscreen,
  isFullscreen,
  windowFull,
}: {
  voice: VoiceApi;
  setTableMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  livingRoom: LivingRoom | undefined;
  joined: boolean | undefined;
  stageMode: boolean;
  videoLocked: boolean;
  setCameraBgMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  cameraBgMenuOpen: boolean;
  cameraTab: "blur" | "images" | "fx";
  setCameraTab: React.Dispatch<React.SetStateAction<"blur" | "images" | "fx">>;
  bgFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleBgUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  customBgs: CustomBackgroundItem[];
  handleDeleteCustomBg: (id: string, e: React.MouseEvent) => void;
  setScreenSharePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  screenSharePopoverOpen: boolean;
  focused: VideoTile | null;
  setFocusedKey: React.Dispatch<React.SetStateAction<string | null>>;
  videoTiles: VideoTile[];
  activitiesOpen: boolean;
  setActivitiesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  moreMenuOpen: boolean;
  setMoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  soundboardAllowed: boolean;
  setSoundboardOpen: React.Dispatch<React.SetStateAction<boolean>>;
  soundboardOpen: boolean;
  setQaOpen: React.Dispatch<React.SetStateAction<boolean>>;
  qa: { questions: QaQuestion[]; voted: Set<string>; canHost: boolean; loaded: boolean; pinned: QaQuestion | null; open: number; ask: (text: string) => Promise<void>; vote: (id: string) => Promise<void>; host: (action: "pin" | "answer" | "hide", id: string) => Promise<void>; };
  captions: { supported: boolean; engine?: "duyu" | "browser" | null; sharing: boolean; showing: boolean; listening: boolean; lines: CaptionLine[]; receive: (event: { channelId: string; connectionId: string; displayName: string; text: string; final: boolean; }) => void; toggleShowing: () => void; toggleSharing: () => void; } | undefined;
  handleViewModeChange: (mode: "grid" | "table" | "map") => void;
  viewMode: "grid" | "table" | "map";
  onToggleBattlemap: (() => void) | undefined;
  qaOpen: boolean;
  onExit: (() => void) | undefined;
  onPopout: (() => void) | undefined;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
  windowFull: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="voice-stage-bottom-bar">
      <div className="voice-ctrls-centered">
        <button
          type="button"
          className={`vctrl-btn vctrl-wide-only ${voice.tableMode ? "active" : ""}`}
          aria-label={t("voiceStage.table")}
          onClick={() => setTableMenuOpen(true)}
          title={t("voiceStage.table")}
        >
          <SlidersHorizontal size={18} />
        </button>
        {livingRoom && joined && !stageMode && (
          <button
            type="button"
            className={`vctrl-btn ${livingRoom.open ? "active" : ""}`}
            aria-label="Living room"
            aria-pressed={livingRoom.open}
            onClick={() => livingRoom.setOpen(!livingRoom.open)}
            title="Living Room: hang out in a shared 3D room, voices come from where people sit"
          >
            <Armchair size={18} />
          </button>
        )}
        <button
          type="button"
          className={`vctrl-btn ${voice.important ? "active" : ""}`}
          aria-label={t("voiceStage.speakImportant")}
          onClick={voice.toggleImportant}
          disabled={voice.muted || voice.deafened || voice.forcedMute}
          title={t("voiceStage.speakImportant")}
        >
          <Megaphone size={18} />
        </button>
        {voice.priorityAllowed && (
          <button
            type="button"
            className={`vctrl-btn ${voice.prioritySpeaker ? "active" : ""}`}
            aria-label={t("priority.toggle")}
            aria-pressed={voice.prioritySpeaker}
            onClick={voice.togglePrioritySpeaker}
            title={voice.prioritySpeaker ? t("priority.on") : t("priority.toggle")}
          >
            <Crown size={18} />
          </button>
        )}

        <div className="vctrl-divider" />

        <button
          type="button"
          className={`vctrl-btn ${voice.muted ? "danger" : ""}`}
          onClick={voice.toggleMute}
          disabled={voice.forcedMute}
          title={voice.muted ? t("voiceStage.unmute") : t("voiceStage.mute")}
        >
          {voice.muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          type="button"
          className={`vctrl-btn ${voice.deafened ? "danger" : ""}`}
          onClick={voice.toggleDeafen}
          title={voice.deafened ? t("voiceStage.undeafen") : t("voiceStage.deafen")}
        >
          {voice.deafened ? <VolumeX size={18} /> : <Headphones size={18} />}
        </button>
        <div className="relative inline-flex items-center">
          <button
            type="button"
            className={`vctrl-btn ${voice.cameraOn ? "active" : ""}`}
            onClick={() =>
              voice.cameraOn ? voice.stopCamera() : void voice.startCamera()
            }
            disabled={videoLocked && !voice.cameraOn}
            title={
              voice.cameraOn
                ? t("voiceStage.turnCameraOff")
                : videoLocked
                  ? t("voiceStage.cameraStageOnly")
                  : t("voiceStage.turnCameraOn")
            }
          >
            {voice.cameraOn ? <VideoOff size={18} /> : <Video size={18} />}
          </button>
          <button
            type="button"
            className={`vctrl-btn-mini ${voice.cameraBackground && voice.cameraBackground !== "none" ? "highlight" : ""}`}
            onClick={() => setCameraBgMenuOpen((o) => !o)}
            title="Camera Virtual Backgrounds & Effects"
          >
            <Sparkles size={11} />
          </button>
          {cameraBgMenuOpen && (
            <div className="camera-bg-popover absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--line)] bg-[var(--panel)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--ink)]">{t("voiceStage.cameraEffects")}</span>
                </div>
                <button
                  type="button"
                  className="popup-close-x"
                  onClick={() => setCameraBgMenuOpen(false)}
                  aria-label="Close camera effects"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Tab Switcher */}
              <div className="flex items-center gap-1 p-2 border-b border-[var(--line)] bg-[var(--paper)]">
                <button
                  type="button"
                  className={`camera-bg-tab flex-1 flex items-center justify-center gap-1.5 ${cameraTab === "blur" ? "active" : ""}`}
                  onClick={() => setCameraTab("blur")}
                >
                  <span>✨</span>
                  <span>{t("voiceStage.bokehBlur")}</span>
                </button>
                <button
                  type="button"
                  className={`camera-bg-tab flex-1 flex items-center justify-center gap-1.5 ${cameraTab === "images" ? "active" : ""}`}
                  onClick={() => setCameraTab("images")}
                >
                  <span>🖼️</span>
                  <span>{t("voiceStage.backdrops")}</span>
                </button>
                <button
                  type="button"
                  className={`camera-bg-tab flex-1 flex items-center justify-center gap-1.5 ${cameraTab === "fx" ? "active" : ""}`}
                  onClick={() => setCameraTab("fx")}
                >
                  <span>🎨</span>
                  <span>{t("voiceStage.fx")}</span>
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-3 overflow-y-auto max-h-[320px] space-y-3">
                {cameraTab === "blur" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                          voice.cameraBackground === "blur"
                            ? "bg-[var(--lavender)] text-white shadow-md"
                            : "bg-[var(--panel)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--lavender)]"
                        }`}
                        onClick={() => voice.setCameraBackground?.("blur")}
                      >
                        {voice.cameraBackground === "blur" ? "✓ Bokeh Blur Active" : "Enable Bokeh Blur"}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[var(--panel)] border border-[var(--line)] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[var(--ink)]">Blur Strength</span>
                        <span className="font-mono text-[var(--lavender)] font-bold">{voice.cameraBlurAmount || 14}px</span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="32"
                        step="2"
                        value={voice.cameraBlurAmount || 14}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          voice.setCameraBlurAmount?.(val);
                          if (voice.cameraBackground !== "blur") {
                            voice.setCameraBackground?.("blur");
                          }
                        }}
                        className="w-full h-1.5 cursor-pointer accent-[var(--lavender)] rounded-lg"
                      />
                      <div className="grid grid-cols-4 gap-1.5 pt-1">
                        {[
                          { label: "Subtle", val: 8 },
                          { label: "Normal", val: 14 },
                          { label: "Heavy", val: 22 },
                          { label: "Deep", val: 30 },
                        ].map((b) => (
                          <button
                            key={b.val}
                            type="button"
                            className={`py-1 text-[10px] rounded-lg border transition-all ${
                              (voice.cameraBlurAmount || 14) === b.val
                                ? "bg-[var(--lavender)]/20 border-[var(--lavender)] text-[var(--lavender)] font-bold"
                                : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] bg-[var(--paper)]"
                            }`}
                            onClick={() => {
                              voice.setCameraBlurAmount?.(b.val);
                              if (voice.cameraBackground !== "blur") {
                                voice.setCameraBackground?.("blur");
                              }
                            }}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                      Client-side AI segmentation cleanly cuts around your person, leaving you sharp while beautifully blurring your room.
                    </p>
                  </div>
                )}

                {cameraTab === "images" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--ink)]">Virtual Backgrounds</span>
                      <button
                        type="button"
                        className="text-xs font-medium text-[var(--lavender)] hover:underline flex items-center gap-1"
                        onClick={() => bgFileInputRef.current?.click()}
                      >
                        <span>＋</span>
                        <span>Upload Image</span>
                      </button>
                      <input
                        ref={bgFileInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleBgUpload}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Custom Upload Tile */}
                      <div
                        className="camera-bg-tile border-dashed border-[var(--lavender)]/40 flex flex-col items-center justify-center gap-1 p-2 text-center hover:bg-[var(--lavender)]/10"
                        onClick={() => bgFileInputRef.current?.click()}
                        title="Upload custom image from your device"
                      >
                        <span className="text-lg">📁</span>
                        <span className="text-[10px] font-semibold text-[var(--lavender)]">{t("voiceStage.uploadImage")}</span>
                      </div>

                      {/* Custom User Uploaded Backgrounds */}
                      {customBgs.map((custom) => {
                        const isSelected = voice.cameraBackground === "image" && voice.cameraBackgroundImage === custom.id;
                        return (
                          <div
                            key={custom.id}
                            className={`camera-bg-tile ${isSelected ? "active" : ""}`}
                            onClick={() => {
                              voice.setCameraBackground?.("image");
                              voice.setCameraBackgroundImage?.(custom.id);
                            }}
                            title={custom.name}
                          >
                            <img src={custom.dataUrl} alt={custom.name} />
                            <span className="absolute bottom-1 left-1.5 text-[9px] font-semibold text-white bg-black/60 px-1 py-0.5 rounded truncate max-w-[85%]">
                              {custom.name}
                            </span>
                            {isSelected && (
                              <span className="absolute top-1 left-1.5 w-4 h-4 rounded-full bg-[var(--lavender)] text-white text-[10px] flex items-center justify-center font-bold">
                                ✓
                              </span>
                            )}
                            <button
                              type="button"
                              className="camera-bg-delete-btn"
                              onClick={(e) => handleDeleteCustomBg(custom.id, e)}
                              title="Delete background"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}

                      {/* Built-in Preset Images */}
                      {BUILTIN_BACKGROUND_IMAGES.map((preset) => {
                        const isSelected = voice.cameraBackground === "image" && voice.cameraBackgroundImage === preset.id;
                        return (
                          <div
                            key={preset.id}
                            className={`camera-bg-tile ${isSelected ? "active" : ""}`}
                            onClick={() => {
                              voice.setCameraBackground?.("image");
                              voice.setCameraBackgroundImage?.(preset.id);
                            }}
                            title={`${preset.name} - ${preset.description}`}
                          >
                            <img src={preset.svgDataUri} alt={preset.name} />
                            <span className="absolute bottom-1 left-1.5 text-[9px] font-semibold text-white bg-black/60 px-1 py-0.5 rounded truncate max-w-[85%] flex items-center gap-1">
                              <span>{preset.emoji}</span>
                              <span>{preset.name}</span>
                            </span>
                            {isSelected && (
                              <span className="absolute top-1 left-1.5 w-4 h-4 rounded-full bg-[var(--lavender)] text-white text-[10px] flex items-center justify-center font-bold">
                                ✓
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {cameraTab === "fx" && (
                  <div className="space-y-1.5">
                    {[
                      { id: "studio" as const, name: "Studio Spotlight", emoji: "🎙️", badge: "Warm" },
                      { id: "cyberpunk" as const, name: "Neon Cyberpunk", emoji: "🌆", badge: "Cyber" },
                      { id: "sunset" as const, name: "Golden Sunset", emoji: "🌅", badge: "Sunset" },
                      { id: "matrix" as const, name: "Digital Matrix", emoji: "🟩", badge: "Matrix" },
                      { id: "cosmos" as const, name: "Deep Space", emoji: "🌌", badge: "Cosmic" },
                    ].map((preset) => {
                      const isSelected = voice.cameraBackground === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors text-left ${
                            isSelected
                              ? "bg-[var(--lavender)] text-white font-medium shadow-sm"
                              : "text-[var(--ink)] hover:bg-[var(--panel)] border border-transparent"
                          }`}
                          onClick={() => voice.setCameraBackground?.(preset.id)}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="text-base leading-none">{preset.emoji}</span>
                            <span className="font-medium">{preset.name}</span>
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                            isSelected ? "bg-white/20 text-white" : "bg-[var(--line)] text-[var(--muted)]"
                          }`}>
                            {preset.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer Controls */}
              <div className="p-2 border-t border-[var(--line)] bg-[var(--panel)] flex items-center justify-between">
                <button
                  type="button"
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                    voice.cameraBackground === "none"
                      ? "text-[var(--muted)] cursor-default"
                      : "text-[var(--coral)] hover:bg-[var(--coral)]/10 font-semibold"
                  }`}
                  disabled={voice.cameraBackground === "none"}
                  onClick={() => voice.setCameraBackground?.("none")}
                >
                  🚫 {t("voiceStage.turnOffEffects")}
                </button>
                <span className="text-[10px] text-[var(--muted)] font-mono">
                  Active: {voice.cameraBackground || "none"}
                </span>
              </div>
            </div>
          )}
        </div>
        {/* Screen Share Button & Options Popover */}
        <div className="relative inline-flex items-center vctrl-wide-only">
          <button
            type="button"
            className={`vctrl-btn ${voice.screenSharing ? "active" : ""}`}
            onClick={() => {
              if (voice.screenSharing) {
                voice.stopScreenShare();
              } else {
                setScreenSharePopoverOpen((o) => !o);
              }
            }}
            disabled={videoLocked && !voice.screenSharing}
            title={
              voice.screenSharing
                ? t("voiceStage.stopSharingScreen")
                : videoLocked
                  ? t("voiceStage.screenStageOnly")
                  : t("voiceStage.startScreenShare")
            }
          >
            <Monitor size={18} />
          </button>

          {/* If streamer is sharing screen, show stream audio mute toggle right here in the dock! */}
          {voice.screenSharing && (
            <button
              type="button"
              className={`vctrl-btn ml-1 ${voice.screenAudioMuted ? "text-amber-400 bg-amber-500/10" : ""}`}
              onClick={voice.toggleScreenAudio}
              title={voice.screenAudioMuted ? t("voiceStage.unmuteStreamAudio") : t("voiceStage.muteStreamAudio")}
            >
              {voice.screenAudioMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}

          {/* Screen share setup popover when starting to share */}
          {screenSharePopoverOpen && !voice.screenSharing && (
            <ScreenShareSetup
              className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 min-w-[300px]"
              quality={voice.screenQuality}
              onQuality={voice.setScreenQuality}
              film={voice.screenFilm ?? false}
              onFilm={(film) => voice.setScreenFilm?.(film)}
              audio={voice.screenShareAudio ?? true}
              onAudio={(audio) => voice.setScreenShareAudio?.(audio)}
              onClose={() => setScreenSharePopoverOpen(false)}
              onStart={() => {
                setScreenSharePopoverOpen(false);
                void voice.startScreenShare(voice.screenQuality, voice.screenShareAudio ?? true, voice.screenFilm ?? false);
              }}
            />
          )}
        </div>

        <div className="vctrl-divider" />

        <button
          type="button"
          className={`vctrl-btn vctrl-wide-only ${!focused ? "active" : ""}`}
          onClick={() => setFocusedKey(focused ? null : (videoTiles[0]?.key || null))}
          title={focused ? t("voiceStage.showGrid") : t("voiceStage.focusStream")}
        >
          <LayoutGrid size={18} />
        </button>

        <button
          type="button"
          className={`vctrl-btn vctrl-wide-only ${activitiesOpen ? "active" : ""}`}
          onClick={() => setActivitiesOpen((open) => !open)}
          title={t("voiceStage.activities")}
        >
          <Sparkles size={18} />
        </button>

        {/* More Options Popover Menu */}
        <div className="relative inline-flex items-center">
          <button
            type="button"
            className={`vctrl-btn ${moreMenuOpen ? "active" : ""}`}
            onClick={() => setMoreMenuOpen((o) => !o)}
            title={t("voiceStage.moreOptions")}
          >
            <MoreHorizontal size={18} />
          </button>
          {moreMenuOpen && (
            <div className="vctrl-more-popover absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 p-1.5 rounded-xl bg-[var(--panel)] border border-[var(--line)] shadow-xl flex flex-col gap-1 min-w-[180px]">
              {/* Phones only: the controls that don't fit in the one-row bar. */}
              <button
                type="button"
                className="vctrl-more-item vctrl-phone-only flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                onClick={() => {
                  setTableMenuOpen(true);
                  setMoreMenuOpen(false);
                }}
              >
                <SlidersHorizontal size={15} className="text-[var(--lavender)]" />
                <span>{t("voiceStage.table")}</span>
              </button>
              {(voice.screenSharing || canShareScreen()) && (
                <button
                  type="button"
                  className="vctrl-more-item vctrl-phone-only flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                  disabled={videoLocked && !voice.screenSharing}
                  onClick={() => {
                    setMoreMenuOpen(false);
                    if (voice.screenSharing) voice.stopScreenShare();
                    else void voice.startScreenShare(voice.screenQuality, voice.screenShareAudio ?? true, voice.screenFilm ?? false);
                  }}
                >
                  <Monitor size={15} className="text-[var(--lavender)]" />
                  <span>{voice.screenSharing ? t("voiceStage.stopSharingScreen") : t("voiceStage.startScreenShare")}</span>
                </button>
              )}
              {videoTiles.length > 0 && (
                <button
                  type="button"
                  className="vctrl-more-item vctrl-phone-only flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                  onClick={() => {
                    setFocusedKey(focused ? null : (videoTiles[0]?.key || null));
                    setMoreMenuOpen(false);
                  }}
                >
                  <LayoutGrid size={15} className="text-[var(--lavender)]" />
                  <span>{focused ? t("voiceStage.showEveryone") : t("voiceStage.focusTheStream")}</span>
                </button>
              )}
              <button
                type="button"
                className="vctrl-more-item vctrl-phone-only flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                onClick={() => {
                  setActivitiesOpen((open) => !open);
                  setMoreMenuOpen(false);
                }}
              >
                <Sparkles size={15} className="text-[var(--coral)]" />
                <span>{t("voiceStage.activities")}</span>
              </button>
              {onPopout && (
                <button
                  type="button"
                  className="vctrl-more-item vctrl-phone-only flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onPopout();
                  }}
                >
                  <ExternalLink size={15} className="text-[var(--lavender)]" />
                  <span>{t("voiceStage.popout")}</span>
                </button>
              )}
              <button
                type="button"
                className="vctrl-more-item vctrl-phone-only flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                onClick={() => {
                  setMoreMenuOpen(false);
                  toggleFullscreen();
                }}
              >
                {isFullscreen || windowFull ? <Minimize2 size={15} className="text-[var(--lavender)]" /> : <Maximize2 size={15} className="text-[var(--lavender)]" />}
                <span>{isFullscreen || windowFull ? t("voiceStage.exitFullScreen") : t("voiceStage.fullScreen")}</span>
              </button>
              <div className="vctrl-more-sep vctrl-phone-only" />
              {soundboardAllowed && (
                <button
                  type="button"
                  className="vctrl-more-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                  onClick={() => {
                    setSoundboardOpen((o) => !o);
                    setMoreMenuOpen(false);
                  }}
                >
                  <Volume2 size={15} className="text-[var(--lavender)]" />
                  <span>{soundboardOpen ? t("voiceStage.closeSoundboard") : t("voiceStage.soundboard")}</span>
                </button>
              )}
              {joined && !stageMode && (
                <button
                  type="button"
                  className="vctrl-more-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                  onClick={() => {
                    setQaOpen((current) => !current);
                    setMoreMenuOpen(false);
                  }}
                >
                  <MessageCircleQuestionMark size={15} className="text-[var(--coral)]" />
                  <span>{t("voiceStage.qa")}{qa.open ? ` (${qa.open})` : ""}</span>
                </button>
              )}
              {captions && (
                <button
                  type="button"
                  className="vctrl-more-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                  onClick={() => {
                    captions.toggleShowing();
                    setMoreMenuOpen(false);
                  }}
                >
                  <Captions size={15} className="text-[var(--lavender)]" />
                  <span>{captions.showing ? t("voiceStage.hideCaptions") : t("voiceStage.showCaptions")}</span>
                </button>
              )}
              {captions?.supported && (
                <button
                  type="button"
                  className="vctrl-more-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                  title={
                    captions.engine === "duyu"
                      ? "Duyu turns your speech into captions for the room. Off while you are muted."
                      : "Your browser turns your speech into captions for the room. Off while you are muted."
                  }
                  onClick={() => {
                    captions.toggleSharing();
                    setMoreMenuOpen(false);
                  }}
                >
                  <Captions size={15} className={captions.sharing ? "text-[var(--mint)]" : "text-[var(--muted)]"} />
                  <span>{captions.sharing ? t("voiceStage.stopCaptioning") : t("voiceStage.captionMyVoice")}</span>
                </button>
              )}
              <button
                type="button"
                className="vctrl-more-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                onClick={() => {
                  handleViewModeChange(viewMode === "table" ? "grid" : "table");
                  setMoreMenuOpen(false);
                }}
              >
                <Volume1 size={15} className="text-[var(--mint)]" />
                <span>{t("voiceStage.voiceTable")}</span>
              </button>
              {onToggleBattlemap && (
                <button
                  type="button"
                  className="vctrl-more-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                  onClick={() => {
                    const next = viewMode === "map" ? "grid" : "map";
                    handleViewModeChange(next);
                    onToggleBattlemap();
                    setMoreMenuOpen(false);
                  }}
                >
                  <Map size={15} className="text-[var(--coral)]" />
                  <span>{t("voiceStage.battlemap")}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {joined && stageMode && (
          <button
            type="button"
            className={`vctrl-btn ${qaOpen ? "active" : ""}`}
            aria-label={`Questions, ${qa.open} open`}
            aria-pressed={qaOpen}
            onClick={() => setQaOpen((current) => !current)}
            title="Q&A"
          >
            <MessageCircleQuestionMark size={18} />
            {qa.open > 0 && <span className="vctrl-badge">{qa.open > 99 ? "99+" : qa.open}</span>}
          </button>
        )}

        <div className="vctrl-divider" />

        <button
          type="button"
          className="vctrl-btn danger active disconnect-pill-btn"
          onClick={() => (joined ? voice.leave() : onExit?.())}
          title={joined ? t("voiceStage.disconnect") : t("voiceStage.close")}
        >
          <PhoneOff size={18} />
          <span className="disconnect-label">{joined ? t("voiceStage.leaveCall") : t("voiceStage.close")}</span>
        </button>

        <div className="vctrl-divider" />

        {onPopout && (
          <button
            type="button"
            className="vctrl-btn vctrl-wide-only"
            onClick={onPopout}
            title={t("voiceStage.popout")}
          >
            <ExternalLink size={17} />
          </button>
        )}

        <button
          type="button"
          className="vctrl-btn vctrl-wide-only"
          onClick={toggleFullscreen}
          title={isFullscreen || windowFull ? t("voiceStage.exitFullScreen") : t("voiceStage.fullScreen")}
        >
          {isFullscreen || windowFull ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
      </div>
    </div>
  );
}

/** iOS Safari and most phone browsers can't share the screen at all. */
function canShareScreen(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}
