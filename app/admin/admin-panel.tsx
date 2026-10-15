"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  FileUp,
  Database,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Shield,
  ToggleLeft,
  Users,
  Eye,
  MessageSquare,
  Mic,
  Music,
  Ticket,
  Trash2,
} from "lucide-react";
import type { AdminAuditEntry, AdminFeature, AdminOverview, AdminServer, AdminUser } from "@/lib/admin";
import type { PublicUser } from "@/lib/users";
import { apiFetch, basePath } from "../lib/client";
import { BigFilesTab } from "./big-files-tab";
import { ConfirmDialog, InvitesTab, MessagesTab, ServerPeek, SongsTab, VoiceTab, type ConfirmRequest } from "./admin-tools";
import "./admin.css";

type Tab = "overview" | "hosts" | "users" | "bigfiles" | "servers" | "messages" | "invites" | "voice" | "songs" | "audit" | "features";

interface AdminData {
  overview: AdminOverview;
  users: AdminUser[];
  servers: AdminServer[];
  audit: AdminAuditEntry[];
  features: AdminFeature[];
}

/** What the ops agent reports; every part is optional because a check can fail. */
interface HostStatus {
  serving?: "home" | "oracle" | "thinkpad" | "standby";
  checkedAt?: string;
  host?: {
    hostname: string;
    role: string;
    uptimeSeconds: number;
    load: number[];
    memory: { total: number; available: number };
    disks: Array<{ label: string; free: number; total: number }>;
  };
  vip?: boolean;
  oracle?: {
    reachable: boolean;
    active?: boolean;
    watcher?: string;
    standby?: string;
    replica?: string | null;
    archive?: string | null;
    dns?: Record<string, string>;
  };
  thinkpad?: { reachable: boolean; active?: boolean; standby?: string; serving?: boolean; holdsVip?: boolean };
  replica?: { state: string; result?: string; lastRun?: string | null; lastStarted?: string | null };
  archive?: { count: number; latest: string | null; latestBytes: number; running: boolean };
  voice?: {
    home?: { container?: string; http: number };
    oracle?: { http: number };
    coturn?: string;
  };
  services?: Record<string, { unit?: string; http: number }>;
  /** This Hoffle process's in-memory rate-limit buckets. */
  rateLimits?: { totalBuckets: number; topBuckets: Array<{ key: string; count: number }> };
  /** The music helper's yt-dlp (it upgrades itself daily). */
  musicHelper?: {
    autoUpdate?: boolean;
    ytdlp?: { running: string; installed?: string; checked_at: number | null; result: string };
  } | null;
  error?: string;
}

const TABS: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "hosts", label: "Hosts & backups", icon: HardDrive },
  { id: "users", label: "Users", icon: Users },
  { id: "bigfiles", label: "Big files", icon: FileUp },
  { id: "servers", label: "Servers", icon: Server },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "invites", label: "Invites", icon: Ticket },
  { id: "voice", label: "Voice rooms", icon: Mic },
  { id: "songs", label: "Songs", icon: Music },
  { id: "audit", label: "Audit log", icon: ScrollText },
  { id: "features", label: "Features", icon: ToggleLeft },
];

