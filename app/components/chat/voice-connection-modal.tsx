"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Activity, Bug, Check, Copy, Radio, ShieldCheck, Upload, Volume2, X } from "lucide-react";

export interface VoiceConnectionModalProps {
  onClose: () => void;
  latency?: {
    rttMs: number;
    jitterMs: number;
    packetLoss: number;
    quality: "excellent" | "good" | "poor";
  };
  micSettings?: {
    delayMs?: number;
  };
  onMicSettingsChange?: (settings: { delayMs?: number }) => void;
  streamStats?: {
    resolution?: string;
    fps?: number;
    bitrateKbps?: number;
    viewersCount?: number;
  };
  serverNodeName?: string;
  isSfu?: boolean;
  className?: string;
  defaultTab?: "voice" | "stream";
  voiceRegion?: "nl" | "de" | null;
  onSwitchRegion?: (region?: "nl" | "de") => void | Promise<void>;
}

export function VoiceConnectionModal({
  onClose,
  latency,
  micSettings,
  onMicSettingsChange,
  streamStats,
  serverNodeName = "c-ams08-f0224067",
  isSfu = true,
  className = "",
  defaultTab = "voice",
  voiceRegion,
  onSwitchRegion,
}: VoiceConnectionModalProps) {
  const [activeTab, setActiveTab] = useState<"voice" | "stream">(defaultTab);
  // 0 until the first WebRTC stats sample comes in.
  const currentPing = Math.max(0, Math.round(latency?.rttMs || 0));
  const currentPingRef = useRef(currentPing);
  currentPingRef.current = currentPing;
  const [debugOpen, setDebugOpen] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Real samples only, one every 3s, newest last.
  const [history, setHistory] = useState<Array<{ ping: number; time: string }>>([]);
  useEffect(() => {
    const sample = () => {
      const ping = currentPingRef.current;
      if (ping <= 0) return;
      const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setHistory((prev) => [...prev.slice(-18), { ping, time }]);
    };
    sample();
    const timer = setInterval(sample, 3000);
    return () => clearInterval(timer);
  }, []);

  const avgPing = useMemo(() => {
    if (!history.length) return currentPing;
    const sum = history.reduce((acc, h) => acc + h.ping, 0);
    return Math.round(sum / history.length);
  }, [history, currentPing]);

  // The hook already reports packet loss as a percentage.
  const packetLossPercent = (latency?.packetLoss || 0).toFixed(1);

  // Graph dimensions
  const svgWidth = 320;
  const svgHeight = 90;
  const paddingX = 16;
  const paddingY = 12;
  const graphWidth = svgWidth - paddingX * 2 - 24;
  const graphHeight = svgHeight - paddingY * 2;

  // Generate SVG path for line chart
  const pathD = useMemo(() => {
    if (history.length < 2) return "";
    const maxVal = 100;
    const stepX = graphWidth / (history.length - 1);
    const points = history.map((item, idx) => {
      const x = paddingX + idx * stepX;
      const normalized = Math.max(0, Math.min(100, item.ping));
      const y = paddingY + graphHeight - (normalized / maxVal) * graphHeight;
      return { x, y };
    });

    const d = points.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }, "");

    return d;
  }, [history, graphWidth, graphHeight, paddingX, paddingY]);

  const areaD = useMemo(() => {
    if (!pathD) return "";
    const lastX = paddingX + graphWidth;
    const bottomY = paddingY + graphHeight;
    return `${pathD} L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${paddingX} ${bottomY.toFixed(1)} Z`;
  }, [pathD, graphWidth, graphHeight, paddingX, paddingY]);

  const lastPoint = useMemo(() => {
    if (!history.length) return { x: paddingX + graphWidth, y: paddingY + graphHeight / 2 };
    const last = history[history.length - 1];
    const normalized = Math.max(0, Math.min(100, last.ping));
    return {
      x: paddingX + graphWidth,
      y: paddingY + graphHeight - (normalized / 100) * graphHeight,
    };
  }, [history, graphWidth, graphHeight, paddingX, paddingY]);

  // Click outside to close
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [onClose]);

  const copyDebugLogs = () => {
    const report = {
      serverNode: serverNodeName,
      timestamp: new Date().toISOString(),
      currentPingMs: currentPing,
      avgPingMs: avgPing,
      jitterMs: Math.round(latency?.jitterMs || 0),
      packetLoss: `${packetLossPercent}%`,
      audioDelayMs: micSettings?.delayMs || 0,
      protocol: isSfu ? "LiveKit SFU (WebRTC)" : "P2P Mesh (WebRTC)",
      codec: "Opus 48kHz Stereo",
    };
    void navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setLogsCopied(true);
    setTimeout(() => setLogsCopied(false), 2000);
  };

  return (
    <div
      ref={cardRef}
      className={`discord-connection-modal ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tab Header */}
      <div className="connection-modal-header">
        <div className="connection-modal-tabs">
          <button
            type="button"
            className={`connection-tab ${activeTab === "voice" ? "active" : ""}`}
            onClick={() => setActiveTab("voice")}
          >
            Connection
          </button>
          {streamStats && (
            <button
              type="button"
              className={`connection-tab ${activeTab === "stream" ? "active" : ""}`}
              onClick={() => setActiveTab("stream")}
            >
              Stream
            </button>
          )}
        </div>
        <button
          type="button"
          className="connection-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {activeTab === "voice" ? (
        <>
          {/* Ping Graph Container */}
          <div className="connection-graph-container">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="connection-graph-svg"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="pingFillGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5865f2" stopOpacity="0.38" />
                  <stop offset="100%" stopColor="#5865f2" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Grid lines: 100, 50, 0 */}
              <line
                x1={paddingX}
                y1={paddingY}
                x2={paddingX + graphWidth}
                y2={paddingY}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray="3 3"
              />
              <line
                x1={paddingX}
                y1={paddingY + graphHeight / 2}
                x2={paddingX + graphWidth}
                y2={paddingY + graphHeight / 2}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray="3 3"
              />
              <line
                x1={paddingX}
                y1={paddingY + graphHeight}
                x2={paddingX + graphWidth}
                y2={paddingY + graphHeight}
                stroke="rgba(255, 255, 255, 0.12)"
              />

              {/* Area fill */}
              {areaD && <path d={areaD} fill="url(#pingFillGrad)" />}

              {/* Ping line */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#5865f2"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Current ping pulse dot */}
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="3.5"
                fill="#5865f2"
                stroke="#ffffff"
                strokeWidth="1.5"
              />

              {/* Y Axis Labels (right side) */}
              <text x={svgWidth - 6} y={paddingY + 3} textAnchor="end" className="graph-label-y">
                100
              </text>
              <text x={svgWidth - 6} y={paddingY + graphHeight / 2 + 3} textAnchor="end" className="graph-label-y">
                50
              </text>
              <text x={svgWidth - 6} y={paddingY + graphHeight + 3} textAnchor="end" className="graph-label-y">
                0
              </text>
            </svg>

            {/* X Axis Time Labels */}
            <div className="connection-time-labels">
              <span>{history[0]?.time || "11:47 PM"}</span>
              <span>{history[Math.floor(history.length * 0.33)]?.time || "11:48 PM"}</span>
              <span>{history[Math.floor(history.length * 0.66)]?.time || "11:49 PM"}</span>
              <span>{history[history.length - 1]?.time || "11:50 PM"}</span>
            </div>
          </div>

          {/* Node & Stats Information */}
          <div className="connection-info-section">
            <div className="flex items-center justify-between gap-2 mb-2 pb-1 border-b border-white/5">
              <div>
                <h4 className="connection-node-title font-bold text-[14px] text-white flex items-center gap-1.5">
                  <span>{voiceRegion === "de" ? "🇩🇪 Germany" : voiceRegion === "nl" ? "🇳🇱 Netherlands" : serverNodeName}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                    {voiceRegion === "de" ? "Oracle Cloud" : voiceRegion === "nl" ? "Home Server" : isSfu ? "SFU" : "P2P"}
                  </span>
                </h4>
                <div className="text-[11px] text-white/40 font-mono">
                  {serverNodeName}
                </div>
              </div>
              {onSwitchRegion && isSfu && (
                <button
                  type="button"
                  disabled={switching}
                  onClick={async () => {
                    const next = voiceRegion === "de" ? "nl" : "de";
                    setSwitching(true);
                    try {
                      await onSwitchRegion(next);
                    } finally {
                      setSwitching(false);
                    }
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                  title={`Switch server region to ${voiceRegion === "de" ? "Netherlands" : "Germany"}`}
                >
                  {switching ? "Switching…" : `Switch to ${voiceRegion === "de" ? "🇳🇱 NL" : "🇩🇪 DE"}`}
                </button>
              )}
            </div>

            <div className="connection-stats-list">
              <div className="connection-stat-row">
                <span className="stat-label">Average ping:</span>
                <span className="stat-value">{avgPing ? `${avgPing} ms` : "—"}</span>
              </div>
              <div className="connection-stat-row">
                <span className="stat-label">Last ping:</span>
                <span className="stat-value">{currentPing ? `${currentPing} ms` : "—"}</span>
              </div>
              <div className="connection-stat-row">
                <span className="stat-label">Outbound packet loss rate:</span>
                <span className="stat-value">{packetLossPercent}%</span>
              </div>
            </div>

            {/* Discord Advisory Note */}
            <p className="connection-notice-text">
              You may notice delayed audio at 250 ms or higher. You may sound robotic if your packet loss
              rate is over 10%. If the problem persists, disconnect and try again. See our{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  alert("LiveKit WebRTC troubleshooting guide: Ensure stable UDP connection, check firewall/STUN/TURN permissions.");
                }}
              >
                troubleshooting guide
              </a>{" "}
              for more assistance.
            </p>

            {/* Audio / Voice Delay Slider */}
            {onMicSettingsChange && (
              <div className="connection-delay-box">
                <div className="flex items-center justify-between text-xs font-semibold text-white/90 mb-1">
                  <span>Audio Buffer / Delay</span>
                  <span className="font-mono text-[#5865f2] font-bold">{micSettings?.delayMs || 0} ms</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={25}
                  value={micSettings?.delayMs || 0}
                  onChange={(e) => onMicSettingsChange({ delayMs: Number(e.target.value) })}
                  className="w-full accent-[#5865f2] h-1.5 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-white/40 font-mono mt-0.5">
                  <span>0 ms (Live)</span>
                  <span>1000 ms</span>
                  <span>2000 ms</span>
                </div>
              </div>
            )}

            {/* Debug Drawer */}
            {debugOpen && (
              <div className="connection-debug-panel">
                <div className="debug-row">
                  <span>Jitter:</span>
                  <span className="font-mono">{Math.round(latency?.jitterMs || 0)} ms</span>
                </div>
                <div className="debug-row">
                  <span>Protocol:</span>
                  <span className="font-mono">{isSfu ? "LiveKit SFU" : "P2P WebRTC"}</span>
                </div>
                <div className="debug-row">
                  <span>Audio Codec:</span>
                  <span className="font-mono">Opus (48 kHz)</span>
                </div>
                <div className="debug-row">
                  <span>Quality:</span>
                  <span className="font-mono uppercase text-emerald-400">
                    {latency?.quality || "excellent"}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="connection-actions-row">
              <button
                type="button"
                className={`connection-btn ${debugOpen ? "active" : ""}`}
                onClick={() => setDebugOpen((prev) => !prev)}
              >
                <Bug size={14} />
                <span>Debug</span>
              </button>
              <button
                type="button"
                className="connection-btn"
                onClick={copyDebugLogs}
              >
                {logsCopied ? <Check size={14} className="text-emerald-400" /> : <Upload size={14} />}
                <span>{logsCopied ? "Logs Copied!" : "Upload Logs"}</span>
              </button>
            </div>
          </div>

          {/* Footer: End-to-end encrypted */}
          <div className="connection-modal-footer">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>End-to-end encrypted</span>
          </div>
        </>
      ) : (
        /* Stream Stats View */
        <div className="connection-info-section">
          <h4 className="connection-node-title font-bold text-[14px] text-white flex items-center justify-between">
            <span>Stream Performance</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
              Live
            </span>
          </h4>

          <div className="connection-stats-list">
            <div className="connection-stat-row">
              <span className="stat-label">Resolution:</span>
              <span className="stat-value">{streamStats?.resolution || "1080p 60fps"}</span>
            </div>
            <div className="connection-stat-row">
              <span className="stat-label">Stream Latency:</span>
              <span className="stat-value">{currentPing ? `${currentPing} ms` : "—"}</span>
            </div>
            <div className="connection-stat-row">
              <span className="stat-label">Bitrate:</span>
              <span className="stat-value">{streamStats?.bitrateKbps ? `${streamStats.bitrateKbps} kbps` : "4,500 kbps"}</span>
            </div>
            <div className="connection-stat-row">
              <span className="stat-label">Viewers:</span>
              <span className="stat-value text-emerald-400">{streamStats?.viewersCount ?? 0} watching</span>
            </div>
            <div className="connection-stat-row">
              <span className="stat-label">Video Codec:</span>
              <span className="stat-value">H.264 / VP8 (Hardware Accelerated)</span>
            </div>
          </div>

          {/* Audio / Video Sync Delay Slider */}
          {onMicSettingsChange && (
            <div className="connection-delay-box">
              <div className="flex items-center justify-between text-xs font-semibold text-white/90 mb-1">
                <span>Audio Sync Buffer / Delay</span>
                <span className="font-mono text-[#5865f2] font-bold">{micSettings?.delayMs || 0} ms</span>
              </div>
              <input
                type="range"
                min={0}
                max={2000}
                step={25}
                value={micSettings?.delayMs || 0}
                onChange={(e) => onMicSettingsChange({ delayMs: Number(e.target.value) })}
                className="w-full accent-[#5865f2] h-1.5 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-white/40 font-mono mt-0.5">
                <span>0 ms (Real-time)</span>
                <span>1000 ms</span>
                <span>2000 ms</span>
              </div>
            </div>
          )}

          <div className="connection-actions-row">
            <button
              type="button"
              className="connection-btn col-span-2"
              onClick={copyDebugLogs}
            >
              {logsCopied ? <Check size={14} className="text-emerald-400" /> : <Upload size={14} />}
              <span>{logsCopied ? "Logs Copied!" : "Diagnostic Logs"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
