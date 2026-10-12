"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { StyledText } from "../message-body";
import { type DmSummary } from "../../lib/chat/types";

export function GroupDmContextMenu({
  target,
  onClose,
  onTogglePin,
  onRename,
  onAddMembers,
  onLeave,
  onCloseDm,
}: {
  target: { dm: DmSummary; x: number; y: number };
  onClose: () => void;
  onTogglePin: () => void;
  onRename: () => void;
  onAddMembers: () => void;
  onLeave: () => void;
  onCloseDm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", dismiss);
      window.addEventListener("contextmenu", dismiss);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("contextmenu", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const [pos, setPos] = useState({ left: target.x, top: target.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 12;
    const { width, height } = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - margin;
    const maxTop = window.innerHeight - height - margin;
    setPos({
      left: Math.max(margin, Math.min(target.x, maxLeft)),
      top: Math.max(margin, target.y > maxTop ? Math.min(target.y - height, maxTop) : target.y),
    });
  }, [target.x, target.y]);

  return (
    <div className="user-menu group-dm-menu" ref={ref} style={pos} role="menu">
      <div className="user-menu-head">
        <strong><StyledText text={target.dm.user.displayName} /></strong>
        <span>{target.dm.group?.members.length} {target.dm.group?.members.length === 1 ? "member" : "members"}</span>
      </div>
      <button type="button" role="menuitem" onClick={onTogglePin}>
        {target.dm.pinned ? "Unpin group" : "Pin group"}
      </button>
      <button type="button" role="menuitem" onClick={onRename}>
        Rename group
      </button>
      <button type="button" role="menuitem" onClick={onAddMembers}>
        Add members
      </button>
      <button type="button" role="menuitem" className="danger" onClick={onLeave}>
        Leave group
      </button>
      <button type="button" role="menuitem" onClick={onCloseDm}>
        Close conversation
      </button>
    </div>
  );
}