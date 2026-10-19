import { channelKindInfo } from "@/lib/channel-kinds";
import { hasPermission, Permission } from "@/lib/permissions";
import { EmailPrompt } from "../../email-prompt";
import { BotMenu } from "../../bot-menu";
import { EditHistoryDialog } from "../../edit-history";
import { EventsPanel } from "../../events-panel";
import { QuickSwitcher, type QuickSwitcherTarget } from "../../quick-switcher";
import { GroupDmDialog } from "../../group-dm-dialog";
import { KeyboardShortcutsDialog } from "../../keyboard-shortcuts-dialog";
import { practiceRoll, TutorialPill, WelcomeTutorial } from "../../welcome-tutorial";
import { ToastContainer } from "../../toast";
import { AchievementCenter } from "../../achievement-center";
import { DeviceSwitchPrompt } from "../../device-switch-prompt";
import { RemoteVoiceAudio } from "../../remote-voice-audio";
import { SynthJamAudio } from "../../synth-jam-audio";
import { requestProfileEditor } from "@/lib/profile-editor-request";
import { CustomDialog } from "../../custom-dialog";
import { DM_HOME } from "../../../lib/chat/constants";
import { volumeGain } from "../../../lib/chat/format";
import { GlobalUserSearchDialog } from "../../global-user-search-dialog";
import { apiFetch } from "../../../lib/client";
import { PollDialog } from "../../poll-dialog";
import { ForwardMessageDialog } from "../../forward-message-dialog";
import { WelcomeGate } from "../../server-welcome";
import { OnboardingDirectoryDialog } from "../../onboarding-directory-dialog";
import { getActiveThemeId } from "@/lib/themes";
import { GroupDmContextMenu } from "../group-dm-context-menu";
import { ImageLightbox, ProfileCardLayer, IncomingDmCall, MarkdownGuideModal, ReactionPickerLayer, ReactionViewerLayer, FloatingStreamPreview } from "./overlays";
import { UserMenuLayer, RailMenuLayer, FolderMenuLayer, ChannelMenuLayer } from "./menus";
import { StreamPreviewPopover } from "../stream-preview-popover";
import type { ShellRenderState } from "./chat-shell-renderers";
import { deferred } from "./deferred";

const ProfileCard = deferred(() => import("../../profile-card").then((m) => m.ProfileCard));
const PdfViewer = deferred(() => import("../../pdf-viewer").then((m) => m.PdfViewer));
const SettingsDialog = deferred(() => import("../../settings-dialog").then((m) => m.SettingsDialog));
const ServerSettingsDialog = deferred(() => import("../../server-settings-dialog").then((m) => m.ServerSettingsDialog));
const BlahajBuddy = deferred(() => import("../../blahaj-buddy").then((m) => m.BlahajBuddy));

