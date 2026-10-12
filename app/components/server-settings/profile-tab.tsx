"use client";

import { Smile, Info } from "lucide-react";
import type { PublicServer } from "@/lib/servers";
import type { Member } from "@/lib/users";
import { Tab } from "./types";
import { BANNER_COLORS } from "./constants";

export function ServerProfileTab({
  tab,
  canManageServer,
  serverName,
  setServerName,
  iconFileInputRef,
  handleIconUpload,
  bannerFileInputRef,
  handleBannerUpload,
  serverIconUrl,
  setServerIconUrl,
  serverBannerUrl,
  setServerBannerUrl,
  bannerGradient,
  setBannerGradient,
  handleSaveProfile,
  serverColor,
  server,
  onlineCount,
  serverMembers,
}: {
  tab: Tab;
  canManageServer: boolean;
  serverName: string;
  setServerName: React.Dispatch<React.SetStateAction<string>>;
  iconFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleIconUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  bannerFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleBannerUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  serverIconUrl: string;
  setServerIconUrl: React.Dispatch<React.SetStateAction<string>>;
  serverBannerUrl: string;
  setServerBannerUrl: React.Dispatch<React.SetStateAction<string>>;
  bannerGradient: string;
  setBannerGradient: React.Dispatch<React.SetStateAction<string>>;
  handleSaveProfile: () => Promise<void>;
  serverColor: string;
  server: PublicServer;
  onlineCount: number;
  serverMembers: Member[];
}) {
  return (
    <>
      {tab === "profile" && (
          <div className="tab-pane profile-pane">
            <div className="pane-left">
              {!canManageServer && (
                <div className="server-settings-readonly-banner">
                  <Info size={16} />
                  <span>Viewing server overview in read-only mode. You need the Manage Server permission to edit server details.</span>
                </div>
              )}
              <h1 className="pane-title">Server Profile</h1>
              <p className="pane-subtitle">
                Customize how your server appears in invite links and, if enabled, in Server Discovery and Announcement Channel messages
              </p>

              <div className="form-field">
                <label>Name</label>
                <input
                  type="text"
                  className="discord-text-input"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  maxLength={50}
                  disabled={!canManageServer}
                />
              </div>

              <input
                ref={iconFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleIconUpload}
              />
              <input
                ref={bannerFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleBannerUpload}
              />

              <div className="form-field">
                <label>Server Icon (Photo)</label>
                <p className="field-hint">Upload a custom image/photo for your server icon (minimum 512x512 recommended).</p>
                <div className="button-group">
                  <button
                    type="button"
                    className="discord-btn primary-indigo"
                    onClick={() => iconFileInputRef.current?.click()}
                  >
                    Upload Server Icon
                  </button>
                  {serverIconUrl && (
                    <button
                      type="button"
                      className="discord-btn secondary-gray"
                      onClick={() => setServerIconUrl("")}
                    >
                      Remove Icon
                    </button>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>Server Banner Image</label>
                <p className="field-hint">Upload a custom header banner image for your server sidebar.</p>
                <div className="button-group">
                  <button
                    type="button"
                    className="discord-btn primary-indigo"
                    onClick={() => bannerFileInputRef.current?.click()}
                  >
                    Upload Server Banner
                  </button>
                  {serverBannerUrl && (
                    <button
                      type="button"
                      className="discord-btn secondary-gray"
                      onClick={() => setServerBannerUrl("")}
                    >
                      Remove Banner
                    </button>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>Or Pick Banner Gradient</label>
                <div className="banner-swatches">
                  {BANNER_COLORS.map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      className={`banner-swatch ${bannerGradient === b.value ? "selected" : ""}`}
                      style={{ background: b.value }}
                      onClick={() => {
                        setBannerGradient(b.value);
                        setServerBannerUrl("");
                      }}
                      title={b.label}
                    />
                  ))}
                </div>
              </div>

              <div className="form-field">
                <label>Traits</label>
                <p className="field-hint">Add up to 5 traits to show off your server's interests and personality.</p>
                <div className="traits-grid">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="trait-box">
                      <span className="trait-icon"><Smile size={20} /></span>
                    </div>
                  ))}
                </div>
              </div>

              {canManageServer && (
                <div className="save-bar-actions">
                  <button
                    type="button"
                    className="discord-btn primary-indigo"
                    onClick={handleSaveProfile}
                  >
                    Save Changes
                  </button>
                </div>
              )}
            </div>

            {/* Right Side Live Server Preview Card */}
            <div className="pane-right-preview">
              <div className="server-card-preview">
                <div
                  className="server-card-banner"
                  style={{
                    background: serverBannerUrl ? `url(${serverBannerUrl}) center/cover no-repeat` : bannerGradient,
                  }}
                />
                <div className="server-card-content">
                  <div
                    className="server-card-avatar"
                    style={{ background: serverColor, overflow: "hidden" }}
                  >
                    {serverIconUrl ? (
                      <img src={serverIconUrl} alt={serverName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span>{server.icon || serverName.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <h3 className="server-card-name">{serverName}</h3>
                  <div className="server-card-stats">
                    <span className="dot green" /> {onlineCount} Online &nbsp;
                    <span className="dot gray" /> {serverMembers.length || 12} Members
                  </div>
                  <div className="server-card-est">Est. Jun 2026</div>
                </div>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
