"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Columns2,
  Eye,
  EyeOff,
  Lock,
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  Rows2,
  Square,
  Wifi,
  WifiOff,
} from "lucide-react";
import { apiFetch, apiUrl, basePath } from "../../lib/client";
import {
  DEFAULT_SECOND_SCREEN_STATE,
  type DndCompanionRoute,
  type SecondScreenLayout,
  type SecondScreenPane,
  type SecondScreenState,
} from "@/lib/second-screen";
import { SignedIn } from "../signed-in";
import { BattlemapPane, type BattlemapLiveSignal } from "./battlemap-pane";
import { ChatPane, type ChatPaneLiveSignal, type SimpleChatMessage } from "./chat-pane";
import { DndIframePane } from "./dnd-iframe-pane";
import { ScreensharePane } from "./screenshare-pane";
import "./second-screen.css";

interface ChannelOption {
  id: string;
  name: string;
  group: string;
  kind?: string;
}

interface VoiceOption {
  id: string;
  name: string;
  group: string;
  participants: number;
  hasScreenShare: boolean;
  selfSeated: boolean;
}

interface SecondScreenApiPayload {
  state: SecondScreenState;
  pairedReadOnly: boolean;
  ownerName?: string;
  activeChannelName?: string | null;
  activeVoiceChannelName?: string | null;
  ownerSeatedInVoice?: boolean;
  mySeatedVoiceId?: string | null;
  user?: { id: string; username: string; displayName: string };
  textChannels?: ChannelOption[];
  voiceChannels?: VoiceOption[];
  error?: string;
}

const PANE_LABELS: Array<{ id: SecondScreenPane; label: string }> = [
  { id: "screenshare", label: "Screenshare" },
  { id: "chat", label: "Channel Chat" },
  { id: "battlemap", label: "D&D Battlemap" },
  { id: "dnd-display", label: "D&D Display" },
  { id: "dnd-companion", label: "D&D Companion" },
];

