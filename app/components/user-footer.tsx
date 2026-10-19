"use client";

import { useEffect, useRef, useState } from "react";
import { StreamerModeBadge } from "./streamer-mode-badge";
import { Mic, MicOff, Headphones, VolumeX, Settings, ChevronDown, Check, User } from "lucide-react";
import { Avatar } from "./avatar";
import { AvatarDecoration, NameplateArt, nameplateClass } from "./cosmetics";
import { PRESENCE, type PresenceStatus } from "@/lib/users";
import type { PublicUser } from "@/lib/users";
import { StyledText } from "./message-body";
import { stripTextStyle } from "@/lib/text-style";
import { StyledName } from "./profile-style-parts";
import { useI18n } from "../lib/i18n-context";
import {
  DEVICE_SAVED_EVENT,
  listDevices,
  primeDeviceLabels,
  saveDevice,
  savedDevice,
  supportsOutputSelection,
  type DeviceLists,
} from "../lib/devices";

interface UserFooterProps {
  user: PublicUser;
  status: PresenceStatus;
  customStatus?: string;
  muted: boolean;
  deafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onOpenStatusMenu: (e: React.MouseEvent) => void;
  onOpenSettings: () => void;
  onOpenProfileSettings?: () => void;
  /** After a new microphone is chosen, so a call in progress switches to it. */
  onMicrophoneChange?: () => void;
}

