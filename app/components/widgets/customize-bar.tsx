"use client";

import { useEffect, useState } from "react";
import { Check, EyeOff } from "lucide-react";
import { useI18n } from "@/app/lib/i18n-context";
import {
  armWidget,
  resetLayout,
  setCustomizing,
  setLayout,
  useArmedWidget,
  useCustomizing,
  useLayoutPrefs,
} from "@/app/lib/layout-store";
import { isDefaultLayout, setToolbarItemHidden } from "@/lib/layout-prefs";
import { LayoutPicker } from "./layout-picker";
import { draggedToolbarItem, isToolbarDrag, ToolbarEditor } from "./toolbar";
import { WIDGET_DRAG_TYPE, WidgetArea } from "./widget-area";
import { useWidgetCatalog, useWidgetHost } from "./widget-host";

type Tab = "layout" | "widgets" | "buttons";
const TABS: Tab[] = ["layout", "widgets", "buttons"];

/**
 * Customize mode's tray, docked along the bottom like a browser's
 * "Customize toolbar": where the panels sit, every widget this server offers,
 * and every toolbar's buttons. The app stays live above it, with each place
 * a widget can go drawn as a dashed zone and each toolbar outlined, so its
 * buttons can be dragged right where they are.
 */
export function CustomizeBar({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const customizing = useCustomizing();
  const armed = useArmedWidget();
  const layout = useLayoutPrefs();
  const host = useWidgetHost();
  const catalog = useWidgetCatalog(host.serverId, t);
  const [tab, setTab] = useState<Tab>("layout");
  const [binOver, setBinOver] = useState(false);

  useEffect(() => {
    if (!customizing) return;
    onOpen();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (armed) armWidget(null);
      else setCustomizing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // onOpen is a fresh closure each render; only opening should run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customizing, armed]);

  if (!customizing) return null;
  const placed = new Set(layout.widgets.map((widget) => widget.id));
  const armedEntry = catalog.find((entry) => entry.id === armed);
  const hint =
    tab === "widgets"
      ? armedEntry
        ? t("customize.hintPlacing", { name: armedEntry.title })
        : t("customize.hint")
      : tab === "buttons"
        ? t("customize.hintButtons")
        : t("customize.hintLayout");

  return (
    <div className="customize-bar" role="dialog" aria-label={t("customize.title")}>
      <div className="customize-bar-head">
        <strong>{t("customize.title")}</strong>
        <div className="customize-tabs" role="tablist">
          {TABS.map((id) => (
            <button
              type="button"
              role="tab"
              key={id}
              aria-selected={tab === id}
              className={`customize-tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              {t(`customize.tab.${id}`)}
            </button>
          ))}
        </div>
        <span className="customize-bar-hint">{hint}</span>
        {tab === "widgets" && !host.membersOpen && (
          <span className="customize-bar-hint">{t("customize.membersClosed")}</span>
        )}
        <span className="mw-spacer" />
        {!isDefaultLayout(layout) && (
          <button type="button" className="customize-reset" onClick={resetLayout}>
            {t("layout.reset")}
          </button>
        )}
        <button type="button" className="customize-done" onClick={() => setCustomizing(false)}>
          <Check size={15} /> {t("customize.done")}
        </button>
      </div>
      <div className="customize-bar-body">
        {tab === "layout" && <LayoutPicker compact />}
        {tab === "widgets" && (
          <div className="customize-widgets">
            <span className="layout-picker-label">{t("customize.widgets")}</span>
            <div className="customize-palette">
              {catalog.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={`palette-item ${armed === entry.id ? "armed" : ""} ${placed.has(entry.id) ? "placed" : ""}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(WIDGET_DRAG_TYPE, JSON.stringify({ id: entry.id, sizes: entry.sizes }));
                    event.dataTransfer.effectAllowed = "copyMove";
                    armWidget(null);
                  }}
                  onClick={() => armWidget(armed === entry.id ? null : entry.id)}
                  title={entry.description}
                >
                  <span className="palette-icon" aria-hidden="true">{entry.icon}</span>
                  <span className="palette-text">
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.botName ? t("customize.by", { bot: entry.botName }) : ""}
                      {placed.has(entry.id) ? ` · ${t("customize.placed")}` : ""}
                    </small>
                  </span>
                </button>
              ))}
              {catalog.length < 2 && <p className="customize-empty">{t("customize.noBots")}</p>}
            </div>
            {/* The call view's line, here too so it can be filled outside a call. */}
            <div className="customize-call-zone">
              <WidgetArea area="call" />
            </div>
          </div>
        )}
        {tab === "buttons" && (
          <div className="customize-buttons">
            <ToolbarEditor toolbar="header" />
            <ToolbarEditor toolbar="composer" />
            <ToolbarEditor toolbar="call" />
            <div
              className={`tb-bin ${binOver ? "is-over" : ""}`}
              onDragOver={(event) => {
                if (!isToolbarDrag(event)) return;
                event.preventDefault();
                setBinOver(true);
              }}
              onDragLeave={() => setBinOver(false)}
              onDrop={(event) => {
                setBinOver(false);
                const dragged = draggedToolbarItem(event);
                if (!dragged) return;
                event.preventDefault();
                setLayout((current) => setToolbarItemHidden(current, dragged.toolbar, dragged.item, true));
              }}
            >
              <EyeOff size={16} aria-hidden="true" />
              {t("customize.hideBin")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
