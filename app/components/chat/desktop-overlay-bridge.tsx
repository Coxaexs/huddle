"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicServer } from "@/lib/servers";
import type { VoiceParticipant } from "@/lib/protocol";
import { channelKindInfo } from "@/lib/channel-kinds";
import type { DmSummary } from "../../lib/chat/types";
import { useSpeaking, type SpeakingStore } from "../../lib/speaking-store";
import {
  mainOverlayBridge,
  setOverlayRelay,
  type OverlayAction,
  type OverlayPerson,
  type OverlayShell,
  type OverlayVoice,
} from "../../lib/desktop-overlay";

export interface DesktopOverlayBridgeProps {
  servers: PublicServer[];
  dms: DmSummary[];
  unread: Record<string, { unread: boolean; count: number; mentions: number }>;
  voiceRooms: Record<string, VoiceParticipant[]>;
  voice: {
    channelId: string | null;
    muted: boolean;
    deafened: boolean;
    speakingStore: SpeakingStore;
    toggleMute: () => void;
    toggleDeafen: () => void;
  };
  voiceChannelName: string | null;
  selfConnectionId: string | null;
  activeServerId: string | null;
  activeChannelId: string | null;
  onJoin: (channelId: string) => void;
  onLeave: () => void;
  onOpenChannel: (channelId: string) => void;
  onOpenSettings: () => void;
}

const person = (seat: VoiceParticipant): OverlayPerson => ({
  connectionId: seat.connectionId,
  id: seat.id,
  name: seat.displayName,
  avatar: seat.avatar,
  avatarUrl: seat.avatarUrl ?? null,
  color: seat.color,
  muted: Boolean(seat.muted || seat.serverMuted),
  deafened: Boolean(seat.deafened),
});

/**
 * Desktop app only: keeps the game overlay (desktop/src/overlay.js) told about
 * the call and, while it is open, the channel list and new messages, and
 * carries out its buttons. Sends nothing until the overlay asks (`want`).
 */
export function DesktopOverlayBridge(props: DesktopOverlayBridgeProps) {
  const bridge = useMemo(() => mainOverlayBridge(), []);
  const [want, setWant] = useState({ voice: false, shell: false });
  const speaking = useSpeaking(props.voice.speakingStore);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void bridge.want().then((next) => {
      if (live && next) setWant(next);
    });
    const off = bridge.onWant(setWant);
    return () => {
      live = false;
      off();
    };
  }, [bridge]);

  // The overlay's buttons. Read through a ref so a re-render never drops one.
  useEffect(() => {
    if (!bridge) return;
    return bridge.onAction((action: OverlayAction) => {
      const current = latest.current;
      if (action.type === "mute" && current.voice.channelId) current.voice.toggleMute();
      else if (action.type === "deafen" && current.voice.channelId) current.voice.toggleDeafen();
      else if (action.type === "leave" && current.voice.channelId) current.onLeave();
      else if (action.type === "join") current.onJoin(action.channelId);
      else if (action.type === "open-main" && action.channelId) current.onOpenChannel(action.channelId);
      else if (action.type === "settings") current.onOpenSettings();
    });
  }, [bridge]);

  const { voice, voiceRooms, voiceChannelName, servers, selfConnectionId } = props;
  const roomPeople = voice.channelId ? voiceRooms[voice.channelId] : undefined;
  const voiceSnapshot = useMemo<OverlayVoice | null>(() => {
    if (!voice.channelId) return null;
    const server = servers.find((item) => item.channels.some((channel) => channel.id === voice.channelId));
    return {
      channelId: voice.channelId,
      channelName: voiceChannelName || "Voice",
      serverName: server?.name ?? null,
      muted: voice.muted,
      deafened: voice.deafened,
      people: (roomPeople || []).filter((seat) => !seat.bot).map(person),
      speaking: [...speaking].map((id) => (id === "self" ? selfConnectionId || "self" : id)),
      selfConnectionId,
    };
  }, [voice.channelId, voice.muted, voice.deafened, voiceChannelName, servers, roomPeople, speaking, selfConnectionId]);

  useEffect(() => {
    if (bridge && want.voice) bridge.publishVoice(voiceSnapshot);
  }, [bridge, want.voice, voiceSnapshot]);

  const { dms, unread, activeServerId, activeChannelId } = props;
  useEffect(() => {
    if (!bridge || !want.shell) return;
    const flag = (channelId: string) => ({
      unread: Boolean(unread[channelId]?.unread),
      mentions: unread[channelId]?.mentions || 0,
    });
    const shell: OverlayShell = {
      servers: servers.map((server) => {
        const categories = new Map(server.categories.map((category) => [category.id, category.name]));
        const channels = server.channels
          .filter((channel) => channel.kind !== "dm")
          .map((channel) => ({
            id: channel.id,
            name: channel.name,
            kind: channelKindInfo(channel.kind).appearsAsVoice ? ("voice" as const) : ("text" as const),
            category: channel.categoryId ? categories.get(channel.categoryId) ?? null : null,
            ...flag(channel.id),
          }));
        return {
          id: server.id,
          name: server.name,
          icon: server.icon,
          iconUrl: server.iconUrl ?? null,
          color: server.color,
          channels,
          unread: channels.some((channel) => channel.kind === "text" && channel.unread),
          mentions: channels.reduce((sum, channel) => sum + channel.mentions, 0),
        };
      }),
      dms: dms
        .filter((dm) => !dm.hidden)
        .map((dm) => ({
          channelId: dm.channelId,
          name: dm.group?.name || dm.user.displayName || dm.user.username,
          avatar: dm.user.avatar,
          avatarUrl: dm.user.avatarUrl ?? null,
          color: dm.user.color,
          ...flag(dm.channelId),
        })),
      rooms: Object.fromEntries(
        Object.entries(voiceRooms).map(([channelId, seats]) => [
          channelId,
          seats.filter((seat) => !seat.bot).map(person),
        ]),
      ),
      activeServerId,
      activeChannelId,
    };
    bridge.publishShell(shell);
  }, [bridge, want.shell, servers, dms, unread, voiceRooms, activeServerId, activeChannelId]);

  // New messages reach the overlay through this window's own connection.
  useEffect(() => {
    if (!bridge || !want.shell) return;
    setOverlayRelay((event) => bridge.publishMessage(event));
    return () => setOverlayRelay(null);
  }, [bridge, want.shell]);

  return null;
}
