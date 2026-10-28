import { ConnectionBanner } from "../../connection-banner";
import { UpdateBanner } from "../../update-banner";
import { RetroChrome } from "../../retro-chrome";
import { type PublicUser } from "@/lib/users";
import { MatrixRain } from "../../matrix-rain";
import { Starfield } from "../../starfield";
import { MsnOverlays } from "./overlays";
import { ServerRail, ChannelSidebar, ThreadPanel, MemberPanel } from "./panels";
import type { useShellComposer } from "../../../hooks/chat-shell/use-shell-composer";
import { withShellRenderers } from "./chat-shell-renderers";
import { renderChatMain } from "./chat-main";
import { renderChatOverlays } from "./chat-overlays";
import { WidgetHostProvider, type WidgetHostValue } from "../../widgets/widget-host";
import { CustomizeBar } from "../../widgets/customize-bar";
import { WebViewSheet } from "../../widgets/web-view";

export type ChatShellViewState = Omit<ReturnType<typeof useShellComposer>, "user"> & { user: PublicUser };

/** ChatShell's signed-in screen: the rail, sidebar, chat, members and every overlay. */
export function renderChatShell(s: ChatShellViewState) {
  const v = withShellRenderers(s);
  const {
    activeChannel, activeChannelId, activeServer, addCategory, applyTheme, autoIdleRef, autoReply,
    canCreateServerInvites, canManageChannels, canManageServer, canOpenServerSettings,
    categoryDropProps, channelLayout, channelPrefs, collapsedCats, collapsedGroups,
    createContactGroup, createServer, currentVoiceChannel, deleteCategory, deleteContactGroup,
    dmCall, dmUnreadTotal, emojiMap, hoverCard, hoverTimer, hub, inDmHome, joinServerDirect,
    kindMenu, markServerRead, memberFilterQuery, members, membersById, membersOpen, membersWidth,
    mobileNav, msnContacts, msnTheme, myCustomStatus, myStatus, nextEvent, offlineMembers,
    onMembersResizeDown, onSidebarResizeDown, onThreadResizeDown, onlineMembers, openDm,
    openMentionedChannel, openProfile, openProfileByHandle, openUserMenu, pendingFriendCount,
    pictureOpen, player, prefFor, presenceOf, queueHoverCard, quickSoundboardOpen,
    rawDisplayedMembers, renameCategory, renameContactGroup, renderChannel, renderKindMenu, renderTalkRoom,
    renderRailFolder, renderRailServer, resolvedInvites, roleColorFor, roomPlayer, savePresence,
    sendNudge, sendThreadReply, serverEvents, serverFolders, serverMenuOpen, servers,
    setActiveChannelId, setActiveServerId, setAutoReply, setCollapsedGroups, setDirectoryOpen,
    setDmClosed, setEventsOpen, setGlobalSearchOpen, setGroupDialog, setGroupDmMenu, setHoverCard, setInviteDialog,
    setKindMenu, setLightbox, setLightboxImage, setMemberFilterQuery, setMembersOpen, setMobileNav,
    setNotifyLevel, setPdfViewer, setPictureOpen, setQuickSoundboardOpen, setServerMenuOpen,
    setServerSettingsOpen, setServers, setSettingsOpen, setShareListening, setShortcutsOpen,
    setSidebarShareSetupOpen, setSoundsOpen, setStageChannelId, setStatusOpen, setStockPicture,
    setThreadDraft, setThreadRoot, setTodayOpen, setUserMenu, shareListening, showCustomConfirm, leaveServer,
    showCustomPrompt, sidebarShareSetupOpen, sidebarWidth, signOut, soundsOpen, stageChannel,
    stageChannelId, statusOpen, textChannels, threadBottomRef, threadDraft, threadMessages,
    threadRoot, threadWidth, todayData, todayOpen, toggleCategory, togglePinDm, unread, user,
    userMenuHandlers, visibleDms, voice, voiceChannelName, voiceParticipants, voiceRooms,
    voiceSoundboardAllowed, whatsNew, whatsNewPeople,
  } = v;

  const widgetHost: WidgetHostValue = {
    serverId: inDmHome ? null : activeServer?.id ?? null,
    activeChannelId,
    voiceChannelId: voice.channelId,
    players: hub.players,
    voiceRooms: (inDmHome ? [] : activeServer?.channels ?? [])
      .filter((channel) => channel.kind === "voice")
      .map((channel) => ({ id: channel.id, name: channel.name })),
    joinVoice: (channelId) => {
      const channel = servers.flatMap((server) => server.channels).find((item) => item.id === channelId);
      if (channel) v.openVoiceChannel(channel);
    },
    membersOpen: Boolean(membersOpen && !stageChannel),
  };

  return (
    <WidgetHostProvider value={widgetHost}>
    <MatrixRain />
    <Starfield jumpKey={inDmHome ? "home" : activeServer?.id} />
    <main
      className={`app-shell ${mobileNav ? "nav-open" : ""} ${threadRoot ? "has-thread" : ""} ${membersOpen && !stageChannel ? "has-members" : ""}`}
      style={{
        "--sidebar-w": `${sidebarWidth}px`,
        "--thread-w": threadRoot ? `${threadWidth}px` : "0px",
        "--members-w": membersOpen && !stageChannel ? `${membersWidth}px` : "0px",
      } as React.CSSProperties}
    >
      <ConnectionBanner connected={hub.connected} />
      <UpdateBanner connected={hub.connected} inCall={Boolean(currentVoiceChannel)} />
      <RetroChrome
        serverName={inDmHome ? null : activeServer?.name ?? null}
        serverIconUrl={inDmHome ? null : activeServer?.iconUrl ?? null}
        bannerUrl={inDmHome ? null : activeServer?.bannerUrl ?? null}
        channelName={activeChannel?.name ?? null}
        channelNumber={Math.max(1, textChannels.findIndex((channel) => channel.id === activeChannelId) + 1)}
        channelTopic={activeChannel?.topic || null}
        onlineCount={rawDisplayedMembers.filter((member) => hub.online.has(member.id)).length}
        memberCount={rawDisplayedMembers.length}
        userName={user.displayName || user.username}
        connected={hub.connected}
        voiceRoom={voiceChannelName}
        muted={voice.muted}
        deafened={voice.deafened}
        pingMs={voice.latency.rttMs || null}
        player={roomPlayer}
        membersOpen={membersOpen}
        onPrevChannel={() => {
          if (!textChannels.length) return;
          const at = textChannels.findIndex((channel) => channel.id === activeChannelId);
          setActiveChannelId(textChannels[(at - 1 + textChannels.length) % textChannels.length].id);
        }}
        onNextChannel={() => {
          if (!textChannels.length) return;
          const at = textChannels.findIndex((channel) => channel.id === activeChannelId);
          setActiveChannelId(textChannels[(at + 1) % textChannels.length].id);
        }}
        onToggleMute={voice.toggleMute}
        onToggleDeafen={voice.toggleDeafen}
        onLeaveVoice={() => {
          if (stageChannelId === voice.channelId) setStageChannelId(null);
          voice.leave();
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSearch={() => setGlobalSearchOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onToggleMembers={() => setMembersOpen((open) => !open)}
        onOpenSounds={() => setSoundsOpen(true)}
        onOpenPicture={() => setPictureOpen(true)}
        onOpenToday={() => setTodayOpen(true)}
        onSendNudge={() => void sendNudge()}
        onSignOut={() => void signOut()}
      />
      <MsnOverlays
        msnTheme={msnTheme}
        soundsOpen={soundsOpen}
        setSoundsOpen={setSoundsOpen}
        hoverCard={hoverCard}
        presenceOf={presenceOf}
        user={user}
        myCustomStatus={myCustomStatus}
        msnContacts={msnContacts}
        hoverTimer={hoverTimer}
        queueHoverCard={queueHoverCard}
        setHoverCard={setHoverCard}
        openDm={openDm}
        openProfile={openProfile}
        pictureOpen={pictureOpen}
        setStockPicture={setStockPicture}
        setPictureOpen={setPictureOpen}
        setSettingsOpen={setSettingsOpen}
        todayOpen={todayOpen}
        todayData={todayData}
        whatsNew={whatsNew}
        servers={servers}
        setTodayOpen={setTodayOpen}
        setActiveServerId={setActiveServerId}
        setStageChannelId={setStageChannelId}
        setEventsOpen={setEventsOpen}
        hub={hub}
        members={members}
      />

      {/* Tapping outside the drawer on a phone closes it. */}
      <div
        className="mobile-nav-backdrop"
        onClick={() => setMobileNav(false)}
        aria-hidden="true"
      />
      <ServerRail
        inDmHome={inDmHome}
        setActiveServerId={setActiveServerId}
        setActiveChannelId={setActiveChannelId}
        visibleDms={visibleDms}
        setStageChannelId={setStageChannelId}
        setMobileNav={setMobileNav}
        dmUnreadTotal={dmUnreadTotal}
        servers={servers}
        serverFolders={serverFolders}
        renderRailServer={renderRailServer}
        renderRailFolder={renderRailFolder}
        createServer={createServer}
        openDirectory={() => setDirectoryOpen(true)}
        activeChannelId={activeChannelId}
        unread={unread}
        voiceRooms={voiceRooms}
        presenceOf={presenceOf}
        statusOpen={statusOpen}
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

      <ChannelSidebar
        mobileNav={mobileNav}
        setMobileNav={setMobileNav}
        activeServer={activeServer}
        inDmHome={inDmHome}
        setServerMenuOpen={setServerMenuOpen}
        serverMenuOpen={serverMenuOpen}
        canOpenServerSettings={canOpenServerSettings}
        setServerSettingsOpen={setServerSettingsOpen}
        canCreateServerInvites={canCreateServerInvites}
        openInviteDialog={() => setInviteDialog({ channelId: activeChannelId })}
        showCustomPrompt={showCustomPrompt}
        canManageServer={canManageServer}
        setServers={setServers}
        canManageChannels={canManageChannels}
        setKindMenu={setKindMenu}
        markServerRead={markServerRead}
        setNotifyLevel={setNotifyLevel}
        channelPrefs={channelPrefs}
        showCustomConfirm={showCustomConfirm}
        leaveServer={(serverId) => void leaveServer(serverId)}
        setActiveServerId={setActiveServerId}
        setGlobalSearchOpen={setGlobalSearchOpen}
        setActiveChannelId={setActiveChannelId}
        setStageChannelId={setStageChannelId}
        activeChannelId={activeChannelId}
        stageChannelId={stageChannelId}
        pendingFriendCount={pendingFriendCount}
        user={user}
        setGroupDialog={setGroupDialog}
        openDm={openDm}
        visibleDms={visibleDms}
        unread={unread}
        setUserMenu={setUserMenu}
        setGroupDmMenu={setGroupDmMenu}
        openUserMenu={openUserMenu}
        hub={hub}
        voiceRooms={voiceRooms}
        togglePinDm={togglePinDm}
        setDmClosed={setDmClosed}
        addCategory={addCategory}
        kindMenu={kindMenu}
        renderKindMenu={renderKindMenu}
        nextEvent={nextEvent}
        setEventsOpen={setEventsOpen}
        serverEvents={serverEvents}
        categoryDropProps={categoryDropProps}
        channelLayout={channelLayout}
        renderChannel={renderChannel}
        renderTalkRoom={renderTalkRoom}
        collapsedCats={collapsedCats}
        toggleCategory={toggleCategory}
        renameCategory={renameCategory}
        deleteCategory={deleteCategory}
        roomPlayer={roomPlayer}
        player={player}
        voice={voice}
        servers={servers}
        dmCall={dmCall}
        quickSoundboardOpen={quickSoundboardOpen}
        setQuickSoundboardOpen={setQuickSoundboardOpen}
        sidebarShareSetupOpen={sidebarShareSetupOpen}
        setSidebarShareSetupOpen={setSidebarShareSetupOpen}
        voiceSoundboardAllowed={voiceSoundboardAllowed}
        myStatus={myStatus}
        myCustomStatus={myCustomStatus}
        setStatusOpen={setStatusOpen}
        setSettingsOpen={setSettingsOpen}
        onSidebarResizeDown={onSidebarResizeDown}
      />

      {renderChatMain(v)}

      <ThreadPanel
        threadRoot={threadRoot}
        threadWidth={threadWidth}
        onThreadResizeDown={onThreadResizeDown}
        activeChannel={activeChannel}
        setThreadRoot={setThreadRoot}
        membersById={membersById}
        roleColorFor={roleColorFor}
        user={user}
        openProfileByHandle={openProfileByHandle}
        setLightboxImage={setLightboxImage}
        emojiMap={emojiMap}
        activeServer={activeServer}
        openMentionedChannel={openMentionedChannel}
        setLightbox={setLightbox}
        setPdfViewer={setPdfViewer}
        resolvedInvites={resolvedInvites}
        servers={servers}
        setActiveServerId={setActiveServerId}
        joinServerDirect={joinServerDirect}
        threadMessages={threadMessages}
        applyTheme={applyTheme}
        threadBottomRef={threadBottomRef}
        sendThreadReply={sendThreadReply}
        threadDraft={threadDraft}
        setThreadDraft={setThreadDraft}
      />

      <MemberPanel
        membersOpen={membersOpen}
        activeServer={inDmHome ? null : activeServer}
        inDmHome={inDmHome}
        activeChannelId={activeChannelId}
        voice={voice}
        collapsedGroups={collapsedGroups}
        onMembersResizeDown={onMembersResizeDown}
        msnTheme={msnTheme}
        setCollapsedGroups={setCollapsedGroups}
        voiceParticipants={voiceParticipants}
        currentVoiceChannel={currentVoiceChannel}
        sidebarShareSetupOpen={sidebarShareSetupOpen}
        setSidebarShareSetupOpen={setSidebarShareSetupOpen}
        stageChannelId={stageChannelId}
        setStageChannelId={setStageChannelId}
        memberFilterQuery={memberFilterQuery}
        setMemberFilterQuery={setMemberFilterQuery}
        userMenuHandlers={userMenuHandlers}
        openProfile={openProfile}
        queueHoverCard={queueHoverCard}
        roleColorFor={roleColorFor}
        presenceOf={presenceOf}
        user={user}
        myCustomStatus={myCustomStatus}
        prefFor={prefFor}
        hub={hub}
        msnContacts={msnContacts}
        onlineMembers={onlineMembers}
        offlineMembers={offlineMembers}
        renameContactGroup={renameContactGroup}
        deleteContactGroup={deleteContactGroup}
        createContactGroup={createContactGroup}
        whatsNew={whatsNew}
        whatsNewPeople={whatsNewPeople}
        setGlobalSearchOpen={setGlobalSearchOpen}
      />

      {renderChatOverlays(v)}
      <CustomizeBar onOpen={() => setSettingsOpen(false)} />
      <WebViewSheet />
    </main>
    </WidgetHostProvider>
  );
}
