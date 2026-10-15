"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Copy, Loader2, Plus, Search, Trash2 } from "lucide-react";
import type { AdminInvite, AdminMessageHit, AdminVoiceRoom, PeekChannel } from "@/lib/admin-tools";
import type { AdminServer } from "@/lib/admin";
import { apiFetch } from "../lib/client";
import { buildUserInviteLink } from "../lib/chat/invites";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

// ---- Confirmation ----

export interface ConfirmRequest {
  title: string;
  body: ReactNode;
  /** The person must type this exactly before the button unlocks. */
  typeToConfirm?: string;
  /** An optional extra choice, e.g. "also delete their messages". */
  checkbox?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (checked: boolean) => Promise<void>;
}

/** "Are you sure?" for every destructive admin action. */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unlocked = !request.typeToConfirm || typed === request.typeToConfirm;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await request.onConfirm(checked);
      onClose();
    } catch (cause) {
      setError(errorText(cause, "That didn't work."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="media-admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title">
      <div className="portal-card media-admin-dialog">
        <h2 id="admin-confirm-title">{request.title}</h2>
        <div className="admin-confirm-body">{request.body}</div>
        {request.checkbox && (
          <label className="admin-check">
            <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            {request.checkbox}
          </label>
        )}
        {request.typeToConfirm && (
          <label className="admin-type-confirm">
            <span>
              Type <strong>{request.typeToConfirm}</strong> to confirm
            </span>
            <input autoFocus value={typed} onChange={(event) => setTyped(event.target.value)} aria-label="Confirmation" />
          </label>
        )}
        {error && <p className="admin-error">{error}</p>}
        <div className="media-admin-dialog-actions">
          <button className="portal-btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={`portal-btn ${request.danger === false ? "primary" : "primary danger-fill"}`}
            type="button"
            onClick={() => void confirm()}
            disabled={busy || !unlocked}
          >
            {busy && <Loader2 size={15} className="animate-spin" />} {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Messages ----

function MessageList({
  messages,
  onDelete,
  showWhere = true,
}: {
  messages: AdminMessageHit[];
  onDelete: (message: AdminMessageHit) => void;
  showWhere?: boolean;
}) {
  return (
    <ul className="admin-messages">
      {messages.map((message) => (
        <li key={message.id} className={message.deleted ? "deleted" : ""}>
          <div className="admin-message-head">
            <strong>{message.author}</strong>
            {showWhere && (
              <span className="admin-muted">
                {message.server} · {message.channel}
              </span>
            )}
            <time className="admin-muted" dateTime={message.createdAt}>
              {when(message.createdAt)}
            </time>
            {message.deleted ? (
              <span className="admin-badge warn">deleted</span>
            ) : (
              <button className="portal-btn danger admin-small" type="button" onClick={() => onDelete(message)}>
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
          <p>{message.content || <em className="admin-muted">(no text)</em>}</p>
        </li>
      ))}
    </ul>
  );
}

export function MessagesTab({
  servers,
  confirm,
}: {
  servers: AdminServer[];
  confirm: (request: ConfirmRequest) => void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"words" | "regex">("words");
  const [server, setServer] = useState("");
  const [author, setAuthor] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [dms, setDms] = useState(false);
  const [result, setResult] = useState<{ hits: AdminMessageHit[]; scanned: number; truncated: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: query, mode });
      if (server) params.set("server", server);
      if (author.trim()) params.set("author", author.trim());
      if (deleted) params.set("deleted", "1");
      if (dms) params.set("dms", "1");
      setResult(await apiFetch(`/api/admin/messages?${params}`));
    } catch (cause) {
      setError(errorText(cause, "Search failed."));
    } finally {
      setBusy(false);
    }
  }

  function remove(message: AdminMessageHit) {
    confirm({
      title: "Delete this message?",
      body: (
        <p>
          {message.author}'s message in {message.channel} disappears for everyone. Its files stay in Media.
          <br />
          <em>“{message.content.slice(0, 160)}”</em>
        </p>
      ),
      confirmLabel: "Delete message",
      onConfirm: async () => {
        await apiFetch(`/api/admin/messages/${encodeURIComponent(message.id)}`, { method: "DELETE" });
        setResult((current) =>
          current && { ...current, hits: current.hits.map((hit) => (hit.id === message.id ? { ...hit, deleted: true } : hit)) },
        );
      },
    });
  }

  return (
    <section className="portal-card admin-section">
      <form className="admin-toolbar" onSubmit={(event) => void search(event)}>
        <label className="admin-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            placeholder={mode === "regex" ? "Regular expression, e.g. disc(o|0)rd\\.gg/\\w+" : "Words to find, e.g. free nitro"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search messages"
          />
        </label>
        <select value={mode} onChange={(event) => setMode(event.target.value as "words" | "regex")} aria-label="Search mode">
          <option value="words">Words</option>
          <option value="regex">Regex</option>
        </select>
        <select value={server} onChange={(event) => setServer(event.target.value)} aria-label="Server">
          <option value="">All servers</option>
          {servers.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <input className="admin-input" placeholder="Author" value={author} onChange={(event) => setAuthor(event.target.value)} aria-label="Author" />
        <button className="portal-btn primary" type="submit" disabled={busy || !query.trim()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search
        </button>
        <div className="admin-checks">
          <label className="admin-check">
            <input type="checkbox" checked={deleted} onChange={(event) => setDeleted(event.target.checked)} /> Include deleted
          </label>
          <label className="admin-check">
            <input type="checkbox" checked={dms} onChange={(event) => setDms(event.target.checked)} /> Include DMs (private)
          </label>
        </div>
      </form>
      {error && <p className="admin-error">{error}</p>}
      {result && (
        <>
          <p className="admin-muted">
            {result.hits.length} match{result.hits.length === 1 ? "" : "es"}
            {mode === "regex" && ` in the newest ${result.scanned} messages`}
            {result.truncated && " — showing the newest 200; narrow the search to see more"}
          </p>
          <MessageList messages={result.hits} onDelete={remove} />
        </>
      )}
    </section>
  );
}

// ---- Looking into a server ----

export function ServerPeek({
  server,
  onBack,
  confirm,
}: {
  server: AdminServer;
  onBack: () => void;
  confirm: (request: ConfirmRequest) => void;
}) {
  const [channels, setChannels] = useState<PeekChannel[] | null>(null);
  const [channel, setChannel] = useState<PeekChannel | null>(null);
  const [messages, setMessages] = useState<AdminMessageHit[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ channels: PeekChannel[] }>(`/api/admin/servers/${encodeURIComponent(server.id)}/channels`)
      .then((data) => {
        setChannels(data.channels);
        setChannel(data.channels.find((option) => option.kind !== "voice") ?? null);
      })
      .catch((cause) => setError(errorText(cause, "Could not load channels.")));
  }, [server.id]);

  async function load(target: PeekChannel, before?: string) {
    try {
      const params = before ? `?before=${encodeURIComponent(before)}` : "";
      const data = await apiFetch<{ messages: AdminMessageHit[] }>(`/api/admin/channels/${encodeURIComponent(target.id)}/messages${params}`);
      setMessages((current) => (before ? [...data.messages, ...current] : data.messages));
      setMore(data.messages.length === 100);
    } catch (cause) {
      setError(errorText(cause, "Could not load messages."));
    }
  }

  useEffect(() => {
    setMessages([]);
    if (channel) void load(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  function remove(message: AdminMessageHit) {
    confirm({
      title: "Delete this message?",
      body: <p>“{message.content.slice(0, 160)}” by {message.author} disappears for everyone.</p>,
      confirmLabel: "Delete message",
      onConfirm: async () => {
        await apiFetch(`/api/admin/messages/${encodeURIComponent(message.id)}`, { method: "DELETE" });
        setMessages((current) => current.map((hit) => (hit.id === message.id ? { ...hit, deleted: true } : hit)));
      },
    });
  }

  return (
    <section className="portal-card admin-section">
      <div className="admin-peek-head">
        <button className="portal-btn" type="button" onClick={onBack}>
          <ArrowLeft size={14} /> Servers
        </button>
        <div>
          <strong>{server.name}</strong>
          <span className="admin-muted"> · viewing invisibly: you are not a member and nothing is recorded</span>
        </div>
      </div>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-peek">
        <ul className="admin-peek-channels">
          {channels === null ? (
            <li className="admin-muted">Loading…</li>
          ) : (
            channels.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className={channel?.id === option.id ? "active" : ""}
                  onClick={() => setChannel(option)}
                  disabled={option.kind === "voice"}
                >
                  {option.kind === "voice" ? "🔊" : "#"} {option.name}
                  <span className="admin-muted">{option.kind === "voice" ? "" : option.messages}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="admin-peek-messages">
          {more && channel && (
            <button className="portal-btn admin-small" type="button" onClick={() => void load(channel, messages[0]?.createdAt)}>
              Load older
            </button>
          )}
          {channel ? (
            messages.length ? (
              <MessageList messages={messages} onDelete={remove} showWhere={false} />
            ) : (
              <p className="admin-muted">No messages here.</p>
            )
          ) : (
            <p className="admin-muted">Pick a channel.</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- Invites ----

interface SignupState {
  open: boolean;
  serverId: string | null;
  turnstile: boolean;
  stats: Record<string, { total: number; last24h: number }>;
}

/** The open-signup switch: off puts invite-only signup straight back. */
function OpenSignupCard({ servers }: { servers: AdminServer[] }) {
  const [state, setState] = useState<SignupState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<SignupState>("/api/admin/signup")
      .then(setState)
      .catch((cause) => setError(errorText(cause, "Could not load signup settings.")));
  }, []);

  async function update(change: { open?: boolean; serverId?: string | null }) {
    setBusy(true);
    setError("");
    try {
      setState(await apiFetch<SignupState>("/api/admin/signup", { method: "POST", body: JSON.stringify(change) }));
    } catch (cause) {
      setError(errorText(cause, "Could not save that."));
    } finally {
      setBusy(false);
    }
  }

  const count = (source: string) => state?.stats[source]?.total ?? 0;
  const today = (source: string) => state?.stats[source]?.last24h ?? 0;

  return (
    <section className="portal-card admin-section">
      <h2>Open signup</h2>
      {!state ? (
        <p className="admin-muted">{error || "Loading…"}</p>
      ) : (
        <>
          <p className="admin-muted">
            {state.open
              ? "Anyone can press Create account without an invite code. Invite codes still work and are still counted."
              : "Off: people need an invite code to make an account."}
          </p>
          <div className="admin-toolbar">
            <button
              type="button"
              className={`portal-btn ${state.open ? "" : "primary"}`}
              disabled={busy}
              onClick={() => void update({ open: !state.open })}
            >
              {state.open ? "Turn open signup off" : "Turn open signup on"}
            </button>
            <label className="admin-check">
              New accounts join
              <select
                value={state.serverId ?? ""}
                onChange={(event) => void update({ serverId: event.target.value || null })}
                disabled={busy}
                aria-label="Server open-signup accounts join"
              >
                <option value="">No server</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="admin-muted">
            Joined so far: {count("open")} by open signup ({today("open")} today), {count("invite")} by invite
            ({today("invite")} today), {count("first") + count("older")} before this existed.{" "}
            {state.turnstile
              ? "Turnstile challenge is on."
              : "Turnstile is not set up (TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY), so bots only meet the rate limits."}
          </p>
        </>
      )}
      {error && state && <p className="auth-error">{error}</p>}
    </section>
  );
}

export function InvitesTab({ servers, confirm }: { servers: AdminServer[]; confirm: (request: ConfirmRequest) => void }) {
  const [invites, setInvites] = useState<AdminInvite[] | null>(null);
  const [serverId, setServerId] = useState("");
  const [maxUses, setMaxUses] = useState(10);
  const [note, setNote] = useState("");
  const [created, setCreated] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSpent, setShowSpent] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    apiFetch<{ invites: AdminInvite[] }>("/api/admin/invites")
      .then((data) => setInvites(data.invites))
      .catch((cause) => setError(errorText(cause, "Could not load invites.")));

  useEffect(() => {
    void load();
  }, []);

  const link = buildUserInviteLink;

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await apiFetch<{ code: string }>("/api/admin/invites", {
        method: "POST",
        body: JSON.stringify({ serverId: serverId || null, maxUses, note }),
      });
      setCreated(result.code);
      setCopied(false);
      setNote("");
      void load();
    } catch (cause) {
      setError(errorText(cause, "Could not create the invite."));
    }
  }

  function remove(codes: string[]) {
    confirm({
      title: codes.length === 1 ? `Delete invite ${codes[0]}?` : `Delete ${codes.length} invites?`,
      body: <p>Links using {codes.length === 1 ? "this code" : "these codes"} stop working right away. People who already joined stay.</p>,
      confirmLabel: "Delete",
      onConfirm: async () => {
        await apiFetch("/api/admin/invites", { method: "DELETE", body: JSON.stringify({ codes }) });
        void load();
      },
    });
  }

  const isSpent = (invite: AdminInvite) => invite.revoked || (invite.maxUses > 0 && invite.uses >= invite.maxUses);
  const shown = (invites ?? []).filter((invite) => showSpent || !isSpent(invite));
  const spent = (invites ?? []).filter(isSpent);

  return (
    <>
      <OpenSignupCard servers={servers} />
      <section className="portal-card admin-section">
        <h2>New invite</h2>
        <form className="admin-toolbar" onSubmit={(event) => void create(event)}>
          <select value={serverId} onChange={(event) => setServerId(event.target.value)} aria-label="Invite to">
            <option value="">Sign-up only (no server)</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                Join {server.name}
              </option>
            ))}
          </select>
          <label className="admin-check">
            Uses
            <input
              className="admin-input admin-number"
              type="number"
              min={1}
              max={1000}
              value={maxUses}
              onChange={(event) => setMaxUses(Number(event.target.value))}
              aria-label="Maximum uses (1 to 1000)"
            />
          </label>
          <input className="admin-input" placeholder="Note (who it's for)" value={note} onChange={(event) => setNote(event.target.value)} aria-label="Note" />
          <button className="portal-btn primary" type="submit">
            <Plus size={14} /> Create
          </button>
        </form>
        <p className="admin-muted">0 uses means unlimited.</p>
        {created && (
          <div className="admin-created">
            <code>{link(created)}</code>
            <button
              className="portal-btn admin-small"
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(link(created)).then(() => setCopied(true));
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
        {error && <p className="admin-error">{error}</p>}
      </section>

      <section className="portal-card admin-section">
        <div className="admin-toolbar">
          <h2 className="admin-grow">Invite codes ({invites?.length ?? "…"})</h2>
          <label className="admin-check">
            <input type="checkbox" checked={showSpent} onChange={(event) => setShowSpent(event.target.checked)} /> Show used-up and revoked
          </label>
          <button className="portal-btn danger" type="button" disabled={!spent.length} onClick={() => remove(spent.map((invite) => invite.code))}>
            <Trash2 size={14} /> Delete {spent.length} used-up
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>For</th>
                <th>Uses</th>
                <th>Made by</th>
                <th>Created</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((invite) => (
                <tr key={invite.code} className={isSpent(invite) ? "admin-dim" : ""}>
                  <td>
                    <code>{invite.code}</code>
                  </td>
                  <td>{invite.server ?? "Sign-up"}</td>
                  <td>
                    {invite.uses}/{invite.maxUses || "∞"}
                    {invite.revoked && <span className="admin-badge warn">revoked</span>}
                  </td>
                  <td>{invite.createdBy ?? "—"}</td>
                  <td>{when(invite.createdAt)}</td>
                  <td className="admin-wrap">{invite.note ?? ""}</td>
                  <td>
                    <button className="portal-btn danger admin-small" type="button" onClick={() => remove([invite.code])}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ---- Voice rooms ----

export function VoiceTab() {
  const [rooms, setRooms] = useState<AdminVoiceRoom[] | null>(null);
  const [regions, setRegions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ rooms: AdminVoiceRoom[]; regions: Record<string, string> }>("/api/admin/voice")
      .then((data) => {
        setRooms(data.rooms);
        setRegions(data.regions);
      })
      .catch((cause) => setError(errorText(cause, "Could not load voice rooms.")));
  }, []);

  async function change(room: AdminVoiceRoom, region: string) {
    setBusy(room.id);
    setError("");
    try {
      const data = await apiFetch<{ rooms: AdminVoiceRoom[] }>("/api/admin/voice", {
        method: "PATCH",
        body: JSON.stringify({ channelId: room.id, region }),
      });
      setRooms(data.rooms);
    } catch (cause) {
      setError(errorText(cause, "Could not move that room."));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="portal-card admin-section">
      <p className="admin-muted">
        Which voice server each room uses. People already in a room move over the next time they join it.
      </p>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Room</th>
              <th>Server</th>
              <th>Voice server</th>
            </tr>
          </thead>
          <tbody>
            {(rooms ?? []).map((room) => (
              <tr key={room.id}>
                <td>
                  <strong>🔊 {room.name}</strong>
                </td>
                <td>{room.server}</td>
                <td>
                  <select value={room.region} disabled={busy === room.id} onChange={(event) => void change(room, event.target.value)} aria-label={`Voice server for ${room.name}`}>
                    {Object.entries(regions).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {busy === room.id && <Loader2 size={13} className="animate-spin" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- Songs ----

interface LibrarySong {
  id: string | null;
  title: string;
  artist: string | null;
  file: string;
  size: number;
  stems: boolean;
  analysed: boolean;
  issues?: string[];
}

/** The music bot's downloaded songs. Deleting one wipes its file, stems and analysis so it starts over on the next play. */
export function SongsTab({ confirm }: { confirm: (request: ConfirmRequest) => void }) {
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<LibrarySong[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function load(text: string) {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch<{ songs: LibrarySong[] }>(`/api/admin/songs?q=${encodeURIComponent(text)}`);
      setSongs(data.songs);
    } catch (cause) {
      setError(errorText(cause, "Could not load the song library."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  function reset(song: LibrarySong) {
    const name = song.artist ? `${song.artist} - ${song.title}` : song.title;
    confirm({
      title: "Delete this song and start over?",
      body: (
        <p>
          <strong>{name}</strong>
          <br />
          Its downloaded file, its stems and its analysis are deleted. The next time anyone plays it, the bot downloads it
          again, analyses it again and splits it into stems again, which takes a little while.
        </p>
      ),
      confirmLabel: "Delete song",
      danger: true,
      onConfirm: async () => {
        await apiFetch("/api/admin/songs", { method: "POST", body: JSON.stringify({ id: song.id, title: name }) });
        setSongs((current) => current && current.filter((row) => row.id !== song.id));
        setNote(`${name} was deleted. It downloads and splits again the next time it is played.`);
      },
    });
  }

  return (
    <section className="portal-card admin-section">
      <p className="admin-muted">
        Songs that play wrong or not at all are usually a corrupted download. Songs with a ⚠ were heard to have a problem
        and are listed first. Delete one here and it is fetched and split into stems again from scratch the next time
        it is played.
      </p>
      <form
        className="admin-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
      >
        <label className="admin-search">
          <Search size={15} aria-hidden />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Song or artist" aria-label="Search downloaded songs" />
        </label>
        <button type="submit" className="portal-btn" disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : "Search"}
        </button>
      </form>
      {error && <p className="admin-error">{error}</p>}
      {note && <p className="admin-muted">{note}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Song</th>
              <th>Size</th>
              <th>Cached</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(songs ?? []).map((song) => (
              <tr key={song.file}>
                <td>
                  <strong>{song.title}</strong>
                  {song.artist && <div className="admin-muted">{song.artist}</div>}
                  {song.issues && song.issues.length > 0 && (
                    <div className="admin-error" title="Found by listening to the audio. Deleting the song downloads it fresh.">
                      ⚠ {song.issues.join(" · ")}
                    </div>
                  )}
                </td>
                <td>{(song.size / 1048576).toFixed(1)} MB</td>
                <td>
                  {[song.stems && "stems", song.analysed && "analysis"].filter(Boolean).join(" · ") || "file only"}
                </td>
                <td>
                  <button
                    type="button"
                    className="portal-btn danger admin-small"
                    disabled={!song.id}
                    title={song.id ? "Delete the file, stems and analysis" : "No YouTube id in the file name, so it cannot be reset from here"}
                    onClick={() => reset(song)}
                  >
                    <Trash2 size={13} aria-hidden /> Delete
                  </button>
                </td>
              </tr>
            ))}
            {songs && songs.length === 0 && (
              <tr>
                <td colSpan={4} className="admin-muted">
                  No downloaded songs match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
