"use client";

import type { PublicServer } from "@/lib/servers";
import { AuditEntry, Tab } from "./types";
import { AUDIT_LABELS } from "./constants";

export function ServerAuditLogTab({
  tab,
  server,
  loadAudit,
  loadingAudit,
  audit,
}: {
  tab: Tab;
  server: PublicServer;
  loadAudit: () => Promise<void>;
  loadingAudit: boolean;
  audit: AuditEntry[];
}) {
  return (
    <>
      {tab === "audit_log" && (
          <div className="tab-pane audit-pane">
            <div className="bans-search-row">
              <div>
                <h1 className="pane-title">Audit Log</h1>
                <p className="pane-subtitle">
                  Who did what in {server.name}, newest first.
                </p>
              </div>
              <button
                type="button"
                className="discord-btn primary-indigo"
                onClick={() => void loadAudit()}
              >
                Refresh
              </button>
            </div>

            {loadingAudit ? (
              <p className="pane-subtitle">Loading the audit log…</p>
            ) : !audit.length ? (
              <div className="empty-illustration-box">
                <p>Nothing has happened here yet.</p>
              </div>
            ) : (
              <ul className="audit-list">
                {audit.map((entry) => (
                  <li key={entry.id} className="audit-row">
                    <span className="audit-dot" aria-hidden="true">
                      •
                    </span>
                    <span className="audit-text">
                      <strong>{entry.actorName}</strong>{" "}
                      {AUDIT_LABELS[entry.action] || entry.action}
                      {entry.targetName ? (
                        <>
                          {" "}
                          <em>{entry.targetName}</em>
                        </>
                      ) : null}
                      {entry.detail ? (
                        <span className="audit-detail"> ({entry.detail})</span>
                      ) : null}
                    </span>
                    <time className="audit-time">
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
    </>
  );
}
