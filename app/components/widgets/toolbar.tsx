"use client";

import { useMemo, type CSSProperties, type DragEvent, type ReactNode } from "react";
import {
  Armchair, AtSign, Award, Bookmark, Crown, ExternalLink, Film, Gamepad2, Headphones, LayoutGrid, Maximize2,
  Megaphone, MessageCircleQuestionMark, Mic, Monitor, MoreHorizontal, PhoneOff, Pin, Search,
  SlidersHorizontal, Smile, Sparkles, Type, UserPlus, Users, Video, Vote,
} from "lucide-react";
import { useI18n } from "@/app/lib/i18n-context";
import { setLayout, useCustomizing, useLayoutPrefs } from "@/app/lib/layout-store";
import {
  TOOLBARS,
  moveToolbarItem,
  resetToolbar,
  setToolbarItemHidden,
  toolbarState,
  type ToolbarId,
} from "@/lib/layout-prefs";

const isSeparator = (item: string) => /^sep\d$/.test(item);

/** One drag type per toolbar, so a bar can tell during dragover whether a drop is its own. */
export const toolbarDragType = (toolbar: ToolbarId) => `application/x-hoffle-tb-${toolbar}`;
const DRAG_PREFIX = "application/x-hoffle-tb-";

export function draggedToolbarItem(event: DragEvent): { toolbar: ToolbarId; item: string } | null {
  const type = event.dataTransfer.types.find((entry) => entry.startsWith(DRAG_PREFIX));
  if (!type) return null;
  try {
    const parsed = JSON.parse(event.dataTransfer.getData(type)) as { toolbar?: ToolbarId; item?: string };
    return parsed.toolbar && parsed.item ? { toolbar: parsed.toolbar, item: parsed.item } : null;
  } catch {
    return null;
  }
}

export function isToolbarDrag(event: DragEvent, toolbar?: ToolbarId): boolean {
  return event.dataTransfer.types.some((type) =>
    toolbar ? type === toolbarDragType(toolbar) : type.startsWith(DRAG_PREFIX),
  );
}

/** Before or after the item under the pointer, along the bar's direction. */
function dropSide(event: DragEvent<HTMLElement>): "before" | "after" {
  const element = event.currentTarget;
  const box = element.getBoundingClientRect();
  const parent = element.parentElement;
  const vertical = parent ? getComputedStyle(parent).flexDirection.startsWith("column") : false;
  return vertical
    ? event.clientY > box.top + box.height / 2 ? "after" : "before"
    : event.clientX > box.left + box.width / 2 ? "after" : "before";
}

export type ToolbarItemProps = {
  "data-tb": string;
  className?: string;
  style: CSSProperties;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  onClickCapture?: (event: React.MouseEvent<HTMLElement>) => void;
};

/**
 * A toolbar's arrangement for its buttons. `item(id, className)` gives each
 * button its place (CSS order, so the markup stays put), hides it when it
 * was hidden, and in Customize mode makes it draggable along the bar with
 * its click switched off. `hidden(id)` tells the overflow menu what to list.
 */
