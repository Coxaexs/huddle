"use client";

import { MSN_EXTRA_STATUSES } from "../msn-chrome";
import { PRESENCE, type PresenceStatus } from "@/lib/users";
import { Pencil, Settings, User } from "lucide-react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ShowCustomPrompt } from "../../lib/chat/types";

/**
 * The presence menu that opens from your avatar on the rail: online / idle /
 * busy / invisible, and under the MSN theme its extra statuses, "listening to",
 * sounds, auto-reply, display picture and Today. Setting a status by hand ends
 * an automatic idle.
 */
export function StatusMenu({
  myStatus,
  myCustomStatus,
  savePresence,
  autoIdleRef,
  setStatusOpen,
  msnTheme,
  shareListening,
  setShareListening,
  autoReply,
  setAutoReply,
  showCustomPrompt,
  setSoundsOpen,
  setPictureOpen,
  setTodayOpen,
  setSettingsOpen,
}: {
  myStatus: PresenceStatus;
  myCustomStatus: string | null;
  savePresence: (patch: { status?: PresenceStatus; customStatus?: string | null }) => Promise<void>;
  autoIdleRef: MutableRefObject<boolean>;
  setStatusOpen: Dispatch<SetStateAction<boolean>>;
  msnTheme: boolean;
  shareListening: boolean;
  setShareListening: Dispatch<SetStateAction<boolean>>;
  autoReply: string | null;
  setAutoReply: Dispatch<SetStateAction<string | null>>;
  showCustomPrompt: ShowCustomPrompt;
  setSoundsOpen: Dispatch<SetStateAction<boolean>>;
  setPictureOpen: Dispatch<SetStateAction<boolean>>;
  setTodayOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="status-menu" role="menu">
      {(Object.keys(PRESENCE) as PresenceStatus[]).map((key) => (
        <button
          key={key}
          type="button"
          role="menuitem"
          className={myStatus === key ? "active" : ""}
          onClick={() => {
            autoIdleRef.current = false;
            void savePresence({ status: key });
            setStatusOpen(false);
          }}
        >
          <span
            className="status-dot"
            style={{ background: PRESENCE[key].color }}
          />
          {PRESENCE[key].label}
        </button>
      ))}
      {msnTheme &&
        MSN_EXTRA_STATUSES.map((extra) => (
          <button
            key={extra.label}
            type="button"
            role="menuitem"
            className={myStatus === extra.status && myCustomStatus === extra.text ? "active" : ""}
            onClick={() => {
              autoIdleRef.current = false;
              void savePresence({ status: extra.status, customStatus: extra.text });
              setStatusOpen(false);
            }}
          >
            <span
              className="status-dot"
              style={{ background: PRESENCE[extra.status].color }}
            />
            {extra.label}
          </button>
        ))}
      {msnTheme && (
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={shareListening}
          className={shareListening ? "active" : ""}
          onClick={() => {
            const next = !shareListening;
            setShareListening(next);
            try {
              window.localStorage.setItem("huddle-msn-listening", next ? "1" : "0");
            } catch {
              // Storage blocked: applies until reload.
            }
            setStatusOpen(false);
          }}
        >
          <span className="status-dot msn-listening-dot" style={{ background: "transparent" }}>
            {shareListening ? "✓" : "♫"}
          </span>
          Show what I&apos;m listening to
        </button>
      )}
      {msnTheme && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setStatusOpen(false);
            setSoundsOpen(true);
          }}
        >
          <span className="status-dot msn-listening-dot" style={{ background: "transparent" }}>
            🔔
          </span>
          Sounds…
        </button>
      )}
      {msnTheme && (
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={Boolean(autoReply)}
          className={autoReply ? "active" : ""}
          onClick={() => {
            setStatusOpen(false);
            showCustomPrompt({
              title: "Auto-reply when away",
              message:
                "While you're Away or Busy, the first person to message you in each DM gets this reply. Leave it empty to turn it off.",
              defaultValue: autoReply ?? "I'm away from my computer right now. I'll get back to you soon!",
              confirmText: "Save",
              maxLength: 200,
              onConfirm: (text) => {
                if (text === undefined) return;
                const clean = text.trim() || null;
                setAutoReply(clean);
                try {
                  if (clean) window.localStorage.setItem("huddle-msn-autoreply", clean);
                  else window.localStorage.removeItem("huddle-msn-autoreply");
                } catch {
                  // Storage blocked: applies until reload.
                }
              },
            });
          }}
        >
          <span className="status-dot msn-listening-dot" style={{ background: "transparent" }}>
            {autoReply ? "✓" : "💬"}
          </span>
          Auto-reply when away…
        </button>
      )}
      {msnTheme && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setStatusOpen(false);
            setPictureOpen(true);
          }}
        >
          <span className="status-dot msn-listening-dot" style={{ background: "transparent" }}>
            🖼
          </span>
          Change display picture…
        </button>
      )}
      {msnTheme && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setStatusOpen(false);
            setTodayOpen(true);
          }}
        >
          <span className="status-dot msn-listening-dot" style={{ background: "transparent" }}>
            ☀
          </span>
          Open MSN Today
        </button>
      )}
      <div className="status-menu-divider" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setStatusOpen(false);
          showCustomPrompt({
            title: "Set Custom Status",
            message: "What's on your mind?",
            defaultValue: myCustomStatus || "",
            placeholder: "e.g. In a meeting / Coding...",
            confirmText: "Save Status",
            onConfirm: (text) => {
              if (text === undefined) return;
              void savePresence({ customStatus: text });
            },
          });
        }}
      >
        <span className="status-dot" style={{ background: "transparent" }}>
          <Pencil size={13} />
        </span>
        {myCustomStatus ? "Edit status" : "Set a status"}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setStatusOpen(false);
          setSettingsOpen(true);
        }}
      >
        <span className="status-dot flex items-center justify-center" style={{ background: "transparent" }}>
          <User size={14} />
        </span>
        Edit Profile
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setStatusOpen(false);
          setSettingsOpen(true);
        }}
      >
        <span className="status-dot flex items-center justify-center" style={{ background: "transparent" }}>
          <Settings size={14} />
        </span>
        Settings
      </button>
    </div>
  );
}
