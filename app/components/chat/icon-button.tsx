"use client";

/** The square icon button used across the chat shell's headers. */

import type { ReactNode } from "react";
import type { ToolbarItemProps } from "../widgets/toolbar";

export function Icon({
  children,
  label,
  onClick,
  active,
  badge,
  tb,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  /** A small count in the corner, hidden when zero. */
  badge?: number;
  /** Its place in a customizable toolbar (widgets/toolbar.tsx). */
  tb?: ToolbarItemProps;
}) {
  return (
    <button
      type="button"
      {...tb}
      className={`icon-button ${active ? "active" : ""} ${tb?.className ?? ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
      {badge ? <span className="icon-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}