export function useToolbar(toolbar: ToolbarId) {
  const { t } = useI18n();
  const layout = useLayoutPrefs();
  const customizing = useCustomizing();
  const state = useMemo(() => toolbarState(layout, toolbar), [layout, toolbar]);
  // A divider with nothing on one side of it (or another divider) hides too.
  const idleDividers = useMemo(() => {
    const idle = new Set<string>();
    let pending: string | null = null;
    let seenButton = false;
    for (const id of state.order) {
      if (state.hidden.has(id)) continue;
      if (isSeparator(id)) {
        if (!seenButton || pending) idle.add(id);
        else pending = id;
        continue;
      }
      seenButton = true;
      pending = null;
    }
    if (pending) idle.add(pending);
    return idle;
  }, [state]);
  const type = toolbarDragType(toolbar);

  const item = (id: string, className = ""): ToolbarItemProps => {
    const props: ToolbarItemProps = {
      "data-tb": id,
      className: `${className}${state.hidden.has(id) || idleDividers.has(id) ? " tb-off" : ""}`.trim() || undefined,
      style: { "--tb-order": state.order.indexOf(id) + 1 } as CSSProperties,
    };
    if (!customizing) return props;
    return {
      ...props,
      draggable: true,
      onDragStart: (event) => {
        event.stopPropagation();
        event.dataTransfer.setData(type, JSON.stringify({ toolbar, item: id }));
        event.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (event) => {
        if (!event.dataTransfer.types.includes(type)) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.dataset.tbDrop = dropSide(event);
      },
      onDragLeave: (event) => {
        delete event.currentTarget.dataset.tbDrop;
      },
      onDrop: (event) => {
        const side = event.currentTarget.dataset.tbDrop ?? dropSide(event);
        delete event.currentTarget.dataset.tbDrop;
        const dragged = draggedToolbarItem(event);
        if (!dragged || dragged.toolbar !== toolbar) return;
        event.preventDefault();
        event.stopPropagation();
        setLayout((current) => moveToolbarItem(current, toolbar, dragged.item, id, side === "after"));
      },
      onClickCapture: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
    };
  };

  /** The bar itself: a labelled outline in Customize, and dropping on its empty space appends. */
  const bar = () =>
    customizing
      ? {
          "data-tb-bar": t(`tb.${toolbar}`),
          onDragOver: (event: DragEvent<HTMLElement>) => {
            if (event.dataTransfer.types.includes(type)) event.preventDefault();
          },
          onDrop: (event: DragEvent<HTMLElement>) => {
            const dragged = draggedToolbarItem(event);
            if (!dragged || dragged.toolbar !== toolbar) return;
            event.preventDefault();
            setLayout((current) => moveToolbarItem(current, toolbar, dragged.item, null));
          },
        }
      : {};

  return { item, bar, hidden: (id: string) => state.hidden.has(id), customizing };
}

const ICONS: Record<string, ReactNode> = {
  "header:invite": <UserPlus size={15} />,
  "header:search": <Search size={15} />,
  "header:mentions": <AtSign size={15} />,
  "header:pins": <Pin size={15} />,
  "header:saved": <Bookmark size={15} />,
  "header:achievements": <Award size={15} />,
  "header:members": <Users size={15} />,
  "composer:emoji": <Smile size={15} />,
  "composer:gif": <Film size={15} />,
  "composer:format": <Type size={15} />,
  "composer:poll": <Vote size={15} />,
  "composer:games": <Gamepad2 size={15} />,
  "composer:commands": <span className="tb-chip-text">/</span>,
  "call:table": <SlidersHorizontal size={15} />,
  "call:living": <Armchair size={15} />,
  "call:important": <Megaphone size={15} />,
  "call:priority": <Crown size={15} />,
  "call:mute": <Mic size={15} />,
  "call:deafen": <Headphones size={15} />,
  "call:camera": <Video size={15} />,
  "call:screen": <Monitor size={15} />,
  "call:focus": <LayoutGrid size={15} />,
  "call:activities": <Sparkles size={15} />,
  "call:more": <MoreHorizontal size={15} />,
  "call:qa": <MessageCircleQuestionMark size={15} />,
  "call:leave": <PhoneOff size={15} />,
  "call:popout": <ExternalLink size={15} />,
  "call:fullscreen": <Maximize2 size={15} />,
};

/**
 * A toolbar in the Customize tray as a row of chips in its order: drag a
 * chip to move it (here or on the real bar), click it to hide or show it.
 * Works whether or not the bar is on screen (the call bar only is in a call).
 */
export function ToolbarEditor({ toolbar }: { toolbar: ToolbarId }) {
  const { t } = useI18n();
  const layout = useLayoutPrefs();
  const state = toolbarState(layout, toolbar);
  const type = toolbarDragType(toolbar);
  const locked = TOOLBARS[toolbar].locked;
  const changed = Boolean(layout.toolbars[toolbar]);

  return (
    <div className="tb-editor">
      <div className="tb-editor-head">
        <span className="layout-picker-label">{t(`tb.${toolbar}`)}</span>
        {changed && (
          <button type="button" className="tb-editor-reset" onClick={() => setLayout((current) => resetToolbar(current, toolbar))}>
            {t("tb.reset")}
          </button>
        )}
      </div>
      <div
        className="tb-chips"
        role="list"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(type)) event.preventDefault();
        }}
        onDrop={(event) => {
          const dragged = draggedToolbarItem(event);
          if (!dragged || dragged.toolbar !== toolbar) return;
          event.preventDefault();
          setLayout((current) => moveToolbarItem(current, toolbar, dragged.item, null));
        }}
      >
        {state.order.map((item) => {
          const off = state.hidden.has(item);
          const name = isSeparator(item) ? t("tb.separator") : t(`tb.${toolbar}.${item}` as Parameters<typeof t>[0]);
          const fixed = locked.includes(item);
          return (
            <button
              type="button"
              role="listitem"
              key={item}
              className={`tb-chip ${off ? "off" : ""} ${isSeparator(item) ? "sep" : ""}`}
              draggable
              aria-pressed={!off}
              title={fixed ? t("tb.lockedHint", { name }) : off ? t("tb.showHint", { name }) : t("tb.hideHint", { name })}
              onDragStart={(event) => {
                event.dataTransfer.setData(type, JSON.stringify({ toolbar, item }));
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(type)) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.dataset.tbDrop = dropSide(event);
              }}
              onDragLeave={(event) => {
                delete event.currentTarget.dataset.tbDrop;
              }}
              onDrop={(event) => {
                const side = event.currentTarget.dataset.tbDrop ?? dropSide(event);
                delete event.currentTarget.dataset.tbDrop;
                const dragged = draggedToolbarItem(event);
                if (!dragged || dragged.toolbar !== toolbar) return;
                event.preventDefault();
                event.stopPropagation();
                setLayout((current) => moveToolbarItem(current, toolbar, dragged.item, item, side === "after"));
              }}
              onClick={() => {
                if (!fixed) setLayout((current) => setToolbarItemHidden(current, toolbar, item, !off));
              }}
            >
              {isSeparator(item) ? <span className="tb-chip-sep" aria-hidden="true" /> : ICONS[`${toolbar}:${item}`]}
              <span className="tb-chip-name">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
