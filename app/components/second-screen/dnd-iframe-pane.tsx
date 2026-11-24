"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { apiFetch, basePath } from "../../lib/client";
import type { DndCompanionRoute } from "@/lib/second-screen";
import { useI18n } from "../../lib/i18n-context";

const COMPANION_TABS: Array<{ id: DndCompanionRoute; label: string }> = [
  { id: "sheet", label: "Character" },
  { id: "map", label: "Battle Map" },
  { id: "world", label: "World Map" },
  { id: "compendium", label: "Compendium" },
  { id: "bard", label: "Bard" },
];

export function DndIframePane({
  kind,
  dndRoute,
  pairToken,
  pairedReadOnly,
  onChangeRoute,
}: {
  kind: "dnd-display" | "dnd-companion";
  dndRoute: DndCompanionRoute;
  pairToken: string;
  pairedReadOnly: boolean;
  onChangeRoute?: (route: DndCompanionRoute) => void;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUrl = useCallback(async () => {
    if (pairedReadOnly && kind === "dnd-companion") {
      setLoading(false);
      setUrl("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (pairedReadOnly) {
        const res = await apiFetch<{ url: string }>(
          `/api/second-screen/feed?pair=${encodeURIComponent(pairToken)}&kind=dnd-display`,
        );
        setUrl(res.url);
      } else {
        const route = kind === "dnd-display" ? "display" : dndRoute;
        const mode = kind === "dnd-display" ? "display" : "user";
        const res = await apiFetch<{ url: string }>(
          `/api/integrations/dnd/sso?route=${encodeURIComponent(route)}&mode=${mode}`,
        );
        setUrl(res.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load D&D Companion.");
    } finally {
      setLoading(false);
    }
  }, [kind, dndRoute, pairToken, pairedReadOnly]);

  useEffect(() => {
    void loadUrl();
  }, [loadUrl]);

  if (pairedReadOnly && kind === "dnd-companion") {
    return (
      <div className="s2-pane">
        <div className="s2-pane-head">
          <strong style={{ fontSize: 13 }}>{t("s2.dnd.companion")}</strong>
        </div>
        <div className="s2-empty">
          <Sparkles size={28} style={{ opacity: 0.7 }} />
          <p style={{ margin: 0, maxWidth: 340 }}>
            {t("s2.dnd.pairedNote")}
          </p>
          <a
            href={`${basePath}/screen`}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: "var(--lavender, #8b5cf6)",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {t("s2.dnd.signInScreen")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="s2-pane">
      <div className="s2-pane-head">
        <div className="s2-bar-group">
          <strong style={{ fontSize: 13 }}>
            {kind === "dnd-display" ? t("s2.dnd.playerDisplay") : t("s2.dnd.companion")}
          </strong>
          {kind === "dnd-companion" && onChangeRoute && (
            <div className="s2-bar-group" style={{ marginLeft: 6 }}>
              {COMPANION_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`s2-pill-btn ${dndRoute === tab.id ? "active" : ""}`}
                  style={{ height: 24, fontSize: 11, padding: "0 8px" }}
                  onClick={() => onChangeRoute(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="s2-bar-group">
          <button
            type="button"
            className="s2-pill-btn"
            style={{ height: 24, padding: "0 8px" }}
            onClick={() => void loadUrl()}
            title={t("s2.dnd.reloadFrame")}
          >
            <RefreshCw size={12} />
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="s2-pill-btn"
              style={{ height: 24, padding: "0 8px", textDecoration: "none" }}
              title={t("s2.dnd.openFullTab")}
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
      <div className="s2-pane-body">
        {error ? (
          <div className="s2-empty">
            <p style={{ margin: 0, color: "#fca5a5" }}>{error}</p>
            <button type="button" className="s2-pill-btn active" onClick={() => void loadUrl()}>
              <RefreshCw size={13} /> {t("s2.dnd.retry")}
            </button>
          </div>
        ) : loading || !url ? (
          <div className="s2-empty">
            <p style={{ margin: 0 }}>{t("s2.dnd.connecting")}</p>
          </div>
        ) : (
          <iframe
            key={url}
            src={url}
            title={kind === "dnd-display" ? t("s2.dnd.playerDisplay") : t("s2.dnd.companion")}
            className="s2-iframe"
            allow="autoplay; fullscreen; clipboard-write"
          />
        )}
      </div>
    </div>
  );
}
