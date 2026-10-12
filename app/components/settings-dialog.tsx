"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Activity, Sparkles, Palette, Share2, Edit3, Globe, Eye, X, Layers, User, ShieldCheck, LogOut, Search, ChevronLeft, Coffee, Heart, Dices, MessageSquarePlus, AudioLines, GraduationCap } from "lucide-react";
import { LicensesTab } from "./licenses-tab";
import { TtsSettings } from "./chat/tts-settings";
import { RequestsTab } from "./requests-tab";
import { KOFI_URL, GITHUB_SPONSORS_URL } from "./site-chrome";
import { Avatar } from "./avatar";
import { DiceOverlay } from "./dice-overlay";
import type { DiceRollEvent } from "@/lib/protocol";
import type { HeadTrackingStatus } from "../lib/head-tracking";
import type { RelayStatus } from "../hooks/use-voice";
import { BUILTIN_THEMES, type Theme, type ThemeColors, applyThemeToDocument, exportThemeCode, importThemeCode, getStoredThemes, saveCustomTheme, deleteCustomTheme, getActiveThemeId, THEME_CSS_PRESETS, getClientUiCss, setClientUiCss, isClientUiCssEnabled } from "@/lib/themes";
import { isRetroSoundThemeEnabled } from "../lib/msn-sounds";
import { isThemeFxEnabled } from "../lib/theme-fx";












import type { PublicServer } from "@/lib/servers";
import { type Member, type PrideBadgeId, type ProfileActivity, type PublicUser, type SocialLink, type SpotifyActivity } from "@/lib/users";
import { activitySharingEnabled } from "../hooks/use-activity-detector";
import { apiFetch } from "../lib/client";
import { DEVICE_SAVED_EVENT, listDevices, primeDeviceLabels, savedDevice, type DeviceLists } from "../lib/devices";
import { readMicSettings, writeMicSettings, type MicSettings, type MicTelemetry } from "../lib/mic-chain";
import { RolesTab } from "./settings/roles-tab";
import { Invite, Tab, PrideTheme, Density, Backdrop } from "./settings/types";
import { ProfileTab } from "./settings/profile-tab";
import { ProfileEditorShell } from "./settings/profile-editor-shell";
import { takeProfileEditorRequest } from "@/lib/profile-editor-request";
import { VoiceTab } from "./settings/voice-tab";
import { PasswordTab } from "./settings/password-tab";
import { InvitesTab } from "./settings/invites-tab";
import { AppearanceTab } from "./settings/appearance-tab";
import { DiceTab } from "./settings/dice-tab";
import { ActivitiesTab } from "./settings/activities-tab";
import { CustomCssTab } from "./settings/custom-css-tab";
import { AccessibilityTab } from "./settings/accessibility-tab";



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
  /** What the relay check found, and a way to run it again. */
  relay?: RelayStatus;
  onCheckRelay?: () => void;
  tableMode?: boolean;
  onTableMode?: (enabled: boolean) => void;
  headTracking?: boolean;
  setHeadTracking?: (enabled: boolean) => void;
  headTrackingOffered?: boolean;
  airpodsOffered?: boolean;
  headTrackingSource?: "airpods" | "webcam";
  setHeadTrackingSource?: (source: "airpods" | "webcam") => void;
  spatialOutput?: "headphones" | "speakers";
  setSpatialOutput?: (output: "headphones" | "speakers") => void;
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
  /** Screen share audio defaults. */
  screenShareAudio?: boolean;
  onScreenShareAudioChange?: (enabled: boolean) => void;
  /** The active server, for the roles tab. */
  server?: PublicServer | null;
  members?: Member[];
  /** Whether this user may manage the server (shows the Roles tab). */
  canManageServer?: boolean;
  /** Callback to open a DM conversation directly with a target user. */
  onOpenDm?: (userId: string) => void;
  /** Opens the welcome tutorial (Settings → Tutorial). */
  onOpenTutorial?: () => void;
}


















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
  relay,
  onCheckRelay,
  tableMode = false,
  onTableMode,
  headTracking = false,
  setHeadTracking,
  headTrackingOffered = false,
  airpodsOffered = false,
  headTrackingSource = "airpods",
  setHeadTrackingSource,
  spatialOutput = "headphones",
  setSpatialOutput,
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
  screenShareAudio = true,
  onScreenShareAudioChange,
  server,
  members = [],
  canManageServer = false,
  onShareThemeToChat,
  onOpenDm,
  onOpenTutorial,
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
  const [tab, setTab] = useState<Tab>("password");
  // The profile editor is its own full-screen page, not a settings tab.
  const [startedInEditor] = useState(() => takeProfileEditorRequest());
  const [profileEditor, setProfileEditor] = useState(startedInEditor);
  function closeProfileEditor() {
    setProfileEditor(false);
    if (startedInEditor) onClose();
  }
  // Phones show one pane at a time: the section list, then the chosen page.
  const [mobilePage, setMobilePage] = useState(false);
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
  const [newUsername, setNewUsername] = useState(user.username);
  const [usernamePassword, setUsernamePassword] = useState("");
  const [newEmail, setNewEmail] = useState(user.email || "");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
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
  const [profileEffect, setProfileEffect] = useState(user.profileEffect || "none");
  const [nameplate, setNameplate] = useState(user.nameplate || "none");
  const [profileFrame, setProfileFrame] = useState(user.profileFrame || "none");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(user.socialLinks || []);
  const [newPlatform, setNewPlatform] = useState("github");
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [spotifySong, setSpotifySong] = useState(user.spotifyActivity?.song || "");
  const [spotifyArtist, setSpotifyArtist] = useState(user.spotifyActivity?.artist || "");
  const [spotifyCover, setSpotifyCover] = useState(user.spotifyActivity?.albumArt || "");
  const bannerRef = useRef<HTMLInputElement>(null);
  const [accent, setAccent] = useState("#9d8cf5");
  const [density, setDensity] = useState<Density>("cozy");
  const [backdrop, setBackdrop] = useState<Backdrop>("plain");
  const [corners, setCorners] = useState(16);
  const [motion, setMotion] = useState(true);
  const [cute, setCute] = useState(false);
  const [prideTheme, setPrideTheme] = useState<PrideTheme>("off");
  const [blahaj, setBlahaj] = useState(false);
  const [clickParticles, setClickParticles] = useState<boolean>(() => isThemeFxEnabled());
  const [diceTheme, setDiceTheme] = useState("default");
  const [diceColor, setDiceColor] = useState("#2563eb");
  const [diceMaterial, setDiceMaterial] = useState<"auto" | "plastic" | "metal" | "wood" | "glass">("auto");
  const [diceTexture, setDiceTexture] = useState("auto");
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
  const [retroSounds, setRetroSounds] = useState(() => isRetroSoundThemeEnabled());
  const [spotifyShare, setSpotifyShare] = useState(() =>
    typeof window === "undefined" ? true : activitySharingEnabled(),
  );
  const [spotifyUserInput, setSpotifyUserInput] = useState(() => user.lastfmUsername || "");
  const [trackSearchInput, setTrackSearchInput] = useState("");
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
    const savedDiceMaterial = window.localStorage.getItem("huddle_dice_material");
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
    if (savedDiceTheme && ["default", "pride", "trans", "nonbinary", "vampire", "dark-academia"].includes(savedDiceTheme)) {
      setDiceTheme(savedDiceTheme);
    }
    if (savedDiceColor) setDiceColor(savedDiceColor);
    if (savedDiceMaterial && ["auto", "plastic", "metal", "wood", "glass"].includes(savedDiceMaterial)) {
      setDiceMaterial(savedDiceMaterial as "auto" | "plastic" | "metal" | "wood" | "glass");
    }
    const savedDiceTexture = window.localStorage.getItem("huddle_dice_texture");
    if (savedDiceTexture) {
      setDiceTexture(savedDiceTexture);
    }

    const onBlahajChange = (e: Event) => {
      const custom = e as CustomEvent<string>;
      setBlahaj(custom.detail === "on");
    };
    window.addEventListener("huddle-blahaj-change", onBlahajChange);
    return () => window.removeEventListener("huddle-blahaj-change", onBlahajChange);
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
    window.localStorage.setItem("huddle_dice_color", diceColor);
    window.localStorage.setItem("huddle_dice_material", diceMaterial);
    window.localStorage.setItem("huddle_dice_texture", diceTexture);
  }, [accent, corners, density, backdrop, motion, cute, prideTheme, blahaj, diceTheme, diceColor, diceMaterial, diceTexture]);

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
    // A switch accepted from the hot-plug prompt changes the saved choice
    // under this open page.
    const followSaved = () => {
      setMicId(savedDevice("microphone"));
      setSpeakerId(savedDevice("speaker"));
      setCameraId(savedDevice("camera"));
    };
    window.addEventListener(DEVICE_SAVED_EVENT, followSaved);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
      window.removeEventListener(DEVICE_SAVED_EVENT, followSaved);
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

  /**
   * Saves just the music activity (from the Spotify/Last.fm sync) and mirrors
   * the server's answer into the form, so a later "Save profile" keeps it and
   * the album art is the proxied copy the server stored.
   */
  async function saveSpotifyActivity(activity: SpotifyActivity | null) {
    const data = await apiFetch<{ user: PublicUser }>("/api/settings/profile", {
      method: "PATCH",
      body: JSON.stringify({ spotifyActivity: activity }),
    });
    const saved = data.user.spotifyActivity || null;
    setSpotifySong(saved?.song || "");
    setSpotifyArtist(saved?.artist || "");
    setSpotifyCover(saved?.albumArt || "");
    onUser(data.user);
  }

  async function saveLastfm(username: string | null) {
    const data = await apiFetch<{ user: PublicUser }>("/api/settings/profile", {
      method: "PATCH",
      body: JSON.stringify({ lastfmUsername: username }),
    });
    try {
      if (username) window.localStorage.setItem("huddle-spotify-username", username);
      else window.localStorage.removeItem("huddle-spotify-username");
    } catch {
      // Account copy is the source of truth.
    }
    onUser(data.user);
  }

  async function saveActivity(activity: ProfileActivity | null) {
    const data = await apiFetch<{ user: PublicUser }>("/api/settings/profile", {
      method: "PATCH",
      body: JSON.stringify({ activity }),
    });
    onUser(data.user);
  }

  /** Puts every profile field back to what is saved. */
  function resetProfileDraft(from: PublicUser = user) {
    setDisplayName(from.displayName);
    setAvatar(from.avatar);
    setColor(from.color);
    setPronouns(from.pronouns || "");
    setBio(from.bio || "");
    setPrideBadges(from.prideBadges || []);
    setTagline(from.tagline || "");
    setCustomStatus(from.customStatus || "");
    setAvatarUrl(from.avatarUrl || null);
    setAvatarKey(undefined);
    setBannerUrl(from.bannerUrl || null);
    setBannerKey(undefined);
    setAvatarFrame(from.avatarFrame || "none");
    setProfileEffect(from.profileEffect || "none");
    setNameplate(from.nameplate || "none");
    setProfileFrame(from.profileFrame || "none");
    setSocialLinks(from.socialLinks || []);
    setSpotifySong(from.spotifyActivity?.song || "");
    setSpotifyArtist(from.spotifyActivity?.artist || "");
    setSpotifyCover(from.spotifyActivity?.albumArt || "");
    setProfileCustomCss(from.customCss || "");
    setError("");
  }

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
          profileEffect,
          nameplate,
          profileFrame,
          socialLinks,
          spotifyActivity: spotifySong.trim()
            ? {
                song: spotifySong.trim(),
                artist: spotifyArtist.trim() || "Unknown Artist",
                albumArt: spotifyCover.trim() || undefined,
                isPlaying: true,
              }
            : null,
          customCss: profileCustomCss.trim() || null,
          ...(avatarKey === undefined ? { avatarUrl } : { avatarKey }),
          ...(bannerKey === undefined ? { bannerUrl } : { bannerKey }),
        }),
      });
      onUser(data.user);
      resetProfileDraft(data.user);
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
    // onTheme re-applies the plain base theme (e.g. "light"), so apply the
    // chosen one after it or themes built on a base get wiped.
    onTheme(th.baseTheme);
    applyThemeToDocument(th);
    if (th.colors.lavender) setAccent(th.colors.lavender);
    if (typeof th.corners === "number") setCorners(th.corners);
    if (th.backdrop && ["plain", "aurora", "dots"].includes(th.backdrop)) {
      setBackdrop(th.backdrop as Backdrop);
    }
    if (typeof window !== "undefined" && window.localStorage.getItem("huddle-theme-fx") === null) {
      setClickParticles(isThemeFxEnabled(th.id));
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

  async function saveUsername() {
    setError("");
    try {
      const data = await apiFetch<{ user: PublicUser }>("/api/settings/username", {
        method: "POST",
        body: JSON.stringify({ username: newUsername.trim(), password: usernamePassword }),
      });
      setUsernamePassword("");
      onUser(data.user);
      setStatus(`You are now @${data.user.username}. Sign in with this name from now on.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not change your username.");
    }
  }

  useEffect(() => {
    apiFetch<{ pending: string | null }>("/api/settings/email")
      .then((data) => setPendingEmail(data.pending))
      .catch(() => {});
  }, []);

  async function saveEmail() {
    setError("");
    try {
      const data = await apiFetch<{ pending: string }>("/api/settings/email", {
        method: "POST",
        body: JSON.stringify({ email: newEmail.trim(), password: emailPassword }),
      });
      setEmailPassword("");
      setEmailCode("");
      setPendingEmail(data.pending);
      setStatus(`We mailed a code to ${data.pending}. Enter it below to finish.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not send the code.");
    }
  }

  async function verifyEmail() {
    setError("");
    try {
      const data = await apiFetch<{ user: PublicUser }>("/api/settings/email/verify", {
        method: "POST",
        body: JSON.stringify({ code: emailCode }),
      });
      setEmailCode("");
      setPendingEmail(null);
      setNewEmail(data.user.email || "");
      onUser(data.user);
      setStatus("Email verified. Password reset links will go there.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your email.");
    }
  }

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteMessagesToo, setDeleteMessagesToo] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  async function deleteAccount() {
    if (
      !window.confirm(
        deleteMessagesToo
          ? "Delete your account and all your messages? This cannot be undone."
          : "Delete your account? This cannot be undone.",
      )
    ) {
      return;
    }
    setError("");
    setDeletingAccount(true);
    try {
      await apiFetch("/api/settings/account", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword, deleteMessages: deleteMessagesToo }),
      });
      onSignOut();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete the account.");
    } finally {
      setDeletingAccount(false);
      setDeletePassword("");
    }
  }

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

  const [inviteTheme, setInviteTheme] = useState("");
  const [inviteServer, setInviteServer] = useState("");
  /** How many accounts one code may create; 0 is no limit. */
  const [inviteUses, setInviteUses] = useState(1);
  const [inviteServers, setInviteServers] = useState<PublicServer[]>([]);
  useEffect(() => {
    if (tab !== "invites") return;
    apiFetch<{ servers: PublicServer[] }>("/api/servers")
      .then((data) => setInviteServers(data.servers || []))
      .catch(() => undefined);
  }, [tab]);

  async function createInvite() {
    setError("");
    try {
      const data = await apiFetch<{ invite: Invite }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({
          maxUses: inviteUses,
          defaultTheme: inviteTheme || undefined,
          defaultServerId: inviteServer || undefined,
        }),
      });
      setInvites((list) => [data.invite, ...list]);
      setStatus("Invite code created! Copy the link or code to share.");
      window.setTimeout(() => setStatus(""), 3000);
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
        { id: "password" as Tab, label: "Account & Password", icon: ShieldCheck, desc: "Username, email, password and account security" },
        { id: "activities" as Tab, label: "Activities & Privacy", icon: Activity, desc: "Status sharing, games and Spotify" },
      ],
    },
    {
      title: "APP SETTINGS",
      items: [
        { id: "appearance" as Tab, label: "Appearance", icon: Palette, desc: "Themes, colors, and community library" },
        { id: "dice" as Tab, label: "3D Dice", icon: Dices, desc: "3D dice styles, materials, textures, and roll sound physics" },
        { id: "custom_ui_css" as Tab, label: "Custom CSS", icon: Sparkles, desc: "Personal client-side UI styling" },
        { id: "voice" as Tab, label: "Voice & Video", icon: Mic, desc: "Input, output, mic test, volume and noise gate" },
        { id: "tts" as Tab, label: "Text-to-speech", icon: AudioLines, desc: "Your /tts and /say voice, and hearing /tts messages" },
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
      title: "COMMUNITY & SUPPORT",
      items: [
        {
          id: "requests" as Tab,
          label: "Make a Request",
          icon: MessageSquarePlus,
          desc: "Feature requests & suggestions sent directly to kiwi & flo",
        },
        { id: "tutorial" as Tab, label: "Tutorial", icon: GraduationCap, desc: "Replay the welcome tour and theme picker any time" },
        { id: "licenses" as Tab, label: "Licenses & About", icon: Globe, desc: "Software licenses and legal notices" },
      ],
    },
  ];

  return (
    <div className="modal-backdrop settings-modal-overlay" role="dialog" aria-modal="true">
      <div className={`modal settings-modal ${mobilePage ? "mobile-page" : ""}`}>
        {/* Discord Left Sidebar */}
        <aside className="settings-sidebar">
          <div className="settings-mobile-head">
            <h2>Settings</h2>
            <button
              type="button"
              className="settings-mobile-close"
              onClick={onClose}
              aria-label="Close settings"
            >
              <X size={20} />
            </button>
          </div>
          <div className="settings-sidebar-user">
            <Avatar avatar={avatar} avatarUrl={avatarUrl} color={color} className="w-9 h-9 rounded-full shrink-0" />
            <div className="settings-sidebar-user-info">
              <span className="settings-sidebar-user-name" title={displayName || user.displayName}>
                {displayName || user.displayName}
              </span>
              <button
                type="button"
                className="settings-sidebar-user-sub"
                onClick={() => setProfileEditor(true)}
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
                          setMobilePage(true);
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

          {KOFI_URL && (
            <a
              href={KOFI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="settings-nav-btn text-[#a5b4fc] hover:text-white"
              title="Support Hoffle on Ko-fi"
            >
              <Coffee size={16} className="shrink-0" />
              <span className="truncate">Support on Ko-fi</span>
            </a>
          )}
          {GITHUB_SPONSORS_URL && (
            <a
              href={GITHUB_SPONSORS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="settings-nav-btn text-[#f472b6] hover:text-white"
              title="Sponsor Hoffle on GitHub"
            >
              <Heart size={16} className="shrink-0" />
              <span className="truncate">GitHub Sponsors</span>
            </a>
          )}

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
            <button
              type="button"
              className="settings-mobile-back"
              onClick={() => setMobilePage(false)}
              aria-label="Back to settings list"
            >
              <ChevronLeft size={22} />
            </button>
            <h2>
              {tab === "profile" && "Profile"}
              {tab === "password" && "Account & Password"}
              {tab === "activities" && "Activities & Privacy"}
              {tab === "appearance" && "Appearance"}
              {tab === "dice" && "3D Dice"}
              {tab === "custom_ui_css" && "Custom CSS"}
              {tab === "voice" && "Voice & Video"}
              {tab === "tts" && "Text-to-speech"}
              {tab === "accessibility" && "Accessibility"}
              {tab === "invites" && "Invites"}
              {tab === "roles" && "Roles"}
              {tab === "requests" && "Make a Request"}
              {tab === "licenses" && "Licenses & About"}
              {tab === "tutorial" && "Tutorial"}
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


          {tab === "tts" && <TtsSettings />}

          <VoiceTab
        tab={tab}
        relay={relay}
        onCheckRelay={onCheckRelay}
        onTableMode={onTableMode}
        tableMode={tableMode}
        setSpatialOutput={setSpatialOutput}
        spatialOutput={spatialOutput}
        headTrackingOffered={headTrackingOffered}
        setHeadTracking={setHeadTracking}
        headTracking={headTracking}
        setHeadTrackingSource={setHeadTrackingSource}
        headTrackingSource={headTrackingSource}
        headTrackingStatus={headTrackingStatus}
        airpodsOffered={airpodsOffered}
        recenterHead={recenterHead}
        inCall={inCall}
        tableParticipants={tableParticipants}
        tableHostId={tableHostId}
        onTableHostId={onTableHostId}
        micId={micId}
        setMicId={setMicId}
        onMicrophoneChange={onMicrophoneChange}
        devices={devices}
        mic={mic}
        changeMic={changeMic}
        subscribeMicTelemetry={subscribeMicTelemetry}
        speakerId={speakerId}
        setSpeakerId={setSpeakerId}
        cameraId={cameraId}
        setCameraId={setCameraId}
        pushToTalk={pushToTalk}
        onPushToTalk={onPushToTalk}
        setCapturingKey={setCapturingKey}
        capturingKey={capturingKey}
        onPttKey={onPttKey}
        pttKey={pttKey}
        screenShareAudio={screenShareAudio}
        onScreenShareAudioChange={onScreenShareAudioChange}
        muteKey={muteKey}
        onMuteKey={onMuteKey}
        deafenKey={deafenKey}
        onDeafenKey={onDeafenKey}
      />

          <PasswordTab
        tab={tab}
        newUsername={newUsername}
        setNewUsername={setNewUsername}
        user={user}
        usernamePassword={usernamePassword}
        setUsernamePassword={setUsernamePassword}
        saveUsername={saveUsername}
        newEmail={newEmail}
        setNewEmail={setNewEmail}
        emailPassword={emailPassword}
        setEmailPassword={setEmailPassword}
        saveEmail={saveEmail}
        pendingEmail={pendingEmail}
        emailCode={emailCode}
        setEmailCode={setEmailCode}
        verifyEmail={verifyEmail}
        current={current}
        setCurrent={setCurrent}
        next={next}
        setNext={setNext}
        savePassword={savePassword}
        deletePassword={deletePassword}
        setDeletePassword={setDeletePassword}
        deleteMessagesToo={deleteMessagesToo}
        setDeleteMessagesToo={setDeleteMessagesToo}
        deletingAccount={deletingAccount}
        deleteAccount={deleteAccount}
      />

          <InvitesTab
        tab={tab}
        inviteTheme={inviteTheme}
        setInviteTheme={setInviteTheme}
        inviteServer={inviteServer}
        setInviteServer={setInviteServer}
        inviteServers={inviteServers}
        inviteUses={inviteUses}
        setInviteUses={setInviteUses}
        createInvite={createInvite}
        invites={invites}
        setStatus={setStatus}
        revokeInvite={revokeInvite}
        user={user}
        permissionSearch={permissionSearch}
        setPermissionSearch={setPermissionSearch}
        permissionUsers={permissionUsers}
        toggleInvitePermission={toggleInvitePermission}
        updatingPermission={updatingPermission}
      />

          <AppearanceTab
        tab={tab}
        handleOpenCreateTheme={handleOpenCreateTheme}
        setImportCodeInput={setImportCodeInput}
        setImportError={setImportError}
        setImportParsedTheme={setImportParsedTheme}
        setIsImportingTheme={setIsImportingTheme}
        themeActionNotice={themeActionNotice}
        appearanceSubtab={appearanceSubtab}
        setAppearanceSubtab={setAppearanceSubtab}
        customThemes={customThemes}
        activeThemeId={activeThemeId}
        theme={theme}
        themeShareMenuId={themeShareMenuId}
        setThemeShareMenuId={setThemeShareMenuId}
        handleShareThemeCode={handleShareThemeCode}
        themeCopiedId={themeCopiedId}
        onShareThemeToChat={onShareThemeToChat}
        handleShareThemeChat={handleShareThemeChat}
        handlePublishTheme={handlePublishTheme}
        handleDeleteCustomTheme={handleDeleteCustomTheme}
        handleSelectTheme={handleSelectTheme}
        themeSearchQuery={themeSearchQuery}
        setThemeSearchQuery={setThemeSearchQuery}
        loadCommunityThemes={loadCommunityThemes}
        communityLoading={communityLoading}
        communityThemes={communityThemes}
        setCustomThemes={setCustomThemes}
        setThemeActionNotice={setThemeActionNotice}
        accent={accent}
        setAccent={setAccent}
        prideTheme={prideTheme}
        setPrideTheme={setPrideTheme}
        density={density}
        setDensity={setDensity}
        backdrop={backdrop}
        setBackdrop={setBackdrop}
        corners={corners}
        setCorners={setCorners}
        motion={motion}
        setMotion={setMotion}
        cute={cute}
        setCute={setCute}
        blahaj={blahaj}
        setBlahaj={setBlahaj}
        clickParticles={clickParticles}
        setClickParticles={setClickParticles}
        notify={notify}
        setNotify={setNotify}
        retroSounds={retroSounds}
        setRetroSounds={setRetroSounds}
      />

          <DiceTab
        tab={tab}
        diceTheme={diceTheme}
        setDiceTheme={setDiceTheme}
        diceColor={diceColor}
        setDiceColor={setDiceColor}
        diceMaterial={diceMaterial}
        setDiceMaterial={setDiceMaterial}
        diceTexture={diceTexture}
        setDiceTexture={setDiceTexture}
        activeThemeId={activeThemeId}
        setTestRoll={setTestRoll}
      />

          <ActivitiesTab
        tab={tab}
        spotifyShare={spotifyShare}
        setSpotifyShare={setSpotifyShare}
        saveSpotifyActivity={saveSpotifyActivity}
        spotifyUserInput={spotifyUserInput}
        setSpotifyUserInput={setSpotifyUserInput}
        setError={setError}
        setStatus={setStatus}
        trackSearchInput={trackSearchInput}
        setTrackSearchInput={setTrackSearchInput}
        activity={user.activity}
        saveActivity={saveActivity}
        lastfmUsername={user.lastfmUsername}
        saveLastfm={saveLastfm}
      />

          <CustomCssTab
        tab={tab}
        clientUiCssEnabled={clientUiCssEnabled}
        handleSaveClientUiCss={handleSaveClientUiCss}
        clientUiCss={clientUiCss}
        clientUiNotice={clientUiNotice}
        setClientUiNotice={setClientUiNotice}
        setLocalClientUiCss={setLocalClientUiCss}
      />

          <AccessibilityTab
        tab={tab}
        avatar={avatar}
        chatFontSize={chatFontSize}
        displayName={displayName}
        alwaysUnderlineLinks={alwaysUnderlineLinks}
        setChatFontSize={setChatFontSize}
        setAlwaysUnderlineLinks={setAlwaysUnderlineLinks}
        displayNameStyles={displayNameStyles}
        setDisplayNameStyles={setDisplayNameStyles}
        motion={motion}
        setMotion={setMotion}
      />

          {tab === "roles" && server && (
            <RolesTab server={server} members={members} onError={setError} />
          )}

          {tab === "licenses" && <LicensesTab />}
          {tab === "tutorial" && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-gray-300">
                The tutorial walks you through picking a theme, getting around, voice and screen sharing, chat and game
                night, with buttons that try each thing for real. It opened when you signed up, and you can open it again
                from here any time.
              </p>
              <button type="button" className="discord-btn primary-indigo" onClick={() => onOpenTutorial?.()}>
                Open the tutorial
              </button>
            </div>
          )}
          {tab === "requests" && (
            <RequestsTab
              user={user}
              onOpenDm={onOpenDm}
              onCloseSettings={onClose}
            />
          )}

          {error && <p className="auth-error">{error}</p>}
          {status && <p className="modal-status">{status}</p>}
          </div>
        </main>
      </div>
      {profileEditor && (
        <ProfileEditorShell>
          <ProfileTab
        displayName={displayName}
        setDisplayName={setDisplayName}
        pronouns={pronouns}
        setPronouns={setPronouns}
        tagline={tagline}
        setTagline={setTagline}
        customStatus={customStatus}
        setCustomStatus={setCustomStatus}
        bannerUrl={bannerUrl}
        color={color}
        bannerRef={bannerRef}
        setBannerUrl={setBannerUrl}
        setBannerKey={setBannerKey}
        chooseBanner={chooseBanner}
        avatarFrame={avatarFrame}
        profileEffect={profileEffect}
        nameplate={nameplate}
        profileFrame={profileFrame}
        avatarUrl={avatarUrl}
        avatar={avatar}
        pictureRef={pictureRef}
        setAvatarUrl={setAvatarUrl}
        setAvatarKey={setAvatarKey}
        choosePicture={choosePicture}
        setAvatar={setAvatar}
        setAvatarFrame={setAvatarFrame}
        setProfileEffect={setProfileEffect}
        setNameplate={setNameplate}
        setProfileFrame={setProfileFrame}
        setColor={setColor}
        bio={bio}
        setBio={setBio}
        prideBadges={prideBadges}
        setPrideBadges={setPrideBadges}
        newPlatform={newPlatform}
        setNewPlatform={setNewPlatform}
        newUrl={newUrl}
        setNewUrl={setNewUrl}
        newLabel={newLabel}
        setNewLabel={setNewLabel}
        setSocialLinks={setSocialLinks}
        socialLinks={socialLinks}
        spotifySong={spotifySong}
        setSpotifySong={setSpotifySong}
        spotifyArtist={spotifyArtist}
        setSpotifyArtist={setSpotifyArtist}
        spotifyCover={spotifyCover}
        setSpotifyCover={setSpotifyCover}
        setShowProfileCssGuide={setShowProfileCssGuide}
        showProfileCssGuide={showProfileCssGuide}
        setProfileCustomCss={setProfileCustomCss}
        profileCustomCss={profileCustomCss}
        saveProfile={saveProfile}
        resetProfile={() => resetProfileDraft()}
        onClose={closeProfileEditor}
        status={status}
        error={error}
        user={user}
      />
        </ProfileEditorShell>
      )}
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








