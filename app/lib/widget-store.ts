"use client";

import { useEffect, useSyncExternalStore } from "react";
import { apiFetch } from "@/app/lib/client";
import type { BotWidget } from "@/lib/bot-widgets";

/**
 * Bot widgets per server, loaded when a server is first shown and kept
 * current by the hub's "bot-widget" events. Kept outside React state so the
 * hub handler can update it without threading it through the shell hooks.
 */

const byServer = new Map<string, BotWidget[]>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const EMPTY: BotWidget[] = [];

function emit() {
  for (const listener of listeners) listener();
}

function sameScope(a: string | null, b: string | null | "*") {
  return b === "*" || (a || null) === (b || null);
}

export function receiveBotWidget(event: {
  serverId: string;
  widget?: BotWidget;
  removed?: { key: string; channelId: string | null | "*" };
}) {
  const current = byServer.get(event.serverId);
  // Not loaded yet: the first load will fetch the current set anyway.
  if (!current) return;
  let next = current;
  if (event.widget) {
    const incoming = event.widget;
    next = [
      incoming,
      ...current.filter((widget) => !(widget.key === incoming.key && sameScope(widget.channelId, incoming.channelId))),
    ];
  } else if (event.removed) {
    const { key, channelId } = event.removed;
    next = current.filter((widget) => !(widget.key === key && sameScope(widget.channelId, channelId)));
  }
  byServer.set(event.serverId, next);
  emit();
}

export function loadServerWidgets(serverId: string, force = false): Promise<void> {
  if (!force && (byServer.has(serverId) || loading.has(serverId))) {
    return loading.get(serverId) ?? Promise.resolve();
  }
  const request = apiFetch<{ widgets: BotWidget[] }>(`/api/widgets?serverId=${encodeURIComponent(serverId)}`)
    .then((data) => {
      byServer.set(serverId, data.widgets || []);
      emit();
    })
    .catch(() => undefined)
    .finally(() => loading.delete(serverId));
  loading.set(serverId, request);
  return request;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every bot widget in a server (each room's copy included). */
export function useServerWidgets(serverId: string | null | undefined): BotWidget[] {
  useEffect(() => {
    if (serverId) void loadServerWidgets(serverId);
  }, [serverId]);
  return useSyncExternalStore(
    subscribe,
    () => (serverId ? byServer.get(serverId) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
}

/**
 * The copy of a widget to show: the room you are in, else the channel you
 * have open, else the server-wide one.
 */
export function pickWidget(
  widgets: BotWidget[],
  key: string,
  rooms: Array<string | null | undefined>,
): BotWidget | null {
  const copies = widgets.filter((widget) => widget.key === key);
  for (const room of rooms) {
    if (!room) continue;
    const match = copies.find((widget) => widget.channelId === room);
    if (match) return match;
  }
  return copies.find((widget) => !widget.channelId) ?? null;
}

/** One entry per widget (rooms folded together), for the Customize palette. */
export function distinctWidgets(widgets: BotWidget[]): BotWidget[] {
  const seen = new Map<string, BotWidget>();
  for (const widget of widgets) {
    const kept = seen.get(widget.key);
    if (!kept || (kept.channelId && !widget.channelId)) seen.set(widget.key, widget);
  }
  return [...seen.values()];
}
