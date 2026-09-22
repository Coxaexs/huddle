"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sun, Moon, Mic, Volume2, Activity, Sparkles, Fish, Check,
  Palette, Plus, Download, Share2, Trash2, Edit3, Globe, Copy, Eye, X, Upload, Layers,
  User, ShieldCheck, LogOut, Search, Music
} from "lucide-react";
import { PERMISSION_INFO, type PermissionFlag } from "@/lib/permissions";
import { LicensesTab } from "./licenses-tab";
import { Avatar } from "./avatar";
import { DiceOverlay } from "./dice-overlay";
import type { DiceRollEvent } from "@/lib/protocol";
import type { HeadTrackingStatus } from "../lib/head-tracking";
import {
  BUILTIN_THEMES,
  type Theme,
  type ThemeColors,
  applyThemeToDocument,
  exportThemeCode,
  importThemeCode,
  getStoredThemes,
  saveCustomTheme,
  deleteCustomTheme,
  getActiveThemeId,
  scopeProfileCss,
  PROFILE_CSS_PRESETS,
  THEME_CSS_PRESETS,
  getClientUiCss,
  setClientUiCss,
  isClientUiCssEnabled,
  applyClientUiCss,
  CLIENT_UI_CSS_PRESETS,
} from "@/lib/themes";


/** Where the meter bottoms out. Quieter than this is indistinguishable silence. */
const METER_FLOOR_DB = -80;

const meterPercent = (db: number) =>
  Math.max(0, Math.min(100, ((db - METER_FLOOR_DB) / -METER_FLOOR_DB) * 100));

/**
 * A live picture of what the microphone is doing, with the gate threshold drawn
 * on top of it.
 *
 * A sensitivity slider without a meter is guesswork — you cannot pick a
 * threshold without seeing where your own room noise sits relative to your
 * voice — so the two are deliberately one control.
 */
