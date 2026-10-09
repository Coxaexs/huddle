import type { CaptionLine } from "../hooks/use-live-captions";

/** The caption strip over a voice room: one line per person speaking. */
export function LiveCaptionsOverlay({ lines }: { lines: CaptionLine[] }) {
  if (!lines.length) return null;
  return (
    <div className="live-captions" aria-live="polite" aria-label="Live captions">
      {lines.map((line) => (
        <p key={line.connectionId} className={`live-caption ${line.final ? "" : "interim"}`}>
          <strong>{line.name}</strong> {line.text}
        </p>
      ))}
    </div>
  );
}
