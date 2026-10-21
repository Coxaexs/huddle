import { MsnDisplayPictures } from "../../msn-chrome";
import { GAME_INFO } from "@/lib/games";
import { channelKindInfo } from "@/lib/channel-kinds";
import { hasPermission, Permission } from "@/lib/permissions";
import { ChevronDown } from "lucide-react";
import { SessionNotesBanner } from "../../session-notes-banner";
import { DiceOverlay } from "../../dice-overlay";
import { StyledText } from "../../message-body";
import { ForumBoard } from "../../forum-board";
import { VoiceChatPanel } from "../../voice-chat-panel";
import { FriendsView } from "../../friends-view";
import { LiveRecordingDirector } from "./live-speaking";
import { SearchPanel, SavedPanel, MentionsPanel, PinsPanel } from "./side-panels";
import { DmCallView } from "./dm-call-view";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { ChatHeader } from "./chat-header";
import type { ShellRenderState } from "./chat-shell-renderers";
import { deferred } from "./deferred";
import { AgeGate, AgeGateHidden } from "../../age-gate";

const VoiceStage = deferred(() => import("../../voice-stage").then((m) => m.VoiceStage));
const BattlemapBoard = deferred(() => import("../../battlemap").then((m) => m.BattlemapBoard));

// Most visits open a voice room sooner or later: fetch the stage once the page is idle.
if (typeof window !== "undefined") {
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 2000));
  idle(() => void VoiceStage.preload());
}

