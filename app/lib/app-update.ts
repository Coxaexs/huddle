import { buildId } from "@/lib/build-id";
import { apiUrl } from "./client";

/**
 * Keeping an open Hoffle current, for components/update-banner.tsx.
 *
 * The web app: the desktop apps are windows onto this site, so a deploy
 * reaches everyone at their next reload. A window left open for days never
 * reloads, though, so the page asks /api/version which build the server runs
 * and offers a reload when it differs from its own.
 *
 * The desktop apps themselves (desktop/src/updater.js in the Electron app,
 * src-tauri/src/updater.rs in Hoffle Lite) download a new version in the
 * background and install it at their next launch. They tell the page when one
 * is waiting, so it can offer to restart now. Apps from before 2.1 have no
 * such bridge and report nothing.
 */

/** Whether the server now runs a different build than this page; null when it cannot be asked. */
export async function serverHasNewBuild(): Promise<boolean | null> {
  try {
    const response = await fetch(apiUrl("/api/version"), { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { build?: unknown };
    return typeof data.build === "string" ? data.build !== buildId : null;
  } catch {
    return null;
  }
}

/**
 * The desktop app's own update. "ready": downloaded, a restart installs it.
 * "manual": a newer version is out but this copy cannot replace itself (an
 * unsigned Mac build), so the page links to the download instead.
 */
export interface DesktopUpdate {
  status: "idle" | "checking" | "downloading" | "ready" | "manual" | "error";
  version?: string;
}

export interface DesktopUpdates {
  state(): Promise<DesktopUpdate | null>;
  /** Returns the unsubscribe. */
  onChange(callback: (state: DesktopUpdate) => void): () => void;
  /** Quits, installs and starts the new version. */
  install(): void;
  /** Opens the download page in the browser (for "manual"). */
  download(): void;
}

interface ElectronUpdates {
  state?: () => Promise<unknown>;
  onChange?: (callback: (state: unknown) => void) => () => void;
  install?: () => void;
  download?: () => void;
}

interface TauriApi {
  core?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
  event?: { listen?: (name: string, handler: (event: { payload: unknown }) => void) => Promise<() => void> };
}

function asUpdate(value: unknown): DesktopUpdate | null {
  if (!value || typeof value !== "object") return null;
  const { status, version } = value as { status?: unknown; version?: unknown };
  if (typeof status !== "string") return null;
  return { status: status as DesktopUpdate["status"], version: typeof version === "string" ? version : undefined };
}

/** The shell's update bridge, or null in a browser or an older app. */
export function desktopUpdates(): DesktopUpdates | null {
  const scope = globalThis as { huddle?: { updates?: ElectronUpdates }; __TAURI__?: TauriApi };
  const electron = scope.huddle?.updates;
  if (electron?.state && electron.onChange && electron.install) {
    return {
      state: async () => asUpdate(await electron.state!().catch(() => null)),
      onChange: (callback) => electron.onChange!((state) => {
        const update = asUpdate(state);
        if (update) callback(update);
      }),
      install: () => electron.install!(),
      download: () => electron.download?.(),
    };
  }
  const invoke = scope.__TAURI__?.core?.invoke;
  const listen = scope.__TAURI__?.event?.listen;
  if (invoke && listen) {
    return {
      // Lite builds from before 2.1 have no such command and say nothing.
      state: async () => asUpdate(await invoke("update_state").catch(() => null)),
      onChange(callback) {
        let off: (() => void) | null = null;
        let gone = false;
        void listen("hoffle:update", (event) => {
          const update = asUpdate(event.payload);
          if (update) callback(update);
        }).then((stop) => { if (gone) stop(); else off = stop; }).catch(() => undefined);
        return () => { gone = true; off?.(); };
      },
      install: () => void invoke("update_install").catch(() => undefined),
      download: () => undefined,
    };
  }
  return null;
}

export type UpdateNotice =
  | { kind: "desktop"; version?: string }
  | { kind: "manual"; version?: string }
  | { kind: "web" };

/**
 * What to offer, if anything. A desktop restart reloads the page too, so a
 * waiting app update covers a new web build.
 */
export function pickNotice(webUpdated: boolean, desktop: DesktopUpdate | null): UpdateNotice | null {
  if (desktop?.status === "ready") return { kind: "desktop", version: desktop.version };
  if (desktop?.status === "manual") return { kind: "manual", version: desktop.version };
  return webUpdated ? { kind: "web" } : null;
}

/** Tells notices apart for "Later": dismissing one version's leaves the next to show. */
export const noticeKey = (notice: UpdateNotice): string =>
  notice.kind === "web" ? "web" : `${notice.kind}:${notice.version ?? ""}`;
