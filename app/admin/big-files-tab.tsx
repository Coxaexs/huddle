"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import type { AdminUser } from "@/lib/admin";
import type { AdminBigUpload } from "@/lib/big-uploads";
import { describeBigUploadExpiry } from "@/lib/big-upload-key";
import { apiFetch } from "../lib/client";
import type { ConfirmRequest } from "./admin-tools";

interface BigFilesData {
  allowed: string[];
  /** Instance admins (site admins and ADMIN_IDS), who always may. */
  admins: string[];
  files: AdminBigUpload[];
  used: number;
  budget: number;
  maxBytes: number;
  connected?: boolean;
}

function size(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes % 1024 ** 3 ? 2 : 0)} GB`;
  if (!bytes) return "0 MB";
  return `${Math.max(0.1, bytes / 1024 ** 2).toFixed(bytes >= 10 * 1024 ** 2 ? 0 : 1)} MB`;
}

/**
 * Who may send files up to 2 GB (deleted 12 hours after upload), and the big
 * files alive right now. Instance admins always may.
 */
export function BigFilesTab({ users, confirm }: { users: AdminUser[]; confirm: (request: ConfirmRequest) => void }) {
  const [data, setData] = useState<BigFilesData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<BigFilesData>("/api/admin/big-files"));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load big files.");
    }
  }, []);

  // `users` changes when the panel's own Refresh reloads, so this follows it.
  useEffect(() => {
    void load();
  }, [load, users]);

  const allowed = useMemo(() => new Set(data?.allowed || []), [data]);
  const admins = useMemo(() => new Set(data?.admins || []), [data]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users
      .filter(
        (user) =>
          !needle || user.username.toLowerCase().includes(needle) || user.displayName.toLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          Number(allowed.has(b.id) || admins.has(b.id)) - Number(allowed.has(a.id) || admins.has(a.id)) ||
          a.displayName.localeCompare(b.displayName),
      );
  }, [users, query, allowed, admins]);

  async function toggle(user: AdminUser, on: boolean) {
    setBusy(user.id);
    try {
      setData(
        await apiFetch<BigFilesData>("/api/admin/big-files", {
          method: "POST",
          body: JSON.stringify({ userId: user.id, allowed: on }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change that.");
    } finally {
      setBusy("");
    }
  }

  function remove(file: AdminBigUpload) {
    confirm({
      title: `Delete ${file.name} now?`,
      body: <p>It was sent by {file.uploader} and would be deleted {describeBigUploadExpiry(file.expiresAt).replace("deleted ", "")} anyway. The message stays, with a dead link.</p>,
      confirmLabel: "Delete file",
      onConfirm: async () => {
        setData(
          await apiFetch<BigFilesData>("/api/admin/big-files", {
            method: "DELETE",
            body: JSON.stringify({ key: file.key }),
          }),
        );
      },
    });
  }

  if (!data) {
    return (
      <section className="portal-card admin-section">
        {error ? <p className="portal-notice error" role="alert">{error}</p> : <Loader2 size={20} className="animate-spin" />}
      </section>
    );
  }

  const percent = Math.min(100, Math.round((data.used / data.budget) * 100));
  return (
    <>
      <section className="portal-card admin-section">
        <h2>Big files</h2>
        <p className="admin-muted">
          People switched on below can send files up to {size(data.maxBytes)} in chat (everyone else stops at 40 MB).
          Each one is deleted 12 hours after it was sent. Admins can always send them.
        </p>
        {data.connected === false && <p className="portal-notice error" role="alert">The BIG_UPLOADS bucket is not bound, so nobody can send big files.</p>}
        <div className="admin-meter" role="meter" aria-valuemin={0} aria-valuemax={data.budget} aria-valuenow={data.used} aria-label="Big-file storage used">
          <span style={{ width: `${percent}%` }} className={percent > 85 ? "warn" : ""} />
        </div>
        <p className="admin-muted">
          {size(data.used)} of {size(data.budget)} in use · {data.files.length} file{data.files.length === 1 ? "" : "s"}.
          {" "}An upload that would go over this is refused until older files expire (BIG_UPLOAD_BUDGET_MB).
        </p>
        {error && <p className="portal-notice error" role="alert">{error}</p>}
      </section>

      <section className="portal-card admin-section">
        <div className="admin-toolbar">
          <h2>Files alive now</h2>
          <button className="portal-btn admin-small" type="button" onClick={() => void load()}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        {data.files.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>From</th>
                  <th>Size</th>
                  <th>Deleted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.files.map((file) => (
                  <tr key={file.key}>
                    <td>
                      <strong>{file.name}</strong>
                      {!file.done && <span className="admin-badge warn">uploading</span>}
                    </td>
                    <td>{file.uploader}</td>
                    <td>{size(file.size)}</td>
                    <td>{describeBigUploadExpiry(file.expiresAt).replace("deleted ", "")}</td>
                    <td>
                      <button className="portal-btn danger admin-small" type="button" onClick={() => remove(file)}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-muted">No big files right now.</p>
        )}
      </section>

      <section className="portal-card admin-section">
        <h2>Who can send them</h2>
        <div className="admin-toolbar">
          <label className="admin-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search people…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search people"
            />
          </label>
        </div>
        <ul className="admin-features">
          {shown.map((user) => {
            const admin = admins.has(user.id);
            const on = admin || allowed.has(user.id);
            return (
              <li key={user.id}>
                <span>
                  <strong>{user.displayName}</strong> <span className="admin-muted">@{user.username}</span>
                  {admin && <span className="admin-badge">admin, always on</span>}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`2 GB files for ${user.displayName} ${on ? "on" : "off"}`}
                  className={`admin-switch ${on ? "on" : ""}`}
                  disabled={admin || busy === user.id}
                  onClick={() => void toggle(user, !on)}
                >
                  <span />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
