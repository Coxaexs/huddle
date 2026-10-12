"use client";

import type { SpeakingStore } from "../../../lib/speaking-store";
import { type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { PlayerState } from "@/lib/protocol";
import { MessageAttachmentFiles } from "../../message-file-card";
import { MsnAdBanner, MsnWhatsNew } from "../../msn-chrome";
import type { PublicChannel, PublicServer } from "@/lib/servers";
import { PRESENCE, memberActivityLine, type Member, type PresenceStatus, type PublicUser } from "@/lib/users";
import { activeUntil } from "@/lib/timeouts";
import { Search, Bell, BellOff, CheckCheck, Pin, Settings, Users, Pencil, Plus, Trash2, StickyNote, MessageSquare, PhoneCall, ChevronDown, X, UserPlus, Send, Timer, CalendarDays } from "lucide-react";
import { Avatar } from "../../avatar";
import { MessageBody, StyledText, type MentionChannel } from "../../message-body";
import { eventIsOpen, eventWhen } from "../../events-panel";
import { ServerInviteCard, type ResolvedInvite } from "../../server-invite-card";
import { railEntries, type ServerFolder } from "@/lib/server-folders";
import { showToast } from "../../toast";
import { MiniMusicBar } from "../../mini-music-bar";
import { type Message, type DmSummary } from "../../../lib/chat/types";
import { DM_HOME } from "../../../lib/chat/constants";
import { formatClientTime, formatClientDateTime } from "../../../lib/chat/format";
import { extractInviteCodes } from "../../../lib/chat/invites";
import { Icon } from "../icon-button";
import { MiniVoiceBar } from "../mini-voice-bar";
import { RailQuickDms } from "../rail";
import { StatusMenu } from "../status-menu";
import { UserFooter } from "../../user-footer";
import { type UserMenuTarget, type VoicePref } from "../../user-menu";
import { screenQualityLabel } from "../../../hooks/use-voice";
import { ScreenShareSetup } from "../../screen-share-setup";
import { apiFetch } from "../../../lib/client";
import { PrideBadges } from "../../pride-badges";
import { ForwardedMessageCard } from "../../forwarded-message-card";
import { ThemeShareCard } from "../../theme-share-card";
import { ImageGallery } from "../../image-gallery";
import { type Theme, importThemeCode } from "@/lib/themes";
import { fitComposer } from "../../../lib/chat/shell-helpers";
import type { Dispatch, SetStateAction, RefObject } from "react";
import type { VoiceParticipant, ClientEvent, RecordingState } from "@/lib/protocol";
import type { PublicEvent } from "@/lib/events";
import type { PublicCategory } from "@/lib/servers";
import type { HeadTrackingSource, SpatialOutput, VideoPause, RemoteVoiceStream, VoiceLatencyStats, ScreenShareQuality, RelayStatus } from "../../../hooks/use-voice";
import type { HeadTrackingStatus } from "../../../lib/head-tracking";
import type { BackgroundMode } from "../../../lib/virtual-background";
import type { MicSettings, MicTelemetry } from "../../../lib/mic-chain";
import type { MsnContacts } from "@/lib/msn-contacts";
import type { WhatsNewEntry } from "../../../hooks/use-msn-extras";

export function ServerRail({
  inDmHome,
  setActiveServerId,
  setActiveChannelId,
  visibleDms,
  setStageChannelId,
  setMobileNav,
  dmUnreadTotal,
  servers,
  serverFolders,
  renderRailServer,
  renderRailFolder,
  createServer,
  activeChannelId,
  unread,
  voiceRooms,
  presenceOf,
  statusOpen,
  myStatus,
  myCustomStatus,
  savePresence,
  autoIdleRef,
  setStatusOpen,
  msnTheme,
  shareListening,
  setShareListening,
  autoReply,
  setAutoReply,
  showCustomPrompt,
  setSoundsOpen,
  setPictureOpen,
  setTodayOpen,
  setSettingsOpen,
}: {
  inDmHome: boolean;
  setActiveServerId: Dispatch<SetStateAction<string | null>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  visibleDms: DmSummary[];
  setStageChannelId: Dispatch<SetStateAction<string | null>>;
  setMobileNav: Dispatch<SetStateAction<boolean>>;
  dmUnreadTotal: number;
  servers: PublicServer[];
  serverFolders: ServerFolder[];
  renderRailServer: (server: PublicServer) => React.JSX.Element;
  renderRailFolder: (folder: ServerFolder, folderServers: PublicServer[]) => React.JSX.Element;
  createServer: () => void;
  activeChannelId: string | null;
  unread: Record<string, { unread: boolean; count: number; mentions: number; }>;
  voiceRooms: Record<string, VoiceParticipant[]>;
  presenceOf: (member: Member) => PresenceStatus | "offline";
  statusOpen: boolean;
  myStatus: PresenceStatus;
  myCustomStatus: string | null;
  savePresence: (patch: { status?: PresenceStatus; customStatus?: string | null; }) => Promise<void>;
  autoIdleRef: RefObject<boolean>;
  setStatusOpen: Dispatch<SetStateAction<boolean>>;
  msnTheme: boolean;
  shareListening: boolean;
  setShareListening: Dispatch<SetStateAction<boolean>>;
  autoReply: string | null;
  setAutoReply: Dispatch<SetStateAction<string | null>>;
  showCustomPrompt: (options: { title: string; message?: string; defaultValue?: string; placeholder?: string; confirmText?: string; maxLength?: number; onConfirm: (val?: string) => void; }) => void;
  setSoundsOpen: Dispatch<SetStateAction<boolean>>;
  setPictureOpen: Dispatch<SetStateAction<boolean>>;
  setTodayOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <aside className="rail" aria-label="Servers">
      <div className="rail-item">
        {inDmHome && <span className="rail-active-pill" />}
        <button
          className={`brand-mark ${inDmHome ? "active-space" : ""}`}
          aria-label="Direct messages"
          title="Direct messages"
          onClick={() => {
            setActiveServerId(DM_HOME);
            setActiveChannelId(visibleDms[0]?.channelId || null);
            setStageChannelId(null);
            setMobileNav(false);
          }}
        >
          h
          {dmUnreadTotal > 0 && !inDmHome && (
            <span className="rail-badge">{dmUnreadTotal}</span>
          )}
        </button>
      </div>

      <div className="rail-divider" />
      {railEntries(servers, serverFolders).map((entry) =>
        entry.kind === "server"
          ? renderRailServer(entry.server)
          : renderRailFolder(entry.folder, entry.servers),
      )}
      <button
        className="space-mark add-space"
        aria-label="Create a server"
        title="Create a server"
        onClick={createServer}
      >
        +
      </button>

      <div className="rail-divider" />

      {/* Quick DMs directly on rail from Figma design */}
      <RailQuickDms
        dms={visibleDms}
        inDmHome={inDmHome}
        activeChannelId={activeChannelId}
        unread={unread}
        voiceRooms={voiceRooms}
        presenceOf={presenceOf}
        onOpen={(channelId) => {
          setActiveServerId(DM_HOME);
          setActiveChannelId(channelId);
          setStageChannelId(null);
          setMobileNav(false);
        }}
      />
      <div className="rail-spacer" />

      {statusOpen && (
        <StatusMenu
          myStatus={myStatus}
          myCustomStatus={myCustomStatus}
          savePresence={savePresence}
          autoIdleRef={autoIdleRef}
          setStatusOpen={setStatusOpen}
          msnTheme={msnTheme}
          shareListening={shareListening}
          setShareListening={setShareListening}
          autoReply={autoReply}
          setAutoReply={setAutoReply}
          showCustomPrompt={showCustomPrompt}
          setSoundsOpen={setSoundsOpen}
          setPictureOpen={setPictureOpen}
          setTodayOpen={setTodayOpen}
          setSettingsOpen={setSettingsOpen}
        />
      )}
      {/* 
      <Avatar
        className="profile-dot"
        avatar={user.avatar}
        avatarUrl={user.avatarUrl}
        color={user.color}
        title={
          myCustomStatus ||
          `${PRESENCE[myStatus].label} · click for status, right-click for settings`
        }
        onClick={() => setStatusOpen((open) => !open)}
        onContextMenu={(event) => {
          event.preventDefault();
          setSettingsOpen(true);
        }}
      >
        <span
          className="presence-dot"
          style={{
            background: hub.connected
              ? PRESENCE[myStatus].color
              : PRESENCE.invisible.color,
          }}
        />
      </Avatar> */}
    </aside>
  );
}

export function ChannelSidebar({
  mobileNav,
  setMobileNav,
  activeServer,
  inDmHome,
  setServerMenuOpen,
  serverMenuOpen,
  canOpenServerSettings,
  setServerSettingsOpen,
  canCreateServerInvites,
  showCustomPrompt,
  canManageServer,
  setServers,
  canManageChannels,
  setKindMenu,
  markServerRead,
  setNotifyLevel,
  channelPrefs,
  showCustomConfirm,
  setActiveServerId,
  setGlobalSearchOpen,
  setActiveChannelId,
  setStageChannelId,
  activeChannelId,
  stageChannelId,
  pendingFriendCount,
  user,
  setGroupDialog,
  openDm,
  visibleDms,
  unread,
  setUserMenu,
  setGroupDmMenu,
  openUserMenu,
  hub,
  voiceRooms,
  togglePinDm,
  setDmClosed,
  addCategory,
  kindMenu,
  renderKindMenu,
  nextEvent,
  setEventsOpen,
  serverEvents,
  categoryDropProps,
  channelLayout,
  renderChannel,
  collapsedCats,
  toggleCategory,
  renameCategory,
  deleteCategory,
  roomPlayer,
  player,
  voice,
  servers,
  dmCall,
  quickSoundboardOpen,
  setQuickSoundboardOpen,
  sidebarShareSetupOpen,
  setSidebarShareSetupOpen,
  voiceSoundboardAllowed,
  myStatus,
  myCustomStatus,
  setStatusOpen,
  setSettingsOpen,
  onSidebarResizeDown,
}: {
  mobileNav: boolean;
  setMobileNav: Dispatch<SetStateAction<boolean>>;
  activeServer: PublicServer | null;
  inDmHome: boolean;
  setServerMenuOpen: Dispatch<SetStateAction<boolean>>;
  serverMenuOpen: boolean;
  canOpenServerSettings: boolean;
  setServerSettingsOpen: Dispatch<SetStateAction<boolean>>;
  canCreateServerInvites: boolean;
  showCustomPrompt: (options: { title: string; message?: string; defaultValue?: string; placeholder?: string; confirmText?: string; maxLength?: number; onConfirm: (val?: string) => void; }) => void;
  canManageServer: boolean;
  setServers: Dispatch<SetStateAction<PublicServer[]>>;
  canManageChannels: boolean;
  setKindMenu: Dispatch<SetStateAction<{ categoryId: string | null; } | null>>;
  markServerRead: (server: PublicServer) => void;
  setNotifyLevel: (key: string, level: string) => void;
  channelPrefs: Record<string, string>;
  showCustomConfirm: (options: { title: string; message?: string; isDanger?: boolean; confirmText?: string; cancelText?: string; onConfirm: () => void; onCancel?: () => void; }) => void;
  setActiveServerId: Dispatch<SetStateAction<string | null>>;
  setGlobalSearchOpen: Dispatch<SetStateAction<boolean>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setStageChannelId: Dispatch<SetStateAction<string | null>>;
  activeChannelId: string | null;
  stageChannelId: string | null;
  pendingFriendCount: number;
  user: PublicUser;
  setGroupDialog: Dispatch<SetStateAction<{ mode: "create"; } | { mode: "add"; channelId: string; } | null>>;
  openDm: (targetId: string) => Promise<void>;
  visibleDms: DmSummary[];
  unread: Record<string, { unread: boolean; count: number; mentions: number; }>;
  setUserMenu: Dispatch<SetStateAction<UserMenuTarget | null>>;
  setGroupDmMenu: Dispatch<SetStateAction<{ dm: DmSummary; x: number; y: number; } | null>>;
  openUserMenu: (event: MouseEvent, member: Member, opts?: { dmChannelId?: string; dmPinned?: boolean; }) => void;
  hub: { send: (event: ClientEvent) => boolean; serverNow: () => number; connected: boolean; connectionId: string | null; session: number; online: Set<string>; voice: Record<string, VoiceParticipant[]>; players: Record<string, PlayerState>; recordings: Record<string, RecordingState>; forcedMutes: Set<string>; };
  voiceRooms: Record<string, VoiceParticipant[]>;
  togglePinDm: (channelId: string, pinned: boolean) => Promise<void>;
  setDmClosed: (channelId: string, closed: boolean) => Promise<void>;
  addCategory: () => Promise<void>;
  kindMenu: { categoryId: string | null; } | null;
  renderKindMenu: (categoryId: string | null) => React.JSX.Element;
  nextEvent: PublicEvent | null;
  setEventsOpen: Dispatch<SetStateAction<boolean>>;
  serverEvents: PublicEvent[];
  categoryDropProps: (categoryId: string | null) => { onDragOver?: undefined; onDrop?: undefined; } | { onDragOver: (event: DragEvent<HTMLElement>) => void; onDrop: (event: DragEvent<HTMLElement>) => void; };
  channelLayout: { uncategorised: PublicChannel[]; grouped: { category: PublicCategory; channels: PublicChannel[]; }[]; };
  renderChannel: (channel: PublicChannel) => React.JSX.Element;
  collapsedCats: Set<string>;
  toggleCategory: (id: string) => void;
  renameCategory: (categoryId: string, current: string) => Promise<void>;
  deleteCategory: (categoryId: string, name: string) => Promise<void>;
  roomPlayer: PlayerState | null;
  player: { position: number; blocked: boolean; unblock: () => void; prime: () => void; };
  voice: { important: boolean; toggleImportant: () => void; tableSeatOrder: string[]; tableSeatPans: Record<string, number>; setTableSeatPans: Dispatch<SetStateAction<Record<string, number>>>; tableWidth: number; setTableWidth: Dispatch<SetStateAction<number>>; headTracking: boolean; setHeadTracking: (enabled: boolean) => void; headTrackingOffered: boolean; airpodsOffered: boolean; headTrackingSource: HeadTrackingSource; setHeadTrackingSource: (source: HeadTrackingSource) => void; spatialOutput: SpatialOutput; setSpatialOutput: (output: SpatialOutput) => void; headTrackingStatus: { status: HeadTrackingStatus; live: boolean; }; onHeadTracking: (status: HeadTrackingStatus, live: boolean) => void; recenterHead: () => void; tableMode: boolean; setTableMode: (enabled: boolean) => void; tableHostId: string; setTableHostId: Dispatch<SetStateAction<string>>; channelId: string | null; muted: boolean; forcedMute: boolean; setForcedMute: (next: boolean) => void; deafened: boolean; handRaised: boolean; toggleHand: () => void; hiddenVideo: Record<string, VideoPause>; setVideoHidden: (remoteId: string, which: keyof VideoPause, hidden: boolean) => void; setStageSpeaker: (targetConnectionId: string, allowed: boolean) => void; speakingStore: SpeakingStore; remoteStreams: RemoteVoiceStream[]; sfuMode: boolean; peerStates: Record<string, string>; screenSharing: boolean; streamViewers: string[]; signalStreamWatch: (streamerConnectionId: string, watching: boolean) => void; latency: VoiceLatencyStats; isSfu: boolean; voiceRegion: "nl" | "de" | null; switchRegion: (targetRegion?: "nl" | "de") => Promise<void>; screenShareAudio: boolean; setScreenShareAudio: (enabled: boolean) => void; hasScreenAudio: boolean; screenAudioMuted: boolean; toggleScreenAudio: () => void; screenQuality: "480p15" | "480p24" | "480p30" | "480p60" | "720p15" | "720p24" | "720p30" | "720p60" | "900p15" | "900p24" | "900p30" | "900p60" | "1080p15" | "1080p24" | "1080p30" | "1080p60"; setScreenQuality: (quality: ScreenShareQuality) => void; screenFilm: boolean; setScreenFilm: (enabled: boolean) => void; startScreenShare: (quality?: ScreenShareQuality, withAudio?: boolean, film?: boolean) => Promise<void>; stopScreenShare: () => void; cameraOn: boolean; cameraBackground: BackgroundMode; setCameraBackground: (mode: BackgroundMode) => Promise<void>; cameraBlurAmount: number; setCameraBlurAmount: (amount: number) => void; cameraBackgroundImage: string; setCameraBackgroundImage: (imageId: string) => void; startCamera: () => Promise<void>; stopCamera: () => void; switchMicrophone: () => Promise<void>; activeMicrophone: () => { deviceId: string; ended: boolean; } | null; micSettings: MicSettings; setMicSettings: (next: Partial<MicSettings>) => void; subscribeMicTelemetry: (listener: (telemetry: MicTelemetry) => void) => () => void; localVideos: { kind: "camera" | "screen"; stream: MediaStream; }[]; error: string; setError: Dispatch<SetStateAction<string>>; relay: RelayStatus; recheckRelay: () => Promise<void>; join: (nextChannelId: string, options?: { startMuted?: boolean; }) => Promise<void>; leave: () => void; toggleMute: () => void; toggleDeafen: () => void; handleSignal: (from: string, raw: unknown) => Promise<void>; takeClip: () => Promise<Blob | null>; clipSeconds: number; pushToTalk: boolean; pttKey: string; pttHeld: boolean; muteKey: string; deafenKey: string; setMuteKey: (combo: string) => void; setDeafenKey: (combo: string) => void; setPushToTalk: (enabled: boolean) => void; setPttKey: (code: string) => void; pttPress: () => void; pttRelease: () => void; speakIntoCall: (audio: Float32Array, sampleRate: number) => Promise<"sent" | "no-call" | "no-server" | "server-muted" | "busy" | "too-long">; stopSpeaking: () => void; canSpeak: () => boolean; };
  servers: PublicServer[];
  dmCall: { channelId: string; otherUser: { id: string; displayName: string; avatar?: string; avatarUrl?: string | null; color?: string; }; status: "calling" | "connected"; startTime: number; isVideo?: boolean; seenOther?: boolean; } | null;
  quickSoundboardOpen: boolean;
  setQuickSoundboardOpen: Dispatch<SetStateAction<boolean>>;
  sidebarShareSetupOpen: boolean;
  setSidebarShareSetupOpen: Dispatch<SetStateAction<boolean>>;
  voiceSoundboardAllowed: boolean;
  myStatus: PresenceStatus;
  myCustomStatus: string | null;
  setStatusOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  onSidebarResizeDown: (e: React.MouseEvent) => void;
}) {
  return (
    <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
      {/* Mobile close button from Figma */}
      <div className="mobile-drawer-header md:hidden">
        <button
          type="button"
          className="mobile-drawer-close"
          onClick={() => setMobileNav(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>
      {activeServer?.bannerUrl && !inDmHome && (
        <div
          className="server-banner-header"
          style={{
            backgroundImage: `url(${activeServer.bannerUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            height: "120px",
            width: "100%",
            flexShrink: 0,
          }}
        />
      )}
      <header className="space-header" style={{ position: "relative" }}>
        <div>
          <span className="eyebrow">
            {inDmHome ? "PRIVATE" : "PRIVATE SPACE"}
          </span>
          <h1>{inDmHome ? "Direct messages" : activeServer?.name || "Huddle"}</h1>
        </div>
        {!inDmHome && (
          <Icon label="Server settings" onClick={() => setServerMenuOpen((o) => !o)}>
            •••
          </Icon>
        )}

        {serverMenuOpen && !inDmHome && activeServer && (
          <div className="server-menu-dropdown" role="menu">
            {canOpenServerSettings && (
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  setServerSettingsOpen(true);
                }}
              >
                <span className="flex items-center gap-2">
                  <Settings size={16} /> Server Settings
                </span>
              </button>
            )}
            {canCreateServerInvites && (
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  void apiFetch<{ invite: { code: string } }>("/api/invites", {
                    method: "POST",
                    body: JSON.stringify({ serverId: activeServer.id, maxUses: 0 }),
                  })
                    .then(async ({ invite }) => {
                      const link = `${window.location.origin}/hangout?${invite.code}`;
                      const copied = await navigator.clipboard
                        ?.writeText(link)
                        .then(() => true)
                        .catch(() => false);
                      if (copied) showToast(`Invite link copied: ${link}`);
                      else
                        showCustomPrompt({
                          title: "Invite created",
                          message: "Share this link:",
                          defaultValue: link,
                          confirmText: "Done",
                          onConfirm: () => undefined,
                        });
                    })
                    .catch((error) =>
                      showToast(error instanceof Error ? error.message : "Could not create an invite."),
                    );
                }}
              >
                <span className="flex items-center gap-2">
                  <UserPlus size={16} /> Create Invite
                </span>
              </button>
            )}
            {canManageServer && (
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  showCustomPrompt({
                    title: "Rename Server",
                    message: "Enter a new name for this server:",
                    defaultValue: activeServer.name,
                    confirmText: "Save Name",
                    onConfirm: async (name) => {
                      if (!name?.trim()) return;
                      const data = await apiFetch<{ servers: PublicServer[] }>(
                        `/api/servers/${activeServer.id}`,
                        { method: "PATCH", body: JSON.stringify({ name: name.trim() }) },
                      ).catch(() => null);
                      if (data) setServers(data.servers);
                    },
                  });
                }}
              >
                <span className="flex items-center gap-2">
                  <Pencil size={16} /> Rename Server
                </span>
              </button>
            )}
            {canManageChannels && (
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  // The same five-kind picker as the sidebar's "+".
                  setKindMenu({ categoryId: null });
                }}
              >
                <span className="flex items-center gap-2">
                  <Plus size={16} /> Create Channel
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setServerMenuOpen(false);
                markServerRead(activeServer);
              }}
            >
              <span className="flex items-center gap-2">
                <CheckCheck size={16} /> Mark as Read
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setServerMenuOpen(false);
                const key = `server:${activeServer.id}`;
                setNotifyLevel(key, channelPrefs[key] ? "all" : "mentions");
              }}
            >
              <span className="flex items-center gap-2">
                {channelPrefs[`server:${activeServer.id}`] ? (
                  <><Bell size={16} /> Unmute Server</>
                ) : (
                  <><BellOff size={16} /> Mute Server</>
                )}
              </span>
            </button>
            <div className="server-menu-divider" />
            {canManageServer && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setServerMenuOpen(false);
                  showCustomConfirm({
                    title: `Delete '${activeServer.name}'?`,
                    message: "Are you sure? This will permanently delete the server and all channels.",
                    isDanger: true,
                    confirmText: "Delete Server",
                    onConfirm: async () => {
                      const data = await apiFetch<{ servers: PublicServer[] }>(
                        `/api/servers/${activeServer.id}`,
                        { method: "DELETE" },
                      ).catch(() => null);
                      if (data) {
                        setServers(data.servers);
                        setActiveServerId(data.servers[0]?.id || null);
                      }
                    },
                  });
                }}
              >
                <span className="flex items-center gap-2">
                  <Trash2 size={16} /> Delete Server
                </span>
              </button>
            )}
          </div>
        )}
      </header>

      {inDmHome ? (
        <nav className="channel-nav" aria-label="Conversations">
          <div className="px-2 pt-1 pb-2">
            <button
              type="button"
              onClick={() => setGlobalSearchOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[var(--muted)] hover:text-white transition-colors text-xs font-semibold border border-white/[0.04]"
              title="Search all users (⌘K)"
            >
              <span className="flex items-center gap-2">
                <Search size={14} className="text-[var(--lavender)]" />
                <span>Find conversation or user</span>
              </span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-[var(--muted)]">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="px-2 pb-2">
            <button
              type="button"
              onClick={() => {
                setActiveChannelId(null);
                setStageChannelId(null);
                setMobileNav(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${!activeChannelId && !stageChannelId
                ? "bg-white/[0.12] text-white"
                : "text-[var(--muted)] hover:bg-white/[0.05] hover:text-white"
                }`}
            >
              <Users size={18} className={!activeChannelId && !stageChannelId ? "text-[var(--lavender)]" : "text-[#7c7599]"} />
              <span className="flex-1 text-left">Friends</span>
              {pendingFriendCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500 text-white font-black text-[11px] leading-tight">
                  {pendingFriendCount}
                </span>
              )}
            </button>
          </div>

          <div className="section-label flex items-center justify-between">
            <span>DIRECT MESSAGES</span>
            {user && (
              <span className="flex items-center gap-2">
              <button
                type="button"
                className="hover:text-white transition-colors"
                title="Create DM or group"
                aria-label="Create DM or group"
                onClick={() => setGroupDialog({ mode: "create" })}
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                className="hover:text-white transition-colors"
                title="Note to Self"
                onClick={() => void openDm(user.id)}
              >
                <StickyNote size={14} />
              </button>
              </span>
            )}
          </div>
          {visibleDms.map((dm) => {
            const isSelf = Boolean(user && dm.user.id === user.id);
            return (
              <div key={dm.channelId} className={`dm-row ${dm.pinned ? "is-pinned" : ""}`}>
              <button
                className={`channel dm-channel ${activeChannelId === dm.channelId ? "selected" : ""} ${unread[dm.channelId]?.unread ? "has-unread" : ""
                  }`}
                onClick={() => {
                  setActiveChannelId(dm.channelId);
                  setStageChannelId(null);
                  setMobileNav(false);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (dm.group) {
                    setUserMenu(null);
                    setGroupDmMenu({ dm, x: event.clientX, y: event.clientY });
                    return;
                  }
                  openUserMenu(event, dm.user, {
                    dmChannelId: dm.channelId,
                    dmPinned: dm.pinned,
                  });
                }}
              >
                {unread[dm.channelId]?.unread && <span className="unread-pill" />}
                <Avatar
                  className="tiny-avatar"
                  avatar={dm.user.avatar}
                  avatarUrl={dm.user.avatarUrl}
                  color={dm.user.color}
                />
                {dm.group ? (
                  <span className="dm-group-label">
                    <span className="truncate"><StyledText text={dm.user.displayName} /></span>
                    <small>
                      {dm.group.members.length}{" "}
                      {dm.group.members.length === 1 ? "Member" : "Members"}
                    </small>
                  </span>
                ) : (
                <span className="flex items-center gap-1.5 truncate">
                  <StyledText text={dm.user.displayName} />
                  {isSelf && " (Notes)"}
                </span>
                )}
                {dm.pinned && (
                  <Pin size={11} className="dm-pinned-indicator text-[var(--lavender)] fill-[var(--lavender)] rotate-45 ml-auto flex-shrink-0" />
                )}
                {dm.group ? null : isSelf ? (
                  <StickyNote size={12} className="text-amber-400/80 ml-auto flex-shrink-0" />
                ) : (
                  hub.online.has(dm.user.id) && <i className="dm-online" />
                )}
                {voiceRooms[dm.channelId]?.length > 0 && (
                  <PhoneCall size={12} className="text-green-400 ml-auto animate-pulse" />
                )}
                {(unread[dm.channelId]?.count ?? 0) > 0 && (
                  <span className="mention-badge">
                    {unread[dm.channelId].count}
                  </span>
                )}
              </button>
              <div className="dm-row-actions">
                <button
                  type="button"
                  className={`dm-action-btn dm-pin-btn ${dm.pinned ? "is-pinned" : ""}`}
                  aria-label={dm.pinned ? `Unpin conversation with ${dm.user.displayName}` : `Pin conversation with ${dm.user.displayName}`}
                  title={dm.pinned ? "Unpin conversation" : "Pin conversation"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void togglePinDm(dm.channelId, !dm.pinned);
                  }}
                >
                  <Pin size={12} className={dm.pinned ? "fill-current" : ""} />
                </button>
                <button
                  type="button"
                  className="dm-action-btn dm-close"
                  aria-label={`Close conversation with ${dm.user.displayName}`}
                  title="Close (messages are kept, reopen with Cmd+K)"
                  onClick={(e) => {
                    e.stopPropagation();
                    void setDmClosed(dm.channelId, true);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
              </div>
            );
          })}
          {!visibleDms.length && (
            <p className="sidebar-empty">
              Right-click someone or click the note icon above to start a conversation.
            </p>
          )}
        </nav>
      ) : (
        <nav className="channel-nav" aria-label="Channels">
          <div className="section-label">
            <span>Channels</span>
            {canManageChannels && (
              <span className="section-actions">
                <button
                  aria-label="Add category"
                  title="Add category"
                  onClick={() => void addCategory()}
                >
                  <ChevronDown size={14} /><Plus size={14} />
                </button>
                {/* One picker for all five kinds. Separate text/voice buttons
                    made the other three undiscoverable. */}
                <span className="channel-kind-picker">
                  <button
                    aria-label="Create channel"
                    title="Create channel"
                    aria-haspopup="menu"
                    aria-expanded={kindMenu?.categoryId === null}
                    onClick={() =>
                      setKindMenu(kindMenu?.categoryId === null ? null : { categoryId: null })
                    }
                  >
                    <Plus size={14} />
                  </button>
                  {kindMenu?.categoryId === null && renderKindMenu(null)}
                </span>
              </span>
            )}
          </div>

          <button
            type="button"
            className={`events-chip ${nextEvent && eventIsOpen(nextEvent) ? "is-open" : ""}`}
            onClick={() => setEventsOpen(true)}
            title={nextEvent ? `${nextEvent.title} · ${eventWhen(nextEvent)}` : "Plan an event"}
          >
            <CalendarDays size={15} />
            {nextEvent ? (
              <span className="events-chip-text">
                <strong>{nextEvent.title}</strong>
                <small>{eventWhen(nextEvent)}</small>
              </span>
            ) : (
              <span className="events-chip-text">
                <strong>Events</strong>
              </span>
            )}
            {serverEvents.length > 1 && <span className="events-chip-count">{serverEvents.length}</span>}
          </button>

          {/* Uncategorised channels sit above every category, Discord-style. */}
          <div className="category-body" {...categoryDropProps(null)}>
            {channelLayout.uncategorised.map((channel) => renderChannel(channel))}
          </div>

          {channelLayout.grouped.map(({ category, channels }) => {
            const collapsed = collapsedCats.has(category.id);
            return (
              <div className="category" key={category.id}>
                <div
                  className="category-head"
                  {...categoryDropProps(category.id)}
                >
                  <button
                    className="category-toggle"
                    onClick={() => toggleCategory(category.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (canManageChannels)
                        void renameCategory(category.id, category.name);
                    }}
                  >
                    <ChevronDown
                      size={14}
                      className={`cat-caret transition-transform ${collapsed ? "-rotate-90" : ""}`}
                    />
                    <span>{category.name}</span>
                  </button>
                  {canManageChannels && (
                    <span className="category-actions">
                      <span className="channel-kind-picker">
                        <button
                          aria-label={`Add channel to ${category.name}`}
                          title="Add channel here"
                          aria-haspopup="menu"
                          aria-expanded={kindMenu?.categoryId === category.id}
                          onClick={() =>
                            setKindMenu(
                              kindMenu?.categoryId === category.id
                                ? null
                                : { categoryId: category.id },
                            )
                          }
                        >
                          +
                        </button>
                        {kindMenu?.categoryId === category.id && renderKindMenu(category.id)}
                      </span>
                      <button
                        aria-label={`Delete ${category.name}`}
                        title="Delete category"
                        onClick={() => void deleteCategory(category.id, category.name)}
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <div className="category-body" {...categoryDropProps(category.id)}>
                    {channels.map((channel) => renderChannel(channel))}
                    {!channels.length && (
                      <p className="category-empty">Drag channels here</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        </nav>
      )}

      {/* Synchronized Music Bar - sits on top of mini-voice-bar */}
      {roomPlayer?.track && (
        <MiniMusicBar
          state={roomPlayer}
          position={player.position}
          controllable
          onToggle={() =>
            hub.send({
              t: "player",
              channelId: voice.channelId!,
              action: { name: "toggle" },
            })
          }
          onSeek={(positionMs) =>
            hub.send({
              t: "player",
              channelId: voice.channelId!,
              action: { name: "seek", positionMs },
            })
          }
          onSkip={() =>
            hub.send({
              t: "player",
              channelId: voice.channelId!,
              action: { name: "skip" },
            })
          }
        />
      )}

      {/* Mini voice bar - seamless top extension of discord-user-footer */}
      {voice.channelId && (
        <MiniVoiceBar
          voice={voice}
          roomName={
            servers.flatMap((s) => s.channels).find((c) => c.id === voice.channelId)?.name ||
            (dmCall && dmCall.channelId === voice.channelId
              ? dmCall.otherUser.displayName
              : "Voice Connected")
          }
          soundboardServerId={
            servers.find((s) => s.channels.some((c) => c.id === voice.channelId))?.id || null
          }
          quickSoundboardOpen={quickSoundboardOpen}
          setQuickSoundboardOpen={setQuickSoundboardOpen}
          sidebarShareSetupOpen={sidebarShareSetupOpen}
          setSidebarShareSetupOpen={setSidebarShareSetupOpen}
          setStageChannelId={setStageChannelId}
          soundboardAllowed={voiceSoundboardAllowed}
        />
      )}

      {user && (
        <UserFooter
          user={user}
          status={myStatus}
          customStatus={myCustomStatus || undefined}
          muted={voice.muted}
          deafened={voice.deafened}
          onToggleMute={voice.toggleMute}
          onToggleDeafen={voice.toggleDeafen}
          onOpenStatusMenu={() => setStatusOpen((o) => !o)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenProfileSettings={() => setSettingsOpen(true)}
          onMicrophoneChange={() => void voice.switchMicrophone()}
        />
      )}

      {/* Sidebar Resize Handle (Desktop) */}
      <div
        className="sidebar-resize-handle"
        onMouseDown={onSidebarResizeDown}
        title="Drag to resize channels"
      />
    </aside>
  );
}

export function ThreadPanel({
  threadRoot,
  threadWidth,
  onThreadResizeDown,
  activeChannel,
  setThreadRoot,
  membersById,
  roleColorFor,
  user,
  openProfileByHandle,
  setLightboxImage,
  emojiMap,
  activeServer,
  openMentionedChannel,
  setLightbox,
  setPdfViewer,
  resolvedInvites,
  servers,
  setActiveServerId,
  joinServerDirect,
  threadMessages,
  applyTheme,
  threadBottomRef,
  sendThreadReply,
  threadDraft,
  setThreadDraft,
}: {
  threadRoot: Message | null;
  threadWidth: number;
  onThreadResizeDown: (e: React.MouseEvent) => void;
  activeChannel: PublicChannel | null;
  setThreadRoot: Dispatch<SetStateAction<Message | null>>;
  membersById: Map<string, Member>;
  roleColorFor: (member: Member | undefined) => string | null;
  user: PublicUser;
  openProfileByHandle: (handle: string) => void;
  setLightboxImage: (img: string | null) => void;
  emojiMap: Record<string, string>;
  activeServer: PublicServer | null;
  openMentionedChannel: (target: MentionChannel) => void;
  setLightbox: Dispatch<SetStateAction<{ images: string[]; index: number; } | null>>;
  setPdfViewer: Dispatch<SetStateAction<{ url: string; name: string; } | null>>;
  resolvedInvites: Record<string, ResolvedInvite>;
  servers: PublicServer[];
  setActiveServerId: Dispatch<SetStateAction<string | null>>;
  joinServerDirect: (rawInput?: string) => Promise<void>;
  threadMessages: Message[];
  applyTheme: (next: "cozy" | "legacy" | "light" | Theme) => void;
  threadBottomRef: RefObject<HTMLDivElement | null>;
  sendThreadReply: () => Promise<void>;
  threadDraft: string;
  setThreadDraft: Dispatch<SetStateAction<string>>;
}) {
  return (
    <>
      {threadRoot && (
        <aside
          className="thread-panel"
          aria-label="Thread"
          style={{ width: `${threadWidth}px` }}
        >
          {/* Resize handle for thread panel */}
          <div
            className="thread-resize-handle"
            onMouseDown={onThreadResizeDown}
            title="Drag to resize thread"
          />

          <header className="thread-head">
            <div className="thread-head-info">
              <div className="thread-head-title-row">
                <MessageSquare size={16} className="thread-icon" />
                <span className="thread-title">
                  {threadRoot.text?.slice(0, 36) || (threadRoot.image ? "Image" : "Thread")}
                </span>
              </div>
              <span className="thread-head-channel">
                #{activeChannel?.name || "channel"}
              </span>
            </div>
            <div className="thread-head-actions">
              <button
                type="button"
                className="thread-close-btn"
                onClick={() => setThreadRoot(null)}
                aria-label="Close thread"
                title="Close thread"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="thread-body">
            <article className="message thread-root">
              <Avatar
                className="avatar"
                avatar={
                  (threadRoot.userId
                    ? membersById.get(threadRoot.userId)?.avatar
                    : null) || threadRoot.avatar
                }
                avatarUrl={
                  threadRoot.userId
                    ? membersById.get(threadRoot.userId)?.avatarUrl
                    : undefined
                }
                color={
                  (threadRoot.userId
                    ? membersById.get(threadRoot.userId)?.color
                    : null) || threadRoot.color
                }
              />
              <div className="message-body">
                <div className="message-meta">
                  <strong
                    style={{
                      color:
                        roleColorFor(
                          threadRoot.userId
                            ? membersById.get(threadRoot.userId)
                            : undefined,
                        ) || undefined,
                    }}
                  >
                    {threadRoot.author}
                  </strong>
                  <time title={formatClientDateTime(threadRoot.createdAt)}>
                    {formatClientTime(threadRoot.createdAt, threadRoot.time)}
                  </time>
                </div>
                <MessageBody
                  text={threadRoot.text}
                  selfHandle={user.username}
                  onMention={openProfileByHandle}
                  onImage={setLightboxImage}
                  emojis={emojiMap}
                  linkPreviews
                  channels={activeServer?.channels}
                  roles={activeServer?.roles}
                  onChannel={openMentionedChannel}
                />
                {(() => {
                  const allImages = [
                    threadRoot.image,
                    ...(threadRoot.images || []),
                  ].filter((img): img is string => typeof img === "string" && Boolean(img));
                  if (allImages.length === 0) return null;
                  return (
                    <ImageGallery
                      images={allImages}
                      onOpenLightbox={(imgs, idx) =>
                        setLightbox({ images: imgs, index: idx })
                      }
                    />
                  );
                })()}
                <MessageAttachmentFiles
                  files={threadRoot.files || threadRoot.file}
                  onPdf={(pdf) => setPdfViewer(pdf)}
                />
                {extractInviteCodes(threadRoot.text).map((code) => {
                  const inv = resolvedInvites[code];
                  if (!inv) return null;
                  const isCurrentlyMember = inv.server
                    ? servers.some((s) => s.id === inv.server?.id)
                    : false;
                  return (
                    <ServerInviteCard
                      key={code}
                      invite={inv}
                      isMember={isCurrentlyMember}
                      onJoin={() => {
                        if (isCurrentlyMember && inv.server) {
                          setActiveServerId(inv.server.id);
                        } else {
                          void joinServerDirect(code);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </article>

            <div className="thread-divider">
              <span>
                {threadMessages.length}{" "}
                {threadMessages.length === 1 ? "reply" : "replies"}
              </span>
            </div>

            {threadMessages.length === 0 && (
              <div className="thread-empty-state">
                <MessageSquare size={24} className="thread-empty-icon" />
                <p>No replies yet.</p>
                <span>Be the first to reply in this thread!</span>
              </div>
            )}

            {threadMessages.map((reply) => {
              const author = reply.userId
                ? membersById.get(reply.userId)
                : undefined;
              return (
                <article className="message thread-reply" key={reply.id}>
                  <Avatar
                    className="avatar"
                    avatar={author?.avatar || reply.avatar}
                    avatarUrl={author?.avatarUrl}
                    color={author?.color || reply.color}
                  />
                  <div className="message-body">
                    <div className="message-meta">
                      <strong
                        style={{ color: roleColorFor(author) || undefined }}
                      >
                        {author?.displayName || reply.author}
                      </strong>
                      <time title={formatClientDateTime(reply.createdAt)}>
                        {formatClientTime(reply.createdAt, reply.time)}
                      </time>
                    </div>
                    {reply.payload?.forwardedFrom ? (
                      <ForwardedMessageCard
                        data={reply.payload.forwardedFrom}
                        comment={reply.text}
                        selfHandle={user.username}
                        emojis={emojiMap}
                        onMention={openProfileByHandle}
                        onImage={setLightboxImage}
                        onPdf={setPdfViewer}
                        formatTime={(d) => formatClientTime(d, "")}
                      />
                    ) : (
                      <MessageBody
                        text={reply.text}
                        selfHandle={user.username}
                        onMention={openProfileByHandle}
                        onImage={setLightboxImage}
                        emojis={emojiMap}
                        linkPreviews
                        channels={activeServer?.channels}
                        roles={activeServer?.roles}
                        onChannel={openMentionedChannel}
                      />
                    )}
                    {reply.payload?.themeShare && (
                      <ThemeShareCard
                        theme={reply.payload.themeShare}
                        onApplyTheme={(th) => applyTheme(th)}
                      />
                    )}
                    {!reply.payload?.themeShare && reply.text?.includes("huddle-theme:v1:") && (() => {
                      const match = reply.text.match(/huddle-theme:v1:[a-zA-Z0-9+/=_-]+/);
                      if (!match) return null;
                      const parsed = importThemeCode(match[0]);
                      if (!parsed) return null;
                      return (
                        <ThemeShareCard
                          theme={parsed}
                          onApplyTheme={(th) => applyTheme(th)}
                        />
                      );
                    })()}
                    {(() => {
                      const allImages = [
                        reply.image,
                        ...(reply.images || []),
                      ].filter((img): img is string => typeof img === "string" && Boolean(img));
                      if (allImages.length === 0) return null;
                      return (
                        <ImageGallery
                          images={allImages}
                          onOpenLightbox={(imgs, idx) =>
                            setLightbox({ images: imgs, index: idx })
                          }
                        />
                      );
                    })()}
                    <MessageAttachmentFiles
                      files={reply.files || reply.file}
                      onPdf={(pdf) => setPdfViewer(pdf)}
                    />
                    {extractInviteCodes(reply.text).map((code) => {
                      const inv = resolvedInvites[code];
                      if (!inv) return null;
                      const isCurrentlyMember = inv.server
                        ? servers.some((s) => s.id === inv.server?.id)
                        : false;
                      return (
                        <ServerInviteCard
                          key={code}
                          invite={inv}
                          isMember={isCurrentlyMember}
                          onJoin={() => {
                            if (isCurrentlyMember && inv.server) {
                              setActiveServerId(inv.server.id);
                            } else {
                              void joinServerDirect(code);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </article>
              );
            })}
            <div ref={threadBottomRef} />
          </div>

          <form
            className="thread-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendThreadReply();
            }}
          >
            <div className="thread-composer-inner">
              <textarea
                value={threadDraft}
                rows={1}
                ref={(node) => {
                  if (node) fitComposer(node);
                }}
                placeholder="Reply in thread…"
                aria-label="Reply in thread"
                onChange={(event) => setThreadDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendThreadReply();
                  }
                }}
              />
              <button
                type="submit"
                className={`thread-send-btn ${threadDraft.trim() ? "can-send" : ""}`}
                disabled={!threadDraft.trim()}
                aria-label="Send reply"
                title="Send reply"
              >
                <Send size={15} />
              </button>
            </div>
          </form>
        </aside>
      )}
    </>
  );
}

export function MemberPanel({
  membersOpen,
  inDmHome,
  activeChannelId,
  voice,
  collapsedGroups,
  onMembersResizeDown,
  msnTheme,
  setCollapsedGroups,
  voiceParticipants,
  currentVoiceChannel,
  sidebarShareSetupOpen,
  setSidebarShareSetupOpen,
  stageChannelId,
  setStageChannelId,
  memberFilterQuery,
  setMemberFilterQuery,
  userMenuHandlers,
  openProfile,
  queueHoverCard,
  roleColorFor,
  presenceOf,
  user,
  myCustomStatus,
  prefFor,
  hub,
  msnContacts,
  onlineMembers,
  offlineMembers,
  renameContactGroup,
  deleteContactGroup,
  createContactGroup,
  whatsNew,
  whatsNewPeople,
  setGlobalSearchOpen,
}: {
  membersOpen: boolean;
  inDmHome: boolean;
  activeChannelId: string | null;
  voice: { important: boolean; toggleImportant: () => void; tableSeatOrder: string[]; tableSeatPans: Record<string, number>; setTableSeatPans: Dispatch<SetStateAction<Record<string, number>>>; tableWidth: number; setTableWidth: Dispatch<SetStateAction<number>>; headTracking: boolean; setHeadTracking: (enabled: boolean) => void; headTrackingOffered: boolean; airpodsOffered: boolean; headTrackingSource: HeadTrackingSource; setHeadTrackingSource: (source: HeadTrackingSource) => void; spatialOutput: SpatialOutput; setSpatialOutput: (output: SpatialOutput) => void; headTrackingStatus: { status: HeadTrackingStatus; live: boolean; }; onHeadTracking: (status: HeadTrackingStatus, live: boolean) => void; recenterHead: () => void; tableMode: boolean; setTableMode: (enabled: boolean) => void; tableHostId: string; setTableHostId: Dispatch<SetStateAction<string>>; channelId: string | null; muted: boolean; forcedMute: boolean; setForcedMute: (next: boolean) => void; deafened: boolean; handRaised: boolean; toggleHand: () => void; hiddenVideo: Record<string, VideoPause>; setVideoHidden: (remoteId: string, which: keyof VideoPause, hidden: boolean) => void; setStageSpeaker: (targetConnectionId: string, allowed: boolean) => void; speakingStore: SpeakingStore; remoteStreams: RemoteVoiceStream[]; sfuMode: boolean; peerStates: Record<string, string>; screenSharing: boolean; streamViewers: string[]; signalStreamWatch: (streamerConnectionId: string, watching: boolean) => void; latency: VoiceLatencyStats; isSfu: boolean; voiceRegion: "nl" | "de" | null; switchRegion: (targetRegion?: "nl" | "de") => Promise<void>; screenShareAudio: boolean; setScreenShareAudio: (enabled: boolean) => void; hasScreenAudio: boolean; screenAudioMuted: boolean; toggleScreenAudio: () => void; screenQuality: "480p15" | "480p24" | "480p30" | "480p60" | "720p15" | "720p24" | "720p30" | "720p60" | "900p15" | "900p24" | "900p30" | "900p60" | "1080p15" | "1080p24" | "1080p30" | "1080p60"; setScreenQuality: (quality: ScreenShareQuality) => void; screenFilm: boolean; setScreenFilm: (enabled: boolean) => void; startScreenShare: (quality?: ScreenShareQuality, withAudio?: boolean, film?: boolean) => Promise<void>; stopScreenShare: () => void; cameraOn: boolean; cameraBackground: BackgroundMode; setCameraBackground: (mode: BackgroundMode) => Promise<void>; cameraBlurAmount: number; setCameraBlurAmount: (amount: number) => void; cameraBackgroundImage: string; setCameraBackgroundImage: (imageId: string) => void; startCamera: () => Promise<void>; stopCamera: () => void; switchMicrophone: () => Promise<void>; activeMicrophone: () => { deviceId: string; ended: boolean; } | null; micSettings: MicSettings; setMicSettings: (next: Partial<MicSettings>) => void; subscribeMicTelemetry: (listener: (telemetry: MicTelemetry) => void) => () => void; localVideos: { kind: "camera" | "screen"; stream: MediaStream; }[]; error: string; setError: Dispatch<SetStateAction<string>>; relay: RelayStatus; recheckRelay: () => Promise<void>; join: (nextChannelId: string, options?: { startMuted?: boolean; }) => Promise<void>; leave: () => void; toggleMute: () => void; toggleDeafen: () => void; handleSignal: (from: string, raw: unknown) => Promise<void>; takeClip: () => Promise<Blob | null>; clipSeconds: number; pushToTalk: boolean; pttKey: string; pttHeld: boolean; muteKey: string; deafenKey: string; setMuteKey: (combo: string) => void; setDeafenKey: (combo: string) => void; setPushToTalk: (enabled: boolean) => void; setPttKey: (code: string) => void; pttPress: () => void; pttRelease: () => void; speakIntoCall: (audio: Float32Array, sampleRate: number) => Promise<"sent" | "no-call" | "no-server" | "server-muted" | "busy" | "too-long">; stopSpeaking: () => void; canSpeak: () => boolean; };
  collapsedGroups: Record<string, boolean | undefined>;
  onMembersResizeDown: (e: React.MouseEvent) => void;
  msnTheme: boolean;
  setCollapsedGroups: Dispatch<SetStateAction<Record<string, boolean | undefined>>>;
  voiceParticipants: VoiceParticipant[];
  currentVoiceChannel: PublicChannel | undefined;
  sidebarShareSetupOpen: boolean;
  setSidebarShareSetupOpen: Dispatch<SetStateAction<boolean>>;
  stageChannelId: string | null;
  setStageChannelId: Dispatch<SetStateAction<string | null>>;
  memberFilterQuery: string;
  setMemberFilterQuery: Dispatch<SetStateAction<string>>;
  userMenuHandlers: (member: Member) => { onContextMenu: (event: MouseEvent) => void; onClick: (event: MouseEvent) => void; };
  openProfile: (member: Member, e?: React.MouseEvent) => void;
  queueHoverCard: (member: Member | null, anchor?: HTMLElement) => void;
  roleColorFor: (member: Member | undefined) => string | null;
  presenceOf: (member: Member) => PresenceStatus | "offline";
  user: PublicUser;
  myCustomStatus: string | null;
  prefFor: (id: string) => VoicePref;
  hub: { send: (event: ClientEvent) => boolean; serverNow: () => number; connected: boolean; connectionId: string | null; session: number; online: Set<string>; voice: Record<string, VoiceParticipant[]>; players: Record<string, PlayerState>; recordings: Record<string, RecordingState>; forcedMutes: Set<string>; };
  msnContacts: { contacts: MsnContacts; update: (change: (current: MsnContacts) => MsnContacts) => void; };
  onlineMembers: Member[];
  offlineMembers: Member[];
  renameContactGroup: (groupId: string) => void;
  deleteContactGroup: (groupId: string) => void;
  createContactGroup: (thenPlace?: string) => void;
  whatsNew: { feed: WhatsNewEntry[]; clear: () => void; };
  whatsNewPeople: Member[];
  setGlobalSearchOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <aside
      className={`member-panel ${membersOpen && !(inDmHome && !activeChannelId) ? "" : "closed"} ${
        voice.channelId && !collapsedGroups.voice ? "voice-panel-open" : ""
      }`}
    >
      {/* Resize handle for members panel (Desktop) */}
      <div
        className="member-resize-handle"
        onMouseDown={onMembersResizeDown}
        title="Drag to resize member list"
      />

      {/* Outside MSN the sidebar voice bar already has these controls. */}
      {msnTheme && voice.channelId && (
        <>
          <div
            className={`member-panel-title voice-panel-title ${collapsedGroups.voice ? "msn-collapsed" : ""}`}
            role="button"
            tabIndex={0}
            aria-expanded={!collapsedGroups.voice}
            onClick={() => setCollapsedGroups((g) => ({ ...g, voice: !g.voice }))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setCollapsedGroups((g) => ({ ...g, voice: !g.voice }));
              }
            }}
          >
            <span>IN VOICE — {voiceParticipants.length}</span>
          </div>
          {!collapsedGroups.voice && (
          <>
          <div className="voice-feature">
            <div className="voice-feature-avatars">
              {voiceParticipants.slice(0, 5).map((person) => (
                <Avatar
                  key={person.connectionId}
                  avatar={person.avatar}
                  avatarUrl={person.avatarUrl}
                  color={person.color}
                />
              ))}
            </div>
            <strong>{currentVoiceChannel?.name}</strong>
            <p>
              {voiceParticipants.length === 1
                ? "Just you so far"
                : `${voiceParticipants.length} in the room`}
            </p>
            <div className="voice-controls">
              <button
                className={`mic-control ${voice.muted ? "muted" : ""}`}
                onClick={voice.toggleMute}
                disabled={voice.forcedMute}
              >
                {voice.forcedMute
                  ? "Server muted"
                  : voice.muted
                    ? "Muted"
                    : "Mic on"}
              </button>
              <button className="leave-outline" onClick={voice.leave}>
                Leave
              </button>
            </div>
            <div className="screen-share-controls compact">
              <button
                className={voice.screenSharing ? "sharing" : sidebarShareSetupOpen ? "active" : ""}
                aria-expanded={!voice.screenSharing && sidebarShareSetupOpen}
                onClick={() =>
                  voice.screenSharing
                    ? voice.stopScreenShare()
                    : setSidebarShareSetupOpen((open) => !open)
                }
              >
                {voice.screenSharing ? `Stop · ${screenQualityLabel(voice.screenQuality)}` : "Share screen"}
              </button>
              <button
                className={voice.cameraOn ? "sharing" : ""}
                onClick={() =>
                  voice.cameraOn ? voice.stopCamera() : void voice.startCamera()
                }
              >
                {voice.cameraOn ? "Camera off" : "Camera"}
              </button>
            </div>
            {sidebarShareSetupOpen && !voice.screenSharing && (
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
            )}
          </div>

          {stageChannelId !== voice.channelId && voice.channelId && (
            <button
              type="button"
              className="open-stage-button"
              onClick={() => setStageChannelId(voice.channelId)}
            >
              Open call view
            </button>
          )}
          </>
          )}
        </>
      )}

      <div className="px-3 pt-2 pb-1">
        <div className="relative flex items-center">
          <input
            type="text"
            value={memberFilterQuery}
            onChange={(e) => setMemberFilterQuery(e.target.value)}
            placeholder="Search members..."
            className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] text-xs text-white placeholder-white/40 rounded-lg px-2.5 py-1.5 outline-none transition-colors border border-white/5 focus:border-[var(--lavender)]/50"
          />
          {memberFilterQuery && (
            <button
              type="button"
              onClick={() => setMemberFilterQuery("")}
              className="absolute right-2 text-white/40 hover:text-white text-xs px-1"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {(() => {
        // One row per contact; Online and Not Online share it, and so do
        // the MSN theme's own groups.
        const row = (member: Member, offline: boolean) =>
          offline ? (
        <div
          className="member offline-member clickable-name"
          key={member.id}
          {...userMenuHandlers(member)}
          onClick={() => openProfile(member)}
            onMouseEnter={(event) => msnTheme && queueHoverCard(member, event.currentTarget)}
            onMouseLeave={() => msnTheme && queueHoverCard(null)}
        >
          <Avatar
            className="member-avatar"
            avatar={member.avatar}
            avatarUrl={member.avatarUrl}
            color={member.color}
          />
          <div>
            <div className="member-name-line">
              <strong style={{ color: roleColorFor(member) || undefined }}>
                <StyledText text={member.displayName} />
              </strong>
              <PrideBadges badges={member.prideBadges} mini />
              {activeUntil(member.timeoutUntil) && (
                <span
                  className="member-timeout-icon"
                  title={`Timed out until ${formatClientDateTime(member.timeoutUntil!)}`}
                  aria-label="Timed out"
                >
                  <Timer size={12} />
                </span>
              )}
            </div>
          </div>
        </div>
          ) : (
        <div
          className="member clickable-name"
          key={member.id}
          {...userMenuHandlers(member)}
          onClick={() => openProfile(member)}
            onMouseEnter={(event) => msnTheme && queueHoverCard(member, event.currentTarget)}
            onMouseLeave={() => msnTheme && queueHoverCard(null)}
        >
          <Avatar
            className="member-avatar"
            avatar={member.avatar}
            avatarUrl={member.avatarUrl}
            color={member.color}
          >
            <span
              className="presence-dot"
              title={
                PRESENCE[
                  (presenceOf(member) === "offline"
                    ? "invisible"
                    : presenceOf(member)) as PresenceStatus
                ].label
              }
              style={{
                background:
                  presenceOf(member) === "offline"
                    ? PRESENCE.invisible.color
                    : PRESENCE[presenceOf(member) as PresenceStatus].color,
              }}
            />
          </Avatar>
          <div>
            <div className="member-name-line">
              <strong style={{ color: roleColorFor(member) || undefined }}>
                <StyledText text={member.displayName} />
              </strong>
              <PrideBadges badges={member.prideBadges} mini />
              {activeUntil(member.timeoutUntil) && (
                <span
                  className="member-timeout-icon"
                  title={`Timed out until ${formatClientDateTime(member.timeoutUntil!)}`}
                  aria-label="Timed out"
                >
                  <Timer size={12} />
                </span>
              )}
            </div>
            <span>
              <StyledText text={(member.id === user.id ? myCustomStatus : member.customStatus) ||
                memberActivityLine(member) ||
                (member.id === user.id
                  ? "Here now"
                  : prefFor(member.id).muted
                    ? "Muted for you"
                    : hub.forcedMutes.has(member.id)
                      ? "Server muted"
                      : PRESENCE[
                        (presenceOf(member) === "offline"
                          ? "invisible"
                          : presenceOf(member)) as PresenceStatus
                      ].label)} />
            </span>
          </div>
        </div>
          );
        const placement = msnTheme ? msnContacts.contacts.placement : {};
        const groups = msnTheme ? msnContacts.contacts.groups : [];
        const unplaced = (list: Member[]) =>
          groups.length ? list.filter((m) => !groups.some((g) => g.id === placement[m.id])) : list;
        const looseOnline = unplaced(onlineMembers);
        const looseOffline = unplaced(offlineMembers);
        const header = (key: string, label: string, extraClass: string, tools?: ReactNode) => (
          <div
            className={`member-panel-title ${extraClass} ${msnTheme && collapsedGroups[key] ? "msn-collapsed" : ""}`}
            role={msnTheme ? "button" : undefined}
            tabIndex={msnTheme ? 0 : undefined}
            aria-expanded={msnTheme ? !collapsedGroups[key] : undefined}
            onClick={() => msnTheme && setCollapsedGroups((g) => ({ ...g, [key]: !g[key] }))}
            onKeyDown={(event) => {
              if (msnTheme && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                setCollapsedGroups((g) => ({ ...g, [key]: !g[key] }));
              }
            }}
          >
            <span>{label}</span>
            {tools}
          </div>
        );
        // MSN groups stop growing at about ten contacts and scroll instead.
        const rows = (nodes: ReactNode) =>
          msnTheme ? <div className="msn-contact-scroll">{nodes}</div> : nodes;
        return (
          <>
            {groups.map((group) => {
              const inGroupOnline = onlineMembers.filter((m) => placement[m.id] === group.id);
              const inGroupOffline = offlineMembers.filter((m) => placement[m.id] === group.id);
              return (
                <div key={group.id} className="msn-contact-group">
                  {header(
                    `group:${group.id}`,
                    `${group.name} (${inGroupOnline.length}/${inGroupOnline.length + inGroupOffline.length})`,
                    "msn-group-title",
                    <span className="msn-group-tools" onClick={(event) => event.stopPropagation()}>
                      <button type="button" title="Rename group" onClick={() => renameContactGroup(group.id)}>
                        ✎
                      </button>
                      <button type="button" title="Delete group" onClick={() => deleteContactGroup(group.id)}>
                        ×
                      </button>
                    </span>,
                  )}
                  {!collapsedGroups[`group:${group.id}`] &&
                    rows(
                      <>
                        {inGroupOnline.map((member) => row(member, false))}
                        {inGroupOffline.map((member) => row(member, true))}
                      </>,
                    )}
                </div>
              );
            })}
            {header(
              "online",
              msnTheme ? `Online (${looseOnline.length})` : `Online — ${looseOnline.length}`,
              "online-title",
            )}
            {!(msnTheme && collapsedGroups.online) && rows(looseOnline.map((member) => row(member, false)))}
            {header(
              "offline",
              msnTheme ? `Not Online (${looseOffline.length})` : `Offline — ${looseOffline.length}`,
              "offline-title",
            )}
            {!(msnTheme && collapsedGroups.offline) && rows(looseOffline.map((member) => row(member, true)))}
            {msnTheme && (
              <button type="button" className="msn-add-group" onClick={() => createContactGroup()}>
                + Create a group
              </button>
            )}
          </>
        );
      })()}
      {msnTheme && (
        <MsnWhatsNew
          feed={whatsNew.feed}
          onClear={whatsNew.clear}
          onOpen={(id) => {
            const person = whatsNewPeople.find((p) => p.id === id);
            if (person) openProfile(person);
          }}
        />
      )}
      {msnTheme && <MsnAdBanner onClick={() => setGlobalSearchOpen(true)} />}
    </aside>
  );
}
