"use client";

import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import {
  Columns2,
  Copy,
  ExternalLink,
  Hash,
  Map as MapIcon,
  Monitor,
  QrCode,
  RefreshCw,
  ShieldOff,
  Sparkles,
  X,
} from "lucide-react";
import { renderSVG } from "uqr";
import { apiFetch, basePath } from "../../lib/client";
import {
  DEFAULT_SECOND_SCREEN_STATE,
  type SecondScreenLayout,
  type SecondScreenPane,
  type SecondScreenState,
} from "@/lib/second-screen";
import "./second-screen.css";
import { useI18n } from "../../lib/i18n-context";
import { Icon } from "../chat/icon-button";
import type { ToolbarItemProps } from "../widgets/toolbar";

export interface SecondScreenTriggerHandle {
  open: () => void;
}

interface SecondScreenTriggerProps {
  activeChannelId: string | null;
  activeChannelName: string;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  hasActiveScreenShare: boolean;
  hasBattlemap: boolean;
  /** Compact stage button beside live screenshare controls. */
  stageQuickCast?: boolean;
  /** Toolbar integration when rendered in the chat header. */
  tb?: ToolbarItemProps;
  launcherRef?: Ref<SecondScreenTriggerHandle>;
}

export function SecondScreenTrigger({
  activeChannelId,
  activeChannelName,
  voiceChannelId,
  voiceChannelName,
  hasActiveScreenShare,
  hasBattlemap,
  stageQuickCast = false,
  tb,
  launcherRef,
}: SecondScreenTriggerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SecondScreenState>(DEFAULT_SECOND_SCREEN_STATE);
  const [pairUrl, setPairUrl] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusNote, setStatusNote] = useState("");

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const loadedRef = useRef(false);
  const followSyncRef = useRef<number | null>(null);
  const titleId = useId();

  const qrDataUrl = useMemo(() => {
    if (!pairUrl) return "";
    try {
      const svg = renderSVG(pairUrl, { ecc: "M" });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      return "";
    }
  }, [pairUrl]);

  const broadcastLocal = (next: SecondScreenState) => {
    if (typeof BroadcastChannel === "undefined") return;
    try {
      const ch = new BroadcastChannel("hoffle-second-screen");
      ch.postMessage({ type: "state", state: next });
      ch.close();
    } catch {
      /* ignore */
    }
  };

  const pushPatch = useCallback(
    async (patch: Partial<SecondScreenState>, note?: string) => {
      const optimistic: SecondScreenState = {
        ...state,
        ...patch,
        updatedAt: Date.now(),
      };
      setState(optimistic);
      broadcastLocal(optimistic);
      try {
        const res = await apiFetch<{ state: SecondScreenState }>("/api/second-screen", {
          method: "POST",
          body: JSON.stringify({ action: "update", patch }),
        });
        setState(res.state);
        broadcastLocal(res.state);
        if (note) setStatusNote(note);
      } catch {
        /* ignore */
      }
    },
    [state],
  );

  // Load initial 2nd Screen preference once on mount so auto-follow stays synced
  useEffect(() => {
    if (stageQuickCast) return;
    let cancelled = false;
    apiFetch<{ state: SecondScreenState }>("/api/second-screen")
      .then((res) => {
        if (!cancelled && res.state) {
          loadedRef.current = true;
          setState(res.state);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stageQuickCast]);

  // Auto-follow active channel & active voice room when followActive is enabled
  useEffect(() => {
    if (stageQuickCast || !loadedRef.current || !state.followActive) return;
    const nextChannel = activeChannelId ?? state.channelId;
    const nextVoice = voiceChannelId ?? state.voiceChannelId;
    if (nextChannel === state.channelId && nextVoice === state.voiceChannelId) return;

    const patch: Partial<SecondScreenState> = {
      ...(nextChannel ? { channelId: nextChannel } : {}),
      ...(nextVoice ? { voiceChannelId: nextVoice } : {}),
    };
    const optimistic: SecondScreenState = {
      ...state,
      ...patch,
      updatedAt: Date.now(),
    };
    broadcastLocal(optimistic);

    if (followSyncRef.current) window.clearTimeout(followSyncRef.current);
    followSyncRef.current = window.setTimeout(() => {
      void apiFetch<{ state: SecondScreenState }>("/api/second-screen", {
        method: "POST",
        body: JSON.stringify({ action: "update", patch }),
      })
        .then((res) => setState(res.state))
        .catch(() => {});
    }, 350);

    return () => {
      if (followSyncRef.current) window.clearTimeout(followSyncRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, voiceChannelId, state.followActive]);

  // Open/close native <dialog> via showModal() + Safari light-dismiss fallback
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const onClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener("click", onClick);
      return () => dialog.removeEventListener("click", onClick);
    }
  }, []);

  const loadPairLink = async (action: "pair" | "rotate-pair") => {
    setPairBusy(true);
    try {
      const res = await apiFetch<{ url: string }>("/api/second-screen", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setPairUrl(res.url || "");
    } catch {
      /* ignore */
    } finally {
      setPairBusy(false);
    }
  };

  const revokePairLink = async () => {
    setPairBusy(true);
    try {
      await apiFetch("/api/second-screen", {
        method: "POST",
        body: JSON.stringify({ action: "revoke-pair" }),
      });
      setPairUrl("");
      setStatusNote(t("s2.launcher.pairRevoked"));
    } finally {
      setPairBusy(false);
    }
  };

  const openModal = () => {
    setOpen(true);
    setStatusNote("");
    if (!pairUrl) void loadPairLink("pair");
  };

  useImperativeHandle(launcherRef, () => ({ open: openModal }));

  const openSecondWindow = async () => {
    await pushPatch({
      channelId: activeChannelId || state.channelId,
      voiceChannelId: voiceChannelId || state.voiceChannelId,
    });
    window.open(
      `${basePath}/screen`,
      "hoffle-second-screen",
      "noopener,width=1360,height=840",
    );
  };

  const castPreset = async (
    layout: SecondScreenLayout,
    primary: SecondScreenPane,
    secondary: SecondScreenPane,
    label: string,
  ) => {
    await pushPatch(
      {
        layout,
        primary,
        secondary,
        channelId: activeChannelId || state.channelId,
        voiceChannelId: voiceChannelId || state.voiceChannelId,
      },
      t("s2.launcher.sentNote", { label }),
    );
  };

  const copyUrl = async (target: string) => {
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const screenUrl =
    typeof window !== "undefined" ? `${window.location.origin}${basePath}/screen` : `${basePath}/screen`;

  return (
    <>
      {stageQuickCast ? (
        <button
          type="button"
          className="voice-stage-topbar-btn"
          onClick={() => {
            void castPreset("single", "screenshare", "chat", t("s2.launcher.screenshare"));
            openModal();
          }}
          title={t("s2.launcher.quickCastTitle")}
        >
          <Monitor size={15} />
        </button>
      ) : (
        <Icon
          label={t("s2.launcher.openTitle")}
          active={open}
          onClick={openModal}
          tb={tb}
        >
          <Monitor size={18} />
        </Icon>
      )}

      <dialog
        ref={dialogRef}
        className="s2-dialog"
        aria-labelledby={titleId}
        {...({ closedby: "any" } as Record<string, string>)}
        onClose={() => setOpen(false)}
      >
        <div className="s2-dialog-inner">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Monitor size={18} style={{ color: "var(--lavender, #8b5cf6)" }} />
              <h2 id={titleId} style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                {t("s2.brand")}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("s2.launcher.closeAria")}
              style={{
                background: "transparent",
                border: 0,
                color: "inherit",
                cursor: "pointer",
                padding: 6,
                borderRadius: 8,
              }}
            >
              <X size={18} />
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 13, opacity: 0.78, lineHeight: 1.45 }}>
            {t("s2.launcher.intro")}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="s2-pill-btn active"
              style={{ height: 38, padding: "0 14px", borderRadius: 10, fontSize: 13 }}
              onClick={() => void openSecondWindow()}
            >
              <ExternalLink size={14} /> {t("s2.launcher.openWindow")}
            </button>
            <button
              type="button"
              className="s2-pill-btn"
              style={{ height: 38, padding: "0 12px", borderRadius: 10, fontSize: 13 }}
              onClick={() => void copyUrl(screenUrl)}
            >
              <Copy size={14} /> {copied ? t("s2.launcher.copiedUrl") : t("s2.launcher.copyUrl")}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {t("s2.launcher.sendTo")}
            </div>
            <div className="s2-preset-grid">
              <button
                type="button"
                className={`s2-preset-btn ${state.layout === "single" && state.primary === "screenshare" ? "active" : ""}`}
                onClick={() => void castPreset("single", "screenshare", "chat", t("s2.launcher.screenshare"))}
              >
                <Monitor size={15} />
                <span>
                  {t("s2.launcher.screenshare")}{hasActiveScreenShare ? t("s2.launcher.liveSuffix") : ""}
                </span>
              </button>
              <button
                type="button"
                className={`s2-preset-btn ${state.layout === "single" && state.primary === "chat" ? "active" : ""}`}
                onClick={() => void castPreset("single", "chat", "screenshare", t("s2.launcher.channelChat"))}
              >
                <Hash size={15} />
                <span>#{activeChannelName || t("s2.launcher.chatFallback")}</span>
              </button>
              <button
                type="button"
                className={`s2-preset-btn ${state.layout === "split-h" && state.primary === "screenshare" && state.secondary === "chat" ? "active" : ""}`}
                onClick={() => void castPreset("split-h", "screenshare", "chat", t("s2.launcher.screenshareChat"))}
              >
                <Columns2 size={15} />
                <span>{t("s2.launcher.streamPlusChat")}</span>
              </button>
              <button
                type="button"
                className={`s2-preset-btn ${state.layout === "single" && state.primary === "battlemap" ? "active" : ""}`}
                onClick={() => void castPreset("single", "battlemap", "chat", t("s2.launcher.battlemap"))}
              >
                <MapIcon size={15} />
                <span>{t("s2.launcher.dndBattlemap")}{hasBattlemap ? t("s2.launcher.activeSuffix") : ""}</span>
              </button>
              <button
                type="button"
                className={`s2-preset-btn ${state.layout === "split-h" && state.primary === "battlemap" && state.secondary === "chat" ? "active" : ""}`}
                onClick={() => void castPreset("split-h", "battlemap", "chat", t("s2.launcher.battlemapPlusChat"))}
              >
                <Columns2 size={15} />
                <span>{t("s2.launcher.mapPlusChat")}</span>
              </button>
              <button
                type="button"
                className={`s2-preset-btn ${state.layout === "single" && state.primary === "dnd-companion" ? "active" : ""}`}
                onClick={() => void castPreset("single", "dnd-companion", "chat", t("s2.launcher.dndCompanion"))}
              >
                <Sparkles size={15} />
                <span>{t("s2.launcher.dndCompanion")}</span>
              </button>
            </div>
            {statusNote && (
              <span style={{ fontSize: 12, color: "#34d399" }}>{statusNote}</span>
            )}
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <span>
              {t("s2.launcher.followActive", {
                channel: activeChannelName || t("s2.launcher.none"),
                voice: voiceChannelName || t("s2.launcher.none"),
              })}
            </span>
            <input
              type="checkbox"
              checked={state.followActive}
              onChange={(e) => void pushPatch({ followActive: e.target.checked })}
            />
          </label>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 14,
              padding: 12,
              borderRadius: 12,
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            {qrDataUrl ? (
              <div className="s2-qr-box">
                <img
                  src={qrDataUrl}
                  alt={t("s2.launcher.qrAlt")}
                  width={120}
                  height={120}
                  style={{ width: "100%", height: "100%", aspectRatio: "1 / 1" }}
                />
              </div>
            ) : (
              <div className="s2-qr-box" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>
                <QrCode size={32} style={{ opacity: 0.6 }} />
              </div>
            )}
            <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>{t("s2.launcher.pairHeading")}</strong>
              <span style={{ fontSize: 12, opacity: 0.72, lineHeight: 1.4 }}>
                {t("s2.launcher.pairDesc")}
              </span>
              {pairUrl && (
                <input
                  type="text"
                  readOnly
                  value={pairUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.25)",
                    color: "inherit",
                    fontSize: 12,
                    fontFamily: "monospace",
                  }}
                />
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  type="button"
                  className="s2-pill-btn"
                  disabled={!pairUrl}
                  onClick={() => void copyUrl(pairUrl)}
                >
                  <Copy size={12} /> {t("s2.launcher.copyPairLink")}
                </button>
                <button
                  type="button"
                  className="s2-pill-btn"
                  disabled={pairBusy}
                  onClick={() => void loadPairLink("rotate-pair")}
                >
                  <RefreshCw size={12} /> {pairUrl ? t("s2.launcher.rotate") : t("s2.launcher.createLink")}
                </button>
                {pairUrl && (
                  <button
                    type="button"
                    className="s2-pill-btn"
                    disabled={pairBusy}
                    onClick={() => void revokePairLink()}
                  >
                    <ShieldOff size={12} /> {t("s2.launcher.revoke")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