/** Everything ChatShell layers over the page: voice audio, menus, dialogs, viewers, toasts and the floating stream preview. */
export function renderChatOverlays(v: ShellRenderState) {
  const {
    acceptIncomingCall, activeChannelId, activeDm, activeServer, activeServerId, addQuickReaction,
    addToGroupDm, applyTheme, bannedIds, blockedUserIds, botMenu, canBanMembers,
    canCreateServerInvites, canKickMembers, canManageChannels, canManageNicknames, canManageRoles,
    canManageServer, canModerate, canOpenServerSettings, canViewAuditLog, changeChannelKind,
    channelMenu, channelPrefs, closeTutorial, composerRef, createContactGroup, createGroupDm,
    declineIncomingCall, deleteChannel, dialogCallback, dialogCancel, dialogDismissRef,
    dialogOptions, directoryOpen, dms, dndBotActions, editChannelBitrate, editChannelRegion,
    editChannelSlowmode, toggleChannelNsfw, editChannelTopic, editHistoryId, editNickname, setServerAvatar, emojiMap, eventsOpen,
    floatingStream, folderIdOf, folderMenu, forwardTarget, friendUserIds, globalSearchOpen,
    groupDialog, groupDmMenu, handleAcceptFriend, handleAddFriend, handleBlockUser,
    handleForwardMessage, handleRemoveFriend, handleShareThemeToChat, handleUnblockUser, hub,
    inDmHome, incomingDmCall, incomingFriendUserIds, leaveGroupDm, leaveServer, lightbox,
    livingRoom, loadMembers, loadServers, markServerRead, markWelcomeChecked, markdownModalOpen,
    members, membersById, messages, moderateMember, moveMember, msnContacts, msnTheme,
    musicBotActions, myPermissions, openDm, openProfile, openVoiceChannel, outgoingFriendUserIds,
    pdfViewer, pipDismissed, placeContact, pollDialogOpen, prefFor, presenceOf, profileCardTarget,
    profileMember, quickSwitcherOpen, railMenu, reactionPicker, reactionViewer, reloadEvents,
    removeFromGroupDm, renameChannel, renameGroupDm, rolesForMember, roomPlayer, runCommand,
    saveServerFolders, saveVoicePref, sendFileCopy, serverEvents, serverFolders,
    serverSettingsOpen, servers, setActiveChannelId, setActiveServerId, setBotMenu, setChannelMenu,
    setDialogCallback, setDialogCancel, setDialogOptions, setDiceRoll, setDirectoryOpen,
    setDmClosed, setDraft, setEditHistoryId, setEventsOpen, setFolderMenu, setFormatOpen,
    setForwardTarget, setGamesOpen, setGlobalSearchOpen, setGroupDialog, setGroupDmMenu,
    setLightbox, setMarkdownModalOpen, setMembers, setMobileNav, setNotice, setNotifyLevel,
    setPdfViewer, setPipDismissed, setPollDialogOpen, setProfileCardTarget, setProfileMember,
    setQuickSwitcherOpen, setRailMenu, setReactionPicker, setReactionViewer, setServerSettingsOpen,
    setServers, setSettingsOpen, setShortcutsOpen, setStageChannelId, setStreamVolume, setTutorial,
    setUser, setUserMenu, settingsOpen, shortcutsOpen, showCustomConfirm, showCustomPrompt,
    signOut, stageChannelId, streamPreferenceFor, theme, threadMessages, threadRoot, timeoutMember,
    toggleChannelSoundboard, togglePinDm, toggleReaction, toggleSignInAlert, toggleStreamMute,
    tutorial, unread, user, userMenu, userMenuVoiceJoinedAt, voice, voiceChannels,
    voiceParticipants, voiceRooms, welcomeChecked, streamHover, setStreamHover, keepStreamHover, watchStream,
  } = v;
  const closeStreamHover = () => setStreamHover(null);

  return (
    <>
      {/* Everyone's Gesture Synth in your voice room, played on this machine. */}
      {voice.channelId && (
        <SynthJamAudio
          channelId={voice.channelId}
          send={hub.send}
          serverNow={hub.serverNow}
          deafened={voice.deafened}
          preferenceFor={(id) => {
            const pref = prefFor(id);
            return { volume: volumeGain(pref.volume), muted: pref.muted };
          }}
        />
      )}

      {/* Remote voice audio. Hidden, but this is what you actually hear. */}
      {voice.channelId && (
        <RemoteVoiceAudio
          key={voice.channelId}
          streams={voice.remoteStreams}
          participants={voiceParticipants}
          listenerId={hub.connectionId}
          enabled={voice.tableMode}
          hostId={voice.tableHostId}
          seatOrder={voice.tableSeatOrder}
          seatPans={voice.tableSeatPans}
          width={voice.tableWidth}
          headTracking={voice.headTracking}
          headTrackingSource={voice.headTrackingSource}
          headphones={voice.spatialOutput === "headphones"}
          onHeadTracking={voice.onHeadTracking}
          livingRoom={livingRoom.heard}
          tv={livingRoom.tv}
          spatialOff={livingRoom.spatialOff}
          roomShape={livingRoom.open && livingRoom.settings.spatial ? livingRoom.theme : "table"}
          deafened={voice.deafened}
          speakingStore={voice.speakingStore}
          preferenceFor={(id) => {
            const pref = prefFor(id);
            if (id === "bot:music") {
              const generalVol = Math.max(
                0,
                Math.min(1, (roomPlayer?.volume ?? 100) / 100),
              );
              return {
                volume: volumeGain(pref.volume) * generalVol,
                muted: pref.muted,
              };
            }
            return { volume: volumeGain(pref.volume), muted: pref.muted };
          }}
          streamPreferenceFor={(streamId, userId) => {
            const pref = streamPreferenceFor(streamId, userId);
            return { volume: volumeGain(pref.volume), muted: pref.muted };
          }}
        />
      )}

      {botMenu && (
        <BotMenu
          name={botMenu.kind === "music" ? "Music + Watch" : "D&D Bot"}
          description={
            botMenu.kind === "music"
              ? "Music and watch-together bot"
              : "Tabletop helper bot"
          }
          x={botMenu.x}
          y={botMenu.y}
          actions={
            botMenu.kind === "music" ? musicBotActions : dndBotActions
          }
          voicePref={
            botMenu.kind === "music"
              ? prefFor("bot:music")
              : undefined
          }
          onVoiceMute={
            botMenu.kind === "music"
              ? (muted) => void saveVoicePref("bot:music", { muted })
              : undefined
          }
          onVoiceVolume={
            botMenu.kind === "music"
              ? (volume) => void saveVoicePref("bot:music", { volume })
              : undefined
          }
          onClose={() => setBotMenu(null)}
        />
      )}

      <UserMenuLayer
        userMenu={userMenu}
        user={user}
        msnTheme={msnTheme}
        msnContacts={msnContacts}
        placeContact={placeContact}
        setUserMenu={setUserMenu}
        createContactGroup={createContactGroup}
        toggleSignInAlert={toggleSignInAlert}
        setMembers={setMembers}
        prefFor={prefFor}
        hub={hub}
        blockedUserIds={blockedUserIds}
        handleBlockUser={handleBlockUser}
        handleUnblockUser={handleUnblockUser}
        openDm={openDm}
        saveVoicePref={saveVoicePref}
        togglePinDm={togglePinDm}
        canModerate={canModerate}
        canManageServer={canManageServer}
        inDmHome={inDmHome}
        activeDm={activeDm}
        removeFromGroupDm={removeFromGroupDm}
        moderateMember={moderateMember}
        bannedIds={bannedIds}
        voiceChannels={voiceChannels}
        voiceRooms={voiceRooms}
        userMenuVoiceJoinedAt={userMenuVoiceJoinedAt}
        moveMember={moveMember}
        membersById={membersById}
        activeServer={activeServer}
        myPermissions={myPermissions}
        timeoutMember={timeoutMember}
        canManageNicknames={canManageNicknames}
        editNickname={editNickname}
        setServerAvatar={setServerAvatar}
      />

      {groupDmMenu && (
        <GroupDmContextMenu
          target={groupDmMenu}
          onClose={() => setGroupDmMenu(null)}
          onTogglePin={() => {
            void togglePinDm(groupDmMenu.dm.channelId, !groupDmMenu.dm.pinned);
            setGroupDmMenu(null);
          }}
          onRename={() => {
            renameGroupDm(groupDmMenu.dm);
            setGroupDmMenu(null);
          }}
          onAddMembers={() => {
            setGroupDialog({ mode: "add", channelId: groupDmMenu.dm.channelId });
            setGroupDmMenu(null);
          }}
          onLeave={() => {
            leaveGroupDm(groupDmMenu.dm);
            setGroupDmMenu(null);
          }}
          onCloseDm={() => {
            void setDmClosed(groupDmMenu.dm.channelId, true);
            setGroupDmMenu(null);
          }}
        />
      )}

      {eventsOpen && activeServer && !inDmHome && user && (
        <EventsPanel
          serverId={activeServer.id}
          events={serverEvents}
          reload={reloadEvents}
          userId={user.id}
          canManage={canManageServer || canManageChannels}
          voiceChannels={voiceChannels.map((channel) => ({ id: channel.id, name: channel.name }))}
          onJoinVoice={(channelId) => {
            const channel = voiceChannels.find((item) => item.id === channelId);
            setEventsOpen(false);
            if (channel) openVoiceChannel(channel);
          }}
          onClose={() => setEventsOpen(false)}
          onRequestConfirm={showCustomConfirm}
        />
      )}

      {editHistoryId && (
        <EditHistoryDialog messageId={editHistoryId} onClose={() => setEditHistoryId(null)} />
      )}

      <RailMenuLayer
        railMenu={railMenu}
        setRailMenu={setRailMenu}
        unread={unread}
        markServerRead={markServerRead}
        folderIdOf={folderIdOf}
        saveServerFolders={saveServerFolders}
        serverFolders={serverFolders}
        channelPrefs={channelPrefs}
        setNotifyLevel={setNotifyLevel}
      />

      <FolderMenuLayer
        folderMenu={folderMenu}
        setFolderMenu={setFolderMenu}
        servers={servers}
        markServerRead={markServerRead}
        showCustomPrompt={showCustomPrompt}
        saveServerFolders={saveServerFolders}
        serverFolders={serverFolders}
      />

      <ChannelMenuLayer
        channelMenu={channelMenu}
        setChannelMenu={setChannelMenu}
        channelPrefs={channelPrefs}
        setNotifyLevel={setNotifyLevel}
        canManageChannels={canManageChannels}
        renameChannel={renameChannel}
        editChannelTopic={editChannelTopic}
        editChannelSlowmode={editChannelSlowmode}
        toggleChannelNsfw={toggleChannelNsfw}
        editChannelBitrate={editChannelBitrate}
        toggleChannelSoundboard={toggleChannelSoundboard}
        editChannelRegion={editChannelRegion}
        changeChannelKind={changeChannelKind}
        deleteChannel={deleteChannel}
      />

      <ImageLightbox lightbox={lightbox} setLightbox={setLightbox} />

      {pdfViewer && (
        <PdfViewer
          url={pdfViewer.url}
          name={pdfViewer.name}
          onClose={() => setPdfViewer(null)}
          onSendCopy={activeChannelId ? sendFileCopy : undefined}
        />
      )}

      {profileMember && (
        <ProfileCard
          member={profileMember}
          online={hub.online.has(profileMember.id)}
          roles={rolesForMember(profileMember)}
          isSelf={profileMember.id === user.id}
          onMessage={() => {
            const id = profileMember.id;
            setProfileMember(null);
            void openDm(id);
          }}
          onClose={() => setProfileMember(null)}
        />
      )}

      {!user.email && !user.emailPromptSkipped && <EmailPrompt onUser={setUser} />}

      {settingsOpen && (
        <SettingsDialog
          user={user}
          theme={theme}
          onTheme={applyTheme}
          onShareThemeToChat={handleShareThemeToChat}
          onUser={setUser}
          onClose={() => setSettingsOpen(false)}
          onOpenDm={(targetId) => {
            setSettingsOpen(false);
            void openDm(targetId);
          }}
          onOpenTutorial={() => {
            setSettingsOpen(false);
            setTutorial({ page: 0, folded: false });
          }}
          onSignOut={signOut}
          onMicrophoneChange={() => void voice.switchMicrophone()}
          micSettings={voice.micSettings}
          onMicSettings={voice.setMicSettings}
          subscribeMicTelemetry={voice.subscribeMicTelemetry}
          inCall={Boolean(voice.channelId)}
          relay={voice.relay}
          onCheckRelay={() => void voice.recheckRelay()}
          headTracking={voice.headTracking}
          setHeadTracking={voice.setHeadTracking}
          headTrackingOffered={voice.headTrackingOffered}
          airpodsOffered={voice.airpodsOffered}
          headTrackingSource={voice.headTrackingSource}
          setHeadTrackingSource={voice.setHeadTrackingSource}
          spatialOutput={voice.spatialOutput}
          setSpatialOutput={voice.setSpatialOutput}
          headTrackingStatus={voice.headTrackingStatus}
          recenterHead={voice.recenterHead}
          tableMode={voice.tableMode}
          onTableMode={voice.setTableMode}
          tableHostId={voice.tableHostId}
          onTableHostId={voice.setTableHostId}
          tableParticipants={voiceParticipants.filter((p) => !p.bot && !p.recorder)}
          pushToTalk={voice.pushToTalk}
          pttKey={voice.pttKey}
          onPushToTalk={voice.setPushToTalk}
          onPttKey={voice.setPttKey}
          whisperKey={voice.whisperKey}
          onWhisperKey={voice.setWhisperKey}
          muteKey={voice.muteKey}
          deafenKey={voice.deafenKey}
          onMuteKey={voice.setMuteKey}
          onDeafenKey={voice.setDeafenKey}
          onMicTestHold={voice.holdForMicTest}
          screenShareAudio={voice.screenShareAudio}
          onScreenShareAudioChange={voice.setScreenShareAudio}
          server={inDmHome ? null : activeServer}
          members={members}
          canManageServer={canManageServer}
        />
      )}

      {activeServer && !inDmHome && user && activeServer.ownerId !== user.id && !welcomeChecked.has(activeServer.id) && (
        <WelcomeGate
          key={activeServer.id}
          serverId={activeServer.id}
          serverName={activeServer.name}
          onDone={() => markWelcomeChecked(activeServer.id)}
          onLeave={() => {
            markWelcomeChecked(activeServer.id);
            void leaveServer(activeServer.id);
          }}
        />
      )}

      {serverSettingsOpen && activeServer && canOpenServerSettings && (
        <ServerSettingsDialog
          server={activeServer}
          members={members}
          onlineUserIds={hub.online}
          canManageServer={canManageServer}
          canManageExpressions={
            hasPermission(myPermissions, Permission.MANAGE_EMOJIS) ||
            hasPermission(myPermissions, Permission.MANAGE_CHANNELS)
          }
          canManageRoles={canManageRoles}
          canManageChannels={canManageChannels}
          canModerate={canModerate}
          canKickMembers={canKickMembers}
          canBanMembers={canBanMembers}
          canViewAuditLog={canViewAuditLog}
          canCreateInvites={canCreateServerInvites}
          onClose={() => setServerSettingsOpen(false)}
          onServerUpdated={() => void loadServers().catch(() => undefined)}
          onServerDeleted={() => {
            const deleted = activeServer.id;
            void loadServers()
              .then((list) => setActiveServerId(list.find((server) => server.id !== deleted)?.id || DM_HOME))
              .catch(() => undefined);
          }}
          onRequestPrompt={showCustomPrompt}
          onRequestConfirm={showCustomConfirm}
          isOwner={Boolean(user && activeServer.ownerId === user.id)}
          onLeaveServer={() => void leaveServer(activeServer.id)}
        />
      )}

      <GlobalUserSearchDialog
        isOpen={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onlineUserIds={hub.online}
        servers={servers}
        onOpenDm={(targetUser) => {
          void openDm(targetUser.id);
        }}
        onSelectServer={(serverId) => {
          setActiveServerId(serverId);
          setStageChannelId(null);
          setMobileNav(false);
        }}
      />

      {dialogOptions && (
        <CustomDialog
          options={dialogOptions}
          onConfirm={(val) => {
            // Clear first, THEN run the callback: a callback that opens another
            // dialog (name → background) would otherwise be wiped by these
            // resets, which is why "Next" appeared to do nothing.
            const callback = dialogCallback;
            dialogDismissRef.current = null;
            setDialogOptions(null);
            setDialogCallback(null);
            setDialogCancel(null);
            callback?.(val);
          }}
          onCancel={() => {
            const cancel = dialogCancel;
            dialogDismissRef.current = null;
            setDialogOptions(null);
            setDialogCallback(null);
            setDialogCancel(null);
            cancel?.();
          }}
          onDismiss={() => {
            const dismissed = dialogDismissRef.current;
            dialogDismissRef.current = null;
            setDialogOptions(null);
            setDialogCallback(null);
            setDialogCancel(null);
            dismissed?.();
          }}
        />
      )}

      <GroupDmDialog
        open={Boolean(groupDialog)}
        existingMemberIds={
          groupDialog?.mode === "add"
            ? dms
              .find((dm) => dm.channelId === groupDialog.channelId)
              ?.group?.members.map((member) => member.id) || []
            : undefined
        }
        groupName={
          groupDialog?.mode === "add"
            ? dms.find((dm) => dm.channelId === groupDialog.channelId)?.user.displayName
            : undefined
        }
        onClose={() => setGroupDialog(null)}
        onSubmit={(userIds, name) =>
          groupDialog?.mode === "add"
            ? addToGroupDm(groupDialog.channelId, userIds)
            : createGroupDm(userIds, name)
        }
      />

      <QuickSwitcher
        open={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
        servers={servers}
        channels={servers.flatMap((s) => s.channels || [])}
        dms={dms.map((d) => ({
          id: d.channelId,
          user: {
            id: d.user.id,
            displayName: d.user.displayName,
            username: d.user.username,
            avatar: d.user.avatar,
            avatarUrl: d.user.avatarUrl || undefined,
          },
        }))}
        onSelect={(target: QuickSwitcherTarget) => {
          if (target.type === "channel") {
            if (target.serverId && target.serverId !== activeServerId) {
              setActiveServerId(target.serverId);
            }
            // By the channel itself: the switcher calls a stage "text".
            const found = servers
              .flatMap((server) => server.channels)
              .find((channel) => channel.id === target.id);
            const voiceTarget =
              found && channelKindInfo(found.kind).appearsAsVoice ? found : undefined;
            if (voiceTarget) {
              // The same path as clicking the room: timeout check, stage mute.
              openVoiceChannel(voiceTarget);
            } else {
              setActiveChannelId(target.id);
              setStageChannelId(null);
            }
          } else if (target.type === "dm") {
            setActiveServerId(DM_HOME);
            setActiveChannelId(target.id);
            setStageChannelId(null);
            if (dms.find((dm) => dm.channelId === target.id)?.hidden) {
              void setDmClosed(target.id, false);
            }
          } else if (target.type === "server") {
            setActiveServerId(target.id);
          }
        }}
      />

      {tutorial && !tutorial.folded && (
        <WelcomeTutorial
          page={tutorial.page}
          onPage={(page) => setTutorial({ page, folded: false })}
          onClose={closeTutorial}
          onTry={() => setTutorial((current) => current && { ...current, folded: true })}
          actions={{
            activeThemeId: getActiveThemeId(),
            onTheme: (next) => applyTheme(next),
            openSwitcher: () => setQuickSwitcherOpen(true),
            joinVoice: voiceChannels[0]
              ? { name: voiceChannels[0].name, run: () => openVoiceChannel(voiceChannels[0]) }
              : null,
            openFormat: () => setFormatOpen(true),
            openPoll: () => setPollDialogOpen(true),
            rollDice: () => setDiceRoll(practiceRoll({ id: user.id, displayName: user.displayName })),
            openGames: () => setGamesOpen(true),
            openProfile: () => {
              requestProfileEditor();
              setSettingsOpen(true);
            },
            openShortcuts: () => setShortcutsOpen(true),
          }}
        />
      )}
      {tutorial?.folded && (
        <TutorialPill
          page={tutorial.page}
          onResume={() => setTutorial((current) => current && { ...current, folded: false })}
          onClose={closeTutorial}
        />
      )}

      <OnboardingDirectoryDialog
        open={directoryOpen}
        onClose={() => setDirectoryOpen(false)}
        onServersUpdated={setServers}
        onSelectServer={(serverId) => {
          setActiveServerId(serverId);
          setStageChannelId(null);
          setMobileNav(false);
        }}
      />

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <PollDialog
        open={pollDialogOpen}
        onClose={() => setPollDialogOpen(false)}
        onSubmit={async (question, options, isPrivate) => {
          if (!activeChannelId) return;
          try {
            await apiFetch("/api/polls", {
              method: "POST",
              body: JSON.stringify({
                channelId: activeChannelId,
                question,
                options,
                isPrivate,
              }),
            });
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "Failed to create poll");
          }
        }}
      />

      <ProfileCardLayer
        profileCardTarget={profileCardTarget}
        inDmHome={inDmHome}
        activeServer={activeServer}
        activeServerId={activeServerId}
        setProfileCardTarget={setProfileCardTarget}
        canManageServer={canManageServer}
        canManageRoles={canManageRoles}
        loadMembers={loadMembers}
        user={user}
        presenceOf={presenceOf}
        blockedUserIds={blockedUserIds}
        setSettingsOpen={setSettingsOpen}
        friendUserIds={friendUserIds}
        incomingFriendUserIds={incomingFriendUserIds}
        outgoingFriendUserIds={outgoingFriendUserIds}
        handleAddFriend={handleAddFriend}
        handleRemoveFriend={handleRemoveFriend}
        handleAcceptFriend={handleAcceptFriend}
        handleBlockUser={handleBlockUser}
        handleUnblockUser={handleUnblockUser}
        openDm={openDm}
        setDraft={setDraft}
        composerRef={composerRef}
      />

      <IncomingDmCall incomingDmCall={incomingDmCall} declineIncomingCall={declineIncomingCall} acceptIncomingCall={acceptIncomingCall} />

      <MarkdownGuideModal
        markdownModalOpen={markdownModalOpen}
        setMarkdownModalOpen={setMarkdownModalOpen}
        setDraft={setDraft}
        composerRef={composerRef}
      />

      <BlahajBuddy onRollCommand={(command) => void runCommand(command)} />
      <ToastContainer />
      <AchievementCenter userId={user?.id ?? null} />
      <DeviceSwitchPrompt
        inCall={Boolean(voice.channelId)}
        activeMicrophone={voice.activeMicrophone}
        onMicrophoneChange={() => void voice.switchMicrophone()}
      />

      <ReactionPickerLayer
        reactionPicker={reactionPicker}
        setReactionPicker={setReactionPicker}
        inDmHome={inDmHome}
        activeServerId={activeServerId}
        canManageChannels={canManageChannels}
        addQuickReaction={addQuickReaction}
        toggleReaction={toggleReaction}
      />

      <ForwardMessageDialog
        target={forwardTarget}
        servers={servers}
        dms={dms}
        currentChannelId={activeChannelId}
        onClose={() => setForwardTarget(null)}
        onForward={handleForwardMessage}
      />

      <ReactionViewerLayer
        reactionViewer={reactionViewer}
        setReactionViewer={setReactionViewer}
        messages={messages}
        threadMessages={threadMessages}
        threadRoot={threadRoot}
        emojiMap={emojiMap}
        membersById={membersById}
        openProfile={openProfile}
        user={user}
      />

      {/* Floating Movable Screen Share Preview (Picture-in-Picture) */}
      <FloatingStreamPreview
        floatingStream={floatingStream}
        pipDismissed={pipDismissed}
        stageChannelId={stageChannelId}
        voice={voice}
        servers={servers}
        voiceParticipants={voiceParticipants}
        streamPreferenceFor={streamPreferenceFor}
        setStreamVolume={setStreamVolume}
        toggleStreamMute={toggleStreamMute}
        activeServerId={activeServerId}
        setActiveServerId={setActiveServerId}
        setStageChannelId={setStageChannelId}
        setPipDismissed={setPipDismissed}
      />

      {/* "Streaming Now" card for a streaming member or a room's watch party. */}
      {streamHover && (
        <StreamPreviewPopover
          key={`${streamHover.kind}:${streamHover.connectionId ?? streamHover.channel.id}`}
          kind={streamHover.kind}
          connectionId={streamHover.connectionId}
          streamerName={streamHover.streamerName}
          title={streamHover.title}
          startedAt={streamHover.startedAt}
          viewers={
            streamHover.kind === "watch"
              ? hub.watching[streamHover.channel.id]?.viewers.length ?? 0
              : (voiceRooms[streamHover.channel.id] || []).find((p) => p.connectionId === streamHover.connectionId)?.screenViewers?.length ?? 0
          }
          hubNow={hub.serverNow}
          anchorRect={streamHover.anchorRect}
          send={hub.send}
          onWatchStream={() => {
            watchStream(
              streamHover.channel,
              streamHover.kind === "screen" && streamHover.connectionId
                ? { kind: "screen", connectionId: streamHover.connectionId }
                : { kind: "watch" },
            );
          }}
          onKeep={keepStreamHover}
          onClose={closeStreamHover}
        />
      )}
    </>
  );
}
