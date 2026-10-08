"use client";

/** The square icon button used across the chat shell's headers. */

import type { ReactNode } from "react";

export function Icon({
  children,
  label,
  onClick,
  active,
  badge,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  /** A small count in the corner, hidden when zero. */
  badge?: number;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
      {badge ? <span className="icon-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}
