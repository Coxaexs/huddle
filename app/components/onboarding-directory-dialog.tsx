"use client";

import { useEffect, useState } from "react";
import { Compass, Globe, Plus, Ticket, Users, X } from "lucide-react";
import { apiFetch } from "../lib/client";
import { membersText, SHOW_MEMBERS_FROM } from "@/lib/member-counts";
import type { PublicServer } from "@/lib/servers";
import { showToast } from "./toast";

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

export function OnboardingDirectoryDialog({
  open,
  onClose,
  onServersUpdated,
  onSelectServer,
}: {
  open: boolean;
  onClose: () => void;
  onServersUpdated: (servers: PublicServer[]) => void;
  onSelectServer: (serverId: string) => void;
}) {
  const [tab, setTab] = useState<"discover" | "invite" | "create">("discover");
  const [directory, setDirectory] = useState<PublicDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerDescription, setNewServerDescription] = useState("");
  const [newServerPublic, setNewServerPublic] = useState(false);
  const [creating, setCreating] = useState(false);

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
      showToast("Joined server!");
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not join server");
    } finally {
      setJoiningId(null);
    }
  };

  const handleJoinByInvite = async () => {
    const raw = inviteInput.trim();
    if (!raw) return;
    const match = raw.match(/(?:hangout\?|invite\/)([A-Za-z0-9_-]+)/i);
    const code = match ? match[1] : raw;
    setJoiningInvite(true);
    try {
      const res = await apiFetch<{ servers: PublicServer[]; serverId?: string }>(
        "/api/servers/membership",
        {
          method: "POST",
          body: JSON.stringify({ action: "join", code: code.toUpperCase() }),
        },
      );
      onServersUpdated(res.servers);
      if (res.serverId) onSelectServer(res.serverId);
      showToast("Joined server via invite!");
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Invalid or expired invite");
    } finally {
      setJoiningInvite(false);
    }
  };

  const handleCreateServer = async () => {
    if (!newServerName.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch<{ server: PublicServer; servers: PublicServer[] }>(
        "/api/servers",
        {
          method: "POST",
          body: JSON.stringify({
            name: newServerName.trim(),
            description: newServerDescription.trim() || null,
            isPublic: newServerPublic,
          }),
        },
      );
      onServersUpdated(res.servers);
      onSelectServer(res.server.id);
      showToast(`Created ${res.server.name}!`);
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not create server");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card w-[min(36rem,calc(100vw-40px))] p-5 sm:p-6 rounded-2xl bg-[var(--panel)] border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Compass size={22} className="text-[var(--accent)]" />
            <div>
              <h2 className="text-lg font-bold text-white">Find or Create a Space</h2>
              <p className="text-xs text-white/60">
                No invite code? Explore public servers, paste an invite, or start your own.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1.5 mb-5 p-1 rounded-xl bg-black/25 border border-white/10">
          <button
            type="button"
            onClick={() => setTab("discover")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === "discover"
                ? "bg-[var(--accent)] text-black"
                : "text-white/70 hover:text-white"
            }`}
          >
            <Globe size={14} className="hidden sm:block" /> Public Servers
          </button>
          <button
            type="button"
            onClick={() => setTab("invite")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === "invite"
                ? "bg-[var(--accent)] text-black"
                : "text-white/70 hover:text-white"
            }`}
          >
            <Ticket size={14} className="hidden sm:block" /> Have an Invite?
          </button>
          <button
            type="button"
            onClick={() => setTab("create")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === "create"
                ? "bg-[var(--accent)] text-black"
                : "text-white/70 hover:text-white"
            }`}
          >
            <Plus size={14} className="hidden sm:block" /> Create a Server
          </button>
        </div>

        {tab === "discover" && (
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {loading ? (
              <p className="text-sm text-white/50 py-6 text-center">Loading public servers…</p>
            ) : directory.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-xl bg-white/[0.02] border border-white/10">
                <p className="text-sm font-medium text-white/80 mb-1">
                  No public servers listed yet
                </p>
                <p className="text-xs text-white/50 mb-4">
                  Be the first to create a public community or join with an invite code!
                </p>
                <button
                  type="button"
                  onClick={() => setTab("create")}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-black font-semibold text-xs"
                >
                  Create a Server
                </button>
              </div>
            ) : (
              directory.map((srv) => (
                <div
                  key={srv.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-colors"
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
                      <div className="font-semibold text-sm text-white truncate">{srv.name}</div>
                      {srv.description && (
                        <div className="text-xs text-white/60 truncate">{srv.description}</div>
                      )}
                      {srv.memberCount >= SHOW_MEMBERS_FROM && (
                        <div className="flex items-center gap-1 text-[11px] text-white/40 mt-0.5">
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
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white shrink-0"
                    >
                      Open
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={joiningId === srv.id || srv.raidMode}
                      onClick={() => void joinPublicServer(srv.id)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black text-xs font-semibold disabled:opacity-50 shrink-0"
                    >
                      {srv.raidMode ? "Locked" : joiningId === srv.id ? "Joining…" : "Join"}
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
              <label className="block text-xs font-medium text-white/70 mb-1">
                Invite Code or Link
              </label>
              <input
                type="text"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder="e.g. aB3x9K or https://.../hangout?aB3x9K"
                className="w-full px-3 py-2.5 rounded-lg bg-black/30 border border-white/10 text-sm text-white"
              />
            </div>
            <button
              type="button"
              disabled={!inviteInput.trim() || joiningInvite}
              onClick={() => void handleJoinByInvite()}
              className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-black font-semibold text-sm disabled:opacity-50"
            >
              {joiningInvite ? "Joining…" : "Join Server"}
            </button>
          </div>
        )}

        {tab === "create" && (
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">Server Name</label>
              <input
                type="text"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                maxLength={60}
                placeholder="My Cozy Corner"
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Short Description (optional)
              </label>
              <input
                type="text"
                value={newServerDescription}
                onChange={(e) => setNewServerDescription(e.target.value)}
                maxLength={240}
                placeholder="What is your space about?"
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white"
              />
            </div>
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-white">Public Server</div>
                <div className="text-xs text-white/60">
                  Allow anyone on this instance to discover and join without an invite link.
                </div>
              </div>
              <input
                type="checkbox"
                checked={newServerPublic}
                onChange={(e) => setNewServerPublic(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>
            <button
              type="button"
              disabled={!newServerName.trim() || creating}
              onClick={() => void handleCreateServer()}
              className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-black font-semibold text-sm disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create Server"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
