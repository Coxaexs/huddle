"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicUser } from "@/lib/users";
import { useI18n } from "../lib/i18n-context";
import {
  mayOfferNotifications,
  NOTIFY_MOMENT,
  snoozeNotifyPrompt as snooze,
  type NotifyMomentReason,
} from "../lib/notify-moment";
import { enableWebPush } from "../lib/web-push";
import { Hoffy } from "./hoffy";

/**
 * Offers notifications right after a natural moment (you sent a message, or
 * got a DM or a mention) instead of on page load, where browsers penalise the
 * question and people say no without reading. It sits where Hoffy's tips do,
 * above the message box, and the tip of the moment steps aside for it (CSS:
 * `.notify-tip + .simple-tip`). Settings → Notifications is the other way in.
 */
export function NotifyPrompt({ user }: { user: PublicUser | null }) {
  const { t } = useI18n();
  const [reason, setReason] = useState<NotifyMomentReason | null>(null);
  const [result, setResult] = useState<"on" | "blocked" | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // A guest's bar ("save your account") matters more, and nags enough.
  const eligible = Boolean(user && !user.isGuest);

  useEffect(() => {
    if (!eligible) return;
    const onMoment = (event: Event) => {
      const why = (event as CustomEvent<NotifyMomentReason>).detail;
      if (!mayOfferNotifications()) return;
      window.clearTimeout(timer.current);
      // A beat later, so it doesn't jump in while they read or type.
      timer.current = window.setTimeout(() => setReason((current) => current ?? why), 1500);
    };
    window.addEventListener(NOTIFY_MOMENT, onMoment);
    return () => {
      window.removeEventListener(NOTIFY_MOMENT, onMoment);
      window.clearTimeout(timer.current);
    };
  }, [eligible]);

  useEffect(() => {
    if (!result) return;
    const done = window.setTimeout(() => setResult(null), 6000);
    return () => window.clearTimeout(done);
  }, [result]);

  if (!reason && !result) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      // Asked straight from the click: browsers only show it for a gesture.
      await Notification.requestPermission();
    } catch {}
    setBusy(false);
    setReason(null);
    if (Notification.permission === "granted") {
      try {
        localStorage.setItem("huddle-notify", "on");
      } catch {}
      // Push for when the tab is closed, where the browser and server offer it.
      void enableWebPush(false).catch(() => undefined);
      setResult("on");
    } else if (Notification.permission === "denied") {
      setResult("blocked");
    } else {
      // The browser's question was closed without an answer: ask another day.
      snooze();
    }
  };

  return (
    <div className="simple-tip notify-tip" role="status">
      <Hoffy size={44} pose="point" face="happy" motion="idle" id="notify-tip-hoffy" className="simple-tip-hoffy" />
      <div className="simple-tip-body">
        {result ? (
          <p>{t(result === "on" ? "notifyPrompt.on" : "notifyPrompt.blocked")}</p>
        ) : (
          <>
            <p>
              <strong>{t("notifyPrompt.title")}</strong>{" "}
              {t(reason === "sent" ? "notifyPrompt.afterSend" : "notifyPrompt.afterMessage")}
            </p>
            <span className="notify-tip-actions">
              <button type="button" className="notify-tip-on" disabled={busy} onClick={() => void turnOn()}>
                {t("notifyPrompt.turnOn")}
              </button>
              <button
                type="button"
                className="notify-tip-later"
                onClick={() => {
                  snooze();
                  setReason(null);
                }}
              >
                {t("notifyPrompt.notNow")}
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
