"use client";

import { WidgetArea } from "../../widgets/widget-area";
import type { VoiceApi } from "../../../hooks/use-voice";
import type { PublicChannel } from "@/lib/servers";
import { Search, Pin, Bookmark, Settings, Users, Menu, MoreHorizontal, Pencil, StickyNote, Volume1, Volume2, VolumeX, PhoneCall, Video, UserPlus, AtSign, Monitor, Maximize2, ExternalLink, LogOut, MessageCircle, Award } from "lucide-react";
import { type DmSummary } from "../../../lib/chat/types";
import { channelKindIcon } from "../channel-kind";
import { Icon } from "../icon-button";
import { openAchievements } from "../../../lib/achievement-client";
import { nextScreenQuality, screenQualityLabel } from "../../../hooks/use-voice";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { VoiceParticipant } from "@/lib/protocol";
import type { Battlemap } from "@/lib/battlemap";
import { useI18n } from "@/app/lib/i18n-context";

export function ChatHeader({
  setMobileNav,
  stageChannel,
  inDmHome,
  isSelfDm,
  activeChannel,
  channelTitle,
  activeScreenShare,
  voiceParticipants,
  activeDm,
  voice,
  streamPreferenceFor,
  toggleStreamMute,
  setStreamVolume,
  setStageChannelId,
  setPipDismissed,
  voiceViewMode,
  setVoiceViewMode,
  battlemap,
  openBattlemap,
  closeBattlemap,
  togglePinDm,
  setGroupDialog,
  renameGroupDm,
  leaveGroupDm,
  activeChannelId,
  dmCall,
  voiceRooms,
  setDmCall,
  startDmCall,
  setGlobalSearchOpen,
  searchOpen,
  setSearchOpen,
  mentionsOpen,
  unreadMentionTotal,
  setMentionsOpen,
  pinsOpen,
  setPinsOpen,
  savedOpen,
  setSavedOpen,
  loadSaved,
  msnTheme,
  setSettingsOpen,
  membersOpen,
  setMembersOpen,
  voiceChatOpen,
  setVoiceChatOpen,
}: {
  setMobileNav: Dispatch<SetStateAction<boolean>>;
  stageChannel: PublicChannel | null;
  inDmHome: boolean;
  isSelfDm: boolean;
  activeChannel: PublicChannel | null;
  channelTitle: string;
  activeScreenShare: { streamerName: string; isScreen: boolean; streamId?: string; participantId?: string; self?: boolean; } | null;
  voiceParticipants: VoiceParticipant[];
  activeDm: DmSummary | null;
  voice: VoiceApi;
  streamPreferenceFor: (streamId: string, userId?: string) => { volume: number; muted: boolean; };
  toggleStreamMute: (streamId: string, userId: string | undefined) => void;
  setStreamVolume: (streamId: string, userId: string | undefined, volume: number) => void;
  setStageChannelId: Dispatch<SetStateAction<string | null>>;
  setPipDismissed: Dispatch<SetStateAction<boolean>>;
  voiceViewMode: "map" | "grid" | "table";
  setVoiceViewMode: Dispatch<SetStateAction<"map" | "grid" | "table">>;
  battlemap: Battlemap | null;
  openBattlemap: () => void;
  closeBattlemap: () => void;
  togglePinDm: (channelId: string, pinned: boolean) => Promise<void>;
  setGroupDialog: Dispatch<SetStateAction<{ mode: "create"; } | { mode: "add"; channelId: string; } | null>>;
  renameGroupDm: (dm: DmSummary) => void;
  leaveGroupDm: (dm: DmSummary) => void;
  activeChannelId: string | null;
  dmCall: { channelId: string; otherUser: { id: string; displayName: string; avatar?: string; avatarUrl?: string | null; color?: string; }; status: "calling" | "connected"; startTime: number; isVideo?: boolean; seenOther?: boolean; } | null;
  voiceRooms: Record<string, VoiceParticipant[]>;
  setDmCall: Dispatch<SetStateAction<{ channelId: string; otherUser: { id: string; displayName: string; avatar?: string; avatarUrl?: string | null; color?: string; }; status: "calling" | "connected"; startTime: number; isVideo?: boolean; seenOther?: boolean; } | null>>;
  startDmCall: (video?: boolean) => void;
  setGlobalSearchOpen: Dispatch<SetStateAction<boolean>>;
  searchOpen: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  mentionsOpen: boolean;
  unreadMentionTotal: number;
  setMentionsOpen: Dispatch<SetStateAction<boolean>>;
  pinsOpen: boolean;
  setPinsOpen: Dispatch<SetStateAction<boolean>>;
  savedOpen: boolean;
  setSavedOpen: Dispatch<SetStateAction<boolean>>;
  loadSaved: () => Promise<void>;
  msnTheme: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  membersOpen: boolean;
  setMembersOpen: Dispatch<SetStateAction<boolean>>;
  voiceChatOpen: boolean;
  setVoiceChatOpen: (open: boolean) => void;
}) {
  const { t } = useI18n();
  // Phones keep only the essentials in the header; the rest sit behind "More".
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [moreOpen]);
  const pick = (action: () => void) => () => {
    setMoreOpen(false);
    action();
  };
  const toggleSaved = () => {
    setSavedOpen((open) => !open);
    void loadSaved();
  };
  return (
    <header className="chat-header">
            <button
              className="mobile-menu"
              aria-label={t("header.openChannels")}
              onClick={() => setMobileNav((open) => !open)}
            >
              <Menu size={20} />
            </button>
            <span className="big-hash">
              {stageChannel ? (
                channelKindIcon(stageChannel.kind, 20)
              ) : inDmHome ? (
                isSelfDm ? (
                  <StickyNote size={20} />
                ) : (
                  <AtSign size={20} />
                )
              ) : (
                channelKindIcon(activeChannel?.kind ?? "text", 20)
              )}
            </span>
            <div className="channel-heading min-w-0 flex items-center gap-2">
              <strong className="truncate">{stageChannel ? stageChannel.name : channelTitle}</strong>
              {stageChannel && activeScreenShare && (
                <>
                  <span className="voice-stage-topbar-divider text-[var(--muted)]/40 font-light select-none">/</span>
                  <div className="voice-stage-stream-badge flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--line)] text-xs text-[var(--ink)] font-semibold truncate">
                    <Monitor size={13} className="text-[var(--lavender)] flex-shrink-0" />
                    <span className="truncate">{t("header.screenShare", { streamerName: activeScreenShare.streamerName })}</span>
                  </div>
                </>
              )}
              <span className="text-xs text-[var(--muted)] whitespace-nowrap flex-shrink-0">
                {stageChannel
                  ? `· ${t("header.inCall", { count: voiceParticipants.length })}`
                  : inDmHome
                    ? activeDm
                      ? isSelfDm
                        ? t("header.dmNotes")
                        : activeDm.group
                          ? t("header.dmGroupMembers", { count: activeDm.group.members.length })
                          : t("header.dmJustYouAnd", { name: activeDm.user.displayName })
                      : t("header.pickConversation")
                    : activeChannel?.topic ||
                    (activeChannel
                      ? t("header.channelDefaultTopic", { name: activeChannel.name })
                      : t("header.createChannelHint"))}
              </span>
            </div>
            <div className="header-actions items-center">
              <WidgetArea area="header" />
              {stageChannel && (
                <div className="voice-stage-header-controls flex items-center gap-2 mr-1 flex-shrink-0">
                  {activeScreenShare && (
                    <>
                      <div className="voice-stream-quality-pill flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--panel)] border border-[var(--line)] shadow-sm">
                        <button
                          type="button"
                          className="voice-quality-btn text-[11px] font-bold text-[var(--ink)] hover:text-[var(--lavender)] transition-colors cursor-pointer"
                          title={t("header.cycleQuality")}
                          onClick={() => {
                            const nextQ = nextScreenQuality(voice.screenQuality);
                            voice.setScreenQuality(nextQ);
                          }}
                        >
                          {screenQualityLabel(voice.screenQuality)}
                        </button>
                        <span className="voice-live-badge-red text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#ed4245] text-white">
                          {t("header.live")}
                        </span>
                      </div>

                      {/* Streamer Audio Mute Toggle (if you are sharing screen) */}
                      {(activeScreenShare.self || voice.screenSharing) && (
                        <button
                          type="button"
                          className={`voice-stage-topbar-btn ${voice.screenAudioMuted ? "text-amber-400 bg-amber-500/10" : ""}`}
                          onClick={voice.toggleScreenAudio}
                          title={voice.screenAudioMuted ? t("header.streamAudioMuted") : t("header.muteStreamAudio")}
                        >
                          {voice.screenAudioMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                        </button>
                      )}

                      {/* Watcher Stream Audio Volume Slider (if watching someone else) */}
                      {!(activeScreenShare.self || voice.screenSharing) && (
                        (() => {
                          const sId = activeScreenShare.streamId || "";
                          const pId = activeScreenShare.participantId;
                          const pref = streamPreferenceFor(sId, pId);
                          return (
                            <div className="voice-stream-volume-pill flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--panel)] border border-[var(--line)] shadow-sm">
                              <button
                                type="button"
                                className="hover:text-[var(--lavender)] transition-colors cursor-pointer p-0.5"
                                onClick={() => toggleStreamMute(sId, pId)}
                                title={pref.muted ? t("header.unmuteStreamAudio") : t("header.streamAudioVolume", { volume: pref.volume })}
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
                                onChange={(e) => setStreamVolume(sId, pId, Number(e.target.value))}
                                className="w-16 accent-[var(--lavender)] h-1 cursor-pointer"
                                title={t("header.streamVolume", { volume: pref.muted ? 0 : pref.volume })}
                              />
                              <span className="text-[11px] font-mono text-[var(--ink)] w-7 text-right select-none">
                                {pref.muted ? "0%" : `${pref.volume}%`}
                              </span>
                            </div>
                          );
                        })()
                      )}

                      <button
                        type="button"
                        className="voice-stage-topbar-btn"
                        onClick={() => {
                          setStageChannelId(null);
                          setPipDismissed(false);
                        }}
                        title={t("header.popOutPreview")}
                      >
                        <ExternalLink size={15} />
                      </button>
                    </>
                  )}

                  <div className="voice-view-switcher">
                    {(["grid", "table", "map"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`voice-view-pill ${voiceViewMode === mode ? "active" : ""}`}
                        onClick={() => {
                          setVoiceViewMode(mode);
                          if (mode === "map" && !battlemap) {
                            void openBattlemap();
                          } else if (mode !== "map" && battlemap) {
                            closeBattlemap();
                          }
                        }}
                      >
                        {t(`header.view.${mode}` as const)}
                      </button>
                    ))}
                  </div>

                  {stageChannel.serverId && (
                    <button
                      type="button"
                      className={`voice-stage-topbar-btn ${voiceChatOpen ? "active" : ""}`}
                      onClick={() => setVoiceChatOpen(!voiceChatOpen)}
                      title={voiceChatOpen ? t("header.hideChat") : t("header.showChat")}
                      aria-label={voiceChatOpen ? t("header.hideChat") : t("header.showChat")}
                      aria-pressed={voiceChatOpen}
                    >
                      <MessageCircle size={16} />
                    </button>
                  )}

                  <div className="w-[1px] h-5 bg-[var(--line)] mx-1 opacity-60 flex-shrink-0" />
                </div>
              )}
              {inDmHome && activeDm?.group && (
                <div className="dm-call-actions">
                  <button
                    type="button"
                    className={`dm-call-btn flex items-center gap-1.5 ${activeDm.pinned ? "active" : ""}`}
                    onClick={() => void togglePinDm(activeDm.channelId, !activeDm.pinned)}
                    title={activeDm.pinned ? t("header.unpinGroup") : t("header.pinGroup")}
                  >
                    <Pin size={15} className={activeDm.pinned ? "fill-current" : ""} />
                    <span>{activeDm.pinned ? t("header.pinned") : t("header.pin")}</span>
                  </button>
                  <button
                    type="button"
                    className="dm-call-btn flex items-center gap-1.5"
                    onClick={() => setGroupDialog({ mode: "add", channelId: activeDm.channelId })}
                    title={t("header.addFriendsToGroup")}
                  >
                    <UserPlus size={15} /> {t("header.add")}
                  </button>
                  <button
                    type="button"
                    className="dm-call-btn flex items-center gap-1.5"
                    onClick={() => renameGroupDm(activeDm)}
                    title={t("header.renameGroup")}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="dm-call-btn flex items-center gap-1.5"
                    onClick={() => leaveGroupDm(activeDm)}
                    title={t("header.leaveGroup")}
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              )}
              {inDmHome && activeChannelId && activeDm && !activeDm.group && (
                <div className="dm-call-actions">
                  <button
                    type="button"
                    className={`dm-call-btn flex items-center gap-1.5 ${activeDm.pinned ? "active" : ""}`}
                    onClick={() => void togglePinDm(activeDm.channelId, !activeDm.pinned)}
                    title={activeDm.pinned ? t("header.unpinConversation") : t("header.pinConversation")}
                  >
                    <Pin size={15} className={activeDm.pinned ? "fill-current" : ""} />
                    <span>{activeDm.pinned ? t("header.pinned") : t("header.pin")}</span>
                  </button>
                  {!isSelfDm && (
                    dmCall && dmCall.channelId === activeChannelId ? (
                      <button
                        type="button"
                        className="dm-call-btn flex items-center gap-1.5"
                        onClick={() => setStageChannelId(activeChannelId)}
                        title={t("header.openFullCallView")}
                      >
                        <Maximize2 size={15} /> {t("header.callView")}
                      </button>
                    ) : voiceRooms[activeChannelId]?.length > 0 && voice.channelId !== activeChannelId ? (
                      <button
                        type="button"
                        className="dm-join-call-btn flex items-center gap-1.5"
                        onClick={() => {
                          void voice.join(activeChannelId);
                          if (activeDm) {
                            setDmCall({
                              channelId: activeChannelId,
                              otherUser: activeDm.user,
                              status: "connected",
                              startTime: Date.now(),
                            });
                          }
                        }}
                        title={t("header.joinOngoingCall")}
                      >
                        <PhoneCall size={15} /> {t("header.joinCall")}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="dm-call-btn flex items-center gap-1.5"
                          onClick={() => startDmCall(false)}
                          title={t("header.startVoiceCall")}
                        >
                          <PhoneCall size={15} /> {t("header.startCall")}
                        </button>
                        <button
                          type="button"
                          className="dm-call-btn flex items-center gap-1.5"
                          onClick={() => startDmCall(true)}
                          title={t("header.startVideoCall")}
                        >
                          <Video size={15} /> {t("header.videoCall")}
                        </button>
                      </>
                    )
                  )}
                </div>
              )}
              {!inDmHome && (
                <span className="header-extra">
                  <Icon
                    label={t("header.findUsers")}
                    onClick={() => setGlobalSearchOpen(true)}
                  >
                    <UserPlus size={18} />
                  </Icon>
                </span>
              )}
              {!inDmHome && (
                <Icon
                  label={t("header.searchMessages")}
                  active={searchOpen}
                  onClick={() => setSearchOpen((open) => !open)}
                >
                  <Search size={18} />
                </Icon>
              )}
              <Icon
                label={t("header.mentions")}
                active={mentionsOpen}
                badge={unreadMentionTotal}
                onClick={() => setMentionsOpen((open) => !open)}
              >
                <AtSign size={18} />
              </Icon>
              <span className="header-extra">
                <Icon
                  label={t("header.pinnedMessages")}
                  active={pinsOpen}
                  onClick={() => setPinsOpen((open) => !open)}
                >
                  <Pin size={18} />
                </Icon>
                <Icon label={t("header.savedMessages")} active={savedOpen} onClick={toggleSaved}>
                  <Bookmark size={18} />
                </Icon>
                <Icon
                  label={t("header.achievements")}
                  onClick={() => openAchievements()}
                >
                  <Award size={18} />
                </Icon>
              </span>
              {/* Settings already lives in the user footer; MSN shows it as "Options". */}
              {msnTheme && (
                <Icon label={t("common.settings")} onClick={() => setSettingsOpen(true)}>
                  <Settings size={18} />
                </Icon>
              )}
              <Icon
                label={t("header.toggleMemberList")}
                active={membersOpen}
                onClick={() => setMembersOpen((open) => !open)}
              >
                <Users size={18} />
              </Icon>
              <div className="header-more" ref={moreRef}>
                <Icon label={t("header.more")} active={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
                  <MoreHorizontal size={18} />
                </Icon>
                {moreOpen && (
                  <div className="header-more-menu" role="menu">
                    {!inDmHome && (
                      <button type="button" role="menuitem" onClick={pick(() => setGlobalSearchOpen(true))}>
                        <UserPlus size={18} /> {t("header.findPeople")}
                      </button>
                    )}
                    <button type="button" role="menuitem" onClick={pick(() => setPinsOpen((open) => !open))}>
                      <Pin size={18} /> {t("header.pinnedMessages")}
                    </button>
                    <button type="button" role="menuitem" onClick={pick(toggleSaved)}>
                      <Bookmark size={18} /> {t("header.savedMessages")}
                    </button>
                    <button type="button" role="menuitem" onClick={pick(() => openAchievements())}>
                      <Award size={18} /> {t("header.achievements")}
                    </button>
                    <button type="button" role="menuitem" onClick={pick(() => setSettingsOpen(true))}>
                      <Settings size={18} /> {t("common.settings")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
  );
}
