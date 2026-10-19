"use client";

import { useSyncExternalStore } from "react";
import { apiFetch } from "./client";

/**
 * "Translate" on a message: the answer is shown under the original until the
 * reader hides it. Kept outside React state so asking for one translation
 * re-renders that message only, not the whole list.
 */

export type TranslationState =
  | { status: "loading" }
  | { status: "done"; text: string; to: string }
  | { status: "error"; error: string };

const states = new Map<string, TranslationState>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function translateMessage(messageId: string, to: string): Promise<void> {
  const current = states.get(messageId);
  if (current?.status === "loading") return;
  states.set(messageId, { status: "loading" });
  emit();
  try {
    const result = await apiFetch<{ text: string; to: string }>(
      `/api/messages/${encodeURIComponent(messageId)}/translate`,
      { method: "POST", body: JSON.stringify({ to }) },
    );
    states.set(messageId, { status: "done", text: result.text, to: result.to });
  } catch (error) {
    states.set(messageId, {
      status: "error",
      error: error instanceof Error ? error.message : "",
    });
  }
  emit();
}

export function hideTranslation(messageId: string) {
  if (states.delete(messageId)) emit();
}

export function useTranslation(messageId: string): TranslationState | null {
  return useSyncExternalStore(
    subscribe,
    () => states.get(messageId) ?? null,
    () => null,
  );
}
