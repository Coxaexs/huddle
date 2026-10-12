"use client";

import { MoreHorizontal, Smile, Crown, Skull } from "lucide-react";
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
  return (
    <>
      {tab === "emoji" && (
          <div className="tab-pane emoji-pane">
            <h1 className="pane-title">Emoji</h1>
            <p className="pane-subtitle">
              Add up to 50 custom emoji that anyone can use in this server. Animated GIF emoji may be used by members with Discord Nitro.
            </p>

            {canManageServer && (
              <div className="emoji-upload-row">
                <button
                  type="button"
                  className="discord-btn primary-indigo"
                  disabled={uploadingEmoji}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingEmoji ? "Uploading..." : "Upload Emoji"}
                </button>
                <p className="drag-drop-note">
                  If you want to upload multiple emojis or skip the editor, drag and drop the file(s) onto this page.
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
              <p className="loading-state">Loading emojis...</p>
            ) : emojis.length > 0 ? (
              <div className="custom-emojis-table">
                <div className="table-head">
                  <span>EMOJI</span>
                  <span>NAME</span>
                  <span>ACTIONS</span>
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
                          Remove
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
                <h2>NO EMOJI</h2>
                <p>Get the party started by uploading an emoji</p>
              </div>
            )}
          </div>
        )}
    </>
  );
}
