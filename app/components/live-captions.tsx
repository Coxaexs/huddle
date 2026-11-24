"use client";

import type { CaptionLine } from "../hooks/use-live-captions";
import { useI18n } from "../lib/i18n-context";

/** The caption strip over a voice room: one line per person speaking. */
export function LiveCaptionsOverlay({ lines }: { lines: CaptionLine[] }) {
  const { t } = useI18n();
  if (!lines.length) return null;
  return (
    <div className="live-captions" aria-live="polite" aria-label={t("chat.captions.aria")}>
      {lines.map((line) => (
        <p key={line.connectionId} className={`live-caption ${line.final ? "" : "interim"}`}>
          <strong>{line.name}</strong> {line.text}
        </p>
      ))}
    </div>
  );
}
