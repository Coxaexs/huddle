"use client";

import type { Dispatch, SetStateAction } from "react";
import { Monitor, PhoneOff, Video, VideoOff, Volume2 } from "lucide-react";
import { screenQualityLabel, type useVoice } from "../../hooks/use-voice";
import { ScreenShareSetup } from "../screen-share-setup";
import { SoundboardDrawer } from "../voice-stage";

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
  return (
    <div className="mini-voice-bar">
      <div className="mini-voice-bar-header">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="mini-voice-info min-w-0 cursor-pointer"
            onClick={() => setStageChannelId(voice.channelId)}
            title="Open voice channel"
          >
            <span className="mini-voice-name truncate">
              {roomName}
            </span>
            <span className="mini-voice-status">
              <span className="mini-voice-dot animate-pulse" aria-hidden="true" />
              voice connected
            </span>
          </div>
        </div>
        <div className="mini-voice-actions flex items-center gap-1 flex-shrink-0">
          {soundboardAllowed && (
            <button
              type="button"
              className={`mini-voice-btn ${quickSoundboardOpen ? "on" : ""}`}
              onClick={() => setQuickSoundboardOpen((o) => !o)}
              title={quickSoundboardOpen ? "Close soundboard" : "Soundboard"}
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
            title={voice.screenSharing ? `Stop sharing · ${screenQualityLabel(voice.screenQuality)}` : "Share screen"}
          >
            <Monitor size={14} />
          </button>
          <button
            type="button"
            className={`mini-voice-btn ${voice.cameraOn ? "on" : ""}`}
            onClick={() =>
              voice.cameraOn ? voice.stopCamera() : void voice.startCamera()
            }
            title={voice.cameraOn ? "Turn camera off" : "Camera"}
          >
            {voice.cameraOn ? <VideoOff size={14} /> : <Video size={14} />}
          </button>
          <button
            type="button"
            className="mini-voice-leave"
            onClick={() => voice.leave()}
            title="Disconnect"
          >
            <PhoneOff size={14} />
          </button>
        </div>
      </div>
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
    </div>
  );
}
