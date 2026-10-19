"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { StyledText } from "../message-body";
import { type DmSummary } from "../../lib/chat/types";
import { useI18n } from "@/app/lib/i18n-context";

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
  const { t } = useI18n();
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
        <span>{t("sidebar.groupMembers", { count: target.dm.group?.members.length ?? 0 })}</span>
      </div>
      <button type="button" role="menuitem" onClick={onTogglePin}>
        {target.dm.pinned ? t("groupDmMenu.unpin") : t("groupDmMenu.pin")}
      </button>
      <button type="button" role="menuitem" onClick={onRename}>
        {t("groupDmMenu.rename")}
      </button>
      <button type="button" role="menuitem" onClick={onAddMembers}>
        {t("groupDmMenu.addMembers")}
      </button>
      <button type="button" role="menuitem" className="danger" onClick={onLeave}>
        {t("groupDmMenu.leave")}
      </button>
      <button type="button" role="menuitem" onClick={onCloseDm}>
        {t("groupDmMenu.closeConversation")}
      </button>
    </div>
  );
}