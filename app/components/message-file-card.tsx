"use client";

import {
  getFileBadgeColor,
  getFileDescription,
  getFileExtensionBadge,
} from "@/lib/upload-sniff";

export interface MessageFileItem {
  url: string;
  name: string;
  type?: string;
}

export function MessageAttachmentFiles({
  files,
  onPdf,
}: {
  files?: MessageFileItem[] | MessageFileItem | null;
  onPdf?: (pdf: { url: string; name: string }) => void;
}) {
  const list = Array.isArray(files) ? files : files ? [files] : [];
  if (!list.length) return null;

  return (
    <>
      {list.map((f, idx) => {
        const isPdf = f.type === "pdf" || f.name.toLowerCase().endsWith(".pdf");
        const badge = getFileExtensionBadge(f.name);
        const colorClass = getFileBadgeColor(f.name);

        if (isPdf) {
          return (
            <button
              key={f.url || idx}
              type="button"
              className="message-file-card"
              onClick={() => onPdf?.({ url: f.url, name: f.name })}
            >
              <span className={`message-file-icon file-badge-${colorClass}`}>PDF</span>
              <span>
                <strong>{f.name}</strong>
                <small>PDF document · view and fill in Huddle</small>
              </span>
              <b aria-hidden="true">Open</b>
            </button>
          );
        }

        return (
          <a
            key={f.url || idx}
            href={f.url}
            download={f.name}
            className="message-file-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className={`message-file-icon file-badge-${colorClass}`}>{badge}</span>
            <span>
              <strong>{f.name}</strong>
              <small>{getFileDescription(f.name)}</small>
            </span>
            <b aria-hidden="true">Download</b>
          </a>
        );
      })}
    </>
  );
}
