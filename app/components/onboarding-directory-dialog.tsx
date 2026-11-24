"use client";

import { useEffect, useState } from "react";
import { Compass, Globe, Plus, Ticket, Users, X } from "lucide-react";
import { apiFetch } from "../lib/client";
import { membersText, SHOW_MEMBERS_FROM } from "@/lib/member-counts";
import type { PublicServer } from "@/lib/servers";
import { SERVER_TEMPLATES } from "@/lib/server-templates";
import { looksLikeDiscordTemplate } from "@/lib/discord-import";
import { showDiscordMove, type DiscordMoveDetail } from "./discord-move-dialog";
import { showToast } from "./toast";
import { useDismiss } from "../hooks/use-dismiss";
import { useI18n } from "../lib/i18n-context";

type PublicDirectoryEntry = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  color: string;
  memberCount: number;
  joined: boolean;
  raidMode: boolean;
};

export type DirectoryTab = "discover" | "invite" | "create";

export function OnboardingDirectoryDialog({
  open,
  initialTab,
  onClose,
  onServersUpdated,
  onSelectServer,
}: {
  open: boolean;
  /** Which tab to show on open: the rail's + button opens straight on Create. */
  initialTab?: DirectoryTab;
  onClose: () => void;
  onServersUpdated: (servers: PublicServer[]) => void;
  /** channelId: the channel a joined invite lands you in, if it names one. */
  onSelectServer: (serverId: string, channelId?: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<DirectoryTab>("discover");
  const [directory, setDirectory] = useState<PublicDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerDescription, setNewServerDescription] = useState("");
  const [newServerTemplateId, setNewServerTemplateId] = useState("");
  const [newServerPublic, setNewServerPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  useDismiss(open, onClose);

  useEffect(() => {
    if (open) setTab(initialTab ?? "discover");
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch<{ servers: PublicDirectoryEntry[] }>("/api/servers/public")
      .then((res) => setDirectory(res.servers))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const joinPublicServer = async (serverId: string) => {
    setJoiningId(serverId);
    try {
      const res = await apiFetch<{ servers: PublicServer[]; joinedServerId: string }>(
        "/api/servers/public",
        {
          method: "POST",
          body: JSON.stringify({ serverId }),
        },
      );
      onServersUpdated(res.servers);
      onSelectServer(res.joinedServerId);
      showToast(t("onboarding.joined"));
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("onboarding.joinError"));
    } finally {
      setJoiningId(null);
    }
  };

  const handleJoinByInvite = async () => {
    const raw = inviteInput.trim();
    if (!raw) return;
    const match = raw.match(/(?:hangout\?|invite\/|\/i\/)([A-Za-z0-9_-]+)/i);
    const code = match ? match[1] : raw;
    setJoiningInvite(true);
    try {
      const res = await apiFetch<{ servers: PublicServer[]; serverId?: string; channelId?: string | null }>(
        "/api/servers/membership",
        {
          method: "POST",
          body: JSON.stringify({ action: "join", code: code.toUpperCase() }),
        },
      );
      onServersUpdated(res.servers);
      if (res.serverId) onSelectServer(res.serverId, res.channelId);
      showToast(t("onboarding.joinedInvite"));
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("onboarding.invalidInvite"));
    } finally {
      setJoiningInvite(false);
    }
  };

  // A Discord template link in the name box copies that server instead of a starter template.
  const nameIsDiscordLink = looksLikeDiscordTemplate(newServerName.trim());

  const handleCreateServer = async () => {
    const value = newServerName.trim();
    if (!value) return;
    setCreating(true);
    try {
      const res = await apiFetch<{
        server: PublicServer;
        servers: PublicServer[];
        imported?: DiscordMoveDetail["imported"];
      }>(
        "/api/servers",
        {
          method: "POST",
          body: JSON.stringify(
            nameIsDiscordLink
              ? {
                  discordTemplate: value,
                  description: newServerDescription.trim() || undefined,
                  isPublic: newServerPublic,
                  locale,
                }
              : {
                  name: value,
                  description: newServerDescription.trim() || null,
                  templateId: newServerTemplateId || undefined,
                  isPublic: newServerPublic,
                  locale,
                },
          ),
        },
      );
      onServersUpdated(res.servers);
      onSelectServer(res.server.id);
      if (nameIsDiscordLink && res.imported) {
        showDiscordMove({ server: res.server, imported: res.imported });
      } else {
        showToast(t("onboarding.created", { name: res.server.name }));
      }
      setNewServerName("");
      setNewServerDescription("");
      setNewServerTemplateId("");
      setNewServerPublic(false);
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("onboarding.createError"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card w-[min(36rem,calc(100vw-40px))] p-5 sm:p-6 rounded-2xl bg-[var(--panel)] border border-[var(--line)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Compass size={22} className="text-[var(--lavender)]" />
            <div>
              <h2 className="text-lg font-bold text-[var(--ink)]">{t("onboarding.title")}</h2>
              <p className="text-xs text-[var(--muted)]">{t("onboarding.subtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--line)]"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1.5 mb-5 p-1 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
          <button
            type="button"
            onClick={() => setTab("discover")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === "discover"
                ? "bg-[var(--lavender)] text-[var(--on-accent)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Globe size={14} className="hidden sm:block" /> {t("onboarding.tab.discover")}
          </button>
          <button
            type="button"
            onClick={() => setTab("invite")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === "invite"
                ? "bg-[var(--lavender)] text-[var(--on-accent)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Ticket size={14} className="hidden sm:block" /> {t("onboarding.tab.invite")}
          </button>
          <button
            type="button"
            onClick={() => setTab("create")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === "create"
                ? "bg-[var(--lavender)] text-[var(--on-accent)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Plus size={14} className="hidden sm:block" /> {t("onboarding.tab.create")}
          </button>
        </div>

        {tab === "discover" && (
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {loading ? (
              <p className="text-sm text-[var(--muted)] py-6 text-center">{t("onboarding.loadingPublic")}</p>
            ) : directory.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
                <p className="text-sm font-medium text-[var(--muted)] mb-1">
                  {t("onboarding.noPublicTitle")}
                </p>
                <p className="text-xs text-[var(--muted)] mb-4">
                  {t("onboarding.noPublicDesc")}
                </p>
                <button
                  type="button"
                  onClick={() => setTab("create")}
                  className="px-4 py-2 rounded-lg bg-[var(--lavender)] text-[var(--on-accent)] font-semibold text-xs"
                >
                  {t("onboarding.tab.create")}
                </button>
              </div>
            ) : (
              directory.map((srv) => (
                <div
                  key={srv.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] hover:border-[var(--lavender)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden"
                      style={{ background: srv.color || "#c4b5fd", color: "#111" }}
                    >
                      {srv.iconUrl ? (
                        <img src={srv.iconUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        srv.icon
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-[var(--ink)] truncate">{srv.name}</div>
                      {srv.description && (
                        <div className="text-xs text-[var(--muted)] truncate">{srv.description}</div>
                      )}
                      {srv.memberCount >= SHOW_MEMBERS_FROM && (
                        <div className="flex items-center gap-1 text-[11px] text-[var(--muted)] mt-0.5">
                          <Users size={11} /> {membersText(srv.memberCount)}
                        </div>
                      )}
                    </div>
                  </div>
                  {srv.joined ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectServer(srv.id);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--line)] hover:bg-[var(--lavender-soft)] text-xs font-semibold text-[var(--ink)] shrink-0"
                    >
                      {t("onboarding.open")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={joiningId === srv.id || srv.raidMode}
                      onClick={() => void joinPublicServer(srv.id)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--lavender)] text-[var(--on-accent)] text-xs font-semibold disabled:opacity-50 shrink-0"
                    >
                      {srv.raidMode ? t("onboarding.locked") : joiningId === srv.id ? t("chat.invite.joining") : t("common.join")}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "invite" && (
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                {t("onboarding.inviteLabel")}
              </label>
              <input
                type="text"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder={t("onboarding.invitePlaceholder")}
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--paper)] border border-[var(--line)] text-sm text-[var(--ink)]"
              />
            </div>
            <button
              type="button"
              disabled={!inviteInput.trim() || joiningInvite}
              onClick={() => void handleJoinByInvite()}
              className="w-full py-2.5 rounded-lg bg-[var(--lavender)] text-[var(--on-accent)] font-semibold text-sm disabled:opacity-50"
            >
              {joiningInvite ? t("chat.invite.joining") : t("chat.invite.joinServer")}
            </button>
          </div>
        )}

        {tab === "create" && (
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1">{t("onboarding.serverName")}</label>
              <input
                type="text"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                maxLength={60}
                autoFocus={initialTab === "create"}
                placeholder={t("discordMove.createPlaceholder")}
                className="w-full px-3 py-2 rounded-lg bg-[var(--paper)] border border-[var(--line)] text-sm text-[var(--ink)]"
              />
              <p className="mt-1 text-[11px] text-[var(--muted)]">{t("discordMove.createHint")}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                {t("onboarding.shortDesc")}
              </label>
              <input
                type="text"
                value={newServerDescription}
                onChange={(e) => setNewServerDescription(e.target.value)}
                maxLength={240}
                placeholder={t("onboarding.shortDescPlaceholder")}
                className="w-full px-3 py-2 rounded-lg bg-[var(--paper)] border border-[var(--line)] text-sm text-[var(--ink)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                {t("template.pickerLabel")}
              </label>
              <div
                className={`grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-1 ${
                  nameIsDiscordLink ? "opacity-40 pointer-events-none" : ""
                }`}
                aria-disabled={nameIsDiscordLink}
              >
                <button
                  type="button"
                  onClick={() => setNewServerTemplateId("")}
                  className={`p-2 rounded-lg border text-left text-xs transition-colors ${
                    !newServerTemplateId
                      ? "bg-[var(--lavender-soft)] border-[var(--lavender)] text-[var(--ink)] font-semibold"
                      : "bg-[var(--paper)] border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  ✨ {t("template.blank")}
                </button>
                {SERVER_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setNewServerTemplateId(tpl.id)}
                    className={`p-2 rounded-lg border text-left text-xs transition-colors ${
                      newServerTemplateId === tpl.id
                        ? "bg-[var(--lavender-soft)] border-[var(--lavender)] text-[var(--ink)] font-semibold"
                        : "bg-[var(--paper)] border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span className="block truncate">
                      {tpl.icon} {t(tpl.titleKey)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] cursor-pointer">
              <div>
                <div className="text-sm font-medium text-[var(--ink)]">{t("onboarding.publicServer")}</div>
                <div className="text-xs text-[var(--muted)]">
                  {t("onboarding.publicServerDesc")}
                </div>
              </div>
              <input
                type="checkbox"
                checked={newServerPublic}
                onChange={(e) => setNewServerPublic(e.target.checked)}
                className="h-4 w-4 accent-[var(--lavender)]"
              />
            </label>
            <button
              type="button"
              disabled={!newServerName.trim() || creating}
              onClick={() => void handleCreateServer()}
              className="w-full py-2.5 rounded-lg bg-[var(--lavender)] text-[var(--on-accent)] font-semibold text-sm disabled:opacity-50"
            >
              {creating ? t("onboarding.creating") : t("onboarding.tab.create")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
