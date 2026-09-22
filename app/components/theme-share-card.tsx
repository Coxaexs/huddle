"use client";

import { useState } from "react";
import { Sparkles, Download, Check, Copy, Eye, Palette, X, Layers } from "lucide-react";
import {
  type Theme,
  applyThemeToDocument,
  exportThemeCode,
  saveCustomTheme,
  scopeProfileCss,
} from "@/lib/themes";

interface ThemeShareCardProps {
  theme: Theme;
  onApplyTheme?: (theme: Theme) => void;
}

export function ThemeShareCard({ theme, onApplyTheme }: ThemeShareCardProps) {
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const colors = theme.colors || {};

  const handleApply = () => {
    saveCustomTheme(theme);
    applyThemeToDocument(theme);
    setApplied(true);
    if (onApplyTheme) {
      onApplyTheme(theme);
    }
    setTimeout(() => setApplied(false), 3000);
  };

  const handleCopyCode = async () => {
    const code = exportThemeCode(theme);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <>
      <div className="theme-share-card">
        {/* Card Header & Badges */}
        <div className="theme-share-header">
          <div className="theme-share-title-wrap">
            <div className="theme-share-icon">
              <Palette size={18} style={{ color: colors.lavender || "var(--lavender)" }} />
            </div>
            <div>
              <div className="theme-share-title">{theme.name}</div>
              <div className="theme-share-author">
                by {theme.author?.displayName || "Huddle User"}{" "}
                {theme.author?.username && (
                  <span className="theme-share-handle">@{theme.author.username}</span>
                )}
              </div>
            </div>
          </div>
          <div className="theme-share-badges">
            <span className="theme-badge-base">
              {theme.baseTheme === "light"
                ? "☀️ Light"
                : theme.baseTheme === "legacy"
                  ? "🌙 Legacy"
                  : "✨ Cozy"}
            </span>
            {theme.customCss && (
              <span className="theme-badge-css" title="Includes custom CSS styles">
                CSS ⚡
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {theme.description && (
          <p className="theme-share-description">{theme.description}</p>
        )}

        {/* Color Swatches Palette Bar */}
        <div className="theme-share-palette" title="Theme Color Palette">
          {colors.paper && (
            <div
              className="theme-swatch"
              style={{ background: colors.paper }}
              title={`Background: ${colors.paper}`}
            />
          )}
          {colors.panel && (
            <div
              className="theme-swatch"
              style={{ background: colors.panel }}
              title={`Panels: ${colors.panel}`}
            />
          )}
          {colors.chatBg && (
            <div
              className="theme-swatch"
              style={{ background: colors.chatBg }}
              title={`Chat: ${colors.chatBg}`}
            />
          )}
          {colors.lavender && (
            <div
              className="theme-swatch accent"
              style={{ background: colors.lavender }}
              title={`Primary Accent: ${colors.lavender}`}
            />
          )}
          {colors.lavenderSoft && (
            <div
              className="theme-swatch"
              style={{ background: colors.lavenderSoft }}
              title={`Secondary Accent: ${colors.lavenderSoft}`}
            />
          )}
          {colors.coral && (
            <div
              className="theme-swatch"
              style={{ background: colors.coral }}
              title={`Alert: ${colors.coral}`}
            />
          )}
          {colors.mint && (
            <div
              className="theme-swatch"
              style={{ background: colors.mint }}
              title={`Positive: ${colors.mint}`}
            />
          )}
          {colors.ink && (
            <div
              className="theme-swatch"
              style={{ background: colors.ink }}
              title={`Text: ${colors.ink}`}
            />
          )}
        </div>

        {/* Actions */}
        <div className="theme-share-actions">
          <button
            type="button"
            className={`theme-action-btn primary ${applied ? "success" : ""}`}
            onClick={handleApply}
          >
            {applied ? (
              <>
                <Check size={14} /> Applied Theme!
              </>
            ) : (
              <>
                <Download size={14} /> Install & Apply
              </>
            )}
          </button>
          <button
            type="button"
            className="theme-action-btn secondary"
            onClick={() => setShowPreview(true)}
          >
            <Eye size={14} /> Preview
          </button>
          <button
            type="button"
            className="theme-action-btn secondary"
            onClick={handleCopyCode}
            title="Copy theme share code"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied Code" : "Share Code"}
          </button>
        </div>
      </div>

      {/* Theme Preview Modal */}
      {showPreview && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="theme-preview-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              // @ts-ignore
              "--prev-paper": colors.paper || "#16131f",
              "--prev-panel": colors.panel || "#1a1628",
              "--prev-chat": colors.chatBg || "#1e1a2e",
              "--prev-accent": colors.lavender || "#a78bfa",
              "--prev-ink": colors.ink || "#e8e3f5",
              "--prev-muted": colors.muted || "#9d95bc",
              "--prev-line": colors.line || "rgba(255,255,255,0.1)",
              "--prev-corners": `${theme.corners ?? 16}px`,
            }}
          >
            <div className="theme-preview-modal-header">
              <div className="flex items-center gap-2">
                <Sparkles size={18} style={{ color: colors.lavender || "#a78bfa" }} />
                <h3 className="font-bold text-base text-white">{theme.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">
                  {theme.baseTheme}
                </span>
              </div>
              <button
                type="button"
                className="profile-close"
                onClick={() => setShowPreview(false)}
                aria-label="Close Preview"
              >
                <X size={16} />
              </button>
            </div>

            <div className="theme-preview-mock-ui">
              {/* Mock Rail */}
              <div className="mock-rail">
                <div className="mock-avatar-pill active" />
                <div className="mock-avatar-pill" />
                <div className="mock-avatar-pill" />
              </div>

              {/* Mock Sidebar */}
              <div className="mock-sidebar">
                <div className="mock-server-header">
                  <span>Server Preview</span>
                </div>
                <div className="mock-channel selected"># general</div>
                <div className="mock-channel"># announcements</div>
                <div className="mock-channel">🔊 Voice Lounge</div>
              </div>

              {/* Mock Chat */}
              <div className="mock-chat">
                <div className="mock-message">
                  <div className="mock-msg-avatar" />
                  <div className="mock-msg-body">
                    <div className="mock-msg-name">
                      Ada Lovelace <span className="mock-time">12:34 PM</span>
                    </div>
                    <div className="mock-msg-text">
                      Welcome to Huddle! Here is how messages look in <strong>{theme.name}</strong>.
                    </div>
                  </div>
                </div>

                <div className="mock-message reply">
                  <div className="mock-msg-avatar other" />
                  <div className="mock-msg-body">
                    <div className="mock-msg-name">
                      Alan Turing <span className="mock-time">12:35 PM</span>
                    </div>
                    <div className="mock-msg-text">
                      The color scheme looks stunning! Love the accents.
                    </div>
                  </div>
                </div>

                <div className="mock-composer">
                  <span>Message #general...</span>
                  <button type="button" className="mock-send-btn">
                    Send
                  </button>
                </div>
              </div>
            </div>

            <div className="theme-preview-modal-footer">
              <span className="text-xs text-gray-400">
                Border Radius: {theme.corners ?? 16}px · Backdrop: {theme.backdrop ?? "plain"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="discord-btn secondary-gray"
                  onClick={() => setShowPreview(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="discord-btn primary-indigo"
                  onClick={() => {
                    handleApply();
                    setShowPreview(false);
                  }}
                >
                  <Download size={14} /> Apply This Theme
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
