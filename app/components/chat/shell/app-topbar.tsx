"use client";

import { ArrowLeft, ArrowRight, CircleHelp, Inbox, MessageCircle, Users } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PublicServer } from "@/lib/servers";
import { DM_HOME } from "../../../lib/chat/constants";
import { useI18n } from "../../../lib/i18n-context";
import { requestHelp } from "../../../lib/help-request";

interface NavEntry {
  serverId: string | null;
  channelId: string | null;
  stageChannelId: string | null;
}

function serverMonogram(server: PublicServer): string {
  return (
    server.icon ||
    server.name
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    "SV"
  );
}

/**
 * Discord-style window titlebar: back/forward history on the left, the current
 * space (server name + icon, Friends, or Direct Messages) centered, and Inbox
 * + Help shortcuts on the right. Renders only inside the desktop shell (or an
 * active PWA windowControlsOverlay) so normal browser tabs keep full height.
 */
export function AppTopbar({
  inDmHome,
  activeServer,
  activeChannelId,
  stageChannelId,
  setActiveServerId,
  setActiveChannelId,
  setStageChannelId,
  mentionsOpen,
  unreadMentionTotal,
  setMentionsOpen,
  setShortcutsOpen,
}: {
  inDmHome: boolean;
  activeServer: PublicServer | null;
  activeChannelId: string | null;
  stageChannelId: string | null;
  setActiveServerId: Dispatch<SetStateAction<string | null>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setStageChannelId: Dispatch<SetStateAction<string | null>>;
  mentionsOpen: boolean;
  unreadMentionTotal: number;
  setMentionsOpen: Dispatch<SetStateAction<boolean>>;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { t } = useI18n();
  const [titlebarKind, setTitlebarKind] = useState<"mac" | "win" | null>(null);
  const historyRef = useRef<NavEntry[]>([]);
  const indexRef = useRef(-1);
  const navigatingRef = useRef(false);
  const [navState, setNavState] = useState({ canBack: false, canForward: false });

  useEffect(() => {
    const win = window as unknown as {
      huddle?: { desktop?: boolean; titlebarInset?: boolean };
      __TAURI__?: unknown;
      navigator: Navigator & {
        windowControlsOverlay?: EventTarget & { visible?: boolean };
      };
    };
    const wco = win.navigator.windowControlsOverlay;
    const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
    const kind: "mac" | "win" = isMac ? "mac" : "win";

    const sync = () => {
      const active =
        Boolean(wco?.visible) ||
        Boolean(win.huddle?.titlebarInset) ||
        (isMac && (Boolean(win.huddle?.desktop) || Boolean(win.__TAURI__)));
      if (active) {
        document.documentElement.dataset.desktopTitlebar = kind;
        setTitlebarKind(kind);
      } else {
        delete document.documentElement.dataset.desktopTitlebar;
        setTitlebarKind(null);
      }
    };
    sync();
    wco?.addEventListener?.("geometrychange", sync);
    return () => {
      wco?.removeEventListener?.("geometrychange", sync);
      delete document.documentElement.dataset.desktopTitlebar;
    };
  }, []);

  const locServerId = inDmHome ? DM_HOME : activeServer?.id ?? null;

  useEffect(() => {
    if (!inDmHome && !activeServer) return;
    const next: NavEntry = {
      serverId: locServerId,
      channelId: activeChannelId,
      stageChannelId,
    };
    if (navigatingRef.current) {
      navigatingRef.current = false;
      return;
    }
    const stack = historyRef.current;
    const current = stack[indexRef.current];
    if (
      current &&
      current.serverId === next.serverId &&
      current.channelId === next.channelId &&
      current.stageChannelId === next.stageChannelId
    ) {
      return;
    }
    // Entering a server briefly renders with null channels before session picks one.
    if (
      current &&
      next.serverId !== DM_HOME &&
      current.serverId === next.serverId &&
      current.channelId === null &&
      current.stageChannelId === null &&
      (next.channelId !== null || next.stageChannelId !== null)
    ) {
      stack[indexRef.current] = next;
      return;
    }
    const trimmed = stack.slice(0, indexRef.current + 1);
    trimmed.push(next);
    if (trimmed.length > 50) trimmed.shift();
    historyRef.current = trimmed;
    indexRef.current = trimmed.length - 1;
    setNavState({
      canBack: indexRef.current > 0,
      canForward: indexRef.current < trimmed.length - 1,
    });
  }, [inDmHome, activeServer, locServerId, activeChannelId, stageChannelId]);

  function navigateTo(delta: -1 | 1) {
    const nextIndex = indexRef.current + delta;
    const target = historyRef.current[nextIndex];
    if (!target) return;
    indexRef.current = nextIndex;
    navigatingRef.current = true;
    setNavState({
      canBack: nextIndex > 0,
      canForward: nextIndex < historyRef.current.length - 1,
    });
    setActiveServerId(target.serverId);
    setActiveChannelId(target.channelId);
    setStageChannelId(target.stageChannelId);
  }

  const inFriends = inDmHome && !activeChannelId && !stageChannelId;
  const inDmChat = inDmHome && Boolean(activeChannelId || stageChannelId);

  useEffect(() => {
    if (!inDmHome && !activeServer) return;
    if (inFriends) {
      document.title = `${t("sidebar.friends")} — Hoffle`;
    } else if (inDmChat) {
      document.title = `${t("sidebar.directMessages")} — Hoffle`;
    } else if (activeServer) {
      document.title = `${activeServer.name} — Hoffle`;
    }
  }, [inDmHome, inFriends, inDmChat, activeServer, t]);

  if (!titlebarKind) return null;

  return (
    <div className="app-topbar" role="region" aria-label="Window bar" data-tauri-drag-region="">
      <div className="app-topbar-nav">
        <button
          type="button"
          className="app-topbar-btn"
          disabled={!navState.canBack}
          onClick={() => navigateTo(-1)}
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          className="app-topbar-btn"
          disabled={!navState.canForward}
          onClick={() => navigateTo(1)}
          aria-label="Forward"
          title="Forward"
        >
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="app-topbar-title" data-tauri-drag-region="">
        {!inDmHome && activeServer ? (
          <>
            <span
              className="app-topbar-icon"
              style={
                activeServer.iconUrl
                  ? undefined
                  : { background: activeServer.color || "var(--lavender)" }
              }
              aria-hidden="true"
            >
              {activeServer.iconUrl ? (
                <img src={activeServer.iconUrl} alt="" />
              ) : (
                serverMonogram(activeServer)
              )}
            </span>
            <span className="truncate">{activeServer.name}</span>
          </>
        ) : inFriends ? (
          <>
            <Users size={15} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{t("sidebar.friends")}</span>
          </>
        ) : inDmChat ? (
          <>
            <MessageCircle size={15} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{t("sidebar.directMessages")}</span>
          </>
        ) : null}
      </div>

      <div className="app-topbar-actions">
        <button
          type="button"
          className={`app-topbar-btn ${mentionsOpen ? "active" : ""}`}
          aria-label={t("header.mentions")}
          title={t("header.mentions")}
          aria-pressed={mentionsOpen}
          onPointerDown={(e) => {
            if (mentionsOpen) e.stopPropagation();
          }}
          onClick={() => setMentionsOpen((open) => !open)}
        >
          <Inbox size={16} />
          {unreadMentionTotal > 0 && (
            <span className="icon-badge">
              {unreadMentionTotal > 99 ? "99+" : unreadMentionTotal}
            </span>
          )}
        </button>
        <button
          type="button"
          className="app-topbar-btn"
          aria-label={t("help.title")}
          title={t("help.title")}
          onClick={requestHelp}
        >
          <CircleHelp size={16} />
        </button>
      </div>
    </div>
  );
}
