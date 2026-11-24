"use client";

import { Search, Hammer, Zap } from "lucide-react";
import { useI18n } from "../../lib/i18n-context";
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
  const { t, locale } = useI18n();
  return (
    <>
      {tab === "bans" && (
          <div className="tab-pane bans-pane">
            <h1 className="pane-title">{t("serverSettings.bans.title")}</h1>
            <p className="pane-subtitle">
              {t("serverSettings.bans.subtitle")}
            </p>

            <div className="bans-search-row">
              <div className="search-wrap">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  className="discord-search-input"
                  placeholder={t("serverSettings.bans.searchPlaceholder")}
                  value={banSearch}
                  onChange={(e) => setBanSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="discord-btn primary-indigo"
                onClick={() => void loadBans()}
              >
                {t("serverSettings.bans.refresh")}
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
                return <p className="pane-subtitle">{t("serverSettings.bans.loading")}</p>;
              }

              if (!bans.length) {
                return (
                  <div className="bans-empty-card">
                    <div className="ban-hammer-illustration">
                      <span className="hammer-emoji"><Hammer size={26} /><Zap size={26} /></span>
                    </div>
                    <h2>{t("serverSettings.bans.emptyTitle")}</h2>
                    <p>{t("serverSettings.bans.emptySubtitle")}</p>
                  </div>
                );
              }

              if (!shown.length) {
                return <p className="pane-subtitle">{t("serverSettings.bans.noMatch")}</p>;
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
                          {ban.bannedBy ? t("serverSettings.bans.bannedBy", { name: ban.bannedBy }) : ""}
                          {ban.bannedAt
                            ? ` · ${new Date(ban.bannedAt).toLocaleDateString(locale)}`
                            : ""}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="discord-btn"
                        onClick={() =>
                          onRequestConfirm({
                            title: t("serverSettings.bans.unbanTitle", { name: ban.displayName }),
                            message: t("serverSettings.bans.unbanMsg"),
                            confirmText: t("serverSettings.bans.unbanBtn"),
                            onConfirm: () => void unban(ban),
                          })
                        }
                      >
                        {t("serverSettings.bans.unbanBtn")}
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
