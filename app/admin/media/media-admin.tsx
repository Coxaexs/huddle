"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Loader2,
  Music,
  RefreshCw,
  Search,
  Trash2,
  Video,
} from "lucide-react";
import type { MediaItem } from "@/lib/media-admin";
import type { PublicUser } from "@/lib/users";
import { apiFetch, basePath } from "../../lib/client";
import "./media-admin.css";

type Sort = "newest" | "oldest" | "largest" | "smallest";
type Filter = "all" | MediaItem["family"] | "unused";

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "largest", label: "Largest first" },
  { id: "smallest", label: "Smallest first" },
];

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
  { id: "pdf", label: "PDFs" },
  { id: "file", label: "Other files" },
  { id: "unused", label: "Unused" },
];

/** Cards rendered per "Show more" step, so hundreds of thumbnails don't load at once. */
const PAGE = 60;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileUrl(key: string): string {
  return `${basePath}/api/uploads/${encodeURIComponent(key)}`;
}

function FamilyIcon({ family, size = 28 }: { family: MediaItem["family"]; size?: number }) {
  if (family === "video") return <Video size={size} />;
  if (family === "audio") return <Music size={size} />;
  if (family === "pdf") return <FileText size={size} />;
  if (family === "image") return <ImageIcon size={size} />;
  return <FileIcon size={size} />;
}

function Preview({ item }: { item: MediaItem }) {
  if (item.family === "image") {
    return <img src={fileUrl(item.key)} alt="" loading="lazy" decoding="async" />;
  }
  if (item.family === "video") {
    return <video src={`${fileUrl(item.key)}#t=0.1`} preload="metadata" muted playsInline />;
  }
  return (
    <span className="media-admin-icon">
      <FamilyIcon family={item.family} />
    </span>
  );
}

/** "3 messages · Kiwi's avatar" — a short summary of what a delete will touch. */
function usageSummary(item: MediaItem): string {
  if (item.refs.length === 0) return item.note || "Not used anywhere";
  const messages = item.refs.filter((ref) => ref.kind === "message");
  const others = item.refs.filter((ref) => ref.kind !== "message");
  const parts: string[] = [];
  if (messages.length) {
    const places = [...new Set(messages.map((ref) => ref.label))];
    parts.push(
      `${messages.length} message${messages.length === 1 ? "" : "s"} in ${places.slice(0, 2).join(", ")}${
        places.length > 2 ? ` +${places.length - 2}` : ""
      }`,
    );
  }
  for (const ref of others.slice(0, 2)) parts.push(ref.label);
  if (others.length > 2) parts.push(`+${others.length - 2} more`);
  return parts.join(" · ");
}

