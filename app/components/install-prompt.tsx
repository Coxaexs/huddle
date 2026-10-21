"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n-context";

/**
 * "Install Hoffle" from hoffle.online opens the app with ?install. This card
 * then offers the browser's own install (Chrome, Edge, Android), or says
 * where the browser keeps it (Safari, iPhone). Installing this way needs no
 * installer and never trips SmartScreen or Gatekeeper.
 *
 * The browser fires `beforeinstallprompt` once, possibly before React is up,
 * so INSTALL_EVENT_SCRIPT (app/lib/install-event.ts, in the root layout's
 * <head>) keeps it on window.
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __hoffleInstall?: InstallEvent | null;
  }
}

type Hint = "installed" | "ios" | "android" | "safariMac" | "firefox" | "chromium";

function hintFor(): Hint {
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return "safariMac";
  return "chromium";
}

export function InstallPrompt() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [hint, setHint] = useState<Hint>("chromium");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("install")) return;
    setOpen(true);
    setHint(hintFor());
    setEvent(window.__hoffleInstall ?? null);
    const onInstallable = () => setEvent(window.__hoffleInstall ?? null);
    const onInstalled = () => setDone(true);
    window.addEventListener("hoffle-installable", onInstallable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("hoffle-installable", onInstallable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function close() {
    setOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("install");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // The card is gone either way.
    }
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    window.__hoffleInstall = null;
    setEvent(null);
    if (choice.outcome === "accepted") setDone(true);
  }

  if (!open) return null;
  const message = done
    ? t("landing.install.done")
    : event
      ? t("landing.install.lead")
      : t(`landing.install.${hint}`);
  return (
    <div className="install-prompt" role="dialog" aria-labelledby="install-prompt-title">
      <img src="/hangout/icon-192.png" alt="" width={44} height={44} className="install-prompt-icon" />
      <div className="install-prompt-body">
        <p id="install-prompt-title" className="install-prompt-title">{t("landing.install.title")}</p>
        <p className="install-prompt-text">{message}</p>
      </div>
      <div className="install-prompt-actions">
        {event && !done && (
          <button type="button" className="install-prompt-go" onClick={() => void install()}>
            {t("landing.install.button")}
          </button>
        )}
        <button type="button" className="install-prompt-close" onClick={close}>
          {t("landing.install.close")}
        </button>
      </div>
    </div>
  );
}
