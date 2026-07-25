"use client";

import type { CSSProperties, MouseEvent } from "react";

interface AvatarProps {
  avatar: string;
  avatarUrl?: string | null;
  color: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  onContextMenu?: (event: MouseEvent) => void;
  onClick?: (event: MouseEvent) => void;
  children?: React.ReactNode;
}

/**
 * One avatar for the whole app: an uploaded picture when there is one, the
 * coloured letter tile when there is not.
 */
export function Avatar({
  avatar,
  avatarUrl,
  color,
  className = "",
  style,
  title,
  onContextMenu,
  onClick,
  children,
}: AvatarProps) {
  return (
    <span
      className={`${className} ${avatarUrl ? "has-picture" : ""}`.trim()}
      style={{ background: avatarUrl ? undefined : color, ...style }}
      title={title}
      onContextMenu={onContextMenu}
      onClick={onClick}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="avatar-image" />
      ) : (
        avatar
      )}
      {children}
    </span>
  );
}
