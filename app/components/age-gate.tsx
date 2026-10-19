"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { ShieldAlert } from "lucide-react";
import { useI18n } from "../lib/i18n-context";

/**
 * Age-restricted channels: before the first look, a member confirms they are
 * 18 or older. The answer is remembered per channel on this device, like
 * Discord's. It is a courtesy gate, not age verification: nothing here proves
 * an age, and the messages themselves are served as usual.
 */

const KEY = "huddle-age-ok";
const listeners = new Set<() => void>();
let accepted: Set<string> | null = null;

function load(): Set<string> {
  if (accepted) return accepted;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    accepted = new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    accepted = new Set();
  }
  return accepted;
}

function accept(channelId: string) {
  const next = new Set(load());
  next.add(channelId);
  accepted = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...next].slice(-200)));
  } catch {
    // Remembered for this tab only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useLocked(channelId: string | null | undefined, restricted: boolean): boolean {
  const ok = useSyncExternalStore(
    subscribe,
    () => !channelId || load().has(channelId),
    () => false,
  );
  return restricted && !ok;
}

/** Shows the confirmation in place of `children` until it has been given. */
export function AgeGate({
  channelId,
  channelName,
  restricted,
  onBack,
  children,
}: {
  channelId: string | null | undefined;
  channelName: string;
  restricted: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  if (!useLocked(channelId, restricted)) return <>{children}</>;
  return (
    <div className="age-gate" role="dialog" aria-labelledby="age-gate-title">
      <ShieldAlert size={44} aria-hidden="true" />
      <h2 id="age-gate-title">{t("nsfw.gateTitle")}</h2>
      <p>{t("nsfw.gateBody", { channel: `#${channelName}` })}</p>
      <div className="age-gate-actions">
        <button type="button" className="discord-btn" onClick={onBack}>
          {t("nsfw.gateBack")}
        </button>
        <button type="button" className="discord-btn primary-indigo" onClick={() => channelId && accept(channelId)}>
          {t("nsfw.gateContinue")}
        </button>
      </div>
    </div>
  );
}

/** Hides `children` (the composer) while the channel's gate is still up. */
export function AgeGateHidden({
  channelId,
  restricted,
  children,
}: {
  channelId: string | null | undefined;
  restricted: boolean;
  children: ReactNode;
}) {
  return useLocked(channelId, restricted) ? null : <>{children}</>;
}
