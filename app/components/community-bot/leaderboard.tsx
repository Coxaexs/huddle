"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Search, Trophy } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/community-bot/types";
import { apiFetch, basePath } from "../../lib/client";
import "./dashboard.css";

interface LeaderboardPayload {
  server: {
    id: string;
    name: string;
    icon: string;
    color: string;
    iconUrl: string | null;
    memberCount: number;
  };
  bot: {
    enabled: boolean;
    name: string;
    avatar: string;
    color: string;
  };
  roleRewards: Array<{ level: number; roleName: string; roleColor: string }>;
  entries: LeaderboardEntry[];
}

export function ServerLeaderboardPage({ serverId }: { serverId: string }) {
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<LeaderboardPayload>(`/api/leaderboard/${encodeURIComponent(serverId)}`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load leaderboard.");
      });
    return () => {
      active = false;
    };
  }, [serverId]);

  if (error) {
    return (
      <div className="cb-lb-page">
        <div className="cb-lb-wrap">
          <div className="cb-card">
            <h2>Leaderboard unavailable</h2>
            <p className="cb-card-sub">{error}</p>
            <a className="cb-btn cb-btn-secondary" href={basePath || "/"}>
              <ArrowLeft size={15} /> Back to Hoffle
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="cb-lb-page">
        <div className="cb-lb-wrap">
          <div className="cb-card">Loading leaderboard…</div>
        </div>
      </div>
    );
  }

  const accent = data.bot.color || "#6366f1";
  const q = query.trim().toLowerCase();
  const filtered = q
    ? data.entries.filter(
        (e) =>
          e.displayName.toLowerCase().includes(q) ||
          e.username.toLowerCase().includes(q),
      )
    : data.entries;
  const podium = !q ? filtered.slice(0, 3) : [];
  const rest = !q ? filtered.slice(3) : filtered;
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="cb-lb-page">
      <div className="cb-lb-wrap">
        <div className="cb-lb-hero">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              className="cb-brand-avatar"
              style={{ background: data.server.color || accent, width: 52, height: 52, fontSize: 26 }}
            >
              {data.server.icon || "🏆"}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
                {data.server.name} Leaderboard
              </h1>
              <p style={{ margin: "4px 0 0", color: "#9aa2b8", fontSize: 14 }}>
                {data.server.memberCount.toLocaleString()} members · Powered by {data.bot.avatar} {data.bot.name}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="cb-btn cb-btn-secondary" href={basePath || "/"}>
              <ArrowLeft size={15} /> Back to Hoffle
            </a>
            <a
              className="cb-btn cb-btn-primary"
              href={`${basePath}/dashboard/${encodeURIComponent(serverId)}`}
            >
              Bot Dashboard
            </a>
          </div>
        </div>

        {data.roleRewards.length > 0 && (
          <div className="cb-card" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, marginBottom: 10 }}>Role Rewards</h2>
            <div className="cb-chips">
              {data.roleRewards.map((rr, i) => (
                <span key={`${rr.level}-${i}`} className="cb-chip">
                  <strong>Lv.{rr.level}</strong>
                  <span style={{ color: rr.roleColor || "#a5b4fc" }}>●</span>
                  {rr.roleName}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="cb-field" style={{ marginBottom: 20, maxWidth: 360 }}>
          <div style={{ position: "relative" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#7c859e",
              }}
            />
            <input
              className="cb-input"
              style={{ paddingLeft: 36 }}
              placeholder="Search member…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {podium.length > 0 && (
          <div className="cb-lb-podium">
            {podium.map((entry, idx) => (
              <div
                key={entry.userId}
                className={`cb-lb-podium-card ${idx === 0 ? "is-first" : ""}`}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>{medals[idx]}</div>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: entry.color || accent,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 22,
                    margin: "0 auto 10px",
                  }}
                >
                  {entry.avatar}
                </div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{entry.displayName}</div>
                <div style={{ color: "#9aa2b8", fontSize: 12.5, marginBottom: 10 }}>
                  @{entry.username}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
                  Level {entry.level} · {entry.xp.toLocaleString()} XP
                </div>
                <div className="cb-lb-bar">
                  <div
                    className="cb-lb-bar-fill"
                    style={{ width: `${entry.progressPct}%`, background: accent }}
                  />
                </div>
                <div style={{ fontSize: 11.5, color: "#8f98b0", marginTop: 6 }}>
                  {entry.messages.toLocaleString()} messages
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="cb-card" style={{ textAlign: "center", padding: "36px 20px" }}>
            <Trophy size={32} style={{ color: "#64748b", marginBottom: 8 }} />
            <h2 style={{ marginBottom: 6 }}>No ranked members yet</h2>
            <p className="cb-card-sub" style={{ margin: 0 }}>
              {data.bot.enabled
                ? "Start chatting in the server to earn XP and appear on the leaderboard."
                : "Enable Levels & XP in the Bot Dashboard to start tracking XP."}
            </p>
          </div>
        ) : (
          <div>
            {rest.map((entry) => (
              <div key={entry.userId} className="cb-lb-row">
                <div style={{ fontWeight: 800, color: "#9aa2b8", textAlign: "center" }}>
                  #{entry.rank}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: entry.color || accent,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    {entry.avatar}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {entry.displayName}{" "}
                      <span style={{ color: "#7c859e", fontWeight: 400, fontSize: 12.5 }}>
                        @{entry.username}
                      </span>
                    </div>
                    <div className="cb-lb-bar">
                      <div
                        className="cb-lb-bar-fill"
                        style={{ width: `${entry.progressPct}%`, background: accent }}
                      />
                    </div>
                  </div>
                </div>
                <div className="cb-lb-msgs" style={{ fontSize: 12.5, color: "#9aa2b8", textAlign: "right" }}>
                  {entry.messages.toLocaleString()} msgs
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: accent }}>
                    Level {entry.level}
                  </div>
                  <div style={{ fontSize: 12, color: "#9aa2b8" }}>
                    {entry.xp.toLocaleString()} XP
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
