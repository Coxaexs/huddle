"use client";

import { MoreHorizontal, Smile, Crown, Skull } from "lucide-react";
import { useI18n } from "../../lib/i18n-context";
import { Tab, CustomEmoji } from "./types";

export function ServerEmojiTab({
  tab,
  canManageServer,
  uploadingEmoji,
  fileInputRef,
  handleFileSelect,
  loadingEmojis,
  emojis,
  handleDeleteEmoji,
}: {
  tab: Tab;
  canManageServer: boolean;
  uploadingEmoji: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  loadingEmojis: boolean;
  emojis: CustomEmoji[];
  handleDeleteEmoji: (emojiId: string, emojiName: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {tab === "emoji" && (
          <div className="tab-pane emoji-pane">
            <h1 className="pane-title">{t("serverSettings.emoji.title")}</h1>
            <p className="pane-subtitle">
              {t("serverSettings.emoji.subtitle")}
            </p>
            {canManageServer && (
              <p className="modal-hint" style={{ marginBottom: 12 }}>
                {t("discordImport.emojiTip")}
              </p>
            )}

            {canManageServer && (
              <div className="emoji-upload-row">
                <button
                  type="button"
                  className="discord-btn primary-indigo"
                  disabled={uploadingEmoji}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingEmoji ? t("serverSettings.emoji.uploading") : t("serverSettings.emoji.upload")}
                </button>
                <p className="drag-drop-note">
                  {t("serverSettings.emoji.dragNote")}
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileSelect}
            />

            {loadingEmojis ? (
              <p className="loading-state">{t("serverSettings.emoji.loading")}</p>
            ) : emojis.length > 0 ? (
              <div className="custom-emojis-table">
                <div className="table-head">
                  <span>{t("serverSettings.emoji.colEmoji")}</span>
                  <span>{t("serverSettings.emoji.colName")}</span>
                  <span>{t("serverSettings.emoji.colActions")}</span>
                </div>
                {emojis.map((emoji) => (
                  <div key={emoji.id} className="table-row">
                    <div className="emoji-preview-col">
                      <img src={emoji.url} alt={emoji.name} className="table-emoji-img" />
                    </div>
                    <div className="emoji-name-col">:{emoji.name}:</div>
                    <div className="emoji-actions-col">
                      {canManageServer && (
                        <button
                          type="button"
                          className="table-action-btn danger"
                          onClick={() => handleDeleteEmoji(emoji.id, emoji.name)}
                        >
                          {t("common.remove")}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Empty State Graphic (SS 2) */
              <div className="empty-illustration-box">
                <div className="illustration-graphic">
                  <div className="graphic-emojis-cluster">
                    <span><Crown size={22} /></span>
                    <span><Smile size={22} /></span>
                    <span><MoreHorizontal size={22} /></span>
                    <span><Skull size={22} /></span>
                  </div>
                </div>
                <h2>{t("serverSettings.emoji.emptyTitle")}</h2>
                <p>{t("serverSettings.emoji.emptySubtitle")}</p>
              </div>
            )}
          </div>
        )}
    </>
  );
}