export function SecondScreenApp() {
  const [pairToken, setPairToken] = useState("");
  const [bootDone, setBootDone] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [state, setState] = useState<SecondScreenState>(DEFAULT_SECOND_SCREEN_STATE);
  const [pairedReadOnly, setPairedReadOnly] = useState(false);
  const [user, setUser] = useState<{ id: string; username: string; displayName: string } | null>(null);
  const [textChannels, setTextChannels] = useState<ChannelOption[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<VoiceOption[]>([]);
  const [activeChannelName, setActiveChannelName] = useState<string | null>(null);
  const [activeVoiceChannelName, setActiveVoiceChannelName] = useState<string | null>(null);
  const [ownerSeatedInVoice, setOwnerSeatedInVoice] = useState(false);
  const [mySeatedVoiceId, setMySeatedVoiceId] = useState<string | null>(null);

  const [wsConnected, setWsConnected] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chatSignal, setChatSignal] = useState<ChatPaneLiveSignal | null>(null);
  const [battlemapSignal, setBattlemapSignal] = useState<BattlemapLiveSignal | null>(null);

  const seqRef = useRef(0);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchSnapshot = useCallback(async (pair: string) => {
    const qs = pair ? `?pair=${encodeURIComponent(pair)}` : "";
    const res = await fetch(apiUrl(`/api/second-screen${qs}`), {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as SecondScreenApiPayload;
    if (res.status === 401) {
      if (pair) {
        setLoadError(data.error || "This pairing link has expired or been revoked.");
      } else {
        setAuthNeeded(true);
      }
      setBootDone(true);
      return;
    }
    if (!res.ok) {
      setLoadError(data.error || `Failed to load 2nd Screen (${res.status}).`);
      setBootDone(true);
      return;
    }

    setLoadError("");
    setAuthNeeded(false);
    setState(data.state);
    setPairedReadOnly(Boolean(data.pairedReadOnly));
    setUser(data.user || null);
    setTextChannels(data.textChannels || []);
    setVoiceChannels(data.voiceChannels || []);
    setActiveChannelName(data.activeChannelName ?? null);
    setActiveVoiceChannelName(data.activeVoiceChannelName ?? null);
    setOwnerSeatedInVoice(Boolean(data.ownerSeatedInVoice));
    setMySeatedVoiceId(data.mySeatedVoiceId ?? null);
    setBootDone(true);
  }, []);

  useEffect(() => {
    const pair = new URLSearchParams(window.location.search).get("pair")?.trim() || "";
    setPairToken(pair);
    void fetchSnapshot(pair);
  }, [fetchSnapshot]);

  // Same-device BroadcastChannel sync (0ms updates between tabs/monitors)
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("hoffle-second-screen");
    ch.onmessage = (event) => {
      const msg = event.data as { type?: string; state?: SecondScreenState };
      if (msg?.type === "state" && msg.state) {
        setState(msg.state);
      }
    };
    return () => ch.close();
  }, []);

  // Poll gently for paired read-only devices (no authenticated WS)
  useEffect(() => {
    if (!bootDone || authNeeded || !pairedReadOnly || !pairToken) return;
    const id = window.setInterval(() => {
      void fetchSnapshot(pairToken);
    }, 2500);
    return () => window.clearInterval(id);
  }, [bootDone, authNeeded, pairedReadOnly, pairToken, fetchSnapshot]);

  const effectiveVoiceId = state.voiceChannelId || mySeatedVoiceId || null;

  // WebSocket live sync for signed-in users
  useEffect(() => {
    if (!bootDone || authNeeded || pairedReadOnly) return;
    let disposed = false;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${proto}//${window.location.host}${basePath}/api/realtime`);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
        const subId = state.channelId || effectiveVoiceId;
        if (subId && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ t: "subscribe", channelId: subId }));
        }
        pingTimer = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ t: "ping" }));
          }
        }, 25_000);
      };

      socket.onmessage = (ev) => {
        let payload: any;
        try {
          payload = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (!payload || typeof payload !== "object") return;
        if (payload.t === "second-screen" && payload.state) {
          setState(payload.state as SecondScreenState);
          return;
        }
        if (payload.t === "voice" && payload.channelId) {
          const seats = (payload.participants || []) as Array<{
            id: string;
            bot?: boolean;
            screenStreamId?: string | null;
          }>;
          const uid = user?.id;
          const selfSeated = Boolean(uid && seats.some((s) => !s.bot && s.id === uid));
          setVoiceChannels((prev) =>
            prev.map((vc) =>
              vc.id === payload.channelId
                ? {
                    ...vc,
                    participants: seats.filter((s) => !s.bot).length,
                    hasScreenShare: seats.some((s) => Boolean(s.screenStreamId)),
                    selfSeated,
                  }
                : vc,
            ),
          );
          if (selfSeated) setMySeatedVoiceId(payload.channelId);
          else if (mySeatedVoiceId === payload.channelId) setMySeatedVoiceId(null);
          if ((state.voiceChannelId || mySeatedVoiceId) === payload.channelId) {
            setOwnerSeatedInVoice(selfSeated);
          }
          return;
        }
        if (payload.t === "message" && payload.channelId && payload.message) {
          seqRef.current += 1;
          setChatSignal({
            seq: seqRef.current,
            kind: "message",
            channelId: payload.channelId,
            message: payload.message as SimpleChatMessage,
          });
          return;
        }
        if (payload.t === "message-edited" && payload.channelId) {
          seqRef.current += 1;
          setChatSignal({
            seq: seqRef.current,
            kind: "edited",
            channelId: payload.channelId,
            messageId: payload.id,
            content: payload.content,
            editedAt: payload.editedAt,
          });
          return;
        }
        if (payload.t === "message-deleted" && payload.channelId) {
          seqRef.current += 1;
          setChatSignal({
            seq: seqRef.current,
            kind: "deleted",
            channelId: payload.channelId,
            messageId: payload.id,
          });
          return;
        }
        if (payload.t === "battlemap" && payload.channelId) {
          seqRef.current += 1;
          setBattlemapSignal({
            seq: seqRef.current,
            channelId: payload.channelId,
          });
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        window.clearInterval(pingTimer);
        if (!disposed) {
          retryTimer = window.setTimeout(connect, 2500);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      setWsConnected(false);
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootDone, authNeeded, pairedReadOnly, user?.id]);

  // Keep WS subscribed to whichever channel Chat (or Battlemap) needs
  const subChannelId = useMemo(() => {
    const usesChat =
      state.primary === "chat" || (state.layout !== "single" && state.secondary === "chat");
    if (usesChat && state.channelId) return state.channelId;
    return effectiveVoiceId || state.channelId || null;
  }, [state.primary, state.secondary, state.layout, state.channelId, effectiveVoiceId]);

  useEffect(() => {
    const sock = wsRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN || !subChannelId) return;
    sock.send(JSON.stringify({ t: "subscribe", channelId: subChannelId }));
  }, [subChannelId, wsConnected]);

  // Refresh ownerSeatedInVoice whenever selected voiceChannelId changes locally
  useEffect(() => {
    if (pairedReadOnly) return;
    const match = voiceChannels.find((v) => v.id === effectiveVoiceId);
    if (match) setOwnerSeatedInVoice(match.selfSeated);
  }, [effectiveVoiceId, voiceChannels, pairedReadOnly]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen?.();
    } catch {
      /* ignore */
    }
  };

  const updateState = async (patch: Partial<SecondScreenState>) => {
    if (pairedReadOnly) return;
    const optimistic: SecondScreenState = { ...state, ...patch, updatedAt: Date.now() };
    setState(optimistic);
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const ch = new BroadcastChannel("hoffle-second-screen");
        ch.postMessage({ type: "state", state: optimistic });
        ch.close();
      } catch {
        /* ignore */
      }
    }
    try {
      const res = await apiFetch<{ state: SecondScreenState }>("/api/second-screen", {
        method: "POST",
        body: JSON.stringify({ action: "update", patch }),
      });
      setState(res.state);
    } catch {
      /* keep optimistic state */
    }
  };

  if (!bootDone) {
    return (
      <div className="s2-shell">
        <div className="s2-empty">Loading 2nd Screen…</div>
      </div>
    );
  }

  if (authNeeded) {
    return (
      <SignedIn>
        <AutoContinue onReady={() => void fetchSnapshot("")} />
      </SignedIn>
    );
  }

  if (loadError) {
    return (
      <div className="s2-shell">
        <div className="s2-empty">
          <Lock size={30} style={{ opacity: 0.7 }} />
          <p style={{ margin: 0, maxWidth: 360 }}>{loadError}</p>
          <div className="s2-bar-group" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="s2-pill-btn active"
              onClick={() => void fetchSnapshot(pairToken)}
            >
              <RefreshCw size={14} /> Retry
            </button>
            <a
              href={`${basePath}/screen`}
              className="s2-pill-btn"
              style={{ textDecoration: "none" }}
            >
              Sign in with Hoffle
            </a>
          </div>
        </div>
      </div>
    );
  }

  const resolvedChannelName =
    activeChannelName ||
    textChannels.find((c) => c.id === state.channelId)?.name ||
    null;

  const resolvedVoiceName =
    activeVoiceChannelName ||
    voiceChannels.find((v) => v.id === effectiveVoiceId)?.name ||
    null;

  const renderPane = (pane: SecondScreenPane) => {
    switch (pane) {
      case "screenshare":
        return (
          <ScreensharePane
            voiceChannelId={effectiveVoiceId}
            voiceChannelName={resolvedVoiceName}
            ownerSeatedInVoice={ownerSeatedInVoice}
            pairToken={pairToken}
            pairedReadOnly={pairedReadOnly}
          />
        );
      case "chat":
        return (
          <ChatPane
            channelId={state.channelId}
            channelName={resolvedChannelName}
            pairToken={pairToken}
            pairedReadOnly={pairedReadOnly}
            liveSignal={chatSignal}
          />
        );
      case "battlemap":
        return (
          <BattlemapPane
            channelId={state.channelId}
            voiceChannelId={effectiveVoiceId}
            userId={user?.id || ""}
            pairToken={pairToken}
            pairedReadOnly={pairedReadOnly}
            liveSignal={battlemapSignal}
          />
        );
      case "dnd-display":
      case "dnd-companion":
        return (
          <DndIframePane
            kind={pane}
            dndRoute={state.dndRoute}
            pairToken={pairToken}
            pairedReadOnly={pairedReadOnly}
            onChangeRoute={
              pairedReadOnly
                ? undefined
                : (dndRoute: DndCompanionRoute) => void updateState({ dndRoute })
            }
          />
        );
    }
  };

  return (
    <div className="s2-shell" ref={shellRef}>
      {hudHidden ? (
        <button
          type="button"
          className="s2-show-bar-fab"
          onClick={() => setHudHidden(false)}
          title="Show 2nd Screen controls"
        >
          <Eye size={14} /> Controls
        </button>
      ) : (
        <header className="s2-bar">
          <div className="s2-bar-group">
            <span className="s2-brand">
              <Monitor size={15} style={{ color: "var(--lavender, #8b5cf6)" }} />
              <span>Hoffle 2nd Screen</span>
            </span>
            {wsConnected ? (
              <Wifi size={13} style={{ color: "#34d399" }} aria-label="Live synced" />
            ) : (
              <WifiOff size={13} style={{ opacity: 0.55 }} aria-label="Polling / reconnecting" />
            )}

            {!pairedReadOnly && (
              <>
                <select
                  className="s2-select"
                  aria-label="Primary pane"
                  value={state.primary}
                  onChange={(e) =>
                    void updateState({ primary: e.target.value as SecondScreenPane })
                  }
                >
                  {PANE_LABELS.map((p) => (
                    <option key={p.id} value={p.id}>
                      Pane 1: {p.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className={`s2-pill-btn ${state.layout === "single" ? "active" : ""}`}
                  onClick={() => void updateState({ layout: "single" })}
                  title="Single pane"
                >
                  <Square size={12} /> 1
                </button>
                <button
                  type="button"
                  className={`s2-pill-btn ${state.layout === "split-h" ? "active" : ""}`}
                  onClick={() => void updateState({ layout: "split-h" })}
                  title="Split side-by-side"
                >
                  <Columns2 size={12} /> Split
                </button>
                <button
                  type="button"
                  className={`s2-pill-btn ${state.layout === "split-v" ? "active" : ""}`}
                  onClick={() => void updateState({ layout: "split-v" })}
                  title="Split stacked"
                >
                  <Rows2 size={12} /> Stack
                </button>

                {state.layout !== "single" && (
                  <select
                    className="s2-select"
                    aria-label="Secondary pane"
                    value={state.secondary}
                    onChange={(e) =>
                      void updateState({
                        secondary: e.target.value as SecondScreenPane,
                      })
                    }
                  >
                    {PANE_LABELS.map((p) => (
                      <option key={p.id} value={p.id}>
                        Pane 2: {p.label}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>

          <div className="s2-bar-group">
            {!pairedReadOnly && textChannels.length > 0 && (
              <select
                className="s2-select"
                aria-label="Channel for chat"
                value={state.channelId || ""}
                onChange={(e) =>
                  void updateState({ channelId: e.target.value || null })
                }
              >
                <option value="">Pick chat channel…</option>
                {textChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.group}: #{c.name}
                  </option>
                ))}
              </select>
            )}
            {!pairedReadOnly && voiceChannels.length > 0 && (
              <select
                className="s2-select"
                aria-label="Voice channel for screenshare"
                value={effectiveVoiceId || ""}
                onChange={(e) =>
                  void updateState({ voiceChannelId: e.target.value || null })
                }
              >
                <option value="">Pick voice room…</option>
                {voiceChannels.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.group}: {v.name} ({v.participants}
                    {v.hasScreenShare ? " · Live" : ""})
                  </option>
                ))}
              </select>
            )}
            {pairedReadOnly && (
              <span className="s2-pill-btn" style={{ cursor: "default" }}>
                <Lock size={12} /> Paired view
              </span>
            )}
            <button
              type="button"
              className="s2-pill-btn"
              onClick={() => void toggleFullscreen()}
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button
              type="button"
              className="s2-pill-btn"
              onClick={() => setHudHidden(true)}
              title="Hide top bar"
            >
              <EyeOff size={13} />
            </button>
          </div>
        </header>
      )}

      <main className="s2-stage">
        <div
          className={`s2-panes ${
            state.layout === "split-h"
              ? "split-h"
              : state.layout === "split-v"
                ? "split-v"
                : ""
          }`}
        >
          {renderPane(state.primary)}
          {state.layout !== "single" && renderPane(state.secondary)}
        </div>
      </main>
    </div>
  );
}

function AutoContinue({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <div className="s2-shell">
      <div className="s2-empty">Signing in to 2nd Screen…</div>
    </div>
  );
}
