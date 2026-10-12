"use client";

import { X } from "lucide-react";
import { type Message, type MentionEntry } from "../../../lib/chat/types";
import { DM_HOME } from "../../../lib/chat/constants";
import { formatClientDateTime } from "../../../lib/chat/format";
import { SavedEntry } from "../../../lib/chat/shell-helpers";
import type { Dispatch, SetStateAction } from "react";

export function SearchPanel({
  searchOpen,
  searchQuery,
  channelTitle,
  runSearch,
  setSearchOpen,
  setSearchQuery,
  setSearchResults,
  searchResults,
  jumpToMessage,
}: {
  searchOpen: boolean;
  searchQuery: string;
  channelTitle: string;
  runSearch: (query: string) => void;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSearchResults: Dispatch<SetStateAction<{ id: string; channelId: string; channelName: string; author: string; snippet: string; }[]>>;
  searchResults: { id: string; channelId: string; channelName: string; author: string; snippet: string; }[];
  jumpToMessage: (channelId: string, messageId: string) => void;
}) {
  return (
    <>
      {searchOpen && (
                  <div className="search-panel">
                    <div className="search-head">
                      <input
                        autoFocus
                        value={searchQuery}
                        placeholder={`Search #${channelTitle}'s server…`}
                        onChange={(event) => void runSearch(event.target.value)}
                        aria-label="Search messages"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          setSearchQuery("");
                          setSearchResults([]);
                        }}
                        aria-label="Close search"
                      >
                        ×
                      </button>
                    </div>
                    <div className="search-filter-pills">
                      <button
                        type="button"
                        onClick={() => {
                          const q = searchQuery.includes("from:") ? searchQuery : `from: ${searchQuery}`.trim();
                          setSearchQuery(q);
                        }}
                      >
                        from:
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const q = searchQuery.includes("in:") ? searchQuery : `in: ${searchQuery}`.trim();
                          setSearchQuery(q);
                        }}
                      >
                        in:
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const q = searchQuery.includes("has:link") ? searchQuery : `${searchQuery} has:link`.trim();
                          setSearchQuery(q);
                          void runSearch(q);
                        }}
                      >
                        has:link
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const q = searchQuery.includes("has:file") ? searchQuery : `${searchQuery} has:file`.trim();
                          setSearchQuery(q);
                          void runSearch(q);
                        }}
                      >
                        has:file
                      </button>
                    </div>
                    <div className="search-results">
                      {searchResults.map((result) => (
                        <button
                          type="button"
                          key={result.id}
                          className="search-result"
                          onClick={() => jumpToMessage(result.channelId, result.id)}
                        >
                          <span className="search-result-meta">
                            <span className="channel-hash">#</span>
                            {result.channelName} · <strong>{result.author}</strong>
                          </span>
                          <span className="search-result-snippet">{result.snippet}</span>
                        </button>
                      ))}
                      {searchQuery.length >= 2 && !searchResults.length && (
                        <p className="pins-empty">Nothing matched that.</p>
                      )}
                    </div>
                  </div>
                )}
    </>
  );
}

