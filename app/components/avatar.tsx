"use client";

import type { CSSProperties, MouseEvent } from "react";

interface AvatarProps {
  avatar: string;
  avatarUrl?: string | null;
  color: string;
  name?: string;
  size?: number;
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
  size,
  className = "",
  style,
  title,
  onContextMenu,
  onClick,
  children,
}: AvatarProps) {
  const sizeStyle: CSSProperties = size
    ? {
      overflow: "visible",
      width: `${size}px`,
      height: `${size}px`,
      minWidth: `${size}px`,
      minHeight: `${size}px`,
      borderRadius: "50%",
      aspectRatio: 1 / 1,
      display: "inline-grid",
      placeItems: "center",
      fontSize: `${Math.max(10, Math.round(size * 0.42))}px`,
    }
    : {};

  const baseClass = className || "avatar";

  return (
    <span
      className={`${baseClass} ${avatarUrl ? "has-picture" : ""}`.trim()}
      style={{
        background: avatarUrl ? undefined : color,
        ...sizeStyle,
        ...style,
      }}
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
