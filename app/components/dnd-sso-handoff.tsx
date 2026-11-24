"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, basePath } from "../lib/client";
import { Hoffy } from "./hoffy";
import { tNow } from "../lib/i18n-context";

export function DndSsoHandoff() {
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState("");
  const [targetUrl, setTargetUrl] = useState("");

  const start = useCallback(async () => {
    setStatus("loading");
    setError("");
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "sheet";
    try {
      const data = await apiFetch<{ url: string }>("/api/integrations/dnd/sso", {
        method: "POST",
        body: JSON.stringify({ route: next, mode: "user" }),
      });
      setTargetUrl(data.url);
      window.location.replace(data.url);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : tNow("dndSso.error"));
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  return (
    <main className="app-shell booting">
      <div className="boot-card hoffy-boot-card">
        <Hoffy motion="boot" size={112} id="hoffy-dnd-sso" />
        {status === "loading" ? (
          <>
            <p className="hoffy-boot-text">{tNow("dndSso.signingIn")}</p>
            <p className="hoffy-boot-about">
              {tNow("dndSso.connecting")}
            </p>
            {targetUrl && (
              <a href={targetUrl} style={{ color: "var(--lavender)", fontSize: 14 }}>
                {tNow("dndSso.continue")}
              </a>
            )}
          </>
        ) : (
          <>
            <p className="hoffy-boot-text">{tNow("dndSso.failedTitle")}</p>
            <p className="hoffy-boot-about" style={{ color: "#f87171" }}>
              {error}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void start()}
              >
                {tNow("music.player.tryAgain")}
              </button>
              <a
                href={`${basePath}/`}
                className="btn-ghost"
                style={{ padding: "8px 14px", borderRadius: 8, textDecoration: "none" }}
              >
                {tNow("dndSso.back")}
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
