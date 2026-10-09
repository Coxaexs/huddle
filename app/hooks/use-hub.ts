"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  heard,
  type ClientEvent,
  type CharacterPresentation,
  type CharacterReveal,
  type DiceRollEvent,
  type PlayerState,
  type RecordingState,
  type ServerEvent,
  type VoiceParticipant,
} from "@/lib/protocol";
import { basePath } from "../lib/client";
import { ROSTER_GRACE_MS, withRosterGrace } from "../lib/roster-grace";

export interface HubState {
  connected: boolean;
  connectionId: string | null;
  /** Counts hub sessions; a resumed connection keeps its id but bumps this. */
  session: number;
  online: Set<string>;
  voice: Record<string, VoiceParticipant[]>;
  players: Record<string, PlayerState>;
  recordings: Record<string, RecordingState>;
  /** People muted for everyone. */
  forcedMutes: Set<string>;
}

interface HubHandlers {
  onMessage?: (channelId: string, message: unknown) => void;
  onSignal?: (from: string, data: unknown) => void;
  onStructureChange?: (serverId?: string) => void;
  /** One person's profile or presence changed. */
  onMember?: (userId: string) => void;
  onMessageDeleted?: (channelId: string, id: string) => void;
  onMessagePinned?: (channelId: string, id: string, pinned: boolean) => void;
  onMessageEdited?: (
    channelId: string,
    id: string,
    content: string | undefined,
    editedAt: string | undefined,
    /** Bot edits can change embeds and buttons too; absent for plain edits. */
    payload?: unknown,
  ) => void;
  onReaction?: (
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
    added: boolean,
  ) => void;
  onSoundboard?: (channelId: string, url: string, name: string, by: string) => void;
  /** An administrator force-stopped /tts and /say in this channel. */
  onTtsStop?: (channelId: string, by: string) => void;
  onTyping?: (channelId: string, userId: string, displayName: string) => void;
  onPoll?: (
    channelId: string,
    pollId: string,
    counts: number[],
    voterLists?: Array<Array<{ id: string; name: string }>>,
  ) => void;
  onBattlemap?: (
    channelId: string,
    payload: {
      action: string;
      map?: unknown;
      token?: unknown;
      tokens?: unknown;
      stroke?: unknown;
      strokes?: unknown;
      fog?: unknown;
    },
  ) => void;
  onActivity?: (
    channelId: string,
    payload: { action: "update" | "close"; activity?: unknown },
  ) => void;
  onDiceRoll?: (channelId: string, roll: DiceRollEvent) => void;
  onCharacterPresentation?: (
    channelId: string,
    payload: {
      sessionId: string;
      action: "updated" | "reveal" | "clear";
      presentation?: CharacterPresentation;
      reveal?: CharacterReveal;
    },
  ) => void;
  onForceMute?: (userId: string, muted: boolean) => void;
  /** This tab lost voice because the account joined from elsewhere. */
  onVoiceEvicted?: () => void;
  /** A moderator moved this account into another voice channel. */
  onVoiceMove?: (channelId: string) => void;
  /** DM call signaling (incoming call, accepted, declined, cancelled). */
  onDmCall?: (payload: {
    channelId: string;
    fromUserId: string;
    fromDisplayName: string;
    fromAvatar: string;
    fromAvatarUrl?: string | null;
    action: "call" | "accept" | "decline" | "cancel";
    isVideo?: boolean;
  }) => void;
}

/**
 * One WebSocket to the hub for the whole app: presence, live messages, voice
 * rooms, WebRTC signalling and the shared player all arrive on it.
 *
 * `serverNow` on every event gives us the hub's clock; the offset it implies is
 * what makes playback positions line up between people whose laptops disagree
 * about the time.
 */