export function UserFooter({
  user,
  status,
  customStatus,
  muted,
  deafened,
  onToggleMute,
  onToggleDeafen,
  onOpenStatusMenu,
  onOpenSettings,
  onOpenProfileSettings,
  onMicrophoneChange,
}: UserFooterProps) {
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const [deafenMenuOpen, setDeafenMenuOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceLists>({ microphones: [], speakers: [], cameras: [] });
  const [selectedMicId, setSelectedMicId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const menuOpen = micMenuOpen || deafenMenuOpen;

  // The device lists are read when a menu opens (and kept fresh while it is
  // open), the same lists and saved choices as Settings → Voice.
  useEffect(() => {
    if (!menuOpen) return;
    setSelectedMicId(savedDevice("microphone"));
    setSelectedSpeakerId(savedDevice("speaker"));
    let cancelled = false;
    const refresh = () =>
      listDevices()
        .then((lists) => {
          if (cancelled) return lists;
          setDevices(lists);
          return lists;
        })
        .catch(() => null);
    void refresh().then((lists) => {
      // Names stay blank until the page has held a microphone permission once.
      if (!cancelled && lists?.microphones.some((device) => !device.label || /^Microphone \d+$/.test(device.label))) {
        void primeDeviceLabels().then(refresh);
      }
    });
    const followSaved = () => {
      setSelectedMicId(savedDevice("microphone"));
      setSelectedSpeakerId(savedDevice("speaker"));
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    window.addEventListener(DEVICE_SAVED_EVENT, followSaved);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
      window.removeEventListener(DEVICE_SAVED_EVENT, followSaved);
    };
  }, [menuOpen]);

  const chooseMic = (deviceId: string) => {
    saveDevice("microphone", deviceId);
    setSelectedMicId(deviceId);
    setMicMenuOpen(false);
    onMicrophoneChange?.();
  };

  const chooseSpeaker = (deviceId: string) => {
    saveDevice("speaker", deviceId);
    setSelectedSpeakerId(deviceId);
    setDeafenMenuOpen(false);
  };

  const micMenuRef = useRef<HTMLDivElement>(null);
  const deafenMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (micMenuRef.current && !micMenuRef.current.contains(e.target as Node)) {
        setMicMenuOpen(false);
      }
      if (deafenMenuRef.current && !deafenMenuRef.current.contains(e.target as Node)) {
        setDeafenMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { t } = useI18n();
  const presenceInfo = PRESENCE[status] || PRESENCE.online;
  const presenceLabel = t(presenceInfo.labelKey);

  return (
    <footer className="discord-user-footer">
      <div
        className={`user-footer-profile${nameplateClass(user.nameplate)}`}
        onClick={onOpenStatusMenu}
        title={stripTextStyle(`${user.displayName} · ${customStatus || presenceLabel}`)}
        role="button"
        tabIndex={0}
      >
        <NameplateArt id={user.nameplate} />
        <div className="avatar-wrapper">
          <Avatar
            className="user-footer-avatar"
            avatar={user.avatar}
            avatarUrl={user.avatarUrl}
            color={user.color}
          >
            <AvatarDecoration id={user.avatarFrame} inChat />
          </Avatar>
          <span
            className="user-footer-presence-dot"
            style={{ background: presenceInfo.color }}
          />
        </div>
        <div className="user-footer-info">
          <span className="user-footer-name"><StyledName name={user.displayName} style={user.profileStyle} /></span>
          <StreamerModeBadge />
          <span className="user-footer-status">
            <StyledText text={customStatus || presenceLabel} />
          </span>
        </div>
      </div>

      <div className="user-footer-controls">
        {/* Mic control with chevron dropdown */}
        <div className="control-btn-group" ref={micMenuRef}>
          <button
            type="button"
            className={`user-footer-btn ${muted ? "off" : ""}`}
            onClick={onToggleMute}
            title={muted ? t("footer.unmute") : t("footer.mute")}
            aria-label={muted ? t("footer.unmute") : t("footer.mute")}
          >
            {muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            type="button"
            className="user-footer-chevron"
            onClick={() => {
              setDeafenMenuOpen(false);
              setMicMenuOpen((o) => !o);
            }}
            aria-expanded={micMenuOpen}
            aria-label={t("footer.inputOptions")}
            title={t("footer.inputOptions")}
          >
            <ChevronDown size={14} />
          </button>

          {micMenuOpen && (
            <div className="user-footer-dropdown-menu">
              <div className="menu-header">{t("footer.inputDevice")}</div>
              {[{ deviceId: "", label: t("footer.systemDefault") }, ...devices.microphones.filter((mic) => mic.deviceId !== "default")].map((mic) => (
                <button
                  key={mic.deviceId || "default"}
                  type="button"
                  className={`menu-item ${mic.deviceId === selectedMicId ? "active" : ""}`}
                  onClick={() => chooseMic(mic.deviceId)}
                >
                  {mic.deviceId === selectedMicId && <Check size={14} className="mr-1 inline" />}
                  {mic.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Headphones control with chevron dropdown */}
        <div className="control-btn-group" ref={deafenMenuRef}>
          <button
            type="button"
            className={`user-footer-btn ${deafened ? "off" : ""}`}
            onClick={onToggleDeafen}
            title={deafened ? t("footer.undeafen") : t("footer.deafen")}
            aria-label={deafened ? t("footer.undeafen") : t("footer.deafen")}
          >
            {deafened ? <VolumeX size={18} /> : <Headphones size={18} />}
          </button>
          <button
            type="button"
            className="user-footer-chevron"
            onClick={() => {
              setMicMenuOpen(false);
              setDeafenMenuOpen((o) => !o);
            }}
            aria-expanded={deafenMenuOpen}
            aria-label={t("footer.outputOptions")}
            title={t("footer.outputOptions")}
          >
            <ChevronDown size={14} />
          </button>

          {deafenMenuOpen && (
            <div className="user-footer-dropdown-menu">
              <div className="menu-header">{t("footer.outputDevice")}</div>
              {supportsOutputSelection() ? (
                [{ deviceId: "", label: t("footer.systemDefault") }, ...devices.speakers.filter((spk) => spk.deviceId !== "default")].map((spk) => (
                  <button
                    key={spk.deviceId || "default"}
                    type="button"
                    className={`menu-item ${spk.deviceId === selectedSpeakerId ? "active" : ""}`}
                    onClick={() => chooseSpeaker(spk.deviceId)}
                  >
                    {spk.deviceId === selectedSpeakerId && <Check size={14} className="mr-1 inline" />}
                    {spk.label}
                  </button>
                ))
              ) : (
                <div className="menu-item disabled">{t("footer.systemOutputOnly")}</div>
              )}
            </div>
          )}
        </div>


        {/* User Settings Gear button */}
        <button
          type="button"
          className="user-footer-btn settings-btn"
          onClick={onOpenSettings}
          title={t("footer.userSettings")}
          aria-label={t("footer.userSettings")}
        >
          <Settings size={18} />
        </button>
      </div>
    </footer>
  );
}
