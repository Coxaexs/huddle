"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientEvent,
  CharacterPresentation,
  CharacterReveal,
  DiceRollEvent,
  PlayerState,
  RecordingState,
  ServerEvent,
  VoiceParticipant,
} from "@/lib/protocol";
import { basePath } from "../lib/client";

export interface HubState {
  connected: boolean;
  connectionId: string | null;
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
  onStructureChange?: () => void;
  onMessageDeleted?: (channelId: string, id: string) => void;
  onMessagePinned?: (channelId: string, id: string, pinned: boolean) => void;
  onMessageEdited?: (
    channelId: string,
    id: string,
    content: string,
    editedAt: string,
  ) => void;
  onReaction?: (
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
    added: boolean,
  ) => void;
  onSoundboard?: (channelId: string, url: string, name: string, by: string) => void;
  onTyping?: (channelId: string, userId: string, displayName: string) => void;
  onPoll?: (channelId: string, pollId: string, counts: number[]) => void;
  onBattlemap?: (
    channelId: string,
    payload: {
      action: string;
      map?: unknown;
      token?: unknown;
      tokens?: unknown;
      stroke?: unknown;
      strokes?: unknown;
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

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        `${protocol}//${window.location.host}${basePath}/api/realtime`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setState((current) => ({ ...current, connected: true }));
        heartbeat = window.setInterval(
          () => send({ t: "ping" }),
          25_000,
        );
      };

      socket.onmessage = (event) => {
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
          case "ready":
            setState({
              connected: true,
              connectionId: payload.connectionId,
              online: new Set(payload.online),
              voice: payload.voice,
              players: payload.players,
              recordings: payload.recordings || {},
              forcedMutes: new Set(payload.forcedMutes || []),
            });
            break;
          case "presence":
            setState((current) => ({
              ...current,
              online: new Set(payload.online),
            }));
            break;
          case "voice":
            setState((current) => ({
              ...current,
              voice: { ...current.voice, [payload.channelId]: payload.participants },
            }));
            break;
          case "player":
            setState((current) => ({
              ...current,
              players: {
                ...current.players,
                [payload.state.channelId]: payload.state,
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
            handlersRef.current.onStructureChange?.();
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
          default:
            break;
        }
      };

      const reconnect = () => {
        window.clearInterval(heartbeat);
        setState((current) => ({ ...current, connected: false }));
        if (disposed) return;
        attempt += 1;
        // Back off, but stay responsive for the usual case (a laptop lid).
        retry = window.setTimeout(connect, Math.min(15_000, 500 * 2 ** attempt));
      };

      socket.onclose = reconnect;
      socket.onerror = () => socket.close();
    };

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(retry);
      window.clearInterval(heartbeat);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, send]);

  return { ...state, send, serverNow };
}
