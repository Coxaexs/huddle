"use client";

import { useMemo, useState } from "react";
import type { PublicServer } from "@/lib/servers";
import { useI18n } from "../../lib/i18n-context";
import { AuditEntry, Tab } from "./types";
import { AUDIT_LABELS } from "./constants";

type AuditCategory = "all" | "moderation" | "structure" | "members" | "integrations";

function matchesCategory(action: string, cat: AuditCategory): boolean {
  if (cat === "all") return true;
  if (cat === "moderation") {
    return (
      action.startsWith("moderation.") ||
      action.startsWith("message.") ||
      action.startsWith("report.") ||
      action === "member.kick" ||
      action === "member.ban" ||
      action === "member.unban" ||
      action === "member.timeout" ||
      action === "member.timeout_remove"
    );
  }
  if (cat === "structure") {
    return (
      action.startsWith("server.") ||
      action.startsWith("channel.") ||
      action.startsWith("role.")
    );
  }
  if (cat === "members") {
    return action.startsWith("member.") || action.startsWith("invite.");
  }
  if (cat === "integrations") {
    return action.startsWith("webhook.") || action.startsWith("bot.") || action.startsWith("feed.");
  }
  return true;
}

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
  const { t, locale } = useI18n();
  const [category, setCategory] = useState<AuditCategory>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audit.filter((entry) => {
      if (!matchesCategory(entry.action, category)) return false;
      if (!q) return true;
      const label = AUDIT_LABELS[entry.action] || entry.action;
      return (
        entry.actorName.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q) ||
        (entry.targetName && entry.targetName.toLowerCase().includes(q)) ||
        (entry.detail && entry.detail.toLowerCase().includes(q))
      );
    });
  }, [audit, category, query]);

  if (tab !== "audit_log") return null;

  return (
    <div className="tab-pane audit-pane">
      <div className="bans-search-row">
        <div>
          <h1 className="pane-title">{t("serverSettings.audit.title")}</h1>
          <p className="pane-subtitle">
            {t("serverSettings.audit.subtitle", { server: server.name })}
          </p>
        </div>
        <button
          type="button"
          className="discord-btn primary-indigo"
          onClick={() => void loadAudit()}
        >
          {t("serverSettings.audit.refresh")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 my-3">
        {(
          [
            ["all", t("serverSettings.audit.cat.all")],
            ["moderation", t("serverSettings.audit.cat.moderation")],
            ["structure", t("serverSettings.audit.cat.structure")],
            ["members", t("serverSettings.audit.cat.members")],
            ["integrations", t("serverSettings.audit.cat.integrations")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setCategory(id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              category === id
                ? "bg-indigo-500 text-white"
                : "bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("serverSettings.audit.filterPlaceholder")}
          className="discord-input text-xs py-1.5 px-3 ml-auto min-w-[220px]"
        />
      </div>

      {loadingAudit ? (
        <p className="pane-subtitle">{t("serverSettings.audit.loading")}</p>
      ) : !filtered.length ? (
        <div className="empty-illustration-box">
          <p>{audit.length ? t("serverSettings.audit.noMatch") : t("serverSettings.audit.empty")}</p>
        </div>
      ) : (
        <ul className="audit-list">
          {filtered.map((entry) => (
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
                {new Date(entry.createdAt).toLocaleString(locale)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
