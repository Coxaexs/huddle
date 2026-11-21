"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, basePath } from "../lib/client";
import { Hoffy } from "./hoffy";

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
      setError(e instanceof Error ? e.message : "Could not sign in to D&D Companion.");
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
            <p className="hoffy-boot-text">Signing in to D&amp;D Companion…</p>
            <p className="hoffy-boot-about">
              Connecting your Hoffle identity to the Tavern table.
            </p>
            {targetUrl && (
              <a href={targetUrl} style={{ color: "var(--lavender)", fontSize: 14 }}>
                Continue to D&amp;D Companion
              </a>
            )}
          </>
        ) : (
          <>
            <p className="hoffy-boot-text">Couldn&apos;t open D&amp;D Companion</p>
            <p className="hoffy-boot-about" style={{ color: "#f87171" }}>
              {error}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void start()}
              >
                Try again
              </button>
              <a
                href={`${basePath}/`}
                className="btn-ghost"
                style={{ padding: "8px 14px", borderRadius: 8, textDecoration: "none" }}
              >
                Back to Hoffle
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
