"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/client";
import { emptyContacts, type MsnContacts, type PersonalEmoticon } from "@/lib/msn-contacts";

/**
 * Your MSN contact groups, placements and quiet list (/api/msn/contacts).
 * Edits apply at once and save in the background.
 */
export function useMsnContacts(enabled: boolean) {
  const [contacts, setContacts] = useState<MsnContacts>(emptyContacts);
  const latest = useRef(contacts);
  latest.current = contacts;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiFetch<{ contacts: MsnContacts }>("/api/msn/contacts")
      .then((data) => {
        if (!cancelled) setContacts(data.contacts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const update = useCallback((change: (current: MsnContacts) => MsnContacts) => {
    const next = change(latest.current);
    latest.current = next;
    setContacts(next);
    void apiFetch<{ contacts: MsnContacts }>("/api/msn/contacts", {
      method: "PUT",
      body: JSON.stringify({ contacts: next }),
    })
      .then((data) => setContacts(data.contacts))
      .catch(() => undefined);
  }, []);

  return { contacts, update };
}

/** Your personal emoticons (/api/emoticons). */
export function usePersonalEmoticons(enabled: boolean) {
  const [emoticons, setEmoticons] = useState<PersonalEmoticon[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiFetch<{ emoticons: PersonalEmoticon[] }>("/api/emoticons")
      .then((data) => {
        if (!cancelled) setEmoticons(data.emoticons);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  /** Uploads the picture, then saves it under the shortcut. Throws with a readable message. */
  const add = useCallback(async (file: File, shortcut: string) => {
    if (!file.type.startsWith("image/")) throw new Error("Pick a picture (PNG, GIF, JPG or WebP).");
    if (file.size > 1024 * 1024) throw new Error("Emoticons must be under 1 MB.");
    // A plain file name keeps the upload key to safe characters.
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const form = new FormData();
    form.append("file", new File([file], `emoticon.${ext}`, { type: file.type }));
    const upload = await apiFetch<{ key: string }>("/api/uploads", { method: "POST", body: form });
    const data = await apiFetch<{ emoticons: PersonalEmoticon[] }>("/api/emoticons", {
      method: "POST",
      body: JSON.stringify({ shortcut, key: upload.key }),
    });
    setEmoticons(data.emoticons);
  }, []);

  const remove = useCallback(async (shortcut: string) => {
    const data = await apiFetch<{ emoticons: PersonalEmoticon[] }>(
      `/api/emoticons?shortcut=${encodeURIComponent(shortcut)}`,
      { method: "DELETE" },
    );
    setEmoticons(data.emoticons);
  }, []);

  return { emoticons, add, remove };
}

export interface WhatsNewEntry {
  id: string;
  userId: string;
  name: string;
  kind: "status" | "picture" | "name";
  /** The new status or name. */
  text: string;
  at: number;
}

interface Snapshot {
  name: string;
  status: string;
  picture: string;
}

const SNAPSHOT_KEY = "huddle-msn-whatsnew-snapshot";
const FEED_KEY = "huddle-msn-whatsnew";
const FEED_LIMIT = 40;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the feed just doesn't persist.
  }
}

/** Keeps only the newest copy of each identical status/name entry. */
function dedupeFeed(feed: WhatsNewEntry[]) {
  const seen = new Set<string>();
  return feed.filter((e) => {
    if (e.kind === "picture") return true;
    const key = `${e.userId}:${e.kind}:${e.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Messenger 2009's "What's New": your contacts' new statuses, display
 * pictures and names. Compares what we see now with the snapshot from last
 * time (kept on this device), so changes made while you were away show up too.
 */
export function useWhatsNew(
  enabled: boolean,
  people: Array<{ id: string; displayName: string; customStatus?: string | null; avatarUrl?: string | null }>,
  selfId: string | null,
) {
  const [feed, setFeed] = useState<WhatsNewEntry[]>([]);

  useEffect(() => {
    if (enabled) setFeed(dedupeFeed(readJson<WhatsNewEntry[]>(FEED_KEY, [])));
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !people.length) return;
    const snapshot = readJson<Record<string, Snapshot>>(SNAPSHOT_KEY, {});
    const fresh: WhatsNewEntry[] = [];
    const now = Date.now();
    for (const person of people) {
      if (person.id === selfId) continue;
      const before = snapshot[person.id];
      // A slim copy of someone (e.g. from the DM list) may leave the status or
      // picture out entirely. That's "unknown", not "cleared": keep what we had,
      // or the full copy arriving a moment later would read as a change.
      const current: Snapshot = {
        name: person.displayName,
        status: person.customStatus === undefined ? (before?.status ?? "") : person.customStatus || "",
        picture: person.avatarUrl === undefined ? (before?.picture ?? "") : person.avatarUrl || "",
      };
      snapshot[person.id] = current;
      // First sighting: remember them, but that isn't news.
      if (!before) continue;
      const entry = (kind: WhatsNewEntry["kind"], text: string) =>
        fresh.push({ id: `${person.id}:${kind}:${now}`, userId: person.id, name: current.name, kind, text, at: now });
      if (current.status && current.status !== before.status && !current.status.startsWith("♫ ")) {
        entry("status", current.status);
      }
      if (current.picture && current.picture !== before.picture) entry("picture", "");
      if (current.name !== before.name) entry("name", current.name);
    }
    writeJson(SNAPSHOT_KEY, snapshot);
    if (!fresh.length) return;
    setFeed((old) => {
      // Never repeat news: drop anything matching that person's latest entry
      // of the same kind (a status flipping back and forth still shows once).
      const novel = fresh.filter((item) => {
        if (item.kind === "picture") return true;
        const last = old.find((e) => e.userId === item.userId && e.kind === item.kind);
        return !last || last.text !== item.text;
      });
      if (!novel.length) return old;
      const next = [...novel, ...old].slice(0, FEED_LIMIT);
      writeJson(FEED_KEY, next);
      return next;
    });
  }, [enabled, people, selfId]);

  const clear = useCallback(() => {
    setFeed([]);
    writeJson(FEED_KEY, []);
  }, []);

  return { feed, clear };
}
