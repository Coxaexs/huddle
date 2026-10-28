"use client";

import { useState, type DragEvent } from "react";
import { GripVertical, X } from "lucide-react";
import { useI18n } from "@/app/lib/i18n-context";
import {
  armWidget,
  setLayout,
  useArmedWidget,
  useCustomizing,
  useLayoutPrefs,
} from "@/app/lib/layout-store";
import { pickWidget, useServerWidgets } from "@/app/lib/widget-store";
import {
  AREA_SIZES,
  MAX_PER_AREA,
  WIDGET_SIZES,
  fitSize,
  placeWidget,
  removeWidget,
  resizeWidget,
  type WidgetArea as Area,
  type WidgetSize,
} from "@/lib/layout-prefs";
import { BotWidget } from "./bot-widget";
import { MusicWidget } from "./music-widget";
import { MUSIC_ENTRY, useWidgetHost } from "./widget-host";

export const WIDGET_DRAG_TYPE = "application/x-hoffle-widget";

/** The sizes a widget offers, from its bot (or all three for built-ins). */
export function readDraggedWidget(event: DragEvent): { id: string; sizes: WidgetSize[] } | null {
  const raw = event.dataTransfer.getData(WIDGET_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string; sizes?: WidgetSize[] };
    return parsed.id ? { id: parsed.id, sizes: parsed.sizes?.length ? parsed.sizes : WIDGET_SIZES } : null;
  } catch {
    return null;
  }
}

/**
 * One place widgets can go. Normally it is just the widgets placed here (and
 * nothing at all when there are none, so the default layout is untouched).
 * In Customize mode it becomes a labelled drop zone, and each widget gets a
 * handle, size buttons and a remove button.
 */
export function WidgetArea({ area }: { area: Area }) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const layout = useLayoutPrefs();
  const customizing = useCustomizing();
  const armed = useArmedWidget();
  const serverWidgets = useServerWidgets(host.serverId);
  const [over, setOver] = useState(false);

  const placed = layout.widgets.filter((widget) => widget.area === area);
  if (!customizing && !placed.length) return null;

  const offeredSizes = (id: string): readonly WidgetSize[] => {
    if (id === MUSIC_ENTRY.id) return MUSIC_ENTRY.sizes;
    return serverWidgets.find((widget) => widget.key === id)?.sizes ?? WIDGET_SIZES;
  };
  const full = placed.length >= MAX_PER_AREA;
  const accepts = (id: string, sizes: readonly WidgetSize[]) =>
    Boolean(fitSize(area, "medium", sizes)) && (!full || placed.some((widget) => widget.id === id));

  const drop = (event: DragEvent, before: string | null) => {
    const dragged = readDraggedWidget(event);
    setOver(false);
    if (!dragged || !accepts(dragged.id, dragged.sizes)) return;
    event.preventDefault();
    event.stopPropagation();
    if (dragged.id === before) return;
    setLayout((current) => placeWidget(current, dragged.id, area, { before, offered: dragged.sizes }));
    armWidget(null);
  };

  const rendered = placed.map((placement) => {
    let body: React.ReactNode = null;
    let name = placement.id;
    if (placement.id === MUSIC_ENTRY.id) {
      name = t("widget.music");
      body = <MusicWidget size={placement.size} area={area} />;
    } else {
      const widget = pickWidget(serverWidgets, placement.id, [host.voiceChannelId, host.activeChannelId]);
      if (widget) {
        name = widget.title;
        body = <BotWidget widget={widget} size={placement.size} />;
      } else if (customizing) {
        name = placement.id.split(":")[2] || placement.id;
        body = <p className="widget-missing">{t("widget.notHere", { name })}</p>;
      }
    }
    if (!body) return null;
    if (!customizing) {
      return (
        <div key={placement.id} className={`widget widget-${placement.size}`} data-widget={placement.id}>
          {body}
        </div>
      );
    }
    const sizes = AREA_SIZES[area].filter((size) => offeredSizes(placement.id).includes(size));
    return (
      <div
        key={placement.id}
        className={`widget widget-${placement.size} widget-editing`}
        data-widget={placement.id}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(
            WIDGET_DRAG_TYPE,
            JSON.stringify({ id: placement.id, sizes: offeredSizes(placement.id) }),
          );
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(WIDGET_DRAG_TYPE)) event.preventDefault();
        }}
        onDrop={(event) => drop(event, placement.id)}
      >
        <div className="widget-edit-bar">
          <GripVertical size={13} className="widget-grip" aria-hidden="true" />
          <span className="widget-edit-name">{name}</span>
          {sizes.length > 1 &&
            sizes.map((size) => (
              <button
                type="button"
                key={size}
                className={`widget-size-btn ${placement.size === size ? "active" : ""}`}
                aria-pressed={placement.size === size}
                title={t("customize.sizeLabel", { size: t(`customize.size.${size}`) })}
                onClick={() => setLayout((current) => resizeWidget(current, placement.id, size, offeredSizes(placement.id)))}
              >
                {t(`customize.size.${size}`)}
              </button>
            ))}
          <button
            type="button"
            className="widget-remove-btn"
            aria-label={t("customize.remove", { name })}
            title={t("customize.remove", { name })}
            onClick={() => setLayout((current) => removeWidget(current, placement.id))}
          >
            <X size={13} />
          </button>
        </div>
        <div className="widget-edit-body" inert>
          {body}
        </div>
      </div>
    );
  });

  if (!customizing) return <div className={`widget-area widget-area-${area}`}>{rendered}</div>;

  // In a channel strip "top" and "bottom" of the list are its start and end.
  const strip = (layout.channels === "top" || layout.channels === "bottom") && area.startsWith("sidebar-");
  const label = strip ? t(`area.${area as "sidebar-top" | "sidebar-bottom"}.strip`) : t(`area.${area}`);
  const armedSizes = armed ? offeredSizes(armed) : null;
  const canTake = armed ? accepts(armed, armedSizes!) : false;
  return (
    <div
      className={`widget-area widget-area-${area} widget-zone ${over ? "is-over" : ""} ${armed ? (canTake ? "can-take" : "cannot-take") : ""}`}
      data-area-label={label}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(WIDGET_DRAG_TYPE)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(event) => drop(event, null)}
      onClick={() => {
        if (!armed || !canTake) return;
        setLayout((current) => placeWidget(current, armed, area, { offered: armedSizes! }));
        armWidget(null);
      }}
    >
      <span className="widget-zone-label">
        {label}
        {full && <em> · {t("customize.full")}</em>}
      </span>
      {rendered}
    </div>
  );
}
