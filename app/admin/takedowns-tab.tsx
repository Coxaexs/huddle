"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicTakedown } from "@/lib/takedowns";
import { apiFetch } from "../lib/client";
import type { ConfirmRequest } from "./admin-tools";

const SOURCE: Record<string, string> = { "order-mail": "From an order by mail", admin: "Taken down by hand" };

/**
 * What was taken down under a legal order, and the way back. It shows text and
 * file names only: the files themselves may be illegal to look at.
 */
export function TakedownsTab({ confirm }: { confirm: (request: ConfirmRequest) => void }) {
  const [items, setItems] = useState<PublicTakedown[] | null>(null);
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems((await apiFetch<{ takedowns: PublicTakedown[] }>("/api/admin/takedowns")).takedowns);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Takedowns could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function takeDownLink() {
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ down: number; already: number; unmatched: number }>("/api/admin/takedowns", {
        method: "POST",
        body: JSON.stringify({ links: link.split(/\s+/).filter(Boolean) }),
      });
      setNotice(
        result.down
          ? `Taken down: ${result.down}.`
          : result.already
            ? "That is already down."
            : "That link is not a message or file on this Hoffle. Use Copy Message Link, or the file's link.",
      );
      setLink("");
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That did not work.");
    }
  }

  const act = (id: string, action: "restore" | "erase") => async () => {
    await apiFetch(`/api/admin/takedowns/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action }) });
    await load();
  };

  const open = items?.filter((item) => item.status === "down").length ?? 0;
  return (
    <section className="admin-section">
      <h2 className="text-sm font-semibold">Takedowns{open ? ` (${open} down)` : ""}</h2>
      <p className="text-xs opacity-70">
        Content removed under a legal order. It is hidden and its files are blocked for everyone, but nothing is gone
        until you say so. Pictures are never shown here, because they may be illegal to look at.
      </p>

      <div className="flex flex-wrap items-center gap-2 pt-3">
        <input
          className="discord-input text-xs py-1.5 px-2.5 flex-1"
          style={{ minWidth: 240 }}
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="Paste a link to a message or file"
          aria-label="Link to take down"
        />
        <button type="button" className="discord-btn danger-btn" disabled={!link.trim()} onClick={() => void takeDownLink()}>
          Take down
        </button>
      </div>
      {notice && <p className="admin-muted">{notice}</p>}
      {error && <p className="admin-muted">{error}</p>}

      {!items ? null : !items.length ? (
        <p className="admin-muted">Nothing has been taken down.</p>
      ) : (
        <ul className="admin-messages">
          {items.map((item) => (
            <li key={item.id}>
              <p className="text-xs opacity-70">
                {new Date(item.createdAt).toLocaleString()} · {item.where} · {item.author} ·{" "}
                {item.status === "down" ? "Down" : item.status === "restored" ? "Restored" : "Deleted for good"}
              </p>
              {item.text && <p>{item.text}</p>}
              {item.files.length > 0 && <p className="text-xs opacity-70">Files: {item.files.join(", ")}</p>}
              <p className="text-xs opacity-70">
                {SOURCE[item.source] || item.source}
                {item.sourceDetail ? ` · ${item.sourceDetail}` : ""}
              </p>
              {item.status === "down" && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    className="discord-btn secondary-gray"
                    onClick={() =>
                      confirm({
                        title: "Restore this?",
                        body:
                          item.source === "order-mail"
                            ? "Only if the order was fake or a mistake, or ATKM withdrew it or you won an objection. Putting back content from a real order breaks the order, and objecting does not pause it."
                            : "It goes back where it was, for everyone. Open channels show it after a reload.",
                        confirmLabel: "Restore",
                        onConfirm: act(item.id, "restore"),
                      })
                    }
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="discord-btn danger-btn"
                    onClick={() =>
                      confirm({
                        title: "Delete this for good?",
                        body: "The message and its files are destroyed and cannot come back. Removed terrorist content has to be kept for 6 months, so do not use this on it until then.",
                        typeToConfirm: "DELETE",
                        confirmLabel: "Delete for good",
                        danger: true,
                        onConfirm: act(item.id, "erase"),
                      })
                    }
                  >
                    Delete for good
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
