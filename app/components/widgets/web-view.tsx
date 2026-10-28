"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ExternalLink, X } from "lucide-react";
import { useI18n } from "@/app/lib/i18n-context";

/**
 * A bot's web page shown inside Hoffle: the music dashboard, a bot's
 * settings page. A sandboxed frame in a side sheet, with a way out to a real
 * tab for pages that refuse to be framed.
 */

interface WebView {
  url: string;
  title: string;
}

let current: WebView | null = null;
const listeners = new Set<() => void>();

export function openWebView(view: WebView | null) {
  if (view) {
    try {
      const parsed = new URL(view.url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
    } catch {
      return;
    }
  }
  current = view;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function WebViewSheet() {
  const { t } = useI18n();
  const view = useSyncExternalStore(subscribe, () => current, () => null);

  useEffect(() => {
    if (!view) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") openWebView(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  if (!view) return null;
  return (
    <div className="web-view-backdrop" onClick={() => openWebView(null)}>
      <section
        className="web-view-sheet"
        role="dialog"
        aria-label={view.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="web-view-bar">
          <strong title={view.url}>{view.title}</strong>
          <span className="web-view-host">{new URL(view.url).host}</span>
          <a
            className="web-view-btn"
            href={view.url}
            target="_blank"
            rel="noreferrer"
            title={t("webview.newTab")}
            aria-label={t("webview.newTab")}
            onClick={() => openWebView(null)}
          >
            <ExternalLink size={15} />
          </a>
          <button
            type="button"
            className="web-view-btn"
            onClick={() => openWebView(null)}
            title={t("webview.close")}
            aria-label={t("webview.close")}
          >
            <X size={16} />
          </button>
        </header>
        <iframe
          key={view.url}
          src={view.url}
          title={view.title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          allow="autoplay; clipboard-write; fullscreen"
          referrerPolicy="no-referrer"
        />
        <p className="web-view-note">{t("webview.blocked")}</p>
      </section>
    </div>
  );
}
