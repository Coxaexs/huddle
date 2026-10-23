"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n-context";
import {
  desktopUpdates,
  noticeKey,
  pickNotice,
  serverHasNewBuild,
  type DesktopUpdate,
} from "../lib/app-update";

/** How often an open page asks whether Hoffle was redeployed. */
const CHECK_EVERY_MS = 10 * 60_000;
/** Focus and visibility changes come in bursts; one question a minute is plenty. */
const MIN_GAP_MS = 60_000;

/**
 * Offers the newest Hoffle to a window that has been open a while: a reload
 * after a deploy, or a restart when the desktop app has downloaded a new
 * version of itself (see lib/app-update.ts). Never reloads on its own, since
 * that would drop a call, an upload or a half-written message.
 *
 * Hidden while the connection banner shows; they share the spot, and the
 * reconnect after a deploy is what triggers the check anyway.
 */
export function UpdateBanner({ connected, inCall }: { connected: boolean; inCall: boolean }) {
  const { t } = useI18n();
  const [webUpdated, setWebUpdated] = useState(false);
  const [desktop, setDesktop] = useState<DesktopUpdate | null>(null);
  const [dismissed, setDismissed] = useState("");
  const checkRef = useRef<(now?: boolean) => void>(() => undefined);

  useEffect(() => {
    let stopped = false;
    let lastAsked = 0;
    let found = false;
    const check = (now = false) => {
      if (stopped || found) return;
      if (!now && Date.now() - lastAsked < MIN_GAP_MS) return;
      lastAsked = Date.now();
      void serverHasNewBuild().then((changed) => {
        if (stopped || !changed) return;
        found = true;
        setWebUpdated(true);
      });
    };
    checkRef.current = check;
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    // A lazy chunk that is gone from the server is a sure sign of a deploy.
    const onChunkError = () => check(true);
    const timer = window.setInterval(() => check(), CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("vite:preloadError", onChunkError);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("vite:preloadError", onChunkError);
    };
  }, []);

  // A deploy restarts the server and drops the live socket, so every
  // (re)connect is worth a check; the first one also catches a page the
  // service worker served from its cache on a slow start.
  useEffect(() => {
    if (connected) checkRef.current(true);
  }, [connected]);

  useEffect(() => {
    const bridge = desktopUpdates();
    if (!bridge) return;
    let stopped = false;
    void bridge.state().then((state) => {
      if (!stopped && state) setDesktop(state);
    });
    const off = bridge.onChange(setDesktop);
    return () => {
      stopped = true;
      off();
    };
  }, []);

  const notice = pickNotice(webUpdated, desktop);
  if (!notice || !connected || dismissed === noticeKey(notice)) return null;

  const act = () => {
    if (notice.kind === "web") window.location.reload();
    else if (notice.kind === "desktop") desktopUpdates()?.install();
    else desktopUpdates()?.download();
  };
  const message =
    notice.kind === "web"
      ? t("shell.update.web")
      : notice.kind === "desktop"
        ? t("shell.update.desktop", { version: notice.version ?? "" })
        : t("shell.update.manual", { version: notice.version ?? "" });
  const action =
    notice.kind === "web"
      ? t("shell.update.reload")
      : notice.kind === "desktop"
        ? t("shell.update.restart")
        : t("shell.update.download");

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span className="update-banner-dot" aria-hidden="true" />
      <span className="update-banner-text">
        {message}
        {inCall && notice.kind !== "manual" ? <small>{t("shell.update.leavesCall")}</small> : null}
      </span>
      <button type="button" className="update-banner-go" onClick={act}>
        {action}
      </button>
      <button
        type="button"
        className="update-banner-later"
        onClick={() => setDismissed(noticeKey(notice))}
      >
        {t("shell.update.later")}
      </button>
    </div>
  );
}
