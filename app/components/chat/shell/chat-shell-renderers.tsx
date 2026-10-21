import { type DragEvent } from "react";
import type { PublicChannel, PublicServer } from "@/lib/servers";
import { channelKindInfo } from "@/lib/channel-kinds";
import { shouldStartMuted } from "@/lib/stage";
import { hasPermission, Permission } from "@/lib/permissions";
import { Mic, MicOff, HeadphoneOff, AudioLines, Eye, Film, UserPlus } from "lucide-react";
import { Avatar } from "../../avatar";
import { type BotMenuAction } from "../../bot-menu";
import { type MentionChannel } from "../../message-body";
import { type ServerFolder } from "@/lib/server-folders";
import { formatClientDateTime } from "../../../lib/chat/format";
import { channelKindIcon } from "../channel-kind";
import { RailFolder, RailServer } from "../rail";
import { VoiceDuration } from "../../voice-duration";
import { Speaking } from "./live-speaking";
import { ringColor } from "../../../lib/profile-look";
import { StyledName, VoiceAura } from "../../profile-style-parts";
import type { ChatShellViewState } from "./chat-shell-view";
import type { StageFocusRequest } from "../../../hooks/chat-shell/use-shell-state";

export type ShellRenderState = ReturnType<typeof withShellRenderers>;