function InputMeter({
  telemetry,
  threshold,
}: {
  telemetry: MicTelemetry | null;
  threshold: number | null;
}) {
  const level = telemetry ? meterPercent(telemetry.inputDb) : 0;
  const open = telemetry?.gateOpen ?? false;

  return (
    <div className="input-meter">
      <div className="input-meter-track">
        <div
          className={`input-meter-fill${open ? " open" : ""}`}
          style={{ width: `${level}%` }}
        />
        {threshold !== null && (
          <div
            className="input-meter-threshold"
            style={{ left: `${meterPercent(threshold)}%` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The Voice input controls: sensitivity, gain and suppression.
 *
 * Whenever you are in a call these read and steer the chain that is actually
 * running, so every change is audible to the room immediately. Outside a call
 * "Test microphone" opens a private chain with the same settings, which is the
 * only honest way to preview them.
 */
function VoiceInput({
  settings,
  onChange,
  subscribe,
  inCall,
}: {
  settings: MicSettings;
  onChange: (next: Partial<MicSettings>) => void;
  subscribe?: (listener: (telemetry: MicTelemetry) => void) => () => void;
  inCall: boolean;
}) {
  const [telemetry, setTelemetry] = useState<MicTelemetry | null>(null);
  const [testing, setTesting] = useState(false);
  const testChainRef = useRef<MicChain | null>(null);

  useEffect(() => {
    if (!inCall || !subscribe) return;
    return subscribe(setTelemetry);
  }, [inCall, subscribe]);

  const stopTest = useCallback(() => {
    testChainRef.current?.stop();
    testChainRef.current = null;
    setTesting(false);
    setTelemetry(null);
  }, []);

  useEffect(() => stopTest, [stopTest]);

  const startTest = async () => {
    if (testing) {
      stopTest();
      return;
    }
    try {
      const chain = await openMicrophone();
      chain.onTelemetry(setTelemetry);
      testChainRef.current = chain;
      setTesting(true);
    } catch {
      stopTest();
    }
  };

  // Changes have to reach the preview chain as well as the saved settings, or
  // the meter goes on showing the old behaviour while you drag the slider.
  const change = (next: Partial<MicSettings>) => {
    onChange(next);
    testChainRef.current?.update(next);
  };

  const manual = settings.sensitivity !== "auto";
  const threshold = manual ? (settings.sensitivity as number) : null;

  return (
    <div className="mic-test-container">
      <div className="mic-test-header">
        <label className="flex items-center gap-1.5 font-semibold text-sm">
          <Mic size={16} /> Input
        </label>
        {inCall ? (
          <span className="modal-hint">Live</span>
        ) : (
          <button
            type="button"
            className={`discord-btn ${testing ? "danger-red" : "primary-indigo"}`}
            onClick={() => void startTest()}
          >
            {testing ? "Stop Testing" : "Test Microphone"}
          </button>
        )}
      </div>

      <InputMeter telemetry={telemetry} threshold={threshold} />

      <label className="appearance-switch">
        <span>
          <strong>Automatic input volume</strong>
          <small>
            {settings.autoGain
              ? `Levelling your voice for you${
                  telemetry ? ` (${telemetry.gainDb.toFixed(0)} dB)` : ""
                }`
              : "Set the input gain yourself"}
          </small>
        </span>
        <input
          type="checkbox"
          checked={settings.autoGain}
          onChange={(event) => change({ autoGain: event.target.checked })}
        />
      </label>

      {!settings.autoGain && (
        <label className="appearance-range">
          <span>
            Input volume <small>{settings.gainDb > 0 ? "+" : ""}{settings.gainDb} dB</small>
          </span>
          <input
            type="range"
            min={GAIN_RANGE.min}
            max={GAIN_RANGE.max}
            step={1}
            value={settings.gainDb}
            onChange={(event) => change({ gainDb: Number(event.target.value) })}
          />
        </label>
      )}

      <label className="appearance-switch">
        <span>
          <strong>Noise gate</strong>
          <small>Stay silent between sentences instead of sending the room</small>
        </span>
        <input
          type="checkbox"
          checked={settings.gate}
          onChange={(event) => change({ gate: event.target.checked })}
        />
      </label>

      {settings.gate && (
        <>
          <label className="appearance-switch">
            <span>
              <strong>Automatic sensitivity</strong>
              <small>Work out what is you and what is the room</small>
            </span>
            <input
              type="checkbox"
              checked={!manual}
              onChange={(event) =>
                change({ sensitivity: event.target.checked ? "auto" : -50 })
              }
            />
          </label>

          {manual && (
            <label className="appearance-range">
              <span>
                Sensitivity <small>{threshold} dB</small>
              </span>
              <input
                type="range"
                min={SENSITIVITY_RANGE.min}
                max={SENSITIVITY_RANGE.max}
                step={1}
                value={threshold ?? -50}
                onChange={(event) =>
                  change({ sensitivity: Number(event.target.value) })
                }
              />
            </label>
          )}
        </>
      )}

      <label htmlFor="settings-suppression">Noise suppression</label>
      <select
        id="settings-suppression"
        value={settings.mode}
        onChange={(event) =>
          change({ mode: event.target.value as MicSettings["mode"] })
        }
      >
        <option value="off">Off</option>
        <option value="browser">Standard — your browser&apos;s filter</option>
        <option value="rnnoise">Enhanced — removes fans, keyboards, hum</option>
        <option value="voice" disabled>
          Remove background voices — needs the GPU service
        </option>
      </select>
      <p className="modal-hint">
        Enhanced runs a small neural network on your own machine. It removes
        noise, not other people talking — that needs a model too heavy for a
        browser tab.
      </p>
    </div>
  );
}

import type { PublicRole, PublicServer } from "@/lib/servers";
import {
  AVATAR_COLORS,
  PRIDE_BADGES,
  type Member,
  type PrideBadgeId,
  type PublicUser,
  type SocialLink,
} from "@/lib/users";
import { PrideBadges } from "./pride-badges";
import { SocialPlatformIcon } from "./user-profile-card";
import { apiFetch } from "../lib/client";
import { comboFromEvent, comboLabel, isModifierOnly } from "../lib/hotkeys";
import {
  listDevices,
  primeDeviceLabels,
  saveDevice,
  savedDevice,
  supportsOutputSelection,
  type DeviceLists,
} from "../lib/devices";
import {
  GAIN_RANGE,
  openMicrophone,
  SENSITIVITY_RANGE,
  readMicSettings,
  writeMicSettings,
  type MicChain,
  type MicSettings,
  type MicTelemetry,
} from "../lib/mic-chain";

interface Invite {
  code: string;
  uses: number;
  maxUses: number;
  revoked: boolean;
  spent: boolean;
  note: string;
}

interface SettingsDialogProps {
  user: PublicUser;
  theme: "cozy" | "legacy" | "light";
  onTheme: (theme: "cozy" | "legacy" | "light") => void;
  onUser: (user: PublicUser) => void;
  onClose: () => void;
  onSignOut: () => void;
  onShareThemeToChat?: (theme: Theme) => void;
  /** Called after the microphone choice changes, to swap it mid-call. */
  onMicrophoneChange?: () => void;
  /** Input chain settings and live meter feed, owned by the voice hook. */
  micSettings?: MicSettings;
  onMicSettings?: (next: Partial<MicSettings>) => void;
  subscribeMicTelemetry?: (
    listener: (telemetry: MicTelemetry) => void,
  ) => () => void;
  /** Whether a call is running, so the meter can read the real chain. */
  inCall?: boolean;
  tableMode?: boolean;
  onTableMode?: (enabled: boolean) => void;
  headTracking?: boolean;
  setHeadTracking?: (enabled: boolean) => void;
  headTrackingOffered?: boolean;
  headTrackingStatus?: { status: HeadTrackingStatus; live: boolean };
  recenterHead?: () => void;
  tableHostId?: string;
  onTableHostId?: (id: string) => void;
  tableParticipants?: Array<{ connectionId: string; displayName: string }>;
  /** Push-to-talk state + setters, owned by the voice hook. */
  pushToTalk?: boolean;
  pttKey?: string;
  onPushToTalk?: (enabled: boolean) => void;
  onPttKey?: (code: string) => void;
  /** Mute / deafen toggle shortcuts. */
  muteKey?: string;
  deafenKey?: string;
  onMuteKey?: (combo: string) => void;
  onDeafenKey?: (combo: string) => void;
  /** The active server, for the roles tab. */
  server?: PublicServer | null;
  members?: Member[];
  /** Whether this user may manage the server (shows the Roles tab). */
  canManageServer?: boolean;
}

type Tab =
  | "profile"
  | "activities"
  | "voice"
  | "password"
  | "invites"
  | "appearance"
  | "custom_ui_css"
  | "accessibility"
  | "roles"
  | "licenses";

type PrideTheme = "off" | "trans" | "pride" | "nonbinary";

export const BANNER_PRESETS = [
  { id: "synthwave", name: "Synthwave Sunset", css: "linear-gradient(135deg, #ff007f, #7928ca, #ff0080)" },
  { id: "nebula", name: "Cosmic Nebula", css: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" },
  { id: "cyberpunk", name: "Cyber Matrix", css: "linear-gradient(135deg, #001100, #003b00, #00ff66)" },
  { id: "aurora", name: "Northern Aurora", css: "linear-gradient(135deg, #0575e6, #00f260)" },
  { id: "sakura", name: "Sakura Blossom", css: "linear-gradient(135deg, #fbc2eb, #a6c1ee)" },
  { id: "midnight", name: "Midnight Velvet", css: "linear-gradient(135deg, #180b2c, #3a1c71, #d76d77)" },
  { id: "ocean", name: "Deep Ocean", css: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)" },
  { id: "carbon", name: "Dark Carbon", css: "linear-gradient(135deg, #141517, #23272a, #111214)" },
];

export const AVATAR_FRAMES = [
  { id: "none", name: "Clean", desc: "Classic avatar" },
  { id: "neon", name: "💫 Neon Pulse", desc: "Vibrant cyan glowing aura" },
  { id: "rainbow", name: "🌈 Rainbow Halo", desc: "Rotating prismatic ring" },
  { id: "cyber", name: "⚡ Cyber Glitch", desc: "Terminal glitch matrix frame" },
  { id: "gold", name: "👑 Royal Gold", desc: "Shimmering luxury gold ring" },
  { id: "sakura", name: "🌸 Sakura Blossom", desc: "Soft pastel floral halo" },
  { id: "diamond", name: "💎 Diamond Cut", desc: "Angular cyber diamond border" },
];

export const COLOR_SWATCHES = [
  "#5865F2", // Discord Blurple
  "#57F287", // Green
  "#FEE75C", // Yellow
  "#EB459E", // Fuchsia
  "#ED4245", // Red
  "#9d8cf5", // Lavender
  "#38bdf8", // Sky Blue
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#f97316", // Orange
  "#ec4899", // Pink
  "#a855f7", // Purple
  "#6366f1", // Indigo
  "#e11d48", // Crimson
  "#14b8a6", // Teal
  "#e2e8f0", // Silver White
];

export const STATUS_EMOJIS = [
  "💬", "🎮", "🎧", "💻", "☕", "✨", "🌙", "🔥", "🚀", "🐱", "🎨", "🎵", "💤", "🍕", "🌸", "⚡"
];

export const PROFILE_CSS_SNIPPETS = [
  {
    name: "✨ Glow Aura",
    snippet: "\n.profile-card {\n  box-shadow: 0 0 25px rgba(168, 85, 247, 0.45) !important;\n  border: 1px solid rgba(168, 85, 247, 0.5) !important;\n}\n",
  },
  {
    name: "🌈 Gradient Name",
    snippet: "\n.profile-display-name {\n  background: linear-gradient(90deg, #ff007f, #00f2fe) !important;\n  -webkit-background-clip: text !important;\n  -webkit-text-fill-color: transparent !important;\n}\n",
  },
  {
    name: "📺 CRT Scanlines",
    snippet: "\n.profile-card::after {\n  content: '' !important;\n  position: absolute !important;\n  inset: 0 !important;\n  background: repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 2px) !important;\n  pointer-events: none !important;\n}\n",
  },
  {
    name: "🧊 Glass Card",
    snippet: "\n.profile-card {\n  background: rgba(18, 19, 26, 0.7) !important;\n  backdrop-filter: blur(16px) !important;\n  border: 1px solid rgba(255, 255, 255, 0.12) !important;\n}\n",
  },
  {
    name: "💫 Float Motion",
    snippet: "\n@keyframes floatAnim {\n  0%, 100% { transform: translateY(0); }\n  50% { transform: translateY(-6px); }\n}\n.profile-card-avatar-wrap {\n  animation: floatAnim 3.5s ease-in-out infinite !important;\n}\n",
  },
];

type Density = "compact" | "cozy" | "roomy";
type Backdrop = "plain" | "aurora" | "dots";

export function SettingsDialog({
  user,
  theme,
  onTheme,
  onUser,
  onClose,
  onSignOut,
  onMicrophoneChange,
  micSettings,
  onMicSettings,
  subscribeMicTelemetry,
  inCall = false,
  tableMode = false,
  onTableMode,
  headTracking = false,
  setHeadTracking,
  headTrackingOffered = false,
  headTrackingStatus = { status: "unsupported", live: false },
  recenterHead,
  tableHostId = "",
  onTableHostId,
  tableParticipants = [],
  pushToTalk = false,
  pttKey = "Space",
  onPushToTalk,
  onPttKey,
  muteKey = "Ctrl+Shift+KeyM",
  deafenKey = "Ctrl+Shift+KeyD",
  onMuteKey,
  onDeafenKey,
  server,
  members = [],
  canManageServer = false,
  onShareThemeToChat,
}: SettingsDialogProps) {
  const [capturingKey, setCapturingKey] = useState(false);
  // Kept locally so the dialog still works if it is rendered without a call.
  const [localMic, setLocalMic] = useState<MicSettings>(() => readMicSettings());
  const mic = micSettings ?? localMic;
  const changeMic = useCallback(
    (next: Partial<MicSettings>) => {
      if (onMicSettings) onMicSettings(next);
      else setLocalMic(writeMicSettings(next));
    },
    [onMicSettings],
  );
  const [tab, setTab] = useState<Tab>("profile");
  const [devices, setDevices] = useState<DeviceLists>({
    microphones: [],
    speakers: [],
    cameras: [],
  });
  const [micId, setMicId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatar, setAvatar] = useState(user.avatar);
  const [color, setColor] = useState(user.color);
  const [pronouns, setPronouns] = useState(user.pronouns || "");
  const [bio, setBio] = useState(user.bio || "");
  const [prideBadges, setPrideBadges] = useState<PrideBadgeId[]>(
    user.prideBadges || [],
  );
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const canCreateInvites = Boolean(user.isAdmin || user.canInvite);
  const [permissionUsers, setPermissionUsers] = useState<
    Array<{
      id: string;
      username: string;
      displayName: string;
      avatar: string;
      avatarUrl: string | null;
      color: string;
      isAdmin: boolean;
      canInvite: boolean;
    }>
  >([]);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [updatingPermission, setUpdatingPermission] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || null);
  const [avatarKey, setAvatarKey] = useState<string | null | undefined>(undefined);
  const [bannerUrl, setBannerUrl] = useState(user.bannerUrl || null);
  const [bannerKey, setBannerKey] = useState<string | null | undefined>(undefined);
  const [tagline, setTagline] = useState(user.tagline || "");
  const [customStatus, setCustomStatus] = useState(user.customStatus || "");
  const [avatarFrame, setAvatarFrame] = useState(user.avatarFrame || "none");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(user.socialLinks || []);
  const [newPlatform, setNewPlatform] = useState("github");
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [spotifySong, setSpotifySong] = useState(user.spotifyActivity?.song || "");
  const [spotifyArtist, setSpotifyArtist] = useState(user.spotifyActivity?.artist || "");
  const bannerRef = useRef<HTMLInputElement>(null);
  const [accent, setAccent] = useState("#9d8cf5");
  const [density, setDensity] = useState<Density>("cozy");
  const [backdrop, setBackdrop] = useState<Backdrop>("plain");
  const [corners, setCorners] = useState(16);
  const [motion, setMotion] = useState(true);
  const [cute, setCute] = useState(false);
  const [prideTheme, setPrideTheme] = useState<PrideTheme>("off");
  const [blahaj, setBlahaj] = useState(false);
  const [diceTheme, setDiceTheme] = useState("default");
  const [diceColor, setDiceColor] = useState("#2563eb");
  const [testRoll, setTestRoll] = useState<DiceRollEvent | null>(null);

  // Theme Manager state
  const [customThemes, setCustomThemes] = useState<Theme[]>(() => getStoredThemes());
  const [activeThemeId, setActiveThemeId] = useState<string>(() => getActiveThemeId());
  const [appearanceSubtab, setAppearanceSubtab] = useState<"installed" | "community">("installed");
  const [themeSearchQuery, setThemeSearchQuery] = useState("");
  const [communityThemes, setCommunityThemes] = useState<Theme[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [themeShareMenuId, setThemeShareMenuId] = useState<string | null>(null);
  const [themeCopiedId, setThemeCopiedId] = useState<string | null>(null);
  const [themeActionNotice, setThemeActionNotice] = useState("");

  // Theme Creator / Editor Modal State
  const [isCreatingTheme, setIsCreatingTheme] = useState(false);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftBaseTheme, setDraftBaseTheme] = useState<"cozy" | "legacy" | "light">("cozy");
  const [draftColors, setDraftColors] = useState<ThemeColors>({
    paper: "#16131f",
    panel: "#1a1628",
    chatBg: "#1e1a2e",
    lavender: "#a78bfa",
    lavenderSoft: "#2e2750",
    lavenderMuted: "#3d2f6b",
    ink: "#e8e3f5",
    muted: "#9d95bc",
    line: "rgba(255, 255, 255, 0.07)",
    coral: "#f59e6e",
    mint: "#4ade80",
  });
  const [draftCorners, setDraftCorners] = useState(16);
  const [draftBackdrop, setDraftBackdrop] = useState<"plain" | "aurora" | "dots" | "grid" | "stars">("plain");
  const [draftCustomCss, setDraftCustomCss] = useState("");
  const [draftIsPublic, setDraftIsPublic] = useState(true);

  // Import Theme Modal State
  const [isImportingTheme, setIsImportingTheme] = useState(false);
  const [importCodeInput, setImportCodeInput] = useState("");
  const [importParsedTheme, setImportParsedTheme] = useState<Theme | null>(null);
  const [importError, setImportError] = useState("");

  // Profile Custom CSS state
  const [profileCustomCss, setProfileCustomCss] = useState(user.customCss || "");
  const [showProfileCssGuide, setShowProfileCssGuide] = useState(false);

  const [notify, setNotify] = useState(
    () =>
      typeof window === "undefined" ||
      window.localStorage.getItem("huddle-notify") !== "off",
  );
  const [activityShare, setActivityShare] = useState(true);
  const [spotifyShare, setSpotifyShare] = useState(true);
  const [appShare, setAppShare] = useState(true);
  const [spotifyUserInput, setSpotifyUserInput] = useState("");
  const [trackSearchInput, setTrackSearchInput] = useState("");
  const [currentAppId, setCurrentAppId] = useState("spotify");
  const [detectedApps, setDetectedApps] = useState([
    { id: "spotify", name: "Spotify", type: "music", details: "Listening to Spotify" },
    { id: "vscode", name: "Visual Studio Code", type: "coding", details: "Editing Hoffle codebase" },
    { id: "minecraft", name: "Minecraft", type: "game", details: "Playing Survival Mode" },
  ]);
  const pictureRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedAccent = window.localStorage.getItem("huddle-accent");
    const savedDensity = window.localStorage.getItem("huddle-density") as Density;
    const savedBackdrop = window.localStorage.getItem("huddle-backdrop") || "";
    const savedCorners = Number(window.localStorage.getItem("huddle-corners"));
    const savedMotion = window.localStorage.getItem("huddle-motion");
    const savedCute = window.localStorage.getItem("huddle-cute");
    const savedPrideTheme = window.localStorage.getItem("huddle-pride-theme");
    const savedBlahaj = window.localStorage.getItem("huddle-blahaj");
    const savedDiceTheme = window.localStorage.getItem("huddle_dice_theme");
    const savedDiceColor = window.localStorage.getItem("huddle_dice_color");
    if (savedAccent) setAccent(savedAccent);
    if (["compact", "cozy", "roomy"].includes(savedDensity)) setDensity(savedDensity);
    // The old glow was the default. Do not carry it forward: gradients are
    // now an explicit opt-in appearance choice.
    if (["plain", "aurora", "dots"].includes(savedBackdrop)) {
      setBackdrop(savedBackdrop as Backdrop);
    } else if (savedBackdrop === "glow") {
      setBackdrop("plain");
    }
    if (savedCorners >= 4 && savedCorners <= 28) setCorners(savedCorners);
    if (savedMotion) setMotion(savedMotion !== "reduced");
    setCute(savedCute === "on");
    if (["off", "trans", "pride", "nonbinary"].includes(savedPrideTheme || "")) {
      setPrideTheme(savedPrideTheme as PrideTheme);
    }
    setBlahaj(savedBlahaj === "on");
    if (savedDiceTheme && ["default", "pride", "trans", "nonbinary"].includes(savedDiceTheme)) {
      setDiceTheme(savedDiceTheme);
    }
    if (savedDiceColor) setDiceColor(savedDiceColor);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--lavender", accent);
    root.style.setProperty("--ui-corners", `${corners}px`);
    root.style.setProperty("--dice-preview-color", diceColor);
    root.dataset.density = density;
    root.dataset.backdrop = backdrop;
    root.dataset.motion = motion ? "full" : "reduced";
    root.dataset.cute = cute ? "on" : "off";
    root.dataset.prideTheme = prideTheme;
    root.dataset.blahaj = blahaj ? "on" : "off";
    window.localStorage.setItem("huddle-accent", accent);
    window.localStorage.setItem("huddle-density", density);
    window.localStorage.setItem("huddle-backdrop", backdrop);
    window.localStorage.setItem("huddle-corners", String(corners));
    window.localStorage.setItem("huddle-motion", motion ? "full" : "reduced");
    window.localStorage.setItem("huddle-cute", cute ? "on" : "off");
    window.localStorage.setItem("huddle-pride-theme", prideTheme);
    window.localStorage.setItem("huddle-blahaj", blahaj ? "on" : "off");
    window.localStorage.setItem("huddle_dice_theme", diceTheme);
  }, [accent, corners, density, backdrop, motion, cute, prideTheme, blahaj, diceTheme, diceColor]);

  // Personal Client-Side UI CSS
  const [clientUiCss, setLocalClientUiCss] = useState<string>(() => getClientUiCss());
  const [clientUiCssEnabled, setClientUiCssEnabled] = useState<boolean>(() => isClientUiCssEnabled());
  const [clientUiNotice, setClientUiNotice] = useState<string>("");

  // Accessibility & Display Settings
  const [chatFontSize, setChatFontSize] = useState<number>(() => {
    if (typeof window === "undefined") return 16;
    return Number(window.localStorage.getItem("huddle_chat_font_size")) || 16;
  });
  const [alwaysUnderlineLinks, setAlwaysUnderlineLinks] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("huddle_underline_links") === "true";
  });
  const [displayNameStyles, setDisplayNameStyles] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("huddle_display_names_styles") !== "false";
  });

  // Settings search
  const [settingsSearch, setSettingsSearch] = useState<string>("");

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--chat-font-size", `${chatFontSize}px`);
    window.localStorage.setItem("huddle_chat_font_size", String(chatFontSize));
  }, [chatFontSize]);

  useEffect(() => {
    window.localStorage.setItem("huddle_underline_links", alwaysUnderlineLinks ? "true" : "false");
    document.documentElement.dataset.underlineLinks = alwaysUnderlineLinks ? "on" : "off";
  }, [alwaysUnderlineLinks]);

  useEffect(() => {
    window.localStorage.setItem("huddle_display_names_styles", displayNameStyles ? "true" : "false");
    document.documentElement.dataset.displayNameStyles = displayNameStyles ? "on" : "off";
  }, [displayNameStyles]);

  const handleSaveClientUiCss = (css: string, enabled: boolean) => {
    setLocalClientUiCss(css);
    setClientUiCssEnabled(enabled);
    setClientUiCss(css, enabled);
    setClientUiNotice("Saved and applied client-side CSS!");
    setTimeout(() => setClientUiNotice(""), 2500);
  };

  useEffect(() => {
    if (tab !== "voice") return;
    setMicId(savedDevice("microphone"));
    setSpeakerId(savedDevice("speaker"));
    setCameraId(savedDevice("camera"));

    let cancelled = false;
    const refresh = () =>
      listDevices()
        .then((lists) => !cancelled && setDevices(lists))
        .catch(() => undefined);
    void refresh();
    // Labels stay blank until the page has held a media permission once.
    void primeDeviceLabels().then(refresh);
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, [tab]);

  const loadPermissions = useCallback(() => {
    if (!user.isAdmin) return;
    apiFetch<{
      users: Array<{
        id: string;
        username: string;
        displayName: string;
        avatar: string;
        avatarUrl: string | null;
        color: string;
        isAdmin: boolean;
        canInvite: boolean;
      }>;
    }>("/api/invites/permissions")
      .then((data) => setPermissionUsers(data.users || []))
      .catch(() => undefined);
  }, [user.isAdmin]);

  useEffect(() => {
    if (tab !== "invites") return;
    apiFetch<{ invites: Invite[] }>("/api/invites")
      .then((data) => setInvites(data.invites))
      .catch(() => undefined);
    if (user.isAdmin) {
      loadPermissions();
    }
  }, [tab, user.isAdmin, loadPermissions]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveProfile() {
    setError("");
    try {
      const data = await apiFetch<{ user: PublicUser }>("/api/settings/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName,
          avatar,
          color,
          pronouns,
          tagline,
          customStatus: customStatus.trim() || null,
          bio,
          prideBadges,
          avatarFrame,
          socialLinks,
          spotifyActivity: spotifySong.trim()
            ? {
                song: spotifySong.trim(),
                artist: spotifyArtist.trim() || "Unknown Artist",
                isPlaying: true,
              }
            : null,
          customCss: profileCustomCss.trim() || null,
          ...(avatarKey === undefined ? { avatarUrl } : { avatarKey }),
          ...(bannerKey === undefined ? { bannerUrl } : { bannerKey }),
        }),
      });
      onUser(data.user);
      setStatus("Profile saved!");
      window.setTimeout(() => setStatus(""), 2500);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    }
  }

  const loadCommunityThemes = useCallback(async (query = "") => {
    setCommunityLoading(true);
    try {
      const url = query ? `/api/themes?query=${encodeURIComponent(query)}` : "/api/themes";
      const res = await apiFetch<{ themes: Theme[] }>(url);
      setCommunityThemes(res.themes || []);
    } catch {
      setCommunityThemes([]);
    } finally {
      setCommunityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "appearance" && appearanceSubtab === "community") {
      void loadCommunityThemes(themeSearchQuery);
    }
  }, [tab, appearanceSubtab, themeSearchQuery, loadCommunityThemes]);

  const handleSelectTheme = (th: Theme) => {
    setActiveThemeId(th.id);
    applyThemeToDocument(th);
    onTheme(th.baseTheme);
    if (th.colors.lavender) setAccent(th.colors.lavender);
    if (typeof th.corners === "number") setCorners(th.corners);
    if (th.backdrop && ["plain", "aurora", "dots"].includes(th.backdrop)) {
      setBackdrop(th.backdrop as Backdrop);
    }
  };

  const handleOpenCreateTheme = (existing?: Theme) => {
    if (existing) {
      setEditingThemeId(existing.id);
      setDraftName(existing.name);
      setDraftDesc(existing.description || "");
      setDraftBaseTheme(existing.baseTheme);
      setDraftColors({ ...existing.colors });
      setDraftCorners(existing.corners ?? 16);
      setDraftBackdrop(existing.backdrop || "plain");
      setDraftCustomCss(existing.customCss || "");
      setDraftIsPublic(existing.isPublic ?? true);
    } else {
      setEditingThemeId(null);
      setDraftName("My Custom Theme");
      setDraftDesc("");
      setDraftBaseTheme("cozy");
      setDraftColors({
        paper: "#16131f",
        panel: "#1a1628",
        chatBg: "#1e1a2e",
        lavender: accent || "#a78bfa",
        lavenderSoft: "#2e2750",
        lavenderMuted: "#3d2f6b",
        ink: "#e8e3f5",
        muted: "#9d95bc",
        line: "rgba(255, 255, 255, 0.07)",
        coral: "#f59e6e",
        mint: "#4ade80",
      });
      setDraftCorners(corners || 16);
      setDraftBackdrop(backdrop || "plain");
      setDraftCustomCss("");
      setDraftIsPublic(true);
    }
    setIsCreatingTheme(true);
  };

  const handleSaveDraftTheme = async () => {
    if (!draftName.trim()) {
      alert("Please provide a name for your theme.");
      return;
    }

    const themeId = editingThemeId || `theme_${Date.now()}`;
    const newTheme: Theme = {
      id: themeId,
      name: draftName.trim(),
      description: draftDesc.trim(),
      baseTheme: draftBaseTheme,
      colors: draftColors,
      corners: draftCorners,
      backdrop: draftBackdrop,
      customCss: draftCustomCss,
      author: {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
      },
      isPublic: draftIsPublic,
      isBuiltin: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveCustomTheme(newTheme);
    setCustomThemes(getStoredThemes());
    handleSelectTheme(newTheme);
    setIsCreatingTheme(false);
    setThemeActionNotice(`Theme "${newTheme.name}" saved and applied!`);
    setTimeout(() => setThemeActionNotice(""), 3500);

    // If marked public, also publish to server database
    if (draftIsPublic) {
      try {
        await apiFetch("/api/themes", {
          method: "POST",
          body: JSON.stringify({ theme: newTheme }),
        });
      } catch {
        // Local storage still succeeded
      }
    }
  };

  const handleDeleteCustomTheme = (id: string) => {
    if (!confirm("Are you sure you want to delete this custom theme?")) return;
    deleteCustomTheme(id);
    setCustomThemes(getStoredThemes());
    if (activeThemeId === id) {
      const defaultTheme = BUILTIN_THEMES[0];
      handleSelectTheme(defaultTheme);
    }
    setThemeActionNotice("Theme deleted.");
    setTimeout(() => setThemeActionNotice(""), 3000);
  };

  const handleShareThemeCode = async (th: Theme) => {
    const code = exportThemeCode(th);
    try {
      await navigator.clipboard.writeText(code);
      setThemeCopiedId(th.id);
      setTimeout(() => setThemeCopiedId(null), 2000);
    } catch {
      alert("Theme share code:\n\n" + code);
    }
  };

  const handleShareThemeChat = (th: Theme) => {
    if (onShareThemeToChat) {
      onShareThemeToChat(th);
      setThemeActionNotice(`Shared "${th.name}" to active chat!`);
      setTimeout(() => setThemeActionNotice(""), 3000);
      onClose();
    } else {
      void handleShareThemeCode(th);
    }
  };

  const handlePublishTheme = async (th: Theme) => {
    try {
      await apiFetch("/api/themes", {
        method: "POST",
        body: JSON.stringify({ theme: th }),
      });
      setThemeActionNotice(`Theme "${th.name}" published to Community Themes!`);
      setTimeout(() => setThemeActionNotice(""), 3500);
      if (appearanceSubtab === "community") {
        void loadCommunityThemes(themeSearchQuery);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to publish theme");
    }
  };

  const handleImportTheme = () => {
    setImportError("");
    if (!importCodeInput.trim()) {
      setImportError("Please paste a theme code or JSON.");
      return;
    }
    const parsed = importThemeCode(importCodeInput);
    if (!parsed) {
      setImportError("Invalid theme code. Please check that you copied the full string.");
      return;
    }
    saveCustomTheme(parsed);
    setCustomThemes(getStoredThemes());
    handleSelectTheme(parsed);
    setIsImportingTheme(false);
    setImportCodeInput("");
    setImportParsedTheme(null);
    setThemeActionNotice(`Successfully imported & applied "${parsed.name}"!`);
    setTimeout(() => setThemeActionNotice(""), 3500);
  };

  async function savePassword() {
    setError("");
    try {
      await apiFetch("/api/settings/password", {
        method: "POST",
        body: JSON.stringify({ current, next }),
      });
      setCurrent("");
      setNext("");
      setStatus("Password changed. Other devices were signed out.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    }
  }

  async function choosePicture(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const upload = await apiFetch<{ key: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      setAvatarKey(upload.key);
      setAvatarUrl(`/hangout/api/uploads/${encodeURIComponent(upload.key)}`);
      setStatus("Picture ready — save the profile to keep it.");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "That image did not upload.",
      );
    }
  }

  async function chooseBanner(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const upload = await apiFetch<{ key: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      setBannerKey(upload.key);
      setBannerUrl(`/hangout/api/uploads/${encodeURIComponent(upload.key)}`);
      setStatus("Banner ready — save the profile to keep it.");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "That banner did not upload.",
      );
    }
  }

  async function createInvite() {
    setError("");
    try {
      const data = await apiFetch<{ invite: Invite }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ maxUses: 1 }),
      });
      setInvites((list) => [data.invite, ...list]);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not make a code.",
      );
    }
  }

  async function revokeInvite(code: string) {
    await apiFetch(`/api/invites?code=${encodeURIComponent(code)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    setInvites((list) =>
      list.map((invite) =>
        invite.code === code ? { ...invite, revoked: true } : invite,
      ),
    );
  }

  async function toggleInvitePermission(targetUserId: string, currentCanInvite: boolean) {
    setUpdatingPermission(targetUserId);
    setError("");
    try {
      const data = await apiFetch<{ ok: boolean; userId: string; canInvite: boolean }>(
        "/api/invites/permissions",
        {
          method: "POST",
          body: JSON.stringify({ userId: targetUserId, canInvite: !currentCanInvite }),
        },
      );
      setPermissionUsers((list) =>
        list.map((u) =>
          u.id === targetUserId ? { ...u, canInvite: data.canInvite } : u,
        ),
      );
      setStatus(data.canInvite ? "Invite permission granted." : "Invite permission revoked.");
      window.setTimeout(() => setStatus(""), 2000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Failed to update permission.");
    } finally {
      setUpdatingPermission(null);
    }
  }

  const NAV_CATEGORIES = [
    {
      title: "USER SETTINGS",
      items: [
        { id: "profile" as Tab, label: "Profile", icon: User, desc: "Avatar, banner, bio, pride badges, and custom CSS" },
        { id: "password" as Tab, label: "Account & Password", icon: ShieldCheck, desc: "Username, password and account security" },
        { id: "activities" as Tab, label: "Activities & Privacy", icon: Activity, desc: "Status sharing, games and Spotify" },
      ],
    },
    {
      title: "APP SETTINGS",
      items: [
        { id: "appearance" as Tab, label: "Appearance", icon: Palette, desc: "Themes, colors, and community library" },
        { id: "custom_ui_css" as Tab, label: "Custom CSS", icon: Sparkles, desc: "Personal client-side UI styling" },
        { id: "voice" as Tab, label: "Voice & Video", icon: Mic, desc: "Input, output, mic test, volume and noise gate" },
        { id: "accessibility" as Tab, label: "Accessibility", icon: Eye, desc: "Font size, readability, preview and animation" },
      ],
    },
    ...(canCreateInvites || (canManageServer && server)
      ? [
          {
            title: "SERVER / COMMUNITY",
            items: [
              ...(canCreateInvites
                ? [{ id: "invites" as Tab, label: "Invites", icon: Share2, desc: "Manage server invites and links" }]
                : []),
              ...(canManageServer && server
                ? [{ id: "roles" as Tab, label: "Roles", icon: Layers, desc: "Configure server roles and permissions" }]
                : []),
            ],
          },
        ]
      : []),
    {
      title: "ABOUT",
      items: [
        { id: "licenses" as Tab, label: "Licenses & About", icon: Globe, desc: "Software licenses and legal notices" },
      ],
    },
  ];

  return (
    <div className="modal-backdrop settings-modal-overlay" role="dialog" aria-modal="true">
      <div className="modal settings-modal">
        {/* Discord Left Sidebar */}
        <aside className="settings-sidebar">
          <div className="settings-sidebar-user">
            <Avatar avatar={avatar} avatarUrl={avatarUrl} color={color} className="w-9 h-9 rounded-full shrink-0" />
            <div className="settings-sidebar-user-info">
              <span className="settings-sidebar-user-name" title={displayName || user.displayName}>
                {displayName || user.displayName}
              </span>
              <button
                type="button"
                className="settings-sidebar-user-sub"
                onClick={() => setTab("profile")}
              >
                <span>Edit Profiles</span>
                <Edit3 size={11} />
              </button>
            </div>
          </div>

          <div className="settings-search-wrap">
            <Search size={14} className="settings-search-icon" />
            <input
              type="text"
              className="settings-search-input"
              placeholder="Search settings…"
              value={settingsSearch}
              onChange={(e) => setSettingsSearch(e.target.value)}
            />
          </div>

          <nav className="settings-nav-groups">
            {NAV_CATEGORIES.map((cat) => {
              const matchingItems = cat.items.filter((item) => {
                if (!settingsSearch.trim()) return true;
                const q = settingsSearch.toLowerCase();
                return item.label.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q);
              });
              if (matchingItems.length === 0) return null;
              return (
                <div key={cat.title} className="settings-group-section">
                  <div className="settings-group-title">{cat.title}</div>
                  {matchingItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`settings-nav-btn ${tab === item.id ? "active" : ""}`}
                        onClick={() => {
                          setTab(item.id);
                          setError("");
                          setStatus("");
                        }}
                      >
                        <Icon size={16} className="shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <button
            type="button"
            className="settings-nav-btn signout"
            onClick={onSignOut}
          >
            <LogOut size={16} />
            <span>Log Out</span>
          </button>
        </aside>

        {/* Right Main Content Panel */}
        <main className="settings-main">
          <header className="settings-topbar">
            <h2>
              {tab === "profile" && "Profile"}
              {tab === "password" && "Account & Password"}
              {tab === "activities" && "Activities & Privacy"}
              {tab === "appearance" && "Appearance"}
              {tab === "custom_ui_css" && "Custom CSS"}
              {tab === "voice" && "Voice & Video"}
              {tab === "accessibility" && "Accessibility"}
              {tab === "invites" && "Invites"}
              {tab === "roles" && "Roles"}
              {tab === "licenses" && "Licenses & About"}
            </h2>
            <button
              type="button"
              className="settings-esc-control"
              onClick={onClose}
              aria-label="Close settings (Esc)"
              title="Close settings (Esc)"
            >
              <div className="settings-esc-circle">
                <X size={18} />
              </div>
              <span className="settings-esc-text">ESC</span>
            </button>
          </header>

          <div className="settings-content-scroll">
          {tab === "profile" && (
            <>
              <label htmlFor="settings-name">Display name</label>
              <input
                id="settings-name"
                value={displayName}
                maxLength={40}
                onChange={(event) => setDisplayName(event.target.value)}
              />

              <label htmlFor="settings-avatar">Avatar letters</label>
              <input
                id="settings-avatar"
                value={avatar}
                maxLength={2}
                onChange={(event) => setAvatar(event.target.value)}
              />

              <label htmlFor="settings-pronouns">Pronouns</label>
              <input
                id="settings-pronouns"
                value={pronouns}
                maxLength={30}
                placeholder="e.g. he/him, she/her, they/them"
                onChange={(event) => setPronouns(event.target.value)}
              />

              <label htmlFor="settings-bio">About me</label>
              <textarea
                id="settings-bio"
                rows={3}
                value={bio}
                maxLength={500}
                placeholder="Tell everyone a bit about yourself…"
                onChange={(event) => setBio(event.target.value)}
              />

              <span className="field-label">Pride badges <small className="field-optional-note">Optional · up to 4</small></span>
              <div className="pride-badge-picker">
                {PRIDE_BADGES.map((badge) => {
                  const selected = prideBadges.includes(badge.id);
                  return (
                    <button
                      type="button"
                      key={badge.id}
                      className={selected ? "selected" : ""}
                      aria-pressed={selected}
                      onClick={() =>
                        setPrideBadges((currentBadges) =>
                          selected
                            ? currentBadges.filter((id) => id !== badge.id)
                            : currentBadges.length < 4
                              ? [...currentBadges, badge.id]
                              : currentBadges,
                        )
                      }
                    >
                      <span
                        className="pride-flag-swatch"
                        aria-hidden="true"
                        style={
                          {
                            "--badge-stripes": badge.colors.join(", "),
                          } as React.CSSProperties
                        }
                      />
                      {badge.label}
                      {selected && <Check size={13} />}
                    </button>
                  );
                })}
              </div>

              <span className="field-label">Profile picture</span>
              <div className="picture-row">
                <span
                  className="picture-preview"
                  style={{ background: avatarUrl ? undefined : color }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    avatar || displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <div className="picture-actions">
                  <button
                    type="button"
                    onClick={() => pictureRef.current?.click()}
                  >
                    Upload
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarUrl(null);
                        setAvatarKey(null);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={pictureRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    void choosePicture(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>

              <span className="field-label">Colour</span>
              <div className="color-row">
                {AVATAR_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`color-dot ${color === option ? "chosen" : ""}`}
                    style={{ background: option }}
                    aria-label={`Use ${option}`}
                    onClick={() => setColor(option)}
                  />
                ))}
              </div>

              <span className="field-label flex items-center justify-between" style={{ marginTop: 20 }}>
                <span className="flex items-center gap-2">
                  Custom Profile CSS
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 font-mono px-1.5 py-0.5 rounded border border-purple-500/30">
                    Scoped
                  </span>
                </span>
                <button
                  type="button"
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                  onClick={() => setShowProfileCssGuide(!showProfileCssGuide)}
                >
                  {showProfileCssGuide ? "Hide Guide" : "CSS Guide"}
                </button>
              </span>

              {showProfileCssGuide && (
                <div style={{ padding: "10px", background: "rgba(0,0,0,0.3)", borderRadius: "8px", fontSize: "11px", marginBottom: "8px", border: "1px solid var(--line)" }}>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>Available Selectors:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontFamily: "monospace", color: "var(--lavender)" }}>
                    <span>.profile-card</span>
                    <span>.profile-banner</span>
                    <span>.profile-avatar</span>
                    <span>.profile-name</span>
                    <span>.profile-bio</span>
                    <span>.profile-badge</span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>Presets:</span>
                {PROFILE_CSS_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    title={p.desc}
                    style={{ fontSize: "11px", padding: "3px 8px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", border: "1px solid var(--line)" }}
                    onClick={() => setProfileCustomCss(p.css)}
                  >
                    ✨ {p.name}
                  </button>
                ))}
                {profileCustomCss && (
                  <button
                    type="button"
                    style={{ fontSize: "11px", padding: "3px 8px", background: "rgba(239,68,68,0.15)", color: "#fca5a5", borderRadius: "6px", border: "1px solid rgba(239,68,68,0.3)" }}
                    onClick={() => setProfileCustomCss("")}
                  >
                    Clear CSS
                  </button>
                )}
              </div>

              <textarea
                rows={5}
                value={profileCustomCss}
                onChange={(e) => setProfileCustomCss(e.target.value)}
                placeholder={`.profile-card {\n  border: 1px solid var(--lavender);\n  box-shadow: 0 0 15px rgba(167, 139, 250, 0.3);\n}`}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  padding: "10px",
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  color: "var(--ink)",
                  marginBottom: "16px",
                  resize: "vertical",
                }}
                spellCheck={false}
              />

              <button type="button" className="primary" onClick={saveProfile}>
                Save profile
              </button>
            </>
          )}

          {tab === "voice" && (
            <>
              <p className="modal-hint">
                Choices are remembered on this device. Changing the microphone
                while you are in a call swaps it without dropping the call.
              </p>

              {onTableMode && (
                <>
                  <label>
                    <input type="checkbox" checked={tableMode}
                      onChange={(event) => onTableMode(event.target.checked)} />
                    Table Mode / Spatial Audio
                  </label>
                  <p className="modal-hint">Places voices around you. Best with headphones. Only changes what you hear.</p>
                  {tableMode && headTrackingOffered && setHeadTracking && (
                    <>
                      <label>
                        <input type="checkbox" checked={headTracking}
                          onChange={(event) => setHeadTracking(event.target.checked)} />
                        Follow my head (AirPods spatial audio)
                      </label>
                      <p className="modal-hint">
                        {headTrackingStatus.status === "denied"
                          ? "Motion access is off for Huddle — turn it on in System Settings › Privacy & Security › Motion & Fitness."
                          : headTracking && headTrackingStatus.status === "unsupported"
                            ? "Needs AirPods (3rd gen or later), AirPods Pro, or AirPods Max."
                            : "The table holds still while you turn your head, so looking at someone brings their voice in front of you."}
                      </p>
                      {headTracking && headTrackingStatus.live && (
                        <button type="button" onClick={recenterHead}>Face forward</button>
                      )}
                    </>
                  )}
                  {tableMode && inCall && (
                    <>
                      <label htmlFor="table-host">Dungeon Master</label>
                      <select id="table-host" value={tableParticipants.some((p) => p.connectionId === tableHostId) ? tableHostId : ""} onChange={(event) => onTableHostId?.(event.target.value)}>
                        <option value="">Automatic seats by join order</option>
                        {tableParticipants.map((person) => (
                          <option key={person.connectionId} value={person.connectionId}>{person.displayName}</option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              )}

              <label htmlFor="settings-mic">Microphone</label>
              <select
                id="settings-mic"
                value={micId}
                onChange={(event) => {
                  setMicId(event.target.value);
                  saveDevice("microphone", event.target.value);
                  void onMicrophoneChange?.();
                }}
              >
                <option value="">System default</option>
                {devices.microphones.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>

              <VoiceInput
                settings={mic}
                onChange={changeMic}
                subscribe={subscribeMicTelemetry}
                inCall={inCall}
              />

              {supportsOutputSelection() ? (
                <>
                  <label htmlFor="settings-speaker">Output</label>
                  <select
                    id="settings-speaker"
                    value={speakerId}
                    onChange={(event) => {
                      setSpeakerId(event.target.value);
                      saveDevice("speaker", event.target.value);
                    }}
                  >
                    <option value="">System default</option>
                    {devices.speakers.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p className="modal-hint">
                  This browser plays through whichever output the system
                  chooses — pick it there instead.
                </p>
              )}

              <label htmlFor="settings-camera">Camera</label>
              <select
                id="settings-camera"
                value={cameraId}
                onChange={(event) => {
                  setCameraId(event.target.value);
                  saveDevice("camera", event.target.value);
                }}
              >
                <option value="">System default</option>
                {devices.cameras.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>

              <label className="appearance-switch">
                <span>
                  <strong>Push to talk</strong>
                  <small>Transmit only while holding a key</small>
                </span>
                <input
                  type="checkbox"
                  checked={pushToTalk}
                  onChange={(event) => onPushToTalk?.(event.target.checked)}
                />
              </label>

              {pushToTalk && (
                <button
                  type="button"
                  className="ptt-key-button"
                  onClick={() => setCapturingKey(true)}
                  onKeyDown={(event) => {
                    if (!capturingKey) return;
                    event.preventDefault();
                    onPttKey?.(event.code);
                    setCapturingKey(false);
                  }}
                >
                  {capturingKey
                    ? "Press a key…"
                    : `Push-to-talk key: ${pttKey.replace(/^Key/, "")}`}
                </button>
              )}

              <span className="field-label">Shortcuts</span>
              <p className="modal-hint">
                These work while you are in a voice room, and are ignored while
                you are typing. Hold modifiers and press a key to rebind.
              </p>
              <ComboButton
                label="Toggle mute"
                combo={muteKey}
                onChange={(combo) => onMuteKey?.(combo)}
              />
              <ComboButton
                label="Toggle deafen"
                combo={deafenKey}
                onChange={(combo) => onDeafenKey?.(combo)}
              />
            </>
          )}

          {tab === "password" && (
            <>
              <label htmlFor="settings-current">Current password</label>
              <input
                id="settings-current"
                type="password"
                value={current}
                autoComplete="current-password"
                onChange={(event) => setCurrent(event.target.value)}
              />
              <label htmlFor="settings-next">New password</label>
              <input
                id="settings-next"
                type="password"
                value={next}
                autoComplete="new-password"
                onChange={(event) => setNext(event.target.value)}
              />
              <button
                type="button"
                className="primary"
                onClick={savePassword}
                disabled={!current || !next}
              >
                Change password
              </button>
            </>
          )}

          {tab === "invites" && (
            <>
              <p className="modal-hint">
                Anyone with a code can create an account here. Every member sees
                every server automatically.
              </p>
              <button type="button" className="primary" onClick={createInvite}>
                Create an invite code
              </button>
              <ul className="invite-list">
                {invites.map((invite) => (
                  <li key={invite.code}>
                    <code>{invite.code}</code>
                    <span>
                      {invite.revoked
                        ? "revoked"
                        : invite.spent
                          ? "used"
                          : `${invite.uses}/${invite.maxUses || "∞"} used`}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(invite.code)}
                    >
                      Copy
                    </button>
                    {!invite.revoked && !invite.spent && (
                      <button
                        type="button"
                        onClick={() => revokeInvite(invite.code)}
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
                {!invites.length && (
                  <li className="empty">No codes yet.</li>
                )}
              </ul>

              {user.isAdmin && (
                <div
                  className="invite-permissions-container"
                  style={{
                    marginTop: "24px",
                    paddingTop: "20px",
                    borderTop: "1px solid #41434f",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#fff",
                      marginBottom: "4px",
                    }}
                  >
                    Invite Creation Permissions
                  </h3>
                  <p className="modal-hint" style={{ marginBottom: "12px" }}>
                    Only you (the first created user/owner) and selected members can
                    create invite codes. Choose who else is authorized to create
                    invites below.
                  </p>
                  <input
                    type="text"
                    placeholder="Filter members by name..."
                    value={permissionSearch}
                    onChange={(e) => setPermissionSearch(e.target.value)}
                    style={{ marginBottom: "12px", width: "100%" }}
                  />
                  <div
                    style={{
                      maxHeight: "220px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {permissionUsers
                      .filter((u) => {
                        if (!permissionSearch) return true;
                        const term = permissionSearch.toLowerCase();
                        return (
                          u.displayName.toLowerCase().includes(term) ||
                          u.username.toLowerCase().includes(term)
                        );
                      })
                      .map((u) => (
                        <div
                          key={u.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            background: "rgba(255, 255, 255, 0.04)",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.06)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                            }}
                          >
                            <Avatar
                              avatar={u.avatar}
                              avatarUrl={u.avatarUrl}
                              color={u.color}
                              size={28}
                            />
                            <div>
                              <span
                                style={{
                                  fontWeight: 500,
                                  color: "#fff",
                                  fontSize: "13px",
                                }}
                              >
                                {u.displayName}
                              </span>{" "}
                              <span
                                style={{
                                  color: "var(--muted)",
                                  fontSize: "12px",
                                }}
                              >
                                @{u.username}
                              </span>
                            </div>
                          </div>

                          {u.isAdmin ? (
                            <span
                              style={{
                                fontSize: "11px",
                                padding: "3px 8px",
                                borderRadius: "4px",
                                background: "rgba(235, 185, 50, 0.15)",
                                color: "#ffd67c",
                                fontWeight: 600,
                              }}
                            >
                              Owner (Always Allowed)
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void toggleInvitePermission(u.id, u.canInvite)
                              }
                              disabled={updatingPermission === u.id}
                              style={{
                                fontSize: "12px",
                                padding: "4px 12px",
                                borderRadius: "6px",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                background: u.canInvite
                                  ? "rgba(87, 242, 135, 0.2)"
                                  : "rgba(255, 255, 255, 0.08)",
                                color: u.canInvite ? "#57f287" : "#aaaeba",
                                border: u.canInvite
                                  ? "1px solid rgba(87, 242, 135, 0.4)"
                                  : "1px solid #4b4d5b",
                              }}
                            >
                              {updatingPermission === u.id
                                ? "Updating…"
                                : u.canInvite
                                  ? "✓ Can Invite"
                                  : "+ Allow Invite"}
                            </button>
                          )}
                        </div>
                      ))}
                    {permissionUsers.length === 0 && (
                      <p className="modal-hint" style={{ textAlign: "center" }}>
                        Loading members…
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "appearance" && (
            <>
              {/* Theme Manager Header */}
              <div className="flex items-center justify-between mt-1 mb-3">
                <span className="field-label" style={{ margin: 0 }}>Themes & Styling</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="discord-btn primary-indigo text-xs py-1 px-2.5 flex items-center gap-1.5"
                    onClick={() => handleOpenCreateTheme()}
                  >
                    <Plus size={14} /> Create Theme
                  </button>
                  <button
                    type="button"
                    className="discord-btn secondary-gray text-xs py-1 px-2.5 flex items-center gap-1.5"
                    onClick={() => {
                      setImportCodeInput("");
                      setImportError("");
                      setImportParsedTheme(null);
                      setIsImportingTheme(true);
                    }}
                  >
                    <Download size={14} /> Import
                  </button>
                </div>
              </div>

              {themeActionNotice && (
                <div className="mb-3 p-2.5 bg-indigo-950/60 border border-indigo-500/40 rounded-lg text-xs text-indigo-200 flex items-center gap-2">
                  <Sparkles size={14} className="text-indigo-400 flex-shrink-0" />
                  <span>{themeActionNotice}</span>
                </div>
              )}

              {/* Subtabs: Installed vs Community */}
              <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
                <button
                  type="button"
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${appearanceSubtab === "installed" ? "bg-white/15 text-white" : "text-gray-400 hover:text-gray-200"}`}
                  onClick={() => setAppearanceSubtab("installed")}
                >
                  Installed Themes ({BUILTIN_THEMES.length + customThemes.length})
                </button>
                <button
                  type="button"
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${appearanceSubtab === "community" ? "bg-white/15 text-white" : "text-gray-400 hover:text-gray-200"}`}
                  onClick={() => setAppearanceSubtab("community")}
                >
                  <Globe size={13} /> Community Library
                </button>
              </div>

              {appearanceSubtab === "installed" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-5">
                  {[...BUILTIN_THEMES, ...customThemes].map((th) => {
                    const isActive = activeThemeId === th.id || (theme === th.id);
                    const colors = th.colors || {};
                    const isShareOpen = themeShareMenuId === th.id;

                    return (
                      <div
                        key={th.id}
                        className={`p-3 rounded-xl border transition-all ${isActive ? "bg-purple-950/20 border-purple-500 shadow-md ring-1 ring-purple-500/40" : "bg-black/30 border-white/10 hover:border-white/20"}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-white">{th.name}</span>
                              {th.isBuiltin && (
                                <span className="text-[9px] uppercase px-1.5 py-0.2 bg-white/10 text-gray-300 rounded">
                                  Default
                                </span>
                              )}
                              {th.customCss && (
                                <span className="text-[9px] px-1.5 py-0.2 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded font-mono">
                                  CSS
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">
                              {th.description || `Base: ${th.baseTheme}`}
                            </div>
                          </div>

                          <div className="relative">
                            <button
                              type="button"
                              title="Share Theme"
                              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                              onClick={() => setThemeShareMenuId(isShareOpen ? null : th.id)}
                            >
                              <Share2 size={13} />
                            </button>

                            {isShareOpen && (
                              <div
                                className="absolute right-0 top-6 z-50 w-44 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 text-xs text-gray-200"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-1.5 hover:bg-indigo-600 hover:text-white flex items-center gap-2"
                                  onClick={() => {
                                    void handleShareThemeCode(th);
                                    setThemeShareMenuId(null);
                                  }}
                                >
                                  <Copy size={13} />
                                  {themeCopiedId === th.id ? "Copied Code!" : "Copy Share Code"}
                                </button>
                                {onShareThemeToChat && (
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 hover:bg-indigo-600 hover:text-white flex items-center gap-2"
                                    onClick={() => {
                                      handleShareThemeChat(th);
                                      setThemeShareMenuId(null);
                                    }}
                                  >
                                    <Sparkles size={13} /> Share to Chat
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-1.5 hover:bg-indigo-600 hover:text-white flex items-center gap-2"
                                  onClick={() => {
                                    void handlePublishTheme(th);
                                    setThemeShareMenuId(null);
                                  }}
                                >
                                  <Globe size={13} /> Publish to Library
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Palette swatches */}
                        <div className="flex items-center gap-1.5 my-2">
                          {[colors.paper, colors.panel, colors.chatBg, colors.lavender, colors.coral, colors.mint].filter(Boolean).map((col, idx) => (
                            <span
                              key={idx}
                              className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                              style={{ background: col }}
                            />
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-white/5">
                          <div className="flex items-center gap-1.5">
                            {!th.isBuiltin && (
                              <>
                                <button
                                  type="button"
                                  className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5"
                                  onClick={() => handleOpenCreateTheme(th)}
                                  title="Edit Theme"
                                >
                                  <Edit3 size={11} /> Edit
                                </button>
                                <button
                                  type="button"
                                  className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-red-950/30"
                                  onClick={() => handleDeleteCustomTheme(th.id)}
                                  title="Delete Theme"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            className={`text-xs px-2.5 py-1 rounded font-medium transition-all ${isActive ? "bg-purple-600 text-white shadow" : "bg-white/10 hover:bg-white/20 text-gray-200"}`}
                            onClick={() => handleSelectTheme(th)}
                          >
                            {isActive ? "✓ Active" : "Apply"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {appearanceSubtab === "community" && (
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      className="discord-text-input text-xs flex-1"
                      placeholder="Search community themes..."
                      value={themeSearchQuery}
                      onChange={(e) => setThemeSearchQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      className="discord-btn secondary-gray text-xs whitespace-nowrap"
                      onClick={() => void loadCommunityThemes(themeSearchQuery)}
                    >
                      Search
                    </button>
                  </div>

                  {communityLoading ? (
                    <div className="text-center py-6 text-xs text-gray-400">Loading community themes…</div>
                  ) : communityThemes.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-400 bg-black/20 rounded-lg border border-white/5">
                      No community themes found yet. Be the first to share one!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {communityThemes.map((th) => {
                        const colors = th.colors || {};

                        return (
                          <div
                            key={th.id}
                            className="p-3 rounded-xl border bg-black/30 border-white/10 hover:border-white/20 transition-all flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-xs text-white">{th.name}</span>
                                <span className="text-[10px] text-gray-400">
                                  by {th.author?.displayName || "Member"}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 line-clamp-1 mt-1">
                                {th.description || `Base: ${th.baseTheme}`}
                              </p>

                              <div className="flex items-center gap-1.5 my-2">
                                {[colors.paper, colors.panel, colors.chatBg, colors.lavender, colors.coral, colors.mint].filter(Boolean).map((col, idx) => (
                                  <span
                                    key={idx}
                                    className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                                    style={{ background: col }}
                                  />
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                              <button
                                type="button"
                                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                                onClick={() => void handleShareThemeCode(th)}
                              >
                                <Copy size={12} /> Copy Code
                              </button>

                              <button
                                type="button"
                                className="discord-btn primary-indigo text-xs py-1 px-2.5 flex items-center gap-1"
                                onClick={() => {
                                  saveCustomTheme(th);
                                  setCustomThemes(getStoredThemes());
                                  handleSelectTheme(th);
                                  setThemeActionNotice(`Installed & applied "${th.name}"!`);
                                  setTimeout(() => setThemeActionNotice(""), 3500);
                                }}
                              >
                                <Download size={12} /> Install & Apply
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <span className="field-label">Accent colour</span>
              <div className="accent-picker-row">
                {["#9d8cf5", "#68a8ff", "#49c99a", "#ff8b72", "#f3bd5d", "#e57bd8"].map(
                  (option) => (
                    <button
                      type="button"
                      key={option}
                      aria-label={`Use accent ${option}`}
                      className={accent === option ? "active" : ""}
                      style={{ background: option }}
                      onClick={() => setAccent(option)}
                    />
                  ),
                )}
                <input
                  type="color"
                  value={accent}
                  aria-label="Custom accent colour"
                  onChange={(event) => setAccent(event.target.value)}
                />
              </div>

              <span className="field-label">Pride palette</span>
              <div className="pride-theme-row">
                {([
                  ["off", "Classic"],
                  ["trans", "Trans"],
                  ["pride", "Pride"],
                  ["nonbinary", "Nonbinary"],
                ] as const).map(([option, label]) => (
                  <button
                    type="button"
                    key={option}
                    className={`${option} ${prideTheme === option ? "active" : ""}`}
                    onClick={() => setPrideTheme(option)}
                  >
                    <span className="pride-theme-swatch" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>

              <span className="field-label">3D Dice Style</span>
              <div className="dice-theme-row">
                {([
                  ["default", "Solid Colour"],
                  ["pride", "Pride 🏳️‍🌈"],
                  ["trans", "Trans 🏳️‍⚧️"],
                  ["nonbinary", "Nonbinary 💛"],
                ] as const).map(([option, label]) => (
                  <button
                    type="button"
                    key={option}
                    className={`${option} ${diceTheme === option ? "active" : ""}`}
                    onClick={() => setDiceTheme(option)}
                  >
                    <span className="dice-theme-swatch" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>

              {diceTheme === "default" && (
                <>
                  <span className="field-label">Dice Colour</span>
                  <div className="accent-picker-row">
                    {[
                      "#2563eb", // Classic Blue
                      "#0284c7", // Sky Blue
                      "#6366f1", // Indigo
                      "#7c3aed", // Violet
                      "#db2777", // Pink
                      "#e11d48", // Crimson Red
                      "#059669", // Emerald Green
                      "#d97706", // Amber Gold
                      "#1e293b", // Slate Dark
                    ].map((col) => (
                      <button
                        type="button"
                        key={col}
                        aria-label={`Use dice colour ${col}`}
                        className={diceColor === col ? "active" : ""}
                        style={{ background: col }}
                        onClick={() => setDiceColor(col)}
                      />
                    ))}
                    <input
                      type="color"
                      value={diceColor}
                      aria-label="Custom dice colour"
                      onChange={(event) => setDiceColor(event.target.value)}
                    />
                  </div>
                </>
              )}

              <div style={{ marginTop: "10px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  className="dice-test-btn"
                  onClick={() => {
                    setTestRoll({
                      expression: "1d20",
                      dice: [{ sides: 20, rolls: [{ value: 20, kept: true }], sign: 1 }],
                      modifier: 0,
                      total: 20,
                      roller: { id: "preview", displayName: "You" },
                      rollType: "normal",
                      animationSeed: String(Date.now()),
                      theme: diceTheme,
                      themeColor: diceColor,
                    });
                  }}
                >
                  🎲 Roll Test d20
                </button>
                <small style={{ color: "var(--muted, #888)", fontSize: "12px" }}>
                  Preview your 3D dice landing on 20
                </small>
              </div>

              <span className="field-label">Message spacing</span>
              <div className="appearance-choice-row">
                {(["compact", "cozy", "roomy"] as const).map((option) => (
                  <button
                    type="button"
                    className={density === option ? "active" : ""}
                    key={option}
                    onClick={() => setDensity(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <span className="field-label">Chat backdrop</span>
              <div className="appearance-choice-row">
                {(["plain", "aurora", "dots"] as const).map((option) => (
                  <button
                    type="button"
                    className={backdrop === option ? "active" : ""}
                    key={option}
                    onClick={() => setBackdrop(option)}
                  >
                    {option === "aurora" ? "Purple + green" : option}
                  </button>
                ))}
              </div>

              <label className="appearance-range">
                <span>Corner roundness <b>{corners}px</b></span>
                <input
                  type="range"
                  min={4}
                  max={28}
                  value={corners}
                  onChange={(event) => setCorners(Number(event.target.value))}
                />
              </label>

              <label className="appearance-switch">
                <span>
                  <strong>Interface motion</strong>
                  <small>Animations and smooth scrolling</small>
                </span>
                <input
                  type="checkbox"
                  checked={motion}
                  onChange={(event) => setMotion(event.target.checked)}
                />
              </label>

              <label className="appearance-switch cute-appearance-switch">
                <span>
                  <strong className="inline-flex items-center gap-1.5">Cozy Hoffle <Sparkles size={14} /></strong>
                  <small>Room pet, sparkles, tiny charms, and celebrations</small>
                </span>
                <input
                  type="checkbox"
                  checked={cute}
                  onChange={(event) => setCute(event.target.checked)}
                />
              </label>

              <label className="appearance-switch blahaj-appearance-switch">
                <span>
                  <strong className="inline-flex items-center gap-1.5">Blåhaj buddy <Fish size={14} /></strong>
                  <small>A small, decorative shark friend who hangs out by the chat</small>
                </span>
                <input
                  type="checkbox"
                  checked={blahaj}
                  onChange={(event) => setBlahaj(event.target.checked)}
                />
              </label>

              <label className="appearance-switch">
                <span>
                  <strong>Desktop notifications</strong>
                  <small>Ping when someone @mentions you</small>
                </span>
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(event) => {
                    const on = event.target.checked;
                    setNotify(on);
                    window.localStorage.setItem(
                      "huddle-notify",
                      on ? "on" : "off",
                    );
                    if (on && typeof Notification !== "undefined") {
                      void Notification.requestPermission();
                    }
                  }}
                />
              </label>
            </>
          )}

          {tab === "activities" && (
            <div className="space-y-4">
              <label className="appearance-switch">
                <span>
                  <strong>Display current activity as a status message</strong>
                  <small>Hoffle will automatically update your profile status when you play a game or listen to Spotify</small>
                </span>
                <input
                  type="checkbox"
                  checked={activityShare}
                  onChange={(e) => setActivityShare(e.target.checked)}
                />
              </label>

              <label className="appearance-switch">
                <span>
                  <strong>Share Spotify / Music Listening</strong>
                  <small>Show live Spotify song titles, artists, and album art on your profile card automatically</small>
                </span>
                <input
                  type="checkbox"
                  checked={spotifyShare}
                  onChange={(e) => setSpotifyShare(e.target.checked)}
                />
              </label>

              {spotifyShare && (
                <div className="bg-green-950/20 border border-green-500/30 p-3 rounded-lg space-y-3 mt-2">
                  <h4 className="text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                    <Activity size={14} /> SPOTIFY REAL-TIME TRACK SYNC
                  </h4>

                  <div>
                    <label className="text-xs text-gray-300 block mb-1">
                      Spotify / Last.fm Account Sync (Automatic Scrobbler)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="discord-text-input text-xs"
                        placeholder="Enter Spotify / Last.fm username..."
                        value={spotifyUserInput}
                        onChange={(e) => setSpotifyUserInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="discord-btn primary-indigo text-xs whitespace-nowrap"
                        onClick={async () => {
                          if (!spotifyUserInput.trim()) return;
                          try {
                            const un = spotifyUserInput.trim();
                            if (typeof window !== "undefined") {
                              window.localStorage.setItem("huddle-spotify-username", un);
                            }
                            const resp = await fetch(`/hangout/api/integrations/spotify?username=${encodeURIComponent(un)}`);
                            const res = await resp.json() as { song?: string; artist?: string; albumArt?: string; error?: string; message?: string; isPlaying?: boolean };
                            if (res.error) {
                              setError(res.error);
                            } else if (res.song && res.isPlaying) {
                              const act = { song: res.song, artist: res.artist || "Spotify", albumArt: res.albumArt, isPlaying: true };
                              await apiFetch("/api/settings/profile", {
                                method: "PATCH",
                                body: JSON.stringify({ spotifyActivity: act }),
                              });
                              setStatus(`Now playing: ${res.song} by ${res.artist}`);
                              onUser({ ...user, spotifyActivity: act });
                            } else {
                              await apiFetch("/api/settings/profile", {
                                method: "PATCH",
                                body: JSON.stringify({ spotifyActivity: null }),
                              });
                              onUser({ ...user, spotifyActivity: null });
                              setStatus(res.message || "Connected! Nothing is playing right now; checking every 10 seconds.");
                            }
                          } catch (err) {
                            setError(`Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`);
                          }
                        }}
                      >
                        Connect & Sync
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-300 block mb-1">
                      Paste Spotify Song Link / Search Track
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="discord-text-input text-xs"
                        placeholder="Paste Spotify link (https://open.spotify.com/track/...) or search song title..."
                        value={trackSearchInput}
                        onChange={(e) => setTrackSearchInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="discord-btn secondary-gray text-xs whitespace-nowrap"
                        onClick={async () => {
                          if (!trackSearchInput.trim()) return;
                          try {
                            const res = await apiFetch<{ song?: string; artist?: string; albumArt?: string }>(
                              `/api/integrations/spotify?track=${encodeURIComponent(trackSearchInput.trim())}`
                            );
                            if (res.song) {
                              const act = { song: res.song, artist: res.artist || "Spotify", albumArt: res.albumArt, isPlaying: true };
                              await apiFetch("/api/settings/profile", {
                                method: "PATCH",
                                body: JSON.stringify({ spotifyActivity: act }),
                              });
                              onUser({ ...user, spotifyActivity: act });
                              setStatus(`Now playing: ${res.song} by ${res.artist}`);
                            }
                          } catch {
                            setError("Track search failed.");
                          }
                        }}
                      >
                        Set Song
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <label className="appearance-switch">
                <span>
                  <strong>Share Desktop Games & App Activity</strong>
                  <small>Display detected active desktop apps, games, or coding sessions</small>
                </span>
                <input
                  type="checkbox"
                  checked={appShare}
                  onChange={(e) => setAppShare(e.target.checked)}
                />
              </label>

              <div className="border-t border-white/10 pt-4 mt-4">
                <h4 className="text-xs font-bold text-gray-300 uppercase mb-3">
                  DETECTED APPLICATIONS & CURRENT ACTIVITY
                </h4>
                
                <div className="space-y-2">
                  {detectedApps.map((app) => (
                    <div
                      key={app.id}
                      className="bg-black/30 p-3 rounded-lg border border-white/10 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">{app.name}</span>
                          {currentAppId === app.id && (
                            <span className="text-[10px] bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded-full font-bold">
                              ACTIVE NOW
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{app.details}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="discord-btn secondary-gray text-xs py-1 px-2.5"
                          onClick={() => {
                            const newName = window.prompt("Correct / Edit Activity Name:", app.name);
                            if (newName && newName.trim()) {
                              setDetectedApps((prev) =>
                                prev.map((a) => (a.id === app.id ? { ...a, name: newName.trim() } : a))
                              );
                            }
                          }}
                        >
                          Edit / Correct
                        </button>

                        {currentAppId !== app.id && (
                          <button
                            type="button"
                            className="discord-btn primary-indigo text-xs py-1 px-2.5"
                            onClick={() => setCurrentAppId(app.id)}
                          >
                            Set Active
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "custom_ui_css" && (
            <div className="space-y-6">
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div>
                    <h3 className="text-base font-bold text-white">Enable Client UI Custom CSS</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Injects your personal custom CSS rules across your entire client interface (client-side only).
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={clientUiCssEnabled}
                      onChange={(e) => {
                        handleSaveClientUiCss(clientUiCss, e.target.checked);
                      }}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-300">Quick Presets:</span>
                    {clientUiNotice && (
                      <span className="text-xs text-emerald-400 font-medium animate-pulse">{clientUiNotice}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {CLIENT_UI_CSS_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all group"
                        onClick={() => {
                          handleSaveClientUiCss(preset.css, true);
                        }}
                      >
                        <div className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">
                          ✨ {preset.name}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1 line-clamp-2">
                          {preset.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-300">CSS Code Editor:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-xs text-gray-300 hover:text-white px-2.5 py-1 rounded bg-white/5 border border-white/10"
                        onClick={() => {
                          void navigator.clipboard.writeText(clientUiCss);
                          setClientUiNotice("CSS copied to clipboard!");
                          setTimeout(() => setClientUiNotice(""), 2000);
                        }}
                      >
                        Copy CSS
                      </button>
                      <button
                        type="button"
                        className="text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20"
                        onClick={() => handleSaveClientUiCss("", false)}
                      >
                        Clear CSS
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={12}
                    value={clientUiCss}
                    onChange={(e) => {
                      const next = e.target.value;
                      setLocalClientUiCss(next);
                      setClientUiCss(next, clientUiCssEnabled);
                    }}
                    placeholder={`/* Write custom CSS to style the Huddle interface (personal to this client) */\n:root {\n  --lavender: #a78bfa !important;\n}\n.sidebar {\n  backdrop-filter: blur(14px) !important;\n}`}
                    className="w-full font-mono text-xs p-3 rounded-lg bg-black/40 border border-white/10 text-gray-200 focus:outline-none focus:border-indigo-500"
                    style={{ resize: "vertical", minHeight: 220 }}
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[11px] text-gray-400">
                      Target selectors: <code className="text-indigo-300">.sidebar</code>, <code className="text-indigo-300">.chat-panel</code>, <code className="text-indigo-300">.message</code>, <code className="text-indigo-300">.composer</code>, <code className="text-indigo-300">.member-panel</code>
                    </p>
                    <button
                      type="button"
                      className="primary px-4 py-1.5 rounded-lg text-xs font-semibold"
                      onClick={() => handleSaveClientUiCss(clientUiCss, true)}
                    >
                      Save & Apply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "accessibility" && (
            <div className="space-y-6">
              {/* Live Chat Preview Card matching Screenshot 5 */}
              <div className="settings-preview-box">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Preview</div>
                <div className="bg-[#1e1f22] border border-white/10 rounded-xl p-4 space-y-3">
                  {/* Message 1 */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shrink-0">
                      {avatar || "K"}
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-pink-400" style={{ fontSize: `${chatFontSize}px` }}>{displayName || "kivu"}</span>
                        <span className="text-[10px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded-full border border-pink-500/30 flex items-center gap-1">
                          ❤️ LGBT
                        </span>
                        <span className="text-[11px] text-gray-400">14:48</span>
                      </div>
                      <p className="text-gray-200" style={{ fontSize: `${chatFontSize}px` }}>
                        what happened to all the beans
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="inline-flex items-center gap-1 text-xs bg-indigo-950/60 border border-indigo-500/40 rounded px-2 py-0.5 text-indigo-300">
                          🫐 3
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs bg-white/5 border border-white/10 rounded px-2 py-0.5 text-gray-300">
                          🧱 1
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Message 2 */}
                  <div className="flex items-start gap-3 pt-1">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shrink-0">
                      {avatar || "K"}
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-pink-400" style={{ fontSize: `${chatFontSize}px` }}>{displayName || "kivu"}</span>
                        <span className="text-[10px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded-full border border-pink-500/30 flex items-center gap-1">
                          ❤️ LGBT
                        </span>
                        <span className="text-[11px] text-gray-400">14:48</span>
                      </div>
                      <div className="text-gray-200 flex items-center justify-between" style={{ fontSize: `${chatFontSize}px` }}>
                        <span>
                          here's a link{" "}
                          <a
                            href="#preview"
                            className={`text-indigo-400 hover:text-indigo-300 ${alwaysUnderlineLinks ? "underline" : "hover:underline"}`}
                            onClick={(e) => e.preventDefault()}
                          >
                            https://huddle.app/accessibility
                          </a>
                        </span>
                        <button
                          type="button"
                          className="primary text-xs px-3 py-1.5 rounded-lg shrink-0 ml-4 font-semibold"
                          onClick={(e) => e.preventDefault()}
                        >
                          Example Button
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Text Readability Section */}
              <div className="space-y-4 pt-2">
                <h3 className="text-base font-bold text-white">Text Readability</h3>

                <div>
                  <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                    <span>Text size in chat</span>
                    <span className="font-bold text-indigo-400">{chatFontSize}px</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">Adjust the size of the chat font.</p>

                  {/* Labeled tick slider matching Discord Screenshot 5 */}
                  <div className="relative pt-1 pb-4">
                    <input
                      type="range"
                      min={12}
                      max={24}
                      step={1}
                      value={chatFontSize}
                      onChange={(e) => setChatFontSize(Number(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <div className="flex justify-between text-[11px] text-gray-400 mt-2 px-1">
                      <span className={chatFontSize === 12 ? "text-indigo-400 font-bold" : ""}>12px</span>
                      <span className={chatFontSize === 14 ? "text-indigo-400 font-bold" : ""}>14px</span>
                      <span className={chatFontSize === 15 ? "text-indigo-400 font-bold" : ""}>15px</span>
                      <span className={chatFontSize === 16 ? "text-indigo-400 font-bold" : ""}>16px</span>
                      <span className={chatFontSize === 18 ? "text-indigo-400 font-bold" : ""}>18px</span>
                      <span className={chatFontSize === 20 ? "text-indigo-400 font-bold" : ""}>20px</span>
                      <span className={chatFontSize === 24 ? "text-indigo-400 font-bold" : ""}>24px</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-t border-white/10">
                  <div>
                    <div className="text-sm font-semibold text-white">Always underline links</div>
                    <div className="text-xs text-gray-400">Make links stand out more across messages.</div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={alwaysUnderlineLinks}
                      onChange={(e) => setAlwaysUnderlineLinks(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="flex items-center justify-between py-3 border-t border-white/10">
                  <div>
                    <div className="text-sm font-semibold text-white">Display Name Styles</div>
                    <div className="text-xs text-gray-400">Enable display name styles — including font, effect, and color — across Huddle.</div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={displayNameStyles}
                      onChange={(e) => setDisplayNameStyles(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="flex items-center justify-between py-3 border-t border-white/10">
                  <div>
                    <div className="text-sm font-semibold text-white">Interface motion</div>
                    <div className="text-xs text-gray-400">Smooth scrolling and interface micro-animations.</div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={motion}
                      onChange={(e) => setMotion(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {tab === "roles" && server && (
            <RolesTab server={server} members={members} onError={setError} />
          )}

          {tab === "licenses" && <LicensesTab />}

          {error && <p className="auth-error">{error}</p>}
          {status && <p className="modal-status">{status}</p>}
          </div>
        </main>
      </div>
      {testRoll && (
        <DiceOverlay
          roll={testRoll}
          onDone={() => setTestRoll(null)}
        />
      )}

      {/* Theme Creator / Editor Modal */}
      {isCreatingTheme && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsCreatingTheme(false)}
        >
          <div
            className="modal-window"
            style={{ width: 680, maxWidth: "94vw", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h2>{editingThemeId ? "Edit Custom Theme" : "Create New Theme"}</h2>
              <button
                type="button"
                className="profile-close"
                onClick={() => setIsCreatingTheme(false)}
                aria-label="Close modal"
              >
                ×
              </button>
            </header>

            <div className="modal-body" style={{ overflowY: "auto", flex: 1, padding: "16px 20px" }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="theme-name-input">Theme Name</label>
                  <input
                    id="theme-name-input"
                    value={draftName}
                    maxLength={50}
                    placeholder="e.g. Neon Cyberpunk"
                    onChange={(e) => setDraftName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="theme-desc-input">Description</label>
                  <input
                    id="theme-desc-input"
                    value={draftDesc}
                    maxLength={140}
                    placeholder="Short summary of this theme..."
                    onChange={(e) => setDraftDesc(e.target.value)}
                  />
                </div>
              </div>

              <span className="field-label">Base Style Foundation</span>
              <div className="theme-row mb-4">
                {(["cozy", "legacy", "light"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    className={`flex items-center gap-1.5 justify-center ${draftBaseTheme === b ? "active" : ""}`}
                    onClick={() => setDraftBaseTheme(b)}
                  >
                    {b === "cozy" ? "✨ Cozy" : b === "legacy" ? "🌙 Legacy" : "☀️ Light"}
                  </button>
                ))}
              </div>

              <span className="field-label">Color Palette</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
                {[
                  { key: "paper", label: "App Background", fallback: "#16131f" },
                  { key: "panel", label: "Sidebars / Panels", fallback: "#1a1628" },
                  { key: "chatBg", label: "Chat Area", fallback: "#1e1a2e" },
                  { key: "lavender", label: "Primary Accent", fallback: "#a78bfa" },
                  { key: "lavenderSoft", label: "Secondary Accent", fallback: "#2e2750" },
                  { key: "ink", label: "Text Color", fallback: "#e8e3f5" },
                  { key: "muted", label: "Muted Text", fallback: "#9d95bc" },
                  { key: "line", label: "Borders / Lines", fallback: "rgba(255,255,255,0.1)" },
                ].map(({ key, label, fallback }) => (
                  <div key={key} className="p-2 rounded-lg bg-black/30 border border-white/10 flex flex-col gap-1">
                    <span className="text-[11px] text-gray-400 font-medium">{label}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={draftColors[key as keyof ThemeColors] || fallback}
                        className="w-7 h-7 rounded border-none cursor-pointer p-0 bg-transparent flex-shrink-0"
                        onChange={(e) =>
                          setDraftColors((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                      <input
                        type="text"
                        value={draftColors[key as keyof ThemeColors] || fallback}
                        className="text-xs font-mono bg-black/40 border border-white/10 rounded px-1.5 py-0.5 w-full text-gray-200"
                        onChange={(e) =>
                          setDraftColors((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="appearance-range">
                    <span>Corner Roundness: <b>{draftCorners}px</b></span>
                    <input
                      type="range"
                      min={4}
                      max={28}
                      value={draftCorners}
                      onChange={(e) => setDraftCorners(Number(e.target.value))}
                    />
                  </label>
                </div>
                <div>
                  <span className="field-label" style={{ marginTop: 0 }}>Chat Backdrop</span>
                  <div className="appearance-choice-row">
                    {(["plain", "aurora", "dots", "grid", "stars"] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        className={draftBackdrop === b ? "active" : ""}
                        onClick={() => setDraftBackdrop(b)}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Theme Custom CSS */}
              <div className="border-t border-white/10 pt-3 mt-3">
                <span className="field-label flex items-center justify-between" style={{ marginTop: 0 }}>
                  <span className="flex items-center gap-2">
                    Custom UI CSS
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 font-mono px-1.5 py-0.5 rounded border border-purple-500/30">
                      Optional
                    </span>
                  </span>
                </span>
                <p className="modal-hint" style={{ marginTop: 2, marginBottom: 8 }}>
                  Write custom CSS rules targeting app UI elements (.rail, .sidebar, .chat-panel, .message, .composer).
                </p>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="text-xs text-gray-400 self-center mr-1">Insert Preset:</span>
                  {THEME_CSS_PRESETS.map((p: { name: string; desc: string; css: string }) => (
                    <button
                      key={p.name}
                      type="button"
                      title={p.desc}
                      className="text-xs bg-white/5 hover:bg-white/10 text-gray-200 px-2 py-0.5 rounded border border-white/10 transition-colors"
                      onClick={() =>
                        setDraftCustomCss((prev) => (prev ? `${prev}\n\n${p.css}` : p.css))
                      }
                    >
                      + {p.name}
                    </button>
                  ))}
                  {draftCustomCss && (
                    <button
                      type="button"
                      className="text-xs bg-red-950/40 hover:bg-red-900/60 text-red-300 px-2 py-0.5 rounded border border-red-800/40 transition-colors"
                      onClick={() => setDraftCustomCss("")}
                    >
                      Clear CSS
                    </button>
                  )}
                </div>

                <textarea
                  rows={5}
                  value={draftCustomCss}
                  onChange={(e) => setDraftCustomCss(e.target.value)}
                  placeholder={`/* Custom UI styling */\n.active-space { box-shadow: 0 0 14px var(--lavender); }\n.composer { border: 1px solid var(--line); }`}
                  style={{
                    width: "100%",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    padding: "10px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--line)",
                    borderRadius: "8px",
                    color: "var(--ink)",
                    resize: "vertical",
                  }}
                  spellCheck={false}
                />
              </div>

              <div className="mt-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={draftIsPublic}
                    onChange={(e) => setDraftIsPublic(e.target.checked)}
                  />
                  <span>Publish to Community Themes Library so others can discover & install it</span>
                </label>
              </div>
            </div>

            <footer className="modal-foot">
              <button
                type="button"
                className="secondary"
                onClick={() => setIsCreatingTheme(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleSaveDraftTheme}
              >
                Save & Apply Theme
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Import Theme Modal */}
      {isImportingTheme && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsImportingTheme(false)}
        >
          <div
            className="modal-window"
            style={{ width: 480, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h2>Import Theme</h2>
              <button
                type="button"
                className="profile-close"
                onClick={() => setIsImportingTheme(false)}
                aria-label="Close modal"
              >
                ×
              </button>
            </header>

            <div className="modal-body" style={{ padding: "16px 20px" }}>
              <p className="modal-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                Paste a theme share code (starting with <code>huddle-theme:v1:</code>) or theme JSON:
              </p>

              <textarea
                rows={4}
                value={importCodeInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setImportCodeInput(val);
                  const parsed = importThemeCode(val);
                  setImportParsedTheme(parsed);
                  setImportError(parsed ? "" : val.trim() ? "Invalid theme code" : "");
                }}
                placeholder="huddle-theme:v1:eyJpZCI6..."
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  padding: "10px",
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  color: "var(--ink)",
                  resize: "vertical",
                }}
                spellCheck={false}
              />

              {importError && (
                <p className="auth-error" style={{ marginTop: 8, marginBottom: 0 }}>
                  {importError}
                </p>
              )}

              {importParsedTheme && (
                <div className="mt-3 p-3 bg-purple-950/20 border border-purple-500/40 rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-white">{importParsedTheme.name}</strong>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">
                      {importParsedTheme.baseTheme}
                    </span>
                  </div>
                  {importParsedTheme.description && (
                    <p className="text-xs text-gray-400 mt-1">{importParsedTheme.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    {Object.values(importParsedTheme.colors || {}).filter(Boolean).map((c, i) => (
                      <span
                        key={i}
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <footer className="modal-foot">
              <button
                type="button"
                className="secondary"
                onClick={() => setIsImportingTheme(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!importParsedTheme}
                onClick={handleImportTheme}
              >
                Install & Apply
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A button that records the next key combination pressed. Modifier-only
 * presses are ignored so you can hold Ctrl+Shift before choosing the letter,
 * and Escape cancels without changing anything.
 */
function ComboButton({
  label,
  combo,
  onChange,
}: {
  label: string;
  combo: string;
  onChange: (combo: string) => void;
}) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setListening(false);
        return;
      }
      if (isModifierOnly(event.code)) return;
      onChange(comboFromEvent(event));
      setListening(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, onChange]);

  return (
    <button
      type="button"
      className={`ptt-key-button ${listening ? "listening" : ""}`}
      onClick={() => setListening(true)}
    >
      <span>{label}</span>
      <kbd>{listening ? "Press keys… (Esc to cancel)" : comboLabel(combo)}</kbd>
    </button>
  );
}

/**
 * Server roles: create roles, edit their colour and permissions, and assign
 * them to members. Every mutation broadcasts a structure change, so the parent's
 * server/member state refreshes over the socket without extra plumbing here.
 */
function RolesTab({
  server,
  members,
  onError,
}: {
  server: PublicServer;
  members: Member[];
  onError: (message: string) => void;
}) {
  const roles = [...server.roles].sort((a, b) => b.position - a.position);

  async function createRole() {
    try {
      await apiFetch("/api/roles", {
        method: "POST",
        body: JSON.stringify({ serverId: server.id, name: "new role" }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not create role.");
    }
  }

  return (
    <div className="roles-tab">
      <p className="modal-hint">
        Roles paint member names their colour and grant permissions. The highest
        role a member holds decides their name colour.
      </p>
      <button type="button" className="primary" onClick={() => void createRole()}>
        Create a role
      </button>

      <div className="roles-list">
        {roles.map((role) => (
          <RoleEditor key={role.id} role={role} onError={onError} />
        ))}
        {!roles.length && <p className="modal-hint">No roles yet.</p>}
      </div>

      {roles.length > 0 && (
        <>
          <span className="field-label">Assign roles</span>
          <div className="assign-list">
            {members.map((member) => (
              <MemberRoles
                key={member.id}
                serverId={server.id}
                member={member}
                roles={roles}
                onError={onError}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RoleEditor({
  role,
  onError,
}: {
  role: PublicRole;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [permissions, setPermissions] = useState(role.permissions);
  const [saving, setSaving] = useState(false);

  function toggle(flag: PermissionFlag) {
    setPermissions((current) => current ^ flag);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, color, permissions }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not save role.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the "${role.name}" role?`)) return;
    try {
      await apiFetch(`/api/roles/${role.id}`, { method: "DELETE" });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not delete role.");
    }
  }

  const dirty =
    name !== role.name || color !== role.color || permissions !== role.permissions;

  return (
    <div className="role-editor">
      <div className="role-editor-head">
        <input
          type="color"
          value={color}
          aria-label="Role colour"
          onChange={(event) => setColor(event.target.value)}
        />
        <input
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          style={{ color }}
        />
        <button type="button" className="role-delete" onClick={() => void remove()}>
          Delete
        </button>
      </div>
      <div className="role-perms">
        {PERMISSION_INFO.map((info) => (
          <label key={info.flag} title={info.description}>
            <input
              type="checkbox"
              checked={(permissions & info.flag) !== 0}
              onChange={() => toggle(info.flag)}
            />
            {info.label}
          </label>
        ))}
      </div>
      {dirty && (
        <button
          type="button"
          className="primary role-save"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      )}
    </div>
  );
}

function MemberRoles({
  serverId,
  member,
  roles,
  onError,
}: {
  serverId: string;
  member: Member;
  roles: PublicRole[];
  onError: (message: string) => void;
}) {
  const held = new Set(member.roleIds?.[serverId] || []);

  async function toggle(roleId: string, add: boolean) {
    try {
      await apiFetch("/api/roles/assign", {
        method: "POST",
        body: JSON.stringify({ serverId, userId: member.id, roleId, add }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not assign role.");
    }
  }

  return (
    <div className="assign-row">
      <strong>{member.displayName}</strong>
      <div className="assign-chips">
        {roles.map((role) => {
          const on = held.has(role.id);
          return (
            <button
              type="button"
              key={role.id}
              className={`assign-chip ${on ? "on" : ""}`}
              style={on ? { borderColor: role.color, color: role.color } : undefined}
              onClick={() => void toggle(role.id, !on)}
            >
              {role.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