const SERVICE_LABELS: Record<string, string> = {
  hoffle: "Hoffle",
  musicWatch: "Music + Watch bot",
  musicHelper: "Music helper",
  dnd: "D&D companion",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function uptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days} d ${hours} h` : `${hours} h ${Math.floor((seconds % 3600) / 60)} min`;
}

/** An HTTP status from a health probe: anything that answered is up. */
function httpUp(code: number | undefined): boolean {
  return Boolean(code && code < 500);
}

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={`admin-dot ${ok ? "ok" : warn ? "warn" : "bad"}`} aria-hidden />;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="portal-card admin-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function Row({ label, ok, warn, children }: { label: string; ok: boolean; warn?: boolean; children: React.ReactNode }) {
  return (
    <li className="admin-row">
      <Dot ok={ok} warn={warn} />
      <span className="admin-row-label">{label}</span>
      <span className="admin-row-value">{children}</span>
    </li>
  );
}

function Overview({ data }: { data: AdminData }) {
  const { overview } = data;
  const peak = Math.max(1, ...overview.messagesPerDay.map((day) => day.count));
  return (
    <>
      <div className="admin-stats">
        <Stat label="Members" value={overview.users} sub={`+${overview.signups24h} today · +${overview.signups7d} this week`} />
        <Stat label="Active today" value={overview.active24h} sub={`${overview.online.length} online now`} />
        <Stat label="Messages" value={overview.messages} sub={`${overview.messages24h} today · ${overview.messages7d} this week`} />
        <Stat label="Servers" value={overview.servers} sub={`${overview.channels} channels`} />
        <Stat label="Storage" value={formatBytes(overview.storageBytes)} sub={`${overview.storageFiles} files`} />
        <Stat label="In voice" value={overview.voice.reduce((sum, room) => sum + room.people.length, 0)} sub={`${overview.voice.length} rooms`} />
      </div>

      <section className="portal-card admin-section">
        <h2>Messages, last 14 days</h2>
        <div className="admin-bars" role="img" aria-label="Messages per day for the last 14 days">
          {overview.messagesPerDay.map((day) => (
            <div key={day.day} className="admin-bar" title={`${day.day}: ${day.count}`}>
              <span style={{ height: `${Math.max(2, (day.count / peak) * 100)}%` }} />
              <small>{day.day.slice(8)}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="admin-split">
        <section className="portal-card admin-section">
          <h2>Online now ({overview.online.length})</h2>
          {overview.online.length ? (
            <ul className="admin-chips">
              {overview.online.map((person) => (
                <li key={person.id}>{person.name}</li>
              ))}
            </ul>
          ) : (
            <p className="admin-muted">Nobody is connected.</p>
          )}
        </section>
        <section className="portal-card admin-section">
          <h2>Voice rooms</h2>
          {overview.voice.length ? (
            <ul className="admin-list">
              {overview.voice.map((room) => (
                <li key={room.channelId}>
                  <strong>{room.channel}</strong>
                  {room.server && <span className="admin-muted"> · {room.server}</span>}
                  <div className="admin-muted">{room.people.join(", ")}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-muted">Nobody is in voice.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Hosts({
  status,
  loading,
  onRefresh,
  onBackup,
  busy,
}: {
  status: HostStatus | null;
  loading: boolean;
  onRefresh: () => void;
  onBackup: (kind: "replica" | "archive") => void;
  busy: string;
}) {
  if (!status) {
    return (
      <div className="portal-loading">
        <Loader2 size={24} className="animate-spin" /> Asking the hosts…
      </div>
    );
  }
  if (status.error) {
    return (
      <div className="portal-card portal-empty">
        <h2>Host status unavailable</h2>
        <p>{status.error}</p>
      </div>
    );
  }
  const serving = status.serving ?? "home";
  const servingLabel = { home: "Home server", oracle: "Oracle (failover)", thinkpad: "ThinkPad (fallback)", standby: "Oracle standby" }[serving];
  const host = status.host;
  const replicaOk = status.replica?.result === "success";
  const archiveAge = status.archive?.latest ? Date.now() - new Date(status.archive.latest).getTime() : Infinity;
  return (
    <>
      <div className={`portal-card admin-serving ${serving === "home" ? "ok" : "warn"}`}>
        <Shield size={22} />
        <div>
          <strong>Hoffle is running on: {servingLabel}</strong>
          <span>
            {serving === "home"
              ? "Everything normal. Oracle is standing by and takes over if home goes down."
              : "Failover is active. Home pulls the data back when it comes up again."}
          </span>
        </div>
        <button className="portal-btn" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Check again
        </button>
      </div>

      <div className="admin-split">
        <section className="portal-card admin-section">
          <h2>Failover chain</h2>
          <ul className="admin-rows">
            <Row label="Home server" ok={serving === "home"} warn={serving !== "home"}>
              {host ? `${host.hostname} · up ${uptime(host.uptimeSeconds)} · load ${host.load[0]}` : "—"}
              {status.vip !== undefined && ` · ${status.vip ? "holds" : "does not hold"} the LAN IP`}
            </Row>
            <Row label="Oracle" ok={Boolean(status.oracle?.reachable && status.oracle.watcher === "active")} warn={!status.oracle?.reachable}>
              {status.oracle?.reachable
                ? `${status.oracle.active ? "SERVING" : "standing by"} · watcher ${status.oracle.watcher} · standby ${status.oracle.standby}`
                : "not reachable"}
            </Row>
            <Row label="ThinkPad" ok={Boolean(status.thinkpad?.reachable)} warn={!status.thinkpad?.reachable}>
              {status.thinkpad?.reachable
                ? `${status.thinkpad.serving ? "SERVING" : "idle"} · fallback ${status.thinkpad.standby}${status.thinkpad.holdsVip ? " · holds the LAN IP" : ""}`
                : "not reachable (off or away)"}
            </Row>
            {status.oracle?.dns &&
              Object.entries(status.oracle.dns).map(([name, ip]) => (
                <Row key={name} label={name} ok>
                  points at {ip}
                </Row>
              ))}
          </ul>
        </section>

        <section className="portal-card admin-section">
          <h2>Voice</h2>
          <ul className="admin-rows">
            <Row label="LiveKit at home" ok={httpUp(status.voice?.home?.http)}>
              container {status.voice?.home?.container ?? "—"}
            </Row>
            <Row label="LiveKit Germany (Oracle)" ok={httpUp(status.voice?.oracle?.http)}>
              {httpUp(status.voice?.oracle?.http) ? "answering" : "down"}
            </Row>
            {status.voice?.coturn && (
              <Row label="TURN relay (coturn)" ok={status.voice.coturn === "active"}>
                {status.voice.coturn}
              </Row>
            )}
          </ul>
          <h2>Services</h2>
          <ul className="admin-rows">
            {Object.entries(status.services ?? {}).map(([id, service]) => (
              <Row key={id} label={SERVICE_LABELS[id] ?? id} ok={httpUp(service.http)}>
                {httpUp(service.http) ? "answering" : "not answering"}
                {service.unit ? ` · ${service.unit}` : ""}
              </Row>
            ))}
          </ul>
        </section>
      </div>

      <section className="portal-card admin-section">
        <h2>Backups</h2>
        <ul className="admin-rows">
          <Row label="Replica to Oracle (every 5 min)" ok={replicaOk} warn={!replicaOk}>
            last {ago(status.replica?.lastRun ?? status.replica?.lastStarted)} ·{" "}
            {status.replica?.state === "activating" ? "running now" : status.replica?.result}
            {status.oracle?.replica && ` · Oracle has data from ${ago(status.oracle.replica)}`}
          </Row>
          <Row label="Daily archive" ok={archiveAge < 36 * 3600_000} warn={archiveAge >= 36 * 3600_000}>
            last {ago(status.archive?.latest)} ({formatBytes(status.archive?.latestBytes ?? 0)}) · {status.archive?.count ?? 0} kept
            {status.archive?.running && " · running now"}
          </Row>
          <Row label="Archive copy on Oracle" ok={Boolean(status.oracle?.archive)}>
            {when(status.oracle?.archive)}
          </Row>
          {host?.disks.map((disk) => (
            <Row key={disk.label} label={`Disk: ${disk.label}`} ok={disk.free / disk.total > 0.1} warn={disk.free / disk.total <= 0.1}>
              {formatBytes(disk.free)} free of {formatBytes(disk.total)}
            </Row>
          ))}
        </ul>
        <div className="admin-actions">
          <button className="portal-btn" type="button" disabled={Boolean(busy)} onClick={() => onBackup("replica")}>
            {busy === "replica" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync to Oracle now
          </button>
          <button className="portal-btn primary" type="button" disabled={Boolean(busy) || status.archive?.running} onClick={() => onBackup("archive")}>
            {busy === "archive" ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />} Make an archive backup now
          </button>
        </div>
        <p className="admin-muted">Checked {ago(status.checkedAt)}. An archive backup takes about a minute and runs in the background.</p>
      </section>

      <section className="portal-card admin-section">
        <h2>Runtime</h2>
        <ul className="admin-rows">
          <Row label="Music helper's yt-dlp" ok={status.musicHelper?.ytdlp?.result === "ok"} warn={!status.musicHelper}>
            {status.musicHelper?.ytdlp
              ? `${status.musicHelper.ytdlp.running}${status.musicHelper.autoUpdate ? "" : " · auto-update off"} · ${
                  status.musicHelper.ytdlp.checked_at
                    ? `checked ${ago(new Date(status.musicHelper.ytdlp.checked_at * 1000).toISOString())}: ${status.musicHelper.ytdlp.result}`
                    : status.musicHelper.ytdlp.result
                }`
              : "not answering"}
          </Row>
          <Row label="Rate limits" ok>
            {status.rateLimits
              ? `${status.rateLimits.totalBuckets} active bucket${status.rateLimits.totalBuckets === 1 ? "" : "s"}${
                  status.rateLimits.topBuckets[0] ? ` · busiest ${status.rateLimits.topBuckets[0].key} (${status.rateLimits.topBuckets[0].count})` : ""
                }`
              : "unknown"}
          </Row>
        </ul>
      </section>
    </>
  );
}

type UserAction = "signout" | "suspend" | "unsuspend" | "purge" | "delete";

function UsersTab({ users, me, onAction }: { users: AdminUser[]; me: string; onAction: (user: AdminUser, action: UserAction) => void }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"joined" | "seen" | "messages">("joined");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = users.filter(
      (user) => !needle || user.username.toLowerCase().includes(needle) || user.displayName.toLowerCase().includes(needle),
    );
    return [...list].sort((a, b) =>
      sort === "messages"
        ? b.messages - a.messages
        : sort === "seen"
          ? b.lastSeenAt.localeCompare(a.lastSeenAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
  }, [users, query, sort]);
  return (
    <section className="portal-card admin-section">
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={15} aria-hidden />
          <input type="search" placeholder="Search people…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search people" />
        </label>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort people">
          <option value="joined">Newest first</option>
          <option value="seen">Recently seen</option>
          <option value="messages">Most messages</option>
        </select>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Joined</th>
              <th>Last seen</th>
              <th>Messages</th>
              <th>Servers</th>
              <th>Devices</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((user) => (
              <tr key={user.id}>
                <td>
                  <Dot ok={user.online} warn={!user.online} />
                  <strong>{user.displayName}</strong> <span className="admin-muted">@{user.username}</span>
                  {user.isAdmin && <span className="admin-badge">admin</span>}
                  {user.suspended && <span className="admin-badge warn">suspended</span>}
                  {user.signupSource === "open" && <span className="admin-badge" title="Joined through open signup">open signup</span>}
                  {user.sameNetwork > 0 && (
                    <span className="admin-badge warn" title="Other accounts signed up from the same network">
                      +{user.sameNetwork} on same network
                    </span>
                  )}
                </td>
                <td>{when(user.createdAt)}</td>
                <td>{user.online ? "online" : ago(user.lastSeenAt)}</td>
                <td>{user.messages}</td>
                <td>{user.servers}</td>
                <td>{user.sessions}</td>
                <td>
                  {user.id === me ? (
                    <span className="admin-muted">you</span>
                  ) : (
                    <select
                      className="admin-action"
                      value=""
                      aria-label={`Actions for ${user.displayName}`}
                      onChange={(event) => {
                        if (event.target.value) onAction(user, event.target.value as UserAction);
                      }}
                    >
                      <option value="">Actions…</option>
                      <option value="signout" disabled={user.sessions === 0}>Sign out everywhere</option>
                      {user.suspended ? (
                        <option value="unsuspend">Unsuspend</option>
                      ) : (
                        <option value="suspend" disabled={user.isAdmin}>Suspend</option>
                      )}
                      <option value="purge" disabled={user.messages === 0}>Delete all their messages</option>
                      <option value="delete" disabled={user.isAdmin}>Delete account</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ServersTab({
  servers,
  onView,
  onDelete,
}: {
  servers: AdminServer[];
  onView: (server: AdminServer) => void;
  onDelete: (server: AdminServer) => void;
}) {
  return (
    <section className="portal-card admin-section">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Server</th>
              <th>Owner</th>
              <th>Members</th>
              <th>Channels</th>
              <th>Messages</th>
              <th>This week</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr key={server.id}>
                <td>
                  <strong>{server.name}</strong>
                </td>
                <td>{server.owner ?? "—"}</td>
                <td>{server.members}</td>
                <td>{server.channels}</td>
                <td>{server.messages}</td>
                <td>{server.messages7d}</td>
                <td>{when(server.createdAt)}</td>
                <td className="admin-row-actions">
                  <button className="portal-btn admin-small" type="button" onClick={() => onView(server)}>
                    <Eye size={13} /> View invisibly
                  </button>
                  <button
                    className="portal-btn danger admin-small"
                    type="button"
                    disabled={server.id === "hangout"}
                    title={server.id === "hangout" ? "The home server can't be deleted" : undefined}
                    onClick={() => onDelete(server)}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AuditTab({ audit }: { audit: AdminAuditEntry[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = audit.filter((entry) =>
    !needle ||
    [entry.action, entry.actorName, entry.targetName ?? "", entry.serverName, entry.detail ?? ""].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
  return (
    <section className="portal-card admin-section">
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={15} aria-hidden />
          <input type="search" placeholder="Filter by action, person or server…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Filter audit log" />
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="admin-muted">Nothing logged yet.</p>
      ) : (
        <ul className="admin-audit">
          {shown.map((entry) => (
            <li key={entry.id}>
              <time dateTime={entry.createdAt}>{when(entry.createdAt)}</time>
              <span>
                <strong>{entry.actorName}</strong> <code>{entry.action}</code>
                {entry.targetName && <> · {entry.targetName}</>}
                {entry.detail && <span className="admin-muted"> · {entry.detail}</span>}
              </span>
              <span className="admin-muted">{entry.serverName}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FeaturesTab({ features, onToggle, busy }: { features: AdminFeature[]; onToggle: (id: string, off: boolean) => void; busy: string }) {
  return (
    <section className="portal-card admin-section">
      <p className="admin-muted">
        Switch a side feature off and its API answers “turned off” within about 15 seconds, everywhere. Core chat
        (messages, servers, DMs, voice, uploads) can't be switched off here.
      </p>
      <ul className="admin-features">
        {features.map((feature) => {
          const off = feature.offInConfig || feature.offHere;
          return (
            <li key={feature.id}>
              <span>
                <strong>{feature.label}</strong> <code>{feature.id}</code>
                {feature.offInConfig && <span className="admin-badge warn">off in config</span>}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!off}
                aria-label={`${feature.label} ${off ? "off" : "on"}`}
                className={`admin-switch ${off ? "" : "on"}`}
                disabled={feature.offInConfig || busy === feature.id}
                onClick={() => onToggle(feature.id, !off)}
              >
                <span />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AdminPanel() {
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<AdminData | null>(null);
  const [hosts, setHosts] = useState<HostStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [hostsLoading, setHostsLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [peeking, setPeeking] = useState<AdminServer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<AdminData>("/api/admin"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHosts = useCallback(async () => {
    setHostsLoading(true);
    try {
      setHosts(await apiFetch<HostStatus>("/api/admin/infra"));
    } catch (cause) {
      setHosts({ error: cause instanceof Error ? cause.message : "Could not reach the hosts." });
    } finally {
      setHostsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("portal-page-active");
    document.body.classList.add("portal-page-active");
    return () => {
      document.documentElement.classList.remove("portal-page-active");
      document.body.classList.remove("portal-page-active");
    };
  }, []);

  useEffect(() => {
    apiFetch<{ user: PublicUser | null }>("/api/auth/session")
      .then((session) => {
        setUser(session.user);
        if (session.user?.isInstanceAdmin) {
          void load();
          void loadHosts();
        }
      })
      .catch(() => setUser(null));
  }, [load, loadHosts]);

  async function backup(kind: "replica" | "archive") {
    setBusy(kind);
    try {
      await apiFetch("/api/admin/backup", { method: "POST", body: JSON.stringify({ kind }) });
      setNotice(kind === "replica" ? "Sync to Oracle started." : "Archive backup started. It takes about a minute.");
      setTimeout(() => void loadHosts(), kind === "replica" ? 15_000 : 75_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the backup.");
    } finally {
      setBusy("");
    }
  }

  async function toggleFeature(id: string, off: boolean) {
    if (!data) return;
    setBusy(id);
    const disabled = data.features.filter((feature) => feature.offHere && feature.id !== id).map((feature) => feature.id as string);
    if (off) disabled.push(id);
    try {
      const result = await apiFetch<{ features: AdminFeature[] }>("/api/admin/features", {
        method: "POST",
        body: JSON.stringify({ disabled }),
      });
      setData({ ...data, features: result.features });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change that feature.");
    } finally {
      setBusy("");
    }
  }

  async function post(path: string, body?: unknown, method = "POST") {
    return apiFetch<Record<string, unknown>>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  function userAction(target: AdminUser, action: UserAction) {
    const id = encodeURIComponent(target.id);
    const who = `${target.displayName} (@${target.username})`;
    const requests: Record<UserAction, ConfirmRequest> = {
      signout: {
        title: `Sign ${target.displayName} out everywhere?`,
        body: <p>All {target.sessions} of their devices have to sign in again. Nothing is deleted.</p>,
        confirmLabel: "Sign out",
        danger: false,
        onConfirm: async () => {
          const result = await post(`/api/admin/users/${id}/signout`);
          setNotice(`Signed ${target.displayName} out of ${result.ended} session(s).`);
        },
      },
      suspend: {
        title: `Suspend ${target.displayName}?`,
        body: <p>{who} is signed out everywhere and can't sign in again until you unsuspend them. Their messages and data stay.</p>,
        confirmLabel: "Suspend",
        onConfirm: async () => {
          await post(`/api/admin/users/${id}/suspend`, { suspended: true });
          setNotice(`${target.displayName} is suspended.`);
        },
      },
      unsuspend: {
        title: `Unsuspend ${target.displayName}?`,
        body: <p>They can sign in again.</p>,
        confirmLabel: "Unsuspend",
        danger: false,
        onConfirm: async () => {
          await post(`/api/admin/users/${id}/suspend`, { suspended: false });
          setNotice(`${target.displayName} can sign in again.`);
        },
      },
      purge: {
        title: `Delete all ${target.messages} messages from ${target.displayName}?`,
        body: <p>Every message {who} has sent disappears for everyone, in every server and DM. Their account stays.</p>,
        typeToConfirm: target.username,
        confirmLabel: "Delete their messages",
        onConfirm: async () => {
          const result = await post(`/api/admin/users/${id}/purge`);
          setNotice(`Deleted ${result.deleted} messages from ${target.displayName}.`);
        },
      },
      delete: {
        title: `Delete ${target.displayName}'s account?`,
        body: (
          <p>
            {who} is removed for good: sign-in, memberships, friends, DMs, reminders and settings. This can't be undone.
            Their messages stay under their name unless you tick the box. Servers they created stay too.
          </p>
        ),
        typeToConfirm: target.username,
        checkbox: `Also delete all ${target.messages} of their messages`,
        confirmLabel: "Delete account",
        onConfirm: async (deleteMessages) => {
          await post(`/api/admin/users/${id}`, { confirmUsername: target.username, deleteMessages }, "DELETE");
          setNotice(`${target.displayName}'s account is deleted.`);
        },
      },
    };
    const request = requests[action];
    setConfirming({
      ...request,
      onConfirm: async (checked) => {
        await request.onConfirm(checked);
        void load();
      },
    });
  }

  function deleteServer(target: AdminServer) {
    setConfirming({
      title: `Delete the server "${target.name}"?`,
      body: (
        <p>
          All {target.channels} channels and {target.messages} messages, its roles, bans and its {target.members} memberships
          are deleted for good. Members keep their accounts. This can't be undone.
        </p>
      ),
      typeToConfirm: target.name,
      confirmLabel: "Delete server",
      onConfirm: async () => {
        await post(`/api/admin/servers/${encodeURIComponent(target.id)}`, { confirmName: target.name }, "DELETE");
        setNotice(`Deleted the server ${target.name}.`);
        void load();
      },
    });
  }


  if (user === undefined) {
    return (
      <div className="recordings-portal admin-panel">
        <div className="portal-loading">
          <Loader2 size={28} className="animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (!user?.isInstanceAdmin) {
    return (
      <div className="recordings-portal admin-panel">
        <div className="portal-card portal-empty">
          <h2>{user ? "Admins only" : "Sign in first"}</h2>
          <p>{user ? "This panel is only for instance admins." : "Sign in to Hoffle, then open this page again."}</p>
          <a className="portal-btn" href={`${basePath}/`}>
            <ArrowLeft size={15} /> Back to chat
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="recordings-portal admin-panel">
      <header className="portal-head">
        <div className="portal-title">
          <Shield size={26} />
          <div>
            <h1>Admin</h1>
            <span>Everything on this Hoffle, in one place</span>
          </div>
        </div>
        <div className="portal-actions">
          <a className="portal-btn" href={`${basePath}/`}>
            <ArrowLeft size={15} /> Chat
          </a>
          <button
            className="portal-btn"
            type="button"
            onClick={() => {
              void load();
              void loadHosts();
            }}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      {notice && (
        <div className="portal-notice" role="status" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}
      {error && (
        <div className="portal-notice error" role="alert" onClick={() => setError("")}>
          {error}
        </div>
      )}

      <nav className="admin-tabs" aria-label="Admin sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={`admin-tab ${tab === id ? "active" : ""}`} aria-current={tab === id ? "page" : undefined} onClick={() => {
            setTab(id);
            setPeeking(null);
          }}>
            <Icon size={15} /> {label}
          </button>
        ))}
        <a className="admin-tab" href={`${basePath}/flo`}>
          <ImageIcon size={15} /> Media
        </a>
      </nav>

      {tab === "hosts" ? (
        <Hosts status={hosts} loading={hostsLoading} onRefresh={() => void loadHosts()} onBackup={(kind) => void backup(kind)} busy={busy} />
      ) : !data ? (
        <div className="portal-loading">
          <Loader2 size={24} className="animate-spin" /> Loading…
        </div>
      ) : tab === "overview" ? (
        <Overview data={data} />
      ) : tab === "users" ? (
        <UsersTab users={data.users} me={user.id} onAction={userAction} />
      ) : tab === "bigfiles" ? (
        <BigFilesTab users={data.users} confirm={setConfirming} />
      ) : tab === "servers" ? (
        peeking ? (
          <ServerPeek server={peeking} onBack={() => setPeeking(null)} confirm={setConfirming} />
        ) : (
          <ServersTab servers={data.servers} onView={setPeeking} onDelete={deleteServer} />
        )
      ) : tab === "messages" ? (
        <MessagesTab servers={data.servers} confirm={setConfirming} />
      ) : tab === "invites" ? (
        <InvitesTab servers={data.servers} confirm={setConfirming} />
      ) : tab === "voice" ? (
        <VoiceTab />
      ) : tab === "songs" ? (
        <SongsTab confirm={setConfirming} />
      ) : tab === "audit" ? (
        <AuditTab audit={data.audit} />
      ) : (
        <FeaturesTab features={data.features} onToggle={(id, off) => void toggleFeature(id, off)} busy={busy} />
      )}

      {confirming && <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />}
    </div>
  );
}
