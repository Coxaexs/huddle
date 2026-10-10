"use client";

import { Crown, Shield, ShieldCheck } from "lucide-react";
import type { MemberTagInfo } from "@/lib/permissions";

interface MemberTagProps {
  tag: MemberTagInfo | null | undefined;
  size?: "small" | "normal";
  className?: string;
}

export function MemberTag({ tag, size = "normal", className = "" }: MemberTagProps) {
  if (!tag) return null;

  return (
    <span
      className={`member-badge-tag member-badge-${tag.type} ${size === "small" ? "member-badge-sm" : ""} ${className}`.trim()}
      style={tag.color ? { borderColor: `${tag.color}55`, color: tag.color } : undefined}
      title={`${tag.label} · Server Role`}
      aria-label={`Role: ${tag.label}`}
    >
      {tag.icon === "crown" && <Crown size={size === "small" ? 10 : 11} className="badge-icon" />}
      {tag.icon === "shield" && <Shield size={size === "small" ? 10 : 11} className="badge-icon" />}
      {tag.icon === "mod" && <ShieldCheck size={size === "small" ? 10 : 11} className="badge-icon" />}
      <span className="badge-text">{tag.label.toUpperCase()}</span>
    </span>
  );
}
