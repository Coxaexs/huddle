"use client";

import { lazy, Suspense, useCallback, useEffect, useId, useState } from "react";
import { Map as MapIcon, RefreshCw } from "lucide-react";
import { areaSvgGeometry, type Battlemap, type MapStroke, type MapToken } from "@/lib/battlemap";
import { apiFetch } from "../../lib/client";
import { DndIframePane } from "./dnd-iframe-pane";
import { useI18n } from "../../lib/i18n-context";

const LazyBattlemapBoard = lazy(() =>
  import("../battlemap").then((m) => ({ default: m.BattlemapBoard })),
);

export interface BattlemapLiveSignal {
  seq: number;
  channelId: string;
}

export function BattlemapPane({
  channelId,
  voiceChannelId,
  userId,
  pairToken,
  pairedReadOnly,
  liveSignal,
}: {
  channelId: string | null;
  voiceChannelId: string | null;
  userId: string;
  pairToken: string;
  pairedReadOnly: boolean;
  liveSignal: BattlemapLiveSignal | null;
}) {
  const { t } = useI18n();
  const targetChannel = voiceChannelId || channelId;
  const [sourceMode, setSourceMode] = useState<"auto" | "hoffle" | "dnd">("auto");
  const [map, setMap] = useState<Battlemap | null>(null);
  const [gm, setGm] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadMap = useCallback(async () => {
    if (!targetChannel && !pairedReadOnly) {
      setMap(null);
      setLoaded(true);
      return;
    }
    try {
      if (pairedReadOnly) {
        const res = await apiFetch<{ map: Battlemap | null }>(
          `/api/second-screen/feed?pair=${encodeURIComponent(pairToken)}&kind=battlemap`,
        );
        setMap(res.map || null);
        setGm(false);
      } else if (targetChannel) {
        const res = await apiFetch<{ map: Battlemap | null; gm?: boolean }>(
          `/api/battlemap?channelId=${encodeURIComponent(targetChannel)}`,
        );
        setMap(res.map || null);
        setGm(Boolean(res.gm));
      }
    } catch {
      setMap(null);
    } finally {
      setLoaded(true);
    }
  }, [targetChannel, pairToken, pairedReadOnly]);

  useEffect(() => {
    void loadMap();
  }, [loadMap]);

  useEffect(() => {
    if (!liveSignal) return;
    if (!targetChannel || liveSignal.channelId === targetChannel) {
      void loadMap();
    }
  }, [liveSignal, targetChannel, loadMap]);

  useEffect(() => {
    if (!pairedReadOnly) return;
    const id = window.setInterval(() => {
      void loadMap();
    }, 3000);
    return () => window.clearInterval(id);
  }, [pairedReadOnly, loadMap]);

  const showHoffleTable =
    sourceMode === "hoffle" || (sourceMode === "auto" && Boolean(map));

  if (!showHoffleTable && sourceMode === "dnd") {
    return (
      <div className="s2-pane">
        <div className="s2-pane-head">
          <div className="s2-bar-group">
            <MapIcon size={14} style={{ color: "var(--lavender, #8b5cf6)" }} />
            <strong style={{ fontSize: 13 }}>{t("s2.map.displayTitle")}</strong>
          </div>
          <div className="s2-bar-group">
            <button
              type="button"
              className="s2-pill-btn"
              style={{ height: 24, fontSize: 11, padding: "0 8px" }}
              onClick={() => setSourceMode("hoffle")}
            >
              {t("s2.map.hoffleTable")}
            </button>
          </div>
        </div>
        <div className="s2-pane-body">
          <DndIframePane
            kind="dnd-display"
            dndRoute="map"
            pairToken={pairToken}
            pairedReadOnly={pairedReadOnly}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="s2-pane">
      <div className="s2-pane-head">
        <div className="s2-bar-group">
          <MapIcon size={14} style={{ color: "var(--lavender, #8b5cf6)" }} />
          <strong style={{ fontSize: 13 }}>
            {map ? t("s2.map.titleNamed", { name: map.name }) : t("s2.map.title")}
          </strong>
        </div>
        <div className="s2-bar-group">
          <button
            type="button"
            className={`s2-pill-btn ${showHoffleTable ? "active" : ""}`}
            style={{ height: 24, fontSize: 11, padding: "0 8px" }}
            onClick={() => setSourceMode("hoffle")}
          >
            {t("s2.map.hoffleTable")}
          </button>
          <button
            type="button"
            className={`s2-pill-btn ${!showHoffleTable ? "active" : ""}`}
            style={{ height: 24, fontSize: 11, padding: "0 8px" }}
            onClick={() => setSourceMode("dnd")}
          >
            {t("s2.map.dndVttDisplay")}
          </button>
          <button
            type="button"
            className="s2-pill-btn"
            style={{ height: 24, padding: "0 8px" }}
            onClick={() => void loadMap()}
            title={t("s2.map.refreshTitle")}
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>
      <div className="s2-pane-body">
        {map && showHoffleTable ? (
          pairedReadOnly ? (
            <ReadonlyBattlemap map={map} />
          ) : (
            <Suspense fallback={<div className="s2-empty">{t("s2.map.loading")}</div>}>
              <LazyBattlemapBoard
                channelId={map.channelId}
                map={map}
                gm={gm}
                userId={userId}
                onClose={() => setSourceMode("dnd")}
                onOpenCompanion={() => {
                  window.open(`/hangout/dnd-login?next=${encodeURIComponent("/vtt")}`, "_blank", "noopener,noreferrer");
                }}
                onLocalToken={(tok: MapToken) => {
                  setMap((prev) => {
                    if (!prev) return prev;
                    const exists = prev.tokens.some((t) => t.id === tok.id);
                    return {
                      ...prev,
                      tokens: exists
                        ? prev.tokens.map((t) => (t.id === tok.id ? tok : t))
                        : [...prev.tokens, tok],
                    };
                  });
                }}
                onLocalStroke={(stroke: MapStroke) => {
                  setMap((prev) =>
                    prev ? { ...prev, strokes: [...prev.strokes, stroke] } : prev,
                  );
                }}
                onAddMyToken={() => {
                  void apiFetch("/api/battlemap", {
                    method: "POST",
                    body: JSON.stringify({
                      channelId: map.channelId,
                      action: "add-token",
                    }),
                  })
                    .then(() => loadMap())
                    .catch(() => {});
                }}
              />
            </Suspense>
          )
        ) : loaded && sourceMode === "auto" ? (
          <DndIframePane
            kind="dnd-display"
            dndRoute="map"
            pairToken={pairToken}
            pairedReadOnly={pairedReadOnly}
          />
        ) : (
          <div className="s2-empty">
            <MapIcon size={28} style={{ opacity: 0.55 }} />
            <p style={{ margin: 0 }}>{t("s2.map.noneOpen")}</p>
            <button
              type="button"
              className="s2-pill-btn active"
              onClick={() => setSourceMode("dnd")}
            >
              {t("s2.map.showVttInstead")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadonlyBattlemap({ map }: { map: Battlemap }) {
  const rawMaskId = useId();
  const fogMaskId = `s2-fog-${rawMaskId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const cols = map.grid || 20;
  const rows = map.rows || Math.round(cols * 0.65);
  const fogRects = map.fog || [];
  const hasCoverFog = fogRects.some((f) => f.mode !== "reveal");
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        background: "#0e1117",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: 12,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxHeight: "100%",
          aspectRatio: `${cols} / ${rows}`,
          background: map.imageUrl ? `url(${map.imageUrl}) center / 100% 100% no-repeat` : "#1b202c",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.14)",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox={`0 0 ${cols} ${rows}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          {(map.areas || []).map((area) => {
            const geom = areaSvgGeometry(area);
            const color = area.color || "#f97316";
            return geom.kind === "circle" ? (
              <circle
                key={area.id}
                cx={geom.cx}
                cy={geom.cy}
                r={geom.r}
                fill={color}
                fillOpacity={0.22}
                stroke={color}
                strokeWidth={0.08}
                strokeDasharray="0.22 0.14"
              />
            ) : (
              <polygon
                key={area.id}
                points={geom.points}
                fill={color}
                fillOpacity={0.22}
                stroke={color}
                strokeWidth={0.08}
                strokeDasharray="0.22 0.14"
              />
            );
          })}
          {(map.strokes || []).map((s) => {
            const pts: string[] = [];
            for (let i = 0; i + 1 < (s.points || []).length; i += 2) {
              pts.push(`${s.points[i]},${s.points[i + 1]}`);
            }
            return (
              <polyline
                key={s.id}
                fill="none"
                stroke={s.color || "#ef6b58"}
                strokeWidth={(s.width || 3) * 0.04}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts.join(" ")}
              />
            );
          })}
          {hasCoverFog && (
            <>
              <defs>
                <mask id={fogMaskId}>
                  <rect x={0} y={0} width={cols} height={rows} fill="black" />
                  {fogRects.map((f) => (
                    <rect
                      key={f.id}
                      x={f.x}
                      y={f.y}
                      width={f.w}
                      height={f.h}
                      fill={f.mode === "reveal" ? "black" : "white"}
                    />
                  ))}
                </mask>
              </defs>
              <rect
                x={0}
                y={0}
                width={cols}
                height={rows}
                fill="rgba(7,9,13,0.94)"
                mask={`url(#${fogMaskId})`}
              />
            </>
          )}
        </svg>
        {(map.tokens || []).map((tok) => {
          const size = tok.size || 1;
          return (
            <div
              key={tok.id}
              style={{
                position: "absolute",
                left: `${(tok.x / cols) * 100}%`,
                top: `${(tok.y / rows) * 100}%`,
                width: `${(size / cols) * 100}%`,
                aspectRatio: "1 / 1",
                transform: "translate(-50%, -50%)",
                borderRadius: "999px",
                background: tok.color || "#8b5cf6",
                border: "2px solid #fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                overflow: "hidden",
              }}
              title={tok.label}
            >
              {tok.avatarUrl ? (
                <img
                  src={tok.avatarUrl}
                  alt={tok.label}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                tok.label.slice(0, 3)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