export function useHub(enabled: boolean, handlers: HubHandlers) {
  const [state, setState] = useState<HubState>({
    connected: false,
    connectionId: null,
    session: 0,
    online: new Set(),
    voice: {},
    players: {},
    recordings: {},
    forcedMutes: new Set(),
  });

  const socketRef = useRef<WebSocket | null>(null);
  const clockOffsetRef = useRef(0);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  /** The id and ticket to ask for back on the next connect. */
  const resumeRef = useRef<{ connectionId: string; ticket: string } | null>(null);
  /** Rosters as the hub last reported them, before any grace is applied. */
  const freshVoiceRef = useRef<Record<string, VoiceParticipant[]>>({});
  /** The roster from before a reconnect, and until when it still counts. */
  const graceRef = useRef<{ voice: Record<string, VoiceParticipant[]>; until: number } | null>(null);
  const shownVoiceRef = useRef<Record<string, VoiceParticipant[]>>({});

  const send = useCallback((event: ClientEvent) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
      return true;
    }
    return false;
  }, []);

  /** The hub's idea of "now", in this browser's terms. */
  const serverNow = useCallback(() => Date.now() + clockOffsetRef.current, []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let retry: number | undefined;
    let heartbeat: number | undefined;
    let attempt = 0;
    /** When anything last arrived, and when the oldest unanswered ping left. */
    let lastMessageAt = 0;
    let pingSentAt = 0;
    let probe: number | undefined;
    let graceTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      window.clearTimeout(retry);
      window.clearTimeout(probe);
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const resume = resumeRef.current;
      const query = resume
        ? `?resume=${encodeURIComponent(resume.connectionId)}&ticket=${encodeURIComponent(resume.ticket)}`
        : "";
      const socket = new WebSocket(
        `${protocol}//${window.location.host}${basePath}/api/realtime${query}`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        lastMessageAt = Date.now();
        pingSentAt = 0;
        setState((current) => ({ ...current, connected: true }));
        heartbeat = window.setInterval(() => {
          // A ping that went a whole beat without any reply means the socket
          // is half-open (a phone that slept, a network that changed under
          // it): readyState still says OPEN, but nothing will ever arrive.
          if (pingSentAt && lastMessageAt < pingSentAt) {
            restart();
            return;
          }
          if (send({ t: "ping" })) pingSentAt = Date.now();
        }, 25_000);
      };

      socket.onmessage = (event) => {
        lastMessageAt = Date.now();
        let payload: ServerEvent;
        try {
          payload = JSON.parse(event.data as string) as ServerEvent;
        } catch {
          return;
        }
        if ("serverNow" in payload && payload.serverNow) {
          clockOffsetRef.current = payload.serverNow - Date.now();
        }

        switch (payload.t) {
          case "ready": {
            resumeRef.current = payload.resumeTicket
              ? { connectionId: payload.connectionId, ticket: payload.resumeTicket }
              : null;
            freshVoiceRef.current = payload.voice;
            // Coming back from a drop: cover the people not reconnected yet.
            const previous = shownVoiceRef.current;
            graceRef.current = Object.keys(previous).length
              ? { voice: previous, until: Date.now() + ROSTER_GRACE_MS }
              : null;
            window.clearTimeout(graceTimer);
            if (graceRef.current) {
              graceTimer = window.setTimeout(() => {
                graceRef.current = null;
                setState((current) => ({ ...current, voice: freshVoiceRef.current }));
              }, ROSTER_GRACE_MS);
            }
            setState((current) => ({
              connected: true,
              connectionId: payload.connectionId,
              session: current.session + 1,
              online: new Set(payload.online),
              voice: withRosterGrace(payload.voice, graceRef.current?.voice ?? null),
              // Players as the room hears them (the DJ booth while it's live).
              players: Object.fromEntries(
                Object.entries(payload.players).map(([id, player]) => [id, heard(player)]),
              ),
              recordings: payload.recordings || {},
              forcedMutes: new Set(payload.forcedMutes || []),
            }));
            break;
          }
          case "presence":
            setState((current) => ({
              ...current,
              online: new Set(payload.online),
            }));
            break;
          case "voice": {
            freshVoiceRef.current = {
              ...freshVoiceRef.current,
              [payload.channelId]: payload.participants,
            };
            const grace = graceRef.current && Date.now() < graceRef.current.until ? graceRef.current.voice : null;
            setState((current) => ({
              ...current,
              voice: withRosterGrace(freshVoiceRef.current, grace),
            }));
            break;
          }
          case "player":
            setState((current) => ({
              ...current,
              players: {
                ...current.players,
                [payload.state.channelId]: heard(payload.state),
              },
            }));
            break;
          case "recording-state":
            setState((current) => {
              const recordings = { ...current.recordings };
              if (payload.state) recordings[payload.channelId] = payload.state;
              else delete recordings[payload.channelId];
              return { ...current, recordings };
            });
            break;
          case "recording-consent":
            setState((current) => {
              const recording = current.recordings[payload.channelId];
              if (!recording || recording.id !== payload.sessionId) return current;
              return {
                ...current,
                recordings: {
                  ...current.recordings,
                  [payload.channelId]: {
                    ...recording,
                    consents: recording.consents.map((consent) =>
                      consent.userId === payload.consent.userId
                        ? payload.consent
                        : consent,
                    ),
                  },
                },
              };
            });
            break;
          case "recording-scene":
            setState((current) => {
              const recording = current.recordings[payload.channelId];
              if (!recording || recording.id !== payload.sessionId) return current;
              return {
                ...current,
                recordings: {
                  ...current.recordings,
                  [payload.channelId]: { ...recording, scene: payload.scene },
                },
              };
            });
            break;
          case "dice-roll":
            handlersRef.current.onDiceRoll?.(payload.channelId, payload.roll);
            break;
          case "character-presentation":
            handlersRef.current.onCharacterPresentation?.(payload.channelId, {
              sessionId: payload.sessionId,
              action: payload.action,
              presentation: payload.presentation,
              reveal: payload.reveal,
            });
            break;
          case "message":
            handlersRef.current.onMessage?.(payload.channelId, payload.message);
            break;
          case "signal":
            handlersRef.current.onSignal?.(payload.from, payload.data);
            break;
          case "structure":
            handlersRef.current.onStructureChange?.(payload.serverId);
            break;
          case "member":
            handlersRef.current.onMember?.(payload.userId);
            break;
          case "message-deleted":
            handlersRef.current.onMessageDeleted?.(payload.channelId, payload.id);
            break;
          case "message-pinned":
            handlersRef.current.onMessagePinned?.(
              payload.channelId,
              payload.id,
              payload.pinned,
            );
            break;
          case "message-edited":
            handlersRef.current.onMessageEdited?.(
              payload.channelId,
              payload.id,
              payload.content,
              payload.editedAt,
              payload.payload,
            );
            break;
          case "reaction":
            handlersRef.current.onReaction?.(
              payload.channelId,
              payload.messageId,
              payload.emoji,
              payload.userId,
              payload.added,
            );
            break;
          case "tts-stop":
            handlersRef.current.onTtsStop?.(payload.channelId, payload.by);
            break;
          case "soundboard":
            handlersRef.current.onSoundboard?.(
              payload.channelId,
              payload.url,
              payload.name,
              payload.by,
            );
            break;
          case "typing":
            handlersRef.current.onTyping?.(
              payload.channelId,
              payload.userId,
              payload.displayName,
            );
            break;
          case "poll":
            handlersRef.current.onPoll?.(
              payload.channelId,
              payload.pollId,
              payload.counts,
              (payload as { voterLists?: Array<Array<{ id: string; name: string }>> }).voterLists,
            );
            break;
          case "battlemap":
            handlersRef.current.onBattlemap?.(payload.channelId, {
              action: payload.action,
              map: payload.map,
              token: payload.token,
              tokens: payload.tokens,
              stroke: payload.stroke,
              strokes: payload.strokes,
              // Without this, every fog edit cleared every player's fog.
              fog: (payload as { fog?: unknown }).fog,
            });
            break;
          case "activity":
            handlersRef.current.onActivity?.(payload.channelId, {
              action: payload.action,
              activity: payload.activity,
            });
            break;
          case "force-mute":
            setState((current) => {
              const forcedMutes = new Set(current.forcedMutes);
              if (payload.muted) forcedMutes.add(payload.userId);
              else forcedMutes.delete(payload.userId);
              return { ...current, forcedMutes };
            });
            handlersRef.current.onForceMute?.(payload.userId, payload.muted);
            break;
          case "voice-evicted":
            handlersRef.current.onVoiceEvicted?.();
            break;
          case "voice-move":
            handlersRef.current.onVoiceMove?.(payload.channelId);
            break;
          case "dm-call":
            handlersRef.current.onDmCall?.(payload);
            break;
          default:
            break;
        }
      };

      const reconnect = () => {
        window.clearInterval(heartbeat);
        setState((current) => ({ ...current, connected: false }));
        if (disposed) return;
        attempt += 1;
        // Every second or so for the first half minute, which covers a server
        // restart; then back off. Jitter keeps a room from arriving in lockstep.
        const delay = attempt <= 30 ? 800 + Math.random() * 400 : Math.min(15_000, 1000 * 2 ** (attempt - 30));
        retry = window.setTimeout(connect, delay);
      };

      socket.onclose = reconnect;
      socket.onerror = () => socket.close();
    };

    /**
     * Drop the current socket and dial again right now. Closing a dead socket
     * can take minutes to report back through onclose, so detach it first
     * rather than waiting for that.
     */
    const restart = () => {
      const socket = socketRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
      }
      window.clearInterval(heartbeat);
      setState((current) => ({ ...current, connected: false }));
      attempt = 0;
      connect();
    };

    /**
     * Coming back to the page (switching back from another app on a phone,
     * reopening a laptop, the network returning) is exactly when the socket is
     * most likely dead. Skip the backoff, and check a socket that claims to be
     * open with a ping it has a few seconds to answer. The voice seat hangs
     * off this connection, so every second here is a second out of the call.
     */
    const wake = () => {
      if (disposed || document.visibilityState !== "visible") return;
      const socket = socketRef.current;
      if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        restart();
        return;
      }
      if (socket.readyState !== WebSocket.OPEN) return;
      const sentAt = Date.now();
      if (!send({ t: "ping" })) return;
      window.clearTimeout(probe);
      probe = window.setTimeout(() => {
        if (socketRef.current === socket && lastMessageAt < sentAt) restart();
      }, 4000);
    };

    connect();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("online", wake);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("online", wake);
      window.clearTimeout(retry);
      window.clearTimeout(probe);
      window.clearTimeout(graceTimer);
      window.clearInterval(heartbeat);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, send]);

  shownVoiceRef.current = state.voice;
  return { ...state, send, serverNow };
}