export function MediaAdmin() {
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ items: MediaItem[] }>("/api/admin/media");
      setItems(data.items);
      // Drop selections for files that no longer exist.
      setSelected((current) => {
        const keys = new Set(data.items.map((item) => item.key));
        return new Set([...current].filter((key) => keys.has(key)));
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load media.");
    } finally {
      setLoading(false);
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
        if (session.user?.canManageMedia) void load();
      })
      .catch(() => setUser(null));
  }, [load]);

  const visible = useMemo(() => {
    if (!items) return [];
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (filter === "unused" ? item.refs.length > 0 : filter !== "all" && item.family !== filter) {
        return false;
      }
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.key.toLowerCase().includes(needle) ||
        (item.uploaderName?.toLowerCase().includes(needle) ?? false) ||
        item.refs.some((ref) => ref.label.toLowerCase().includes(needle))
      );
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.uploaded.localeCompare(b.uploaded);
        case "largest":
          return b.size - a.size;
        case "smallest":
          return a.size - b.size;
        default:
          return b.uploaded.localeCompare(a.uploaded);
      }
    });
    return sorted;
  }, [items, query, sort, filter]);

  useEffect(() => setShown(PAGE), [query, sort, filter]);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setConfirming(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, busy]);

  const totals = useMemo(() => {
    const all = items ?? [];
    return {
      count: all.length,
      bytes: all.reduce((sum, item) => sum + item.size, 0),
      visibleBytes: visible.reduce((sum, item) => sum + item.size, 0),
    };
  }, [items, visible]);

  const byKey = useMemo(() => new Map((items ?? []).map((item) => [item.key, item])), [items]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((current) => {
      const allPicked = visible.every((item) => current.has(item.key));
      const next = new Set(current);
      for (const item of visible) {
        if (allPicked) next.delete(item.key);
        else next.add(item.key);
      }
      return next;
    });
  }

  async function confirmDelete() {
    if (!confirming) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ deleted: number }>("/api/admin/media", {
        method: "DELETE",
        body: JSON.stringify({ keys: confirming }),
      });
      const gone = new Set(confirming);
      setItems((current) => current?.filter((item) => !gone.has(item.key)) ?? current);
      setSelected((current) => new Set([...current].filter((key) => !gone.has(key))));
      setNotice(`Deleted ${result.deleted} file${result.deleted === 1 ? "" : "s"}.`);
      setConfirming(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) {
    return (
      <div className="recordings-portal media-admin">
        <div className="portal-loading">
          <Loader2 size={28} className="animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (!user?.canManageMedia) {
    return (
      <div className="recordings-portal media-admin">
        <div className="portal-card portal-empty">
          <h2>{user ? "Admins only" : "Sign in first"}</h2>
          <p>
            {user
              ? "This panel is only for media admins."
              : "Sign in to Hoffle, then open this page again."}
          </p>
          <a className="portal-btn" href={`${basePath}/`}>
            <ArrowLeft size={15} /> Back to chat
          </a>
        </div>
      </div>
    );
  }

  const confirmItems = (confirming ?? []).map((key) => byKey.get(key)).filter(
    (item): item is MediaItem => Boolean(item),
  );
  const confirmBytes = confirmItems.reduce((sum, item) => sum + item.size, 0);
  const confirmUsed = confirmItems.filter((item) => item.refs.length > 0);
  const allVisiblePicked = visible.length > 0 && visible.every((item) => selected.has(item.key));

  return (
    <div className="recordings-portal media-admin">
      <header className="portal-head">
        <div className="portal-title">
          <ImageIcon size={26} />
          <div>
            <h1>Media admin</h1>
            <span>
              {totals.count} files · {formatBytes(totals.bytes)} stored
            </span>
          </div>
        </div>
        <div className="portal-actions">
          <a className="portal-btn" href={`${basePath}/`}>
            <ArrowLeft size={15} /> Chat
          </a>
          <button className="portal-btn" onClick={() => void load()} disabled={loading}>
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

      <div className="portal-card media-admin-toolbar">
        <label className="media-admin-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            placeholder="Search by file name, uploader or channel…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search media"
          />
        </label>
        <label className="media-admin-sort">
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="media-admin-filters" role="group" aria-label="File type">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`media-admin-chip ${filter === option.id ? "active" : ""}`}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="media-admin-bar">
        <span>
          {visible.length} shown · {formatBytes(totals.visibleBytes)}
        </span>
        <div className="media-admin-bar-actions">
          <button className="portal-btn" type="button" onClick={selectAllVisible} disabled={!visible.length}>
            <Check size={15} /> {allVisiblePicked ? "Unselect shown" : "Select shown"}
          </button>
          <button
            className="portal-btn danger"
            type="button"
            disabled={selected.size === 0}
            onClick={() => setConfirming([...selected])}
          >
            <Trash2 size={15} /> Delete selected{selected.size ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>

      {items === null ? (
        <div className="portal-loading">
          <Loader2 size={28} className="animate-spin" /> Loading files…
        </div>
      ) : visible.length === 0 ? (
        <div className="portal-card portal-empty">
          <h2>Nothing here</h2>
          <p>No files match this search.</p>
        </div>
      ) : (
        <>
          <ul className="media-admin-grid">
            {visible.slice(0, shown).map((item) => {
              const picked = selected.has(item.key);
              return (
                <li key={item.key} className={`portal-card media-admin-card ${picked ? "picked" : ""}`}>
                  <button
                    type="button"
                    className="media-admin-thumb"
                    onClick={() => toggle(item.key)}
                    aria-pressed={picked}
                    aria-label={`${picked ? "Unselect" : "Select"} ${item.name}`}
                  >
                    <Preview item={item} />
                    <span className="media-admin-check" aria-hidden>
                      {picked && <Check size={14} />}
                    </span>
                    <span className="media-admin-size">{formatBytes(item.size)}</span>
                  </button>
                  <div className="media-admin-meta">
                    <strong title={item.name}>{item.name}</strong>
                    <span>
                      {formatDate(item.uploaded)}
                      {item.uploaderName ? ` · ${item.uploaderName}` : ""}
                    </span>
                    <span className={`media-admin-usage ${item.refs.length || item.note ? "" : "unused"}`} title={item.refs.map((ref) => ref.label).join("\n")}>
                      {usageSummary(item)}
                    </span>
                  </div>
                  <div className="media-admin-card-actions">
                    <a className="portal-btn" href={fileUrl(item.key)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} /> Open
                    </a>
                    <button className="portal-btn danger" type="button" onClick={() => setConfirming([item.key])}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {shown < visible.length && (
            <div className="media-admin-more">
              <button className="portal-btn" type="button" onClick={() => setShown((count) => count + PAGE)}>
                Show more ({visible.length - shown} left)
              </button>
            </div>
          )}
        </>
      )}

      {confirming && (
        <div className="media-admin-modal" role="dialog" aria-modal="true" aria-labelledby="media-admin-confirm-title">
          <div className="portal-card media-admin-dialog">
            <h2 id="media-admin-confirm-title">
              Delete {confirmItems.length} file{confirmItems.length === 1 ? "" : "s"}?
            </h2>
            <p>
              {formatBytes(confirmBytes)} will be removed for good. This can't be undone.
            </p>
            {confirmUsed.length > 0 && (
              <div className="media-admin-warning">
                <strong>Still in use:</strong>
                <ul>
                  {confirmUsed.slice(0, 6).map((item) => (
                    <li key={item.key}>
                      <span>{item.name}</span> — {usageSummary(item)}
                    </li>
                  ))}
                  {confirmUsed.length > 6 && <li>…and {confirmUsed.length - 6} more</li>}
                </ul>
                <p>
                  Messages lose the attachment, avatars, banners and icons go back to the
                  default, and emojis, stickers and sounds using it are removed.
                </p>
              </div>
            )}
            <div className="media-admin-dialog-actions">
              <button className="portal-btn" type="button" onClick={() => setConfirming(null)} disabled={busy}>
                Cancel
              </button>
              <button className="portal-btn primary danger-fill" type="button" onClick={() => void confirmDelete()} disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
