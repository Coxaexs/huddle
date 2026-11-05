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
  WIDGET_SIZES,
  fitSize,
  maxInArea,
  moveWidget,
  placeWidget,
  removeWidget,
  resizeWidget,
  type WidgetArea as Area,
  type WidgetSize,
} from "@/lib/layout-prefs";
import { BotWidget } from "./bot-widget";
import { BuiltinWidgetBody } from "./builtin-widgets";
import { builtinWidget, useWidgetHost, widgetAvailable } from "./widget-host";

export const WIDGET_DRAG_TYPE = "application/x-hoffle-widget";

/** What is being dragged: from the tray a new copy, from an area (with a uid) that one. */
export function readDraggedWidget(event: DragEvent): { id: string; uid?: string; sizes: WidgetSize[] } | null {
  const raw = event.dataTransfer.getData(WIDGET_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string; uid?: string; sizes?: WidgetSize[] };
    return parsed.id ? { id: parsed.id, uid: parsed.uid, sizes: parsed.sizes?.length ? parsed.sizes : WIDGET_SIZES } : null;
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
    const builtin = builtinWidget(id);
    if (builtin) return builtin.sizes;
    return serverWidgets.find((widget) => widget.key === id)?.sizes ?? WIDGET_SIZES;
  };
  const full = placed.length >= maxInArea(area);
  const accepts = (sizes: readonly WidgetSize[], uid?: string) =>
    Boolean(fitSize(area, "medium", sizes)) && (!full || placed.some((widget) => widget.uid === uid));

  const drop = (event: DragEvent, before: string | null) => {
    const dragged = readDraggedWidget(event);
    setOver(false);
    if (!dragged || !accepts(dragged.sizes, dragged.uid)) return;
    event.preventDefault();
    event.stopPropagation();
    if (dragged.uid && dragged.uid === before) return;
    setLayout((current) =>
      dragged.uid
        ? moveWidget(current, dragged.uid, area, { before, offered: dragged.sizes })
        : placeWidget(current, dragged.id, area, { before, offered: dragged.sizes }),
    );
    armWidget(null);
  };

  const rendered = placed.map((placement) => {
    let body: React.ReactNode = null;
    let name = placement.id;
    const builtin = builtinWidget(placement.id);
    if (builtin) {
      name = t(builtin.titleKey);
      // Hidden where its bot isn't, the way a bot's own widget is.
      if (widgetAvailable(builtin, host)) {
        body = <BuiltinWidgetBody id={placement.id} size={placement.size} area={area} />;
      } else if (customizing) body = <p className="widget-missing">{t("widget.notHere", { name })}</p>;
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
        <div key={placement.uid} className={`widget widget-${placement.size}`} data-widget={placement.id}>
          {body}
        </div>
      );
    }
    const sizes = AREA_SIZES[area].filter((size) => offeredSizes(placement.id).includes(size));
    return (
      <div
        key={placement.uid}
        className={`widget widget-${placement.size} widget-editing`}
        data-widget={placement.id}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(
            WIDGET_DRAG_TYPE,
            JSON.stringify({ id: placement.id, uid: placement.uid, sizes: offeredSizes(placement.id) }),
          );
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(WIDGET_DRAG_TYPE)) event.preventDefault();
        }}
        onDrop={(event) => drop(event, placement.uid)}
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
                onClick={() => setLayout((current) => resizeWidget(current, placement.uid, size, offeredSizes(placement.id)))}
              >
                {t(`customize.size.${size}`)}
              </button>
            ))}
          <button
            type="button"
            className="widget-remove-btn"
            aria-label={t("customize.remove", { name })}
            title={t("customize.remove", { name })}
            onClick={() => setLayout((current) => removeWidget(current, placement.uid))}
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
  const canTake = armed ? accepts(armedSizes!) : false;
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