/** ChatShell's middle column: the channel header, messages (or a voice stage / the friends page) and the composer. */
export function renderChatMain(v: ShellRenderState) {
  const {
    acceptAttachment, acceptIncomingCall, activeChannel, activeChannelId, activeChannelInfo,
    activeDm, activeScreenShare, activeServer, activeServerId, activeSlashCommand, addMyToken,
    answerInvite, applyTheme, battlemap, battlemapGm, battlemapHidden, beginEdit, blockedUserIds,
    botStreaming, callDuration, canManageChannels, canModerate, canPin, canRecordSessions,
    captions, channelTitle, chooseAttachment, closeBattlemap, composerBlocked, composerRef,
    deleteMessage, diceRoll, dmCall, dmCallView, draft, dragging, editDraft, editingId,
    emojiActive, emojiIndex, emojiMap, emojiMatches, emojiOpen, emojiShortcodeMatch, emojis,
    endDmCall, expandedBlockedMessages, features, fileRef, formatOpen, gamesOpen, gifOpen,
    handleMessageTouchEnd, handleMessageTouchMove, handleMessageTouchStart, handleMessagesScroll,
    handleOpenReactionPicker, handleOpenReactionViewer, handleUnblockUser, hasOlder, hasUnmounted, mountedMessages, showCustomPrompt,
    hiddenServerEmojiIds, hideServerEmoji, hub, inDmHome, incomingDmCall, isDmBlocked, isSelfDm,
    joinServerDirect, jumpToFirstUnread, jumpToLatest, jumpToMessage, leaveGroupDm, livingRoom,
    loadEmojis, loadOlder, loadSaved, longPressTriggeredRef, membersById, membersOpen,
    mentionActive, mentionInbox, mentionMatches, mentionsOpen, mentionsTab, messageEndRef,
    messageFont, messages, messagesScrollRef, mobileActionsMoreId, mobileComposerMenuOpen,
    msnTheme, myPermissions, myTimeoutUntil, noteTyping, notice, nudgeCooling, onChannelDragOver,
    onChannelDrop, onComposerKeyDown, onLocalStroke, onLocalToken, openActionsId, openBattlemap,
    openBotMenu, openDm, openMention, openMentionedChannel, openProfile, openProfileByHandle,
    openThread, openUserMenu, openVoiceChannel, stageFocusRequest, setStageFocusRequest, pendingFiles, pendingInvite, personalEmoticons,
    pickCommand, pickEmojiShortcode, pickMention, pins, pinsOpen, player, pollCounts, pollVoters,
    prefFor, pressBotComponent, quickReactions, quickVoteId, reactionPicker, reactionViewer,
    removeQuickReaction, renameGroupDm, replyTarget, resolvedInvites, roleColorFor, roomActivity,
    roomPlayer, runCommand, runMusicUiCommand, runSearch, saveEdit, saveVoicePref, savedIds,
    savedList, savedOpen, searchOpen, searchQuery, searchResults, sendMessage, sendNudge,
    sendTextComposer, sendWink, servers, setActiveServerId, setComposerCaret, setDiceRoll,
    setDmCall, setDraft, setDragging, setEditDraft, setEditHistoryId, setEditingId, setEmojiIndex,
    setEmojiOpen, setExpandedBlockedMessages, setFocusedStreamInfo, setFormatOpen,
    setForwardTarget, setGamesOpen, setGifOpen, setGlobalSearchOpen, setGroupDialog, setLightbox,
    setLightboxImage, setMembersOpen, setMentionsOpen, setMentionsTab, setMessageFont,
    setMobileActionsMoreId, setMobileComposerMenuOpen, setMobileNav, setNotice, setOpenActionsId,
    setPdfViewer, setPendingFiles, setPendingFriendCount, setPictureOpen, setPinsOpen,
    setPipDismissed, setPollDialogOpen, setQuickVoteId, setReplyTarget, setRoomActivity,
    setSavedOpen, setSearchOpen, setSearchQuery, setSearchResults, setSettingsOpen, setSlashIndex,
    setStageChannelId, setStreamVolume, setTtsSpeakingId, setUnreadBarVisible, setVoiceChatOpen,
    setVoiceViewMode, shiftPressed, showCustomConfirm, showJumpLatest, slashActive, slashIndex,
    slashMatches, stageChannel, startDmCall, startGame, streamPreferenceFor, subscribeVoiceChat,
    tagQuery, toggleBattlemap, togglePin, togglePinDm, toggleReaction, toggleSaved,
    toggleStreamMute, touchInput, ttsSpeakingId, typingNames, unreadBarVisible, unreadMarker,
    unreadMentionTotal, unseenCount, user, voice, voiceChannels, voiceChatOpen, voiceParticipants,
    voiceRecorder, voiceRooms, voiceViewMode, wrapSelection,
  } = v;
  // Age-restricted channels show a confirmation instead of the messages and composer.
  const ageRestricted = Boolean(!inDmHome && activeChannel?.nsfw);
  const leaveAgeGate = () => {
    const safe = activeServer?.channels.find((c) => c.kind === "text" && !c.nsfw);
    if (safe) v.setActiveChannelId(safe.id);
    setMobileNav(true);
  };

  return (
    <section
      className={`chat-panel ${dragging ? "drop-target" : ""}`}
      onDragOver={onChannelDragOver}
      onDragLeave={(event) => {
        // Ignore the flicker as the pointer crosses child elements.
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={onChannelDrop}
    >
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div>Drop to attach · images and PDFs</div>
        </div>
      )}
      {!stageChannel && (
        <DiceOverlay
          roll={diceRoll}
          onDone={() => setDiceRoll(null)}
          className="dice-overlay chat-dice-overlay"
        />
      )}
      {inDmHome && !activeChannelId && !stageChannel ? (
        <FriendsView
          onlineUserIds={hub.online}
          onOpenDm={(targetUser) => {
            void openDm(targetUser.id);
          }}
          onPendingCountChange={(count) => {
            setPendingFriendCount(count);
          }}
          onOpenMobileNav={() => setMobileNav(true)}
        />
      ) : (
        <>
          <ChatHeader
      setMobileNav={setMobileNav}
      stageChannel={stageChannel}
      inDmHome={inDmHome}
      isSelfDm={isSelfDm}
      activeChannel={activeChannel}
      channelTitle={channelTitle}
      activeScreenShare={activeScreenShare}
      voiceParticipants={voiceParticipants}
      activeDm={activeDm}
      voice={voice}
      streamPreferenceFor={streamPreferenceFor}
      toggleStreamMute={toggleStreamMute}
      setStreamVolume={setStreamVolume}
      setStageChannelId={setStageChannelId}
      setPipDismissed={setPipDismissed}
      voiceViewMode={voiceViewMode}
      setVoiceViewMode={setVoiceViewMode}
      battlemap={battlemap}
      openBattlemap={openBattlemap}
      closeBattlemap={closeBattlemap}
      togglePinDm={togglePinDm}
      setGroupDialog={setGroupDialog}
      renameGroupDm={renameGroupDm}
      leaveGroupDm={leaveGroupDm}
      activeChannelId={activeChannelId}
      dmCall={dmCall}
      voiceRooms={voiceRooms}
      setDmCall={setDmCall}
      startDmCall={startDmCall}
      setGlobalSearchOpen={setGlobalSearchOpen}
      searchOpen={searchOpen}
      setSearchOpen={setSearchOpen}
      mentionsOpen={mentionsOpen}
      unreadMentionTotal={unreadMentionTotal}
      setMentionsOpen={setMentionsOpen}
      pinsOpen={pinsOpen}
      setPinsOpen={setPinsOpen}
      savedOpen={savedOpen}
      setSavedOpen={setSavedOpen}
      loadSaved={loadSaved}
      msnTheme={msnTheme}
      setSettingsOpen={setSettingsOpen}
      membersOpen={membersOpen}
      setMembersOpen={setMembersOpen}
      voiceChatOpen={voiceChatOpen}
      setVoiceChatOpen={setVoiceChatOpen}
    />

          {stageChannel ? (
            <div className={`voice-stage-split ${voiceChatOpen && stageChannel.serverId ? "chat-open" : ""}`}>
            <VoiceStage
              channelName={stageChannel.name}
              participants={voiceParticipants}
              connectionId={hub.connectionId}
              serverNow={hub.serverNow}
              voice={voice}
              captions={voice.channelId === stageChannel.id ? captions : undefined}
              livingRoom={voice.channelId === stageChannel.id ? livingRoom : undefined}
              nowPlaying={voice.channelId === stageChannel.id ? roomPlayer : null}
              joined={voice.channelId === stageChannel.id}
              onJoin={() => void openVoiceChannel(stageChannel)}
              onExit={() => setStageChannelId(null)}
              onPopout={() => {
                setStageChannelId(null);
                setPipDismissed(false);
              }}
              hideTopbar={true}
              viewMode={voiceViewMode}
              onViewModeChange={setVoiceViewMode}
              onFocusedChange={setFocusedStreamInfo}
              streamPreferenceFor={streamPreferenceFor}
              onSetStreamVolume={setStreamVolume}
              onToggleStreamMute={toggleStreamMute}
              hubSend={hub.send}
              partyViewers={hub.watching[stageChannel.id]?.viewers}
              focusRequest={stageFocusRequest?.channelId === stageChannel.id ? stageFocusRequest : null}
              onFocusRequestDone={() => setStageFocusRequest(null)}
              serverId={stageChannel.serverId}
              canManageSounds={canManageChannels}
              canProject={canManageChannels}
              // A stage has an audience, so the view splits the room into
              // audible and listening, and offers the listening half a hand.
              stageMode={channelKindInfo(stageChannel.kind).kind === "stage"}
              soundboardEnabled={stageChannel.soundboard !== false}
              // Hosts host: moving seats on and off the stage is a moderation
              // action, and the hub rechecks the same permission.
              canManageStage={hasPermission(myPermissions, Permission.MUTE_MEMBERS)}
              userId={user.id}
              userName={user.displayName}
              activity={roomActivity}
              onActivity={setRoomActivity}
              diceRoll={diceRoll}
              onDiceRollDone={() => setDiceRoll(null)}
              onRollCommand={(command) => void runCommand(command)}
              onOpenParticipantMenu={(event, person) => {
                if (person.bot) {
                  openBotMenu(event, "music");
                  return;
                }
                const member = membersById.get(person.id);
                if (member) openUserMenu(event, member);
              }}
              recording={
                <>
                  {features.recordSessions ? (
                    <LiveRecordingDirector
                      channelId={stageChannel.id}
                      recording={hub.recordings[stageChannel.id] || null}
                      participants={voiceParticipants}
                      currentUserId={user.id}
                      canControl={canRecordSessions}
                      speakingStore={voice.speakingStore}
                      onNotice={setNotice}
                    />
                  ) : null}
                  {hub.sessionNotes[stageChannel.id] ? (
                    <SessionNotesBanner
                      channelId={stageChannel.id}
                      notes={hub.sessionNotes[stageChannel.id]}
                      onNotice={setNotice}
                    />
                  ) : null}
                </>
              }
              battlemapOpen={Boolean(battlemap) && !battlemapHidden}
              onToggleBattlemap={() => {
                if (!battlemap) {
                  if (battlemapGm) void openBattlemap();
                  else setNotice("No map is on the table yet.");
                  return;
                }
                toggleBattlemap();
              }}
              battlemap={
                battlemap && !battlemapHidden ? (
                  <BattlemapBoard
                    channelId={stageChannel.id}
                    map={battlemap}
                    gm={battlemapGm}
                    userId={user.id}
                    onClose={closeBattlemap}
                    onAddMyToken={() => void addMyToken()}
                    onLocalToken={onLocalToken}
                    onLocalStroke={onLocalStroke}
                  />
                ) : null
              }
            />
            {voiceChatOpen && stageChannel.serverId && (
              <VoiceChatPanel
                channelId={stageChannel.id}
                channelName={stageChannel.name}
                userId={user.id}
                selfHandle={user.username}
                canModerate={canModerate}
                membersById={membersById}
                emojis={emojiMap}
                subscribe={subscribeVoiceChat}
                onClose={() => setVoiceChatOpen(false)}
                onImage={setLightboxImage}
                onNotice={setNotice}
              />
            )}
            </div>
          ) : (
            <>
              <SearchPanel
      searchOpen={searchOpen}
      searchQuery={searchQuery}
      channelTitle={channelTitle}
      runSearch={runSearch}
      setSearchOpen={setSearchOpen}
      setSearchQuery={setSearchQuery}
      setSearchResults={setSearchResults}
      searchResults={searchResults}
      jumpToMessage={jumpToMessage}
    />

              <SavedPanel
      savedOpen={savedOpen}
      setSavedOpen={setSavedOpen}
      savedList={savedList}
      setActiveServerId={setActiveServerId}
      jumpToMessage={jumpToMessage}
      toggleSaved={toggleSaved}
    />
              <MentionsPanel
      mentionsOpen={mentionsOpen}
      setMentionsOpen={setMentionsOpen}
      mentionsTab={mentionsTab}
      setMentionsTab={setMentionsTab}
      unreadMentionTotal={unreadMentionTotal}
      mentionInbox={mentionInbox}
      openMention={openMention}
    />

              <PinsPanel
      pinsOpen={pinsOpen}
      channelTitle={channelTitle}
      setPinsOpen={setPinsOpen}
      pins={pins}
      activeChannelId={activeChannelId}
      jumpToMessage={jumpToMessage}
      canPin={canPin}
      togglePin={togglePin}
    />

              <DmCallView
      inDmHome={inDmHome}
      activeChannelId={activeChannelId}
      dmCallView={dmCallView}
      dmCall={dmCall}
      callDuration={callDuration}
      user={user}
      voice={voice}
      setStageChannelId={setStageChannelId}
      endDmCall={endDmCall}
      incomingDmCall={incomingDmCall}
      acceptIncomingCall={acceptIncomingCall}
      activeDm={activeDm}
      setDmCall={setDmCall}
    />

              {/* A forum's posts are its top-level messages, so the board
                  replaces the chat list rather than sitting beside it. The
                  list stays mounted (just hidden) so scroll position and
                  read-marking keep working when you switch back. */}
              {activeChannelInfo.threadContainer && !inDmHome && (
                <ForumBoard
                  posts={messages}
                  channelName={channelTitle}
                  canPost={!composerBlocked}
                  onOpenPost={(postId) => {
                    // Resolved here rather than passed through, so the board
                    // never has to know about the richer Message type.
                    const post = messages.find((m) => m.id === postId);
                    if (post) void openThread(post);
                  }}
                  onNewPost={() => composerRef.current?.focus()}
                />
              )}

              {pendingInvite && (
                <div className="msn-info-bar" role="status">
                  <span className="msn-info-icon" aria-hidden="true">
                    {GAME_INFO[pendingInvite.game.kind].emoji}
                  </span>
                  <span>
                    <StyledText text={pendingInvite.game.players[0].name} /> has invited you to play{" "}
                    <strong>{GAME_INFO[pendingInvite.game.kind].name}</strong>. Do you want to{" "}
                    <button type="button" onClick={() => void answerInvite("join")}>
                      Accept
                    </button>{" "}
                    (Alt+C) or{" "}
                    <button type="button" onClick={() => void answerInvite("decline")}>
                      Decline
                    </button>{" "}
                    (Alt+D) the invitation?
                  </span>
                </div>
              )}
              <AgeGate
                channelId={activeChannel?.id}
                channelName={activeChannel?.name || ""}
                restricted={ageRestricted}
                onBack={leaveAgeGate}
              >
              <MessageList
      onOpenChannels={() => setMobileNav(true)}
      messagesScrollRef={messagesScrollRef}
      handleMessagesScroll={handleMessagesScroll}
      activeChannelInfo={activeChannelInfo}
      inDmHome={inDmHome}
      unreadBarVisible={unreadBarVisible}
      unreadMarker={unreadMarker}
      activeChannelId={activeChannelId}
      jumpToFirstUnread={jumpToFirstUnread}
      setUnreadBarVisible={setUnreadBarVisible}
      msnTheme={msnTheme}
      hasOlder={hasOlder || hasUnmounted}
      loadOlder={loadOlder}
      isSelfDm={isSelfDm}
      activeDm={activeDm}
      channelTitle={channelTitle}
      activeChannel={activeChannel}
      messages={mountedMessages}
      membersById={membersById}
      openUserMenu={openUserMenu}
      jumpToMessage={jumpToMessage}
      setPinsOpen={setPinsOpen}
      user={user}
      canModerate={canModerate}
      blockedUserIds={blockedUserIds}
      expandedBlockedMessages={expandedBlockedMessages}
      setExpandedBlockedMessages={setExpandedBlockedMessages}
      openActionsId={openActionsId}
      reactionPicker={reactionPicker}
      ttsSpeakingId={ttsSpeakingId}
      setTtsSpeakingId={setTtsSpeakingId}
      handleMessageTouchStart={handleMessageTouchStart}
      handleMessageTouchMove={handleMessageTouchMove}
      handleMessageTouchEnd={handleMessageTouchEnd}
      longPressTriggeredRef={longPressTriggeredRef}
      touchInput={touchInput}
      setOpenActionsId={setOpenActionsId}
      openBotMenu={openBotMenu}
      openProfile={openProfile}
      roleColorFor={roleColorFor}
      activeServer={activeServer}
      setEditHistoryId={setEditHistoryId}
      voice={voice}
      player={player}
      hub={hub}
      openThread={openThread}
      setNotice={setNotice}
      openProfileByHandle={openProfileByHandle}
      setLightboxImage={setLightboxImage}
      emojiMap={emojiMap}
      runCommand={runCommand}
      runMusicUiCommand={runMusicUiCommand}
      startGame={startGame}
      pollCounts={pollCounts}
      pollVoters={pollVoters}
      editingId={editingId}
      editDraft={editDraft}
      setEditDraft={setEditDraft}
      setEditingId={setEditingId}
      saveEdit={saveEdit}
      setPdfViewer={setPdfViewer}
      openMentionedChannel={openMentionedChannel}
      pressBotComponent={pressBotComponent}
      applyTheme={applyTheme}
      resolvedInvites={resolvedInvites}
      servers={servers}
      setActiveServerId={setActiveServerId}
      joinServerDirect={joinServerDirect}
      botStreaming={botStreaming}
      voiceChannels={voiceChannels}
      prefFor={prefFor}
      saveVoicePref={saveVoicePref}
      setLightbox={setLightbox}
      reactionViewer={reactionViewer}
      toggleReaction={toggleReaction}
      handleOpenReactionViewer={handleOpenReactionViewer}
      handleOpenReactionPicker={handleOpenReactionPicker}
      quickVoteId={quickVoteId}
      quickReactions={quickReactions}
      removeQuickReaction={removeQuickReaction}
      emojis={emojis}
      hiddenServerEmojiIds={hiddenServerEmojiIds}
      hideServerEmoji={hideServerEmoji}
      shiftPressed={shiftPressed}
      mobileActionsMoreId={mobileActionsMoreId}
      setReplyTarget={setReplyTarget}
      composerRef={composerRef}
      setMobileActionsMoreId={setMobileActionsMoreId}
      savedIds={savedIds}
      toggleSaved={toggleSaved}
      setForwardTarget={setForwardTarget}
      setQuickVoteId={setQuickVoteId}
      beginEdit={beginEdit}
      canPin={canPin}
      togglePin={togglePin}
      deleteMessage={deleteMessage}
      showCustomConfirm={showCustomConfirm}
      messageEndRef={messageEndRef}
    />
              </AgeGate>

              <div className={`jump-latest-anchor ${activeChannelInfo.threadContainer && !inDmHome ? "forum-list-hidden" : ""}`}>
                <button
                  type="button"
                  className={`jump-latest ${showJumpLatest || unseenCount > 0 ? "visible" : ""} ${unseenCount > 0 ? "has-unseen" : ""}`}
                  onClick={jumpToLatest}
                  aria-label={unseenCount > 0 ? `Jump to latest, ${unseenCount} new message${unseenCount === 1 ? "" : "s"}` : "Jump to latest message"}
                  tabIndex={showJumpLatest || unseenCount > 0 ? 0 : -1}
                  aria-hidden={!(showJumpLatest || unseenCount > 0)}
                >
                  {unseenCount > 0 && (
                    <span className="jump-latest-count">
                      {unseenCount > 99 ? "99+" : unseenCount} new
                    </span>
                  )}
                  <ChevronDown size={18} strokeWidth={2.4} />
                </button>
              </div>

              {(notice || voice.error) && (
                <button
                  className="notice"
                  onClick={() => {
                    setNotice("");
                    voice.setError("");
                  }}
                  aria-label="Dismiss notification"
                >
                  {notice || voice.error}
                  <span>×</span>
                </button>
              )}

              <AgeGateHidden channelId={activeChannel?.id} restricted={ageRestricted}>
              <Composer
      sendMessage={sendMessage}
      activeSlashCommand={activeSlashCommand}
      draft={draft}
      slashActive={slashActive}
      slashIndex={slashIndex}
      setSlashIndex={setSlashIndex}
      pickCommand={pickCommand}
      slashMatches={slashMatches}
      voice={voice}
      mentionActive={mentionActive}
      tagQuery={tagQuery}
      mentionMatches={mentionMatches}
      pickMention={pickMention}
      roleColorFor={roleColorFor}
      emojiActive={emojiActive}
      emojiShortcodeMatch={emojiShortcodeMatch}
      emojiMatches={emojiMatches}
      emojiIndex={emojiIndex}
      setEmojiIndex={setEmojiIndex}
      pickEmojiShortcode={pickEmojiShortcode}
      gifOpen={gifOpen}
      setGifOpen={setGifOpen}
      inDmHome={inDmHome}
      activeServerId={activeServerId}
      canManageChannels={canManageChannels}
      sendText={sendTextComposer}
      setDraft={setDraft}
      composerRef={composerRef}
      loadEmojis={loadEmojis}
      gamesOpen={gamesOpen}
      msnTheme={msnTheme}
      setGamesOpen={setGamesOpen}
      startGame={startGame}
      setStageChannelId={setStageChannelId}
      formatOpen={formatOpen}
      wrapSelection={wrapSelection}
      setFormatOpen={setFormatOpen}
      emojiOpen={emojiOpen}
      setEmojiOpen={setEmojiOpen}
      replyTarget={replyTarget}
      setReplyTarget={setReplyTarget}
      pendingFiles={pendingFiles}
      setPendingFiles={setPendingFiles}
      showCustomPrompt={showCustomPrompt}
      myTimeoutUntil={myTimeoutUntil}
      isDmBlocked={isDmBlocked}
      activeDm={activeDm}
      handleUnblockUser={handleUnblockUser}
      composerBlocked={composerBlocked}
      isSelfDm={isSelfDm}
      hub={hub}
      messageFont={messageFont}
      setMessageFont={setMessageFont}
      sendWink={sendWink}
      personalEmoticons={personalEmoticons}
      voiceRecorder={voiceRecorder}
      acceptAttachment={acceptAttachment}
      activeChannelId={activeChannelId}
      sendNudge={sendNudge}
      nudgeCooling={nudgeCooling}
      fileRef={fileRef}
      chooseAttachment={chooseAttachment}
      setComposerCaret={setComposerCaret}
      noteTyping={noteTyping}
      onComposerKeyDown={onComposerKeyDown}
      activeChannelInfo={activeChannelInfo}
      channelTitle={channelTitle}
      mobileComposerMenuOpen={mobileComposerMenuOpen}
      setMobileComposerMenuOpen={setMobileComposerMenuOpen}
      setPollDialogOpen={setPollDialogOpen}
      typingNames={typingNames}
      messages={messages}
      user={user}
    />
              </AgeGateHidden>
            </>
          )}
          {msnTheme && (
            <MsnDisplayPictures
              them={
                inDmHome && activeDm
                  ? { ...activeDm.user, name: activeDm.user.displayName }
                  : {
                      name: activeServer?.name || "Hoffle",
                      avatar: activeServer?.icon || "H",
                      avatarUrl: activeServer?.iconUrl,
                      color: "#3a6ea5",
                    }
              }
              me={user ? { ...user, name: user.displayName } : null}
              onChangeMine={() => setPictureOpen(true)}
            />
          )}
        </>
      )}
    </section>
  );
}
