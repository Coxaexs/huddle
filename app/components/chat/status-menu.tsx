"use client";

import { MSN_EXTRA_STATUSES } from "../msn-chrome";
import { PRESENCE, type PresenceStatus } from "@/lib/users";
import { Pencil, Settings, User } from "lucide-react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ShowCustomPrompt } from "../../lib/chat/types";
import { useState } from "react";
import { useI18n } from "../../lib/i18n-context";
import { readStatusClearChoice, statusClearAfterMs, STATUS_CLEAR_CHOICES, writeStatusClearChoice, type StatusClearChoice } from "../../lib/status-clear";

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
  savePresence: (patch: { status?: PresenceStatus; customStatus?: string | null; clearAfterMs?: number | null }) => Promise<void>;
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
  const { t } = useI18n();
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
          {t(PRESENCE[key].labelKey)}
        </button>
      ))}
      {msnTheme &&
        MSN_EXTRA_STATUSES.map((extra) => (
          <button
            key={extra.labelKey}
            type="button"
            role="menuitem"
            className={myStatus === extra.status && myCustomStatus === t(extra.labelKey) ? "active" : ""}
            onClick={() => {
              autoIdleRef.current = false;
              void savePresence({ status: extra.status, customStatus: t(extra.labelKey) });
              setStatusOpen(false);
            }}
          >
            <span
              className="status-dot"
              style={{ background: PRESENCE[extra.status].color }}
            />
            {t(extra.labelKey)}
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
          {t("status.listening")}
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
          {t("status.sounds")}
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
              title: t("status.autoReply.title"),
              message: t("status.autoReply.message"),
              defaultValue: autoReply ?? t("status.autoReply.default"),
              confirmText: t("common.save"),
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
          {t("status.autoReply")}
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
          {t("status.picture")}
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
          {t("status.today")}
        </button>
      )}
      <div className="status-menu-divider" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setStatusOpen(false);
          showCustomPrompt({
            title: t("status.custom.title"),
            message: t("status.custom.message"),
            defaultValue: myCustomStatus || "",
            placeholder: t("status.custom.placeholder"),
            confirmText: t("status.custom.save"),
            onConfirm: (text) => {
              if (text === undefined) return;
              // A status typed in clears itself as picked under "Clear after".
              void savePresence({ customStatus: text, clearAfterMs: text.trim() ? statusClearAfterMs(readStatusClearChoice()) : null });
            },
          });
        }}
      >
        <span className="status-dot" style={{ background: "transparent" }}>
          <Pencil size={13} />
        </span>
        {myCustomStatus ? t("status.edit") : t("status.set")}
      </button>
      <StatusClearPicker
        hasStatus={Boolean(myCustomStatus)}
        onPick={(choice) => {
          if (myCustomStatus) void savePresence({ clearAfterMs: statusClearAfterMs(choice) });
        }}
      />
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
        {t("status.editProfile")}
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
        {t("common.settings")}
      </button>
    </div>
  );
}

/** "Clear after": applies to the status you have now, and to the next one you set. */
function StatusClearPicker({ hasStatus, onPick }: { hasStatus: boolean; onPick: (choice: StatusClearChoice) => void }) {
  const { t } = useI18n();
  const [choice, setChoice] = useState<StatusClearChoice>(() => readStatusClearChoice());
  return (
    <div className="status-clear-picker" role="group" aria-label={t("status.clear.group")}>
      <span aria-hidden="true">{hasStatus ? t("status.clear.after") : t("status.clear.newAfter")}</span>
      <div role="none">
        {STATUS_CLEAR_CHOICES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="menuitemradio"
            className={choice === option.id ? "active" : ""}
            aria-checked={choice === option.id}
            onClick={() => {
              setChoice(option.id);
              writeStatusClearChoice(option.id);
              onPick(option.id);
            }}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
