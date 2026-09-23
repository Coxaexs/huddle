"use client";

import { useEffect, useRef, useState } from "react";
import { History, X } from "lucide-react";
import { apiFetch } from "../lib/client";

interface Version {
  content: string;
  at: string | null;
}

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

/** Every version of an edited message, oldest first, with the current one last. */
export function EditHistoryDialog({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [current, setCurrent] = useState<Version | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ versions: Version[]; current: Version }>(
      `/api/messages/${encodeURIComponent(messageId)}/edits`,
    )
      .then((data) => {
        if (cancelled) return;
        setVersions(data.versions);
        setCurrent(data.current);
      })
      .catch((failure) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Could not load the history.");
      });
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="edit-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-history-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="edit-history-title">
            <History size={16} /> Edit history
          </h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {error && <p className="edit-history-empty">{error}</p>}
        {!error && versions === null && <p className="edit-history-empty">Loading…</p>}
        {!error && versions !== null && (
          <ol className="edit-history-list">
            {versions.length === 0 && (
              <li className="edit-history-empty">
                This was edited before Huddle kept history, so the earlier text is gone.
              </li>
            )}
            {versions.map((version, index) => (
              <li key={`${version.at}-${index}`}>
                <span className="edit-history-when">
                  {index === 0 ? "Original" : `Edit ${index}`} · {when(version.at)}
                </span>
                <p>{version.content || <em>(no text)</em>}</p>
              </li>
            ))}
            {current && (
              <li className="edit-history-current">
                <span className="edit-history-when">Now · {when(current.at)}</span>
                <p>{current.content || <em>(no text)</em>}</p>
              </li>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
