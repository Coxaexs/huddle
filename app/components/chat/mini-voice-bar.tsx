"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Monitor, PhoneOff, Radio, Video, VideoOff, Volume2 } from "lucide-react";
import { screenQualityLabel, type useVoice } from "../../hooks/use-voice";
import { ScreenShareSetup } from "../screen-share-setup";
import { SoundboardDrawer } from "../voice-stage/soundboard-drawer";
import { VoiceConnectionModal } from "./voice-connection-modal";
import { useI18n } from "@/app/lib/i18n-context";
import { useUiMode } from "@/app/lib/ui-mode";
import { SimpleCallButtons } from "./shell/simple-parts";

/**
 * The bar above the user footer while you are in a voice room: where you are,
 * and soundboard, screen share, camera and leave buttons. The open/closed
 * state of its two popovers lives in the shell, which also closes them on an
 * outside click.
 */
export function MiniVoiceBar({
  voice,
  roomName,
  soundboardServerId,
  quickSoundboardOpen,
  setQuickSoundboardOpen,
  sidebarShareSetupOpen,
  setSidebarShareSetupOpen,
  setStageChannelId,
  soundboardAllowed = true,
}: {
  voice: ReturnType<typeof useVoice>;
  /** The room's name, or the other person's in a DM call. */
  roomName: string;
  /** The server whose soundboard to offer, if the room belongs to one. */
  soundboardServerId: string | null;
  quickSoundboardOpen: boolean;
  setQuickSoundboardOpen: Dispatch<SetStateAction<boolean>>;
  sidebarShareSetupOpen: boolean;
  setSidebarShareSetupOpen: Dispatch<SetStateAction<boolean>>;
  setStageChannelId: Dispatch<SetStateAction<string | null>>;
  /** False in a stage audience or a room with the soundboard switched off. */
  soundboardAllowed?: boolean;
}) {
  const { t } = useI18n();
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const simpleUi = useUiMode() === "simple";

  return (
    <div className="mini-voice-bar relative">
      <div className="mini-voice-bar-header">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            className="mini-voice-signal-btn group relative flex items-center justify-center p-1 rounded hover:bg-white/10 text-emerald-400 cursor-pointer transition-colors"
            onClick={() => setConnectionModalOpen((prev) => !prev)}
            title={t("voiceStage.voiceConnection")}
            aria-label={t("voiceStage.voiceConnection")}
          >
            <Radio size={16} />
            <div className={`mini-voice-ping-bubble ${connectionModalOpen ? "visible" : ""}`}>
              <span>{voice.latency?.rttMs ? `${Math.round(voice.latency.rttMs)} ms` : "—"}</span>
              <div className="mini-voice-ping-bubble-arrow" />
            </div>
          </button>
          <div
            className="mini-voice-info min-w-0 cursor-pointer flex-1"
            onClick={() => setStageChannelId(voice.channelId)}
            title={t("voiceStage.openVoiceChannel")}
          >
            <span className="mini-voice-name truncate">
              {roomName}
            </span>
            <span className="mini-voice-status">
              <span className="mini-voice-dot animate-pulse" aria-hidden="true" />
              {voice.isSfu && voice.voiceRegion
                ? t("voiceStage.connectedRegion", { region: voice.voiceRegion === "de" ? "Germany" : "Netherlands" })
                : t("voiceStage.connected")}
            </span>
          </div>
        </div>
        <div className="mini-voice-actions flex items-center gap-1 flex-shrink-0">
          {soundboardAllowed && (
            <button
              type="button"
              className={`mini-voice-btn ${quickSoundboardOpen ? "on" : ""}`}
              onClick={() => setQuickSoundboardOpen((o) => !o)}
              title={quickSoundboardOpen ? t("voiceStage.closeSoundboard") : t("voiceStage.soundboard")}
            >
              <Volume2 size={14} />
            </button>
          )}
          <button
            type="button"
            className={`mini-voice-btn ${voice.screenSharing || sidebarShareSetupOpen ? "on" : ""}`}
            aria-expanded={!voice.screenSharing && sidebarShareSetupOpen}
            onClick={() =>
              voice.screenSharing
                ? voice.stopScreenShare()
                : setSidebarShareSetupOpen((open) => !open)
            }
            title={voice.screenSharing ? `Stop sharing · ${screenQualityLabel(voice.screenQuality)}` : t("voiceStage.startScreenShare")}
          >
            <Monitor size={14} />
          </button>
          <button
            type="button"
            className={`mini-voice-btn ${voice.cameraOn ? "on" : ""}`}
            onClick={() =>
              voice.cameraOn ? voice.stopCamera() : void voice.startCamera()
            }
            title={voice.cameraOn ? t("voiceStage.turnCameraOff") : t("voiceStage.cameraTitle")}
          >
            {voice.cameraOn ? <VideoOff size={14} /> : <Video size={14} />}
          </button>
          <button
            type="button"
            className="mini-voice-leave"
            onClick={() => voice.leave()}
            title={t("voiceStage.disconnect")}
          >
            <PhoneOff size={14} />
          </button>
        </div>
      </div>
      {simpleUi && (
        <SimpleCallButtons
          voice={voice}
          shareOpen={sidebarShareSetupOpen}
          onShare={() => setSidebarShareSetupOpen((open) => !open)}
        />
      )}
      {sidebarShareSetupOpen && !voice.screenSharing && (
        <div className="soundboard-quick-popover screen-share-quick-popover">
          <ScreenShareSetup
            className="screen-share-setup-inline"
            quality={voice.screenQuality}
            onQuality={voice.setScreenQuality}
            film={voice.screenFilm}
            onFilm={voice.setScreenFilm}
            audio={voice.screenShareAudio}
            onAudio={voice.setScreenShareAudio}
            onClose={() => setSidebarShareSetupOpen(false)}
            onStart={() => {
              setSidebarShareSetupOpen(false);
              void voice.startScreenShare(voice.screenQuality, voice.screenShareAudio, voice.screenFilm);
            }}
          />
        </div>
      )}
      {quickSoundboardOpen && soundboardAllowed && (
        <div className="soundboard-quick-popover">
          <SoundboardDrawer
            serverId={soundboardServerId}
            channelId={voice.channelId}
            canManage={false}
            onClose={() => setQuickSoundboardOpen(false)}
          />
        </div>
      )}
      {connectionModalOpen && (
        <VoiceConnectionModal
          onClose={() => setConnectionModalOpen(false)}
          latency={voice.latency}
          micSettings={voice.micSettings}
          onMicSettingsChange={voice.setMicSettings}
          serverNodeName={
            voice.isSfu
              ? voice.voiceRegion === "de"
                ? "c-fra02-de-oracle (130.61.25.137)"
                : "c-ams08-nl-optiplex (livekit.hoffle.online)"
              : "p2p-mesh-node"
          }
          isSfu={voice.isSfu ?? true}
          voiceRegion={voice.voiceRegion}
          onSwitchRegion={voice.switchRegion}
          className="absolute bottom-[calc(100%+8px)] left-0 z-50 shadow-2xl"
        />
      )}
    </div>
  );
}
