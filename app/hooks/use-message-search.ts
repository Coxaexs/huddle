"use client";

import { useRef, useState } from "react";
import { apiFetch } from "../lib/client";

export interface SearchResult {
  id: string;
  channelId: string;
  channelName: string;
  author: string;
  snippet: string;
}

/** The server-wide message search panel: open flag, query and debounced results. */
export function useMessageSearch() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchTimerRef = useRef<number | null>(null);
  const searchSeqRef = useRef(0);

  /** `serverId` is null where search is unavailable (DMs, no server). */
  function runSearch(query: string, serverId: string | null) {
    setSearchQuery(query);
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    const seq = ++searchSeqRef.current;
    if (query.trim().length < 2 || !serverId) {
      setSearchResults([]);
      return;
    }
    // Wait for a pause in typing, and ignore answers to older queries.
    searchTimerRef.current = window.setTimeout(() => {
      void searchNow(serverId, query, seq);
    }, 250);
  }

  async function searchNow(serverId: string, query: string, seq: number) {
    const data = await apiFetch<{ results: SearchResult[] }>(
      `/api/messages/search?serverId=${encodeURIComponent(serverId)}&q=${encodeURIComponent(query)}`,
    ).catch(() => ({ results: [] as SearchResult[] }));
    if (seq === searchSeqRef.current) setSearchResults(data.results);
  }

  return {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    runSearch,
  };
}
