"use client";

import { Search, Hammer, Zap } from "lucide-react";
import { Tab, ServerBan } from "./types";

export function ServerBansTab({
  tab,
  banSearch,
  setBanSearch,
  loadBans,
  bans,
  loadingBans,
  onRequestConfirm,
  unban,
}: {
  tab: Tab;
  banSearch: string;
  setBanSearch: React.Dispatch<React.SetStateAction<string>>;
  loadBans: () => Promise<void>;
  bans: ServerBan[];
  loadingBans: boolean;
  onRequestConfirm: (options: { title: string; message?: string; isDanger?: boolean; confirmText?: string; onConfirm: () => void; }) => void;
  unban: (ban: ServerBan) => Promise<void>;
}) {
  return (
    <>
      {tab === "bans" && (
          <div className="tab-pane bans-pane">
            <h1 className="pane-title">Server Ban List</h1>
            <p className="pane-subtitle">
              A ban applies to the account: it removes them from the server and stops that account rejoining. Someone could still come back with a new account, so a verification level in Safety Setup helps keep throwaway accounts out.
            </p>

            <div className="bans-search-row">
              <div className="search-wrap">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  className="discord-search-input"
                  placeholder="Search Bans by User Id or Username"
                  value={banSearch}
                  onChange={(e) => setBanSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="discord-btn primary-indigo"
                onClick={() => void loadBans()}
              >
                Refresh
              </button>
            </div>

            {(() => {
              const term = banSearch.trim().toLowerCase();
              const shown = term
                ? bans.filter(
                    (ban) =>
                      ban.username.toLowerCase().includes(term) ||
                      ban.displayName.toLowerCase().includes(term) ||
                      ban.userId.toLowerCase().includes(term),
                  )
                : bans;

              if (loadingBans) {
                return <p className="pane-subtitle">Loading the ban list…</p>;
              }

              if (!bans.length) {
                return (
                  <div className="bans-empty-card">
                    <div className="ban-hammer-illustration">
                      <span className="hammer-emoji"><Hammer size={26} /><Zap size={26} /></span>
                    </div>
                    <h2>NO BANS</h2>
                    <p>
                      You haven&apos;t banned anybody... but if and when you must,
                      do not hesitate!
                    </p>
                  </div>
                );
              }

              if (!shown.length) {
                return <p className="pane-subtitle">Nobody matched that search.</p>;
              }

              return (
                <ul className="ban-list">
                  {shown.map((ban) => (
                    <li key={ban.userId} className="ban-row">
                      <span
                        className="ban-avatar"
                        style={{
                          background: ban.avatarUrl ? undefined : ban.color,
                        }}
                      >
                        {ban.avatarUrl ? (
                          <img src={ban.avatarUrl} alt="" />
                        ) : (
                          ban.avatar
                        )}
                      </span>
                      <span className="ban-who">
                        <strong>{ban.displayName}</strong>
                        <small>
                          @{ban.username}
                          {ban.bannedBy ? ` · banned by ${ban.bannedBy}` : ""}
                          {ban.bannedAt
                            ? ` · ${new Date(ban.bannedAt).toLocaleDateString()}`
                            : ""}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="discord-btn"
                        onClick={() =>
                          onRequestConfirm({
                            title: `Unban ${ban.displayName}?`,
                            message:
                              "They will be able to read and post here again.",
                            confirmText: "Unban",
                            onConfirm: () => void unban(ban),
                          })
                        }
                      >
                        Unban
                      </button>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        )}
    </>
  );
}
