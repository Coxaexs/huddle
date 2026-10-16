"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Trash2, Flag, CheckCircle2, XCircle } from "lucide-react";
import type { PublicServer } from "@/lib/servers";
import { apiFetch } from "../../lib/client";
import type { ModerationReport } from "@/app/api/reports/route";
import type { Tab } from "./types";

export function ServerSafetyTab({
  tab,
  server,
  canManageServer,
  canModerate,
  onServerUpdated,
  setNotice,
}: {
  tab: Tab;
  server: PublicServer;
  canManageServer: boolean;
  canModerate: boolean;
  onServerUpdated: () => void;
  setNotice: (msg: string) => void;
}) {
  const [raidMode, setRaidMode] = useState<boolean>(Boolean(server.raidMode));
  const [purgeChannelId, setPurgeChannelId] = useState<string>(
    () => server.channels.find((c) => c.kind !== "voice" && c.kind !== "stage")?.id || "",
  );
  const [purgeCount, setPurgeCount] = useState<number>(25);
  const [purgeUsername, setPurgeUsername] = useState<string>("");
  const [purging, setPurging] = useState(false);

  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  useEffect(() => {
    setRaidMode(Boolean(server.raidMode));
  }, [server.raidMode]);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const res = await apiFetch<{ reports: ModerationReport[] }>(
        `/api/reports?serverId=${encodeURIComponent(server.id)}`,
      );
      setReports(res.reports || []);
    } catch {
      // Ignore error
    } finally {
      setLoadingReports(false);
    }
  }, [server.id]);

  useEffect(() => {
    if (tab === "safety") {
      void loadReports();
    }
  }, [tab, loadReports]);

  if (tab !== "safety") return null;

  const toggleRaidMode = async (next: boolean) => {
    setRaidMode(next);
    try {
      await apiFetch(`/api/servers/${server.id}`, {
        method: "PATCH",
        body: JSON.stringify({ raidMode: next }),
      });
      onServerUpdated();
      setNotice(
        next
          ? "Raid Lockdown enabled: invite joins and public directory joins are paused."
          : "Raid Lockdown disabled: normal server joins resumed.",
      );
    } catch (err) {
      setRaidMode(!next);
      setNotice(err instanceof Error ? err.message : "Could not toggle raid mode.");
    }
  };

  const handleBulkPurge = async () => {
    if (!purgeChannelId) return;
    setPurging(true);
    try {
      const res = await apiFetch<{ purged: number }>("/api/messages/purge", {
        method: "POST",
        body: JSON.stringify({
          channelId: purgeChannelId,
          count: purgeCount,
          targetUsername: purgeUsername.trim() || undefined,
        }),
      });
      setNotice(`Purged ${res.purged} message${res.purged === 1 ? "" : "s"}.`);
      setPurgeUsername("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Bulk purge failed.");
    } finally {
      setPurging(false);
    }
  };

  const resolveReport = async (reportId: string, status: "resolved" | "dismissed", deleteMessage: boolean) => {
    try {
      await apiFetch("/api/reports", {
        method: "PATCH",
        body: JSON.stringify({ reportId, status, deleteMessage }),
      });
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status, resolvedAt: new Date().toISOString() } : r)),
      );
      setNotice(deleteMessage ? "Deleted reported message and resolved report." : `Report marked as ${status}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update report.");
    }
  };

  const textChannels = server.channels.filter((c) => c.kind !== "voice" && c.kind !== "stage");

  return (
    <div className="tab-pane space-y-6">
      <div>
        <h1 className="pane-title">Safety Setup &amp; Moderation Center</h1>
        <p className="pane-subtitle">
          Raid protection, bulk message cleanup, and member-submitted message reports for {server.name}.
        </p>
      </div>

      {/* Raid Lockdown */}
      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 text-rose-300">
            <ShieldAlert size={16} /> Raid Lockdown Mode
          </h3>
          <p className="text-xs opacity-80 mt-1">
            Immediately pauses all invite links and public directory joins for {server.name}. Turn this on if your server is experiencing a raid or spam wave.
          </p>
        </div>
        <input
          type="checkbox"
          checked={raidMode}
          disabled={!canManageServer && !canModerate}
          onChange={(e) => void toggleRaidMode(e.target.checked)}
        />
      </div>

      {/* Bulk Message Purge */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Trash2 size={16} className="text-amber-400" /> Bulk Message Purge
        </h3>
        <p className="text-xs opacity-75">
          Quickly clean up recent spam in a channel (you can also run <code>/purge 25 @username</code> directly in any channel).
        </p>
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div>
            <label className="block text-xs opacity-70 mb-1">Channel</label>
            <select
              className="discord-input text-xs py-1.5 px-2.5"
              value={purgeChannelId}
              onChange={(e) => setPurgeChannelId(e.target.value)}
            >
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs opacity-70 mb-1">Count</label>
            <select
              className="discord-input text-xs py-1.5 px-2.5"
              value={purgeCount}
              onChange={(e) => setPurgeCount(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  Last {n} messages
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs opacity-70 mb-1">Filter by Username (optional)</label>
            <input
              type="text"
              className="discord-input text-xs py-1.5 px-2.5 w-full"
              placeholder="@username (leave blank for all)"
              value={purgeUsername}
              onChange={(e) => setPurgeUsername(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="discord-btn danger text-xs py-1.5 px-3"
            disabled={purging || !purgeChannelId}
            onClick={() => void handleBulkPurge()}
          >
            {purging ? "Purging…" : "Purge Messages"}
          </button>
        </div>
      </div>

      {/* Member Reports Queue */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Flag size={16} className="text-indigo-400" /> Member Message Reports
            </h3>
            <p className="text-xs opacity-75">
              Messages flagged by members via &ldquo;Report message&rdquo; in the message menu.
            </p>
          </div>
          <button
            type="button"
            className="discord-btn text-xs py-1 px-2.5"
            onClick={() => void loadReports()}
          >
            Refresh
          </button>
        </div>

        {loadingReports ? (
          <p className="text-xs opacity-70">Loading reports…</p>
        ) : reports.length === 0 ? (
          <p className="text-xs opacity-70 py-3">No message reports in {server.name}.</p>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {reports.map((r) => (
              <div
                key={r.id}
                className="p-3 rounded-lg bg-black/25 border border-white/10 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    #{r.channelName} · Author: <span className="text-indigo-300">{r.messageAuthor}</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] uppercase font-bold ${
                      r.status === "open"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <blockquote className="text-xs bg-white/5 p-2 rounded border-l-2 border-indigo-400">
                  {r.messageContent}
                </blockquote>
                <div className="flex items-center justify-between text-xs opacity-75">
                  <span>
                    Reported by <strong>{r.reporterName}</strong>: &ldquo;{r.reason}&rdquo;
                  </span>
                  <time>{new Date(r.createdAt).toLocaleString()}</time>
                </div>
                {r.status === "open" && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      className="discord-btn danger text-xs py-1 px-2.5 inline-flex items-center gap-1"
                      onClick={() => void resolveReport(r.id, "resolved", true)}
                    >
                      <CheckCircle2 size={13} /> Delete Message &amp; Resolve
                    </button>
                    <button
                      type="button"
                      className="discord-btn text-xs py-1 px-2.5 inline-flex items-center gap-1"
                      onClick={() => void resolveReport(r.id, "dismissed", false)}
                    >
                      <XCircle size={13} /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
