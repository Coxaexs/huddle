"use client";

import { useEffect, useState, type ReactNode } from "react";
import { proxiedImage } from "@/app/lib/image-proxy";
import type { WidgetSize } from "@/lib/layout-prefs";

/**
 * What the built-in widgets share, so they all read like the music widget:
 * a rounded tile, a bold title over a small line, and then whatever the widget
 * is for. They use its .mw classes on purpose.
 */

export function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Redraws once a second while something moves. */
export function useTicking(active: boolean, every = 1000): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick((n) => n + 1), every);
    return () => clearInterval(timer);
  }, [active, every]);
}

/** A picture, or an icon on the same tile when there is none. */
export function Tile({ image, children }: { image?: string | null; children?: ReactNode }) {
  return image ? (
    <img className="mw-art" src={proxiedImage(image)} alt="" loading="lazy" />
  ) : (
    <span className="mw-art mw-art-empty" aria-hidden="true">{children}</span>
  );
}

/**
 * The frame of a widget. Small is one line: tile, title, and `right`. Medium
 * and large are the same head with `children` below; `bigTile` gives large the
 * music widget's big art, for widgets about one thing.
 */
export function Shell({
  size,
  tile,
  title,
  subtitle,
  right,
  note,
  bar,
  bigTile,
  children,
}: {
  size: WidgetSize;
  tile: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  note?: string | null;
  /** A progress bar: under the head, or along the bottom edge at small size. */
  bar?: ReactNode;
  bigTile?: boolean;
  children?: ReactNode;
}) {
  if (size === "small") {
    return (
      <div className="mw mw-small">
        {tile}
        <span className="mw-line">
          <strong>{title}</strong>
          {note ? <small role="status">{note}</small> : subtitle ? <small>{subtitle}</small> : null}
        </span>
        {right}
        {bar}
      </div>
    );
  }
  return (
    <div className={`mw mw-${size === "large" && bigTile ? "large" : "medium"}`}>
      <div className="mw-top">
        {tile}
        <span className="mw-text">
          <strong>{title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
        {right}
      </div>
      {bar}
      {children}
      {note && <p className="mw-note" role="status">{note}</p>}
    </div>
  );
}

/** The music widget's thin bar, with the times under it. */
export function Progress({ position, duration }: { position: number; duration: number }) {
  const percent = duration ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <span className="mw-progress" aria-hidden="true">
      <span style={{ width: `${percent}%` }} />
      <small>{clock(position)}</small>
      <small>{clock(duration)}</small>
    </span>
  );
}

/** The same bar with no times, for where they will not fit. */
export function ThinBar({ percent, edge }: { percent: number; edge?: boolean }) {
  return (
    <span className={edge ? "xw-edge-bar" : "xw-row-bar"} aria-hidden="true">
      <span style={{ width: `${percent}%` }} />
    </span>
  );
}

/** One line of a list: a thumbnail, two lines of text, and what sits at the end. */
export function Row({
  thumb,
  title,
  subtitle,
  bar,
  end,
  current,
  onClick,
  label,
}: {
  thumb?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  bar?: ReactNode;
  end?: ReactNode;
  current?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const body = (
    <>
      {thumb}
      <span className="xw-item-text">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
        {bar}
      </span>
    </>
  );
  return (
    <li className={`xw-item ${current ? "is-current" : ""}`}>
      {onClick ? (
        <button type="button" className="xw-item-main" onClick={onClick} title={label} aria-label={label}>{body}</button>
      ) : (
        <div className="xw-item-main">{body}</div>
      )}
      {end ? <span className="xw-item-end">{end}</span> : null}
    </li>
  );
}

/** A small square picture in a row, or a letter or icon in its place. */
export function Thumb({ image, children }: { image?: string | null; children?: ReactNode }) {
  return image ? (
    <img className="xw-thumb" src={proxiedImage(image)} alt="" loading="lazy" />
  ) : (
    <span className="xw-thumb" aria-hidden="true">{children}</span>
  );
}
