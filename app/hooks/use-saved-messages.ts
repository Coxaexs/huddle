"use client";

import { useState } from "react";
import { apiFetch } from "../lib/client";
import type { SavedEntry } from "../lib/chat/shell-helpers";

/** The bookmarked-messages panel: the list, which ids are saved, and toggling. */
export function useSavedMessages(
  onError: (message: string) => void,
  onSaved: () => void,
) {
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedList, setSavedList] = useState<SavedEntry[] | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  /** Loads the saved list (and which ids are saved). */
  async function loadSaved() {
    const data = await apiFetch<{ saved: SavedEntry[] }>("/api/saved").catch(() => null);
    if (!data) return;
    setSavedList(data.saved);
    setSavedIds(new Set(data.saved.map((entry) => entry.messageId)));
  }

  async function toggleSaved(messageId: string) {
    const saved = savedIds.has(messageId);
    setSavedIds((current) => {
      const next = new Set(current);
      if (saved) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
    try {
      await apiFetch(
        saved ? `/api/saved?messageId=${encodeURIComponent(messageId)}` : "/api/saved",
        saved
          ? { method: "DELETE" }
          : { method: "POST", body: JSON.stringify({ messageId }) },
      );
      if (saved) setSavedList((list) => list?.filter((entry) => entry.messageId !== messageId) ?? list);
      else onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save that.");
      void loadSaved();
    }
  }

  return { savedOpen, setSavedOpen, savedList, savedIds, loadSaved, toggleSaved };
}