/** The member lists, voice stage target, rail and channel row renderers and bot menus the view draws with. */
export function withShellRenderers(s: ChatShellViewState) {
  const {
    activeChannelId, activeServer, activeServerId, canCreateServerInvites, canManageChannels, canModerate,
    channelDragProps, deleteChannel, dmMembers, dms, dndUrl, dragServerId, folderDropProps, hub,
    inDmHome, memberFilterQuery, members, membersById, moveMember, musicDashboardUrl,
    myPermissions, myTimeoutUntil, openBotMenu, openFolders, openMusicDashboard, openUserMenu,
    player, prepareCommand, runCommand, serverDragProps, serverDropHint, servers,
    setActiveChannelId, setActiveServerId, setChannelMenu, setFolderMenu, setMobileNav, setNotice,
    setInviteDialog, setRailMenu, setStageChannelId, stageChannelId, toggleFolderOpen, touchInput, unread, user,
    voice, voiceChannels, voiceRooms, queueStreamHover, setStageFocusRequest,
  } = s;

  const rawDisplayedMembers = inDmHome ? dmMembers : members;
  const filterQ = memberFilterQuery.trim().toLowerCase();
  const displayedMembers = filterQ
    ? rawDisplayedMembers.filter(
      (m) =>
        m.username.toLowerCase().includes(filterQ) ||
        m.displayName.toLowerCase().includes(filterQ),
    )
    : rawDisplayedMembers;
  const onlineMembers = displayedMembers.filter((member) => hub.online.has(member.id));
  const offlineMembers = displayedMembers.filter((member) => !hub.online.has(member.id));
  const currentVoiceChannel = voiceChannels.find(
    (channel) => channel.id === voice.channelId,
  );
  const stageDm = stageChannelId
    ? dms.find((d) => d.channelId === stageChannelId)
    : null;

  // The voice channel whose stage fills the main column, if any. Falls back to
  // the connected room's channel across servers or DMs so switching servers keeps it.
  const stageChannel: PublicChannel | null = stageChannelId
    ? voiceChannels.find((channel) => channel.id === stageChannelId) ||
    servers
      .flatMap((server) => server.channels)
      .find((channel) => channel.id === stageChannelId) ||
    (stageDm
      ? {
        id: stageDm.channelId,
        serverId: "",
        name: stageDm.user.displayName,
        kind: "voice" as const,
        topic: `Direct call with ${stageDm.user.displayName}`,
        position: 0,
        categoryId: null,
      }
      : null)
    : null;

  /** Open a voice channel's stage and join it (without ever leaving on re-click). */
  function openVoiceChannel(channel: PublicChannel) {
    if (myTimeoutUntil && voice.channelId !== channel.id) {
      setNotice(`You are timed out here until ${formatClientDateTime(myTimeoutUntil)}.`);
      return;
    }
    player.prime();
    setStageChannelId(channel.id);
    setMobileNav(false);
    if (voice.channelId !== channel.id) {
      // A stage opens you in the audience unless SPEAK says otherwise. This is
      // the only place SPEAK is enforced, and it is what makes the audience real:
      // without it everyone would join with a live microphone and the roster's
      // "on stage" list would be meaningless.
      const startMuted = shouldStartMuted(channel.kind, hasPermission(myPermissions, Permission.SPEAK));
      void voice.join(channel.id, { startMuted });
    }
  }

  /** "Watch Stream": join the room and open its stage on that stream, past the tune-in prompt. */
  function watchStream(channel: PublicChannel, target: StageFocusRequest["target"]) {
    openVoiceChannel(channel);
    setStageFocusRequest({ channelId: channel.id, target, at: Date.now() });
  }

  /** Where a #channel link in a message takes you. */
  function openMentionedChannel(target: MentionChannel) {
    const channel = activeServer?.channels.find((c) => c.id === target.id);
    if (!channel) return;
    // `appearsAsVoice` rather than `kind === "voice"`, so a stage room is joined
    // the same way a voice room is.
    if (channelKindInfo(channel.kind).appearsAsVoice) {
      openVoiceChannel(channel);
      return;
    }
    setStageChannelId(null);
    setActiveChannelId(channel.id);
    setMobileNav(false);
  }

  /** One server icon on the rail (loose, or inside an open folder). */
  function renderRailServer(server: PublicServer) {
    return (
      <RailServer
        key={server.id}
        server={server}
        isActive={server.id === activeServerId}
        unread={unread}
        voiceRooms={voiceRooms}
        dragging={dragServerId === server.id}
        dropMode={serverDropHint?.id === server.id ? serverDropHint.mode : null}
        dragProps={serverDragProps(server)}
        onOpen={() => {
          setActiveServerId(server.id);
          setStageChannelId(null);
          setMobileNav(false);
        }}
        onMenu={(x, y) => setRailMenu({ server, x, y })}
      />
    );
  }

  /** A folder on the rail: a mini grid when closed, its servers when open. */
  function renderRailFolder(folder: ServerFolder, folderServers: PublicServer[]) {
    return (
      <RailFolder
        key={`folder-${folder.id}`}
        folder={folder}
        folderServers={folderServers}
        open={openFolders.has(folder.id)}
        activeServerId={activeServerId}
        unread={unread}
        dropMerge={serverDropHint?.id === folder.id}
        dropProps={folderDropProps(folder)}
        onToggle={() => toggleFolderOpen(folder.id)}
        onMenu={(x, y) => setFolderMenu({ folder, x, y })}
        renderServer={renderRailServer}
      />
    );
  }

  function renderChannel(channel: PublicChannel) {
    if (channelKindInfo(channel.kind).appearsAsVoice) {
      const people = voiceRooms[channel.id] || [];
      const roomWatch = hub.watching[channel.id];
      const playing = hub.players[channel.id]?.track;
      // Merge channel-reorder drag props with a drop zone that accepts a
      // dragged voice member (a moderator moving someone into this room).
      const chanProps = channelDragProps(channel);
      const voiceDropProps = {
        onDragOver: (event: DragEvent<HTMLElement>) => {
          if (
            event.dataTransfer.types.includes(
              "application/x-huddle-voice-member",
            )
          ) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            return;
          }
          chanProps.onDragOver?.(event);
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          const personId = event.dataTransfer.getData(
            "application/x-huddle-voice-member",
          );
          if (personId) {
            event.preventDefault();
            event.stopPropagation();
            if (!people.some((person) => person.id === personId)) {
              void moveMember(personId, channel.id);
            }
            return;
          }
          chanProps.onDrop?.(event);
        },
      };
      const isConnectedVoice = voice.channelId === channel.id;
      return (
        <div
          key={channel.id}
          {...chanProps}
          {...voiceDropProps}
          className={`voice-room-wrapper ${isConnectedVoice ? "voice-active-contour" : ""}`}
        >
          <button
            className={`voice-room ${isConnectedVoice ? "selected-voice active-connected-room" : ""} ${stageChannelId === channel.id ? "viewing-voice" : ""}`}
            title={
              channel.topic
                ? `${channel.name} — ${channel.topic}`
                : channel.name
            }
            onClick={() => openVoiceChannel(channel)}
            onContextMenu={(event) => {
              event.preventDefault();
              setChannelMenu({ channel, x: event.clientX, y: event.clientY });
            }}
          >
            <span className={`speaker-icon ${isConnectedVoice ? "text-emerald-400" : ""}`}>
              {channelKindIcon(channel.kind, 16)}
            </span>
            <span className={isConnectedVoice ? "font-semibold text-[var(--accent-hi)]" : ""}>{channel.name}</span>
            {isConnectedVoice ? (
              <span className="voice-active-pill">
                {people.length > 0 ? `${people.length} active` : "connected"}
              </span>
            ) : people.length > 0 ? (
              <span className="live-pill">LIVE</span>
            ) : null}
            {canManageChannels && (
              <span
                className="channel-delete"
                role="button"
                aria-label={`Delete ${channel.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void deleteChannel(channel);
                }}
              >
                ×
              </span>
            )}
          </button>

          {people.length > 0 && (
            <div className={`voice-members ${isConnectedVoice ? "contour-members" : ""}`}>
              {people.map((person) => {
                const speakingId =
                  person.connectionId === hub.connectionId ? "self" : person.connectionId;
                const isStreaming = Boolean(
                  person.screenStreamId ||
                  (person.connectionId === hub.connectionId && voice.screenSharing)
                );
                const hoverInfo = {
                  kind: "screen" as const,
                  connectionId: person.connectionId,
                  streamerName: person.displayName,
                  startedAt: person.screenStartedAt,
                  channel,
                };
                return (
                  <Speaking key={person.connectionId} store={voice.speakingStore} id={speakingId}>
                    {(isSpeaking) => (
                  <div
                    className={`voice-member ${canModerate && !person.bot ? "draggable-member" : ""
                      } ${isSpeaking ? "is-speaking" : ""}`}
                    draggable={canModerate && !person.bot}
                    onMouseEnter={(event) => {
                      if (isStreaming && !touchInput) queueStreamHover(hoverInfo, event.currentTarget);
                    }}
                    onMouseLeave={() => {
                      if (isStreaming && !touchInput) queueStreamHover(null);
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        "application/x-huddle-voice-member",
                        person.id,
                      );
                    }}
                    onContextMenu={(event) => {
                      if (person.bot) {
                        openBotMenu(event, "music");
                        return;
                      }
                      const member = membersById.get(person.id);
                      if (member) openUserMenu(event, member);
                    }}
                    onClick={(event) => {
                      if (!touchInput) return;
                      if (person.bot) {
                        openBotMenu(event, "music");
                        return;
                      }
                      const member = membersById.get(person.id);
                      if (member) openUserMenu(event, member);
                    }}
                  >
                    <div className={`relative flex items-center justify-center ${isSpeaking && !membersById.get(person.id)?.profileStyle?.ring ? "ring-2 ring-emerald-500/80 rounded-full" : ""}`}>
                      <VoiceAura
                        ring={membersById.get(person.id)?.profileStyle?.ring}
                        color={ringColor(membersById.get(person.id)?.profileStyle, person.color)}
                        speaking={isSpeaking}
                      >
                        <Avatar
                          className="tiny-avatar"
                          avatar={person.avatar}
                          avatarUrl={person.avatarUrl}
                          color={person.color}
                        />
                      </VoiceAura>
                    </div>
                    <span className={isSpeaking ? "font-medium text-[var(--ink)]" : ""}>
                      {person.connectionId === hub.connectionId
                        ? "You"
                        : <StyledName name={person.displayName} style={membersById.get(person.id)?.profileStyle} />}
                      {isSpeaking && isConnectedVoice ? " (speaking)" : ""}
                    </span>
                    <VoiceDuration
                      className="voice-member-timer"
                      joinedAt={person.joinedAt}
                      serverNow={hub.serverNow}
                    />
                    {/* One right-aligned slot so icons line up whatever the name length. */}
                    <span className="voice-member-status">
                      {isStreaming && (
                        <span
                          className="live-stream-badge"
                          role="button"
                          title="Streaming now: click to watch"
                          onClick={(e) => {
                            e.stopPropagation();
                            // No hover on a touch screen: a tap shows the card instead.
                            if (touchInput) {
                              const row = (e.currentTarget as HTMLElement).closest(".voice-member") as HTMLElement | null;
                              queueStreamHover(hoverInfo, row ?? (e.currentTarget as HTMLElement), true);
                              return;
                            }
                            watchStream(channel, { kind: "screen", connectionId: person.connectionId });
                          }}
                        >
                          <span className="live-stream-dot" />
                          LIVE
                        </span>
                      )}
                      {isStreaming && (person.screenViewers?.length ?? 0) > 0 && (
                        <span className="live-viewers" title={`${person.screenViewers!.length} watching`}>
                          <Eye size={11} aria-hidden="true" />
                          {person.screenViewers!.length}
                        </span>
                      )}
                      {isSpeaking && (
                        <Mic size={14} className="is-speaking-icon" aria-label="Speaking" />
                      )}
                      {person.muted && !person.bot && !isSpeaking && (
                        <span
                          className={`muted-pill ${person.serverMuted ? "is-server" : ""}`}
                          title={person.serverMuted ? "Muted for everyone" : "Muted"}
                        >
                          <MicOff size={14} />
                        </span>
                      )}
                      {person.deafened && !person.bot && (
                        <span className="deafened-pill" title="Deafened">
                          <HeadphoneOff size={14} />
                        </span>
                      )}
                      {person.bot && playing && (
                        <span className="speaking-bars" aria-label="Playing">
                          <AudioLines size={14} />
                        </span>
                      )}
                      {person.bot && person.deafened && (
                        <span
                          className="bot-deafened-pill"
                          title="The bot sends music but cannot hear the room"
                          aria-label="Bot deafened"
                        >
                          <HeadphoneOff size={14} />
                        </span>
                      )}
                    </span>
                  </div>
                    )}
                  </Speaking>
                );
              })}
            </div>
          )}
          {roomWatch && people.length > 0 && (() => {
            const watchInfo = {
              kind: "watch" as const,
              streamerName: "Watch party",
              title: roomWatch.title,
              startedAt: roomWatch.startedAt,
              channel,
            };
            return (
              <button
                type="button"
                className="voice-watch-party"
                title={`Watch party: ${roomWatch.title}`}
                onMouseEnter={(event) => { if (!touchInput) queueStreamHover(watchInfo, event.currentTarget); }}
                onMouseLeave={() => { if (!touchInput) queueStreamHover(null); }}
                onClick={(event) => {
                  if (touchInput) {
                    queueStreamHover(watchInfo, event.currentTarget, true);
                    return;
                  }
                  watchStream(channel, { kind: "watch" });
                }}
              >
                <Film size={14} aria-hidden="true" />
                <span className="voice-watch-party-title">{roomWatch.title}</span>
                {roomWatch.viewers.length > 0 && (
                  <span className="live-viewers" title={`${roomWatch.viewers.length} watching`}>
                    <Eye size={11} aria-hidden="true" />
                    {roomWatch.viewers.length}
                  </span>
                )}
                <span className="live-stream-badge">
                  <span className="live-stream-dot" />
                  LIVE
                </span>
              </button>
            );
          })()}
        </div>
      );
    }

    return (
      <button
        key={channel.id}
        className={`channel ${activeChannelId === channel.id && !stageChannelId ? "selected" : ""} ${unread[channel.id]?.unread ? "has-unread" : ""
          }`}
        {...channelDragProps(channel)}
        title={
          channel.topic
            ? `#${channel.name} — ${channel.topic}`
            : `#${channel.name}`
        }
        onClick={() => {
          setActiveChannelId(channel.id);
          setStageChannelId(null);
          setMobileNav(false);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setChannelMenu({ channel, x: event.clientX, y: event.clientY });
        }}
      >
        {unread[channel.id]?.unread && <span className="unread-pill" />}
        {channelKindIcon(channel.kind, 16, "channel-hash shrink-0")}
        <span>{channel.name}</span>
        {channel.nsfw && <span className="nsfw-badge" title="Age-restricted">18+</span>}
        {(unread[channel.id]?.mentions ?? 0) > 0 && (
          <span className="mention-badge">{unread[channel.id].mentions}</span>
        )}
        {canCreateServerInvites && (
          <span
            className="channel-invite"
            role="button"
            title="Create invite"
            aria-label={`Invite people to #${channel.name}`}
            onClick={(event) => {
              event.stopPropagation();
              setInviteDialog({ channelId: channel.id });
            }}
          >
            <UserPlus size={14} />
          </span>
        )}
        {canManageChannels && (
          <span
            className="channel-delete"
            role="button"
            aria-label={`Delete ${channel.name}`}
            onClick={(event) => {
              event.stopPropagation();
              void deleteChannel(channel);
            }}
          >
            ×
          </span>
        )}
      </button>
    );
  }
  const currentPlayer = voice.channelId
    ? hub.players[voice.channelId] || null
    : null;
  const musicBotActions: BotMenuAction[] = [
    { label: "Play something…", onSelect: () => prepareCommand("/play ") },
    { label: "Show queue", onSelect: () => prepareCommand("/queue") },
    { label: "Lyrics now", onSelect: () => void runCommand("/lyricsnow") },
    {
      label: "Toggle Smart Autoplay",
      onSelect: () => void runCommand("/autoplay"),
    },
    {
      label: "Toggle AutoMix",
      onSelect: () => void runCommand("/automix"),
    },
    { label: "Like this track", onSelect: () => void runCommand("/like") },
    {
      label: "Dislike this track",
      onSelect: () => void runCommand("/dislike"),
    },
    { label: "Listening stats", onSelect: () => void runCommand("/stats") },
    { label: "Room Wrapped", onSelect: () => void runCommand("/wrapped") },
    { label: "Music settings", onSelect: () => void runCommand("/settings") },
    ...(voice.channelId && currentPlayer?.track
      ? [
        {
          label: currentPlayer.paused ? "Resume" : "Pause",
          onSelect: () =>
            hub.send({
              t: "player",
              channelId: voice.channelId!,
              action: { name: "toggle" },
            }),
        },
        {
          label: "Skip",
          onSelect: () =>
            hub.send({
              t: "player",
              channelId: voice.channelId!,
              action: { name: "skip" },
            }),
        },
        {
          label: "Stop playing",
          danger: true,
          onSelect: () =>
            hub.send({
              t: "player",
              channelId: voice.channelId!,
              action: { name: "stop" },
            }),
        },
      ]
      : []),
    ...(user?.isAdmin || canModerate
      ? [
        {
          label: "Set room volume…",
          onSelect: () => prepareCommand("/volume "),
        },
      ]
      : []),
    ...(musicDashboardUrl
      ? [
        {
          label: "Open dashboard",
          onSelect: () => void openMusicDashboard(),
        },
        {
          label: "Open DJ booth",
          onSelect: () => void openMusicDashboard("dj"),
        },
      ]
      : []),
  ];
  const dndBotActions: BotMenuAction[] = [
    { label: "Roll dice…", onSelect: () => prepareCommand("/roll ") },
    { label: "Find a spell…", onSelect: () => prepareCommand("/spell ") },
    { label: "Find a monster…", onSelect: () => prepareCommand("/monster ") },
    ...(dndUrl
      ? [
        {
          label: "Open dashboard",
          onSelect: () =>
            window.open(dndUrl, "_blank", "noopener,noreferrer"),
        },
      ]
      : []),
  ];

  return {
    ...s,
    rawDisplayedMembers, filterQ, displayedMembers, onlineMembers, offlineMembers,
    currentVoiceChannel, stageDm, stageChannel, openVoiceChannel, openMentionedChannel, watchStream,
    renderRailServer, renderRailFolder, renderChannel, currentPlayer, musicBotActions,
    dndBotActions,
  };
}