export function SavedPanel({
  savedOpen,
  setSavedOpen,
  savedList,
  setActiveServerId,
  jumpToMessage,
  toggleSaved,
}: {
  savedOpen: boolean;
  setSavedOpen: Dispatch<SetStateAction<boolean>>;
  savedList: SavedEntry[] | null;
  setActiveServerId: Dispatch<SetStateAction<string | null>>;
  jumpToMessage: (channelId: string, messageId: string) => void;
  toggleSaved: (messageId: string) => Promise<void>;
}) {
  return (
    <>
      {savedOpen && (
                  <div className="pins-panel saved-panel">
                    <div className="pins-head">
                      <strong>Saved messages</strong>
                      <button
                        type="button"
                        className="popup-close-x"
                        onClick={() => setSavedOpen(false)}
                        aria-label="Close saved messages"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    {!savedList ? (
                      <p className="pins-empty">Loading…</p>
                    ) : !savedList.length ? (
                      <p className="pins-empty">
                        Nothing saved yet. Hover a message and press the bookmark to keep it here.
                      </p>
                    ) : (
                      savedList.map((entry) => (
                        <div key={entry.messageId} className="search-result mention-entry saved-entry">
                          <button
                            type="button"
                            className="saved-open"
                            onClick={() => {
                              setSavedOpen(false);
                              setActiveServerId(entry.serverId || DM_HOME);
                              jumpToMessage(entry.channelId, entry.messageId);
                            }}
                          >
                            <span className="search-result-meta">
                              {entry.serverName && entry.channelName ? (
                                <>
                                  {entry.serverName} · <span className="channel-hash">#</span>
                                  {entry.channelName}
                                </>
                              ) : (
                                "Direct message"
                              )}
                              {" · "}
                              {formatClientDateTime(entry.createdAt)}
                            </span>
                            <span className="search-result-meta">
                              <strong>{entry.author}</strong>
                            </span>
                            <span className="search-result-snippet">{entry.text}</span>
                          </button>
                          <button
                            type="button"
                            className="saved-remove"
                            onClick={() => void toggleSaved(entry.messageId)}
                            aria-label="Remove from saved"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
    </>
  );
}

export function MentionsPanel({
  mentionsOpen,
  setMentionsOpen,
  mentionsTab,
  setMentionsTab,
  unreadMentionTotal,
  mentionInbox,
  openMention,
}: {
  mentionsOpen: boolean;
  setMentionsOpen: Dispatch<SetStateAction<boolean>>;
  mentionsTab: "all" | "unread";
  setMentionsTab: Dispatch<SetStateAction<"all" | "unread">>;
  unreadMentionTotal: number;
  mentionInbox: MentionEntry[] | null;
  openMention: (entry: MentionEntry) => void;
}) {
  return (
    <>
      {mentionsOpen && (
                  <div className="pins-panel mentions-panel">
                    <div className="pins-head">
                      <strong>Mentions</strong>
                      <button
                        type="button"
                        className="popup-close-x"
                        onClick={() => setMentionsOpen(false)}
                        aria-label="Close mentions"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="mentions-tabs" role="tablist">
                      {(["all", "unread"] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          role="tab"
                          aria-selected={mentionsTab === tab}
                          className={mentionsTab === tab ? "active" : ""}
                          onClick={() => setMentionsTab(tab)}
                        >
                          {tab === "all" ? "All" : `Unread${unreadMentionTotal ? ` (${unreadMentionTotal})` : ""}`}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      if (!mentionInbox) return <p className="pins-empty">Loading…</p>;
                      const shown =
                        mentionsTab === "unread"
                          ? mentionInbox.filter((entry) => !entry.read)
                          : mentionInbox;
                      if (!shown.length) {
                        return (
                          <p className="pins-empty">
                            {mentionsTab === "unread"
                              ? "You're all caught up."
                              : "Nobody has mentioned you yet."}
                          </p>
                        );
                      }
                      return shown.map((entry) => (
                        <button
                          type="button"
                          key={entry.message.id}
                          className={`search-result mention-entry ${entry.read ? "" : "is-unread"}`}
                          onClick={() => openMention(entry)}
                        >
                          <span className="search-result-meta">
                            {entry.serverName ? (
                              <>
                                {entry.serverName} · <span className="channel-hash">#</span>
                                {entry.channelName}
                              </>
                            ) : (
                              "Direct message"
                            )}
                            {" · "}
                            {formatClientDateTime(entry.message.createdAt)}
                          </span>
                          <span className="search-result-meta">
                            <strong>{entry.message.author}</strong>
                          </span>
                          <span className="search-result-snippet">{entry.message.text}</span>
                        </button>
                      ));
                    })()}
                  </div>
                )}
    </>
  );
}

export function PinsPanel({
  pinsOpen,
  channelTitle,
  setPinsOpen,
  pins,
  activeChannelId,
  jumpToMessage,
  canPin,
  togglePin,
}: {
  pinsOpen: boolean;
  channelTitle: string;
  setPinsOpen: Dispatch<SetStateAction<boolean>>;
  pins: Message[];
  activeChannelId: string | null;
  jumpToMessage: (channelId: string, messageId: string) => void;
  canPin: boolean;
  togglePin: (message: Message) => Promise<void>;
}) {
  return (
    <>
      {pinsOpen && (
                  <div className="pins-panel">
                    <div className="pins-head">
                      <strong>Pinned in {channelTitle}</strong>
                      <button
                        type="button"
                        className="popup-close-x"
                        onClick={() => setPinsOpen(false)}
                        aria-label="Close pinned messages"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    {pins.length ? (
                      pins.map((pin) => (
                        <div
                          className="pin-item cursor-pointer hover:bg-white/5 p-2.5 rounded-lg transition-colors border border-transparent hover:border-white/10 my-1"
                          key={pin.id}
                          onClick={() => {
                            // Works for pins older than what is loaded, too.
                            if (activeChannelId) jumpToMessage(activeChannelId, String(pin.id));
                          }}
                          title="Click to jump to message"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <strong className="text-xs text-white">{pin.author}</strong>
                            {canPin && (
                            <button
                                type="button"
                                className="text-xs text-red-400 hover:text-red-300 font-medium px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void togglePin(pin);
                                }}
                              >
                                Unpin
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-gray-300 line-clamp-3">{pin.text}</p>
                        </div>
                      ))
                    ) : (
                      <p className="pins-empty">
                        Nothing pinned yet. Hover a message and press the pin.
                      </p>
                    )}
                  </div>
                )}
    </>
  );
}
