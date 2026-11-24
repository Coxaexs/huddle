"use client";

import { useState } from "react";
import { Sparkles, Download, Check, Copy, Eye, Palette, X, Layers } from "lucide-react";
import {
  type Theme,
  applyThemeToDocument,
  exportThemeCode,
  safeThemeColors,
  saveCustomTheme,
  scopeProfileCss,
} from "@/lib/themes";
import { useI18n } from "../lib/i18n-context";

interface ThemeShareCardProps {
  theme: Theme;
  onApplyTheme?: (theme: Theme) => void;
}

export function ThemeShareCard({ theme: shared, onApplyTheme }: ThemeShareCardProps) {
  const { t } = useI18n();
  // Someone else's message: only plain colours get painted, saved or applied.
  const theme: Theme = { ...shared, colors: safeThemeColors(shared.colors) };
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
                {t("chat.themeCard.by", { name: theme.author?.displayName || t("chat.themeCard.defaultAuthor") })}{" "}
                {theme.author?.username && (
                  <span className="theme-share-handle">@{theme.author.username}</span>
                )}
              </div>
            </div>
          </div>
          <div className="theme-share-badges">
            <span className="theme-badge-base">
              {theme.baseTheme === "light"
                ? t("chat.themeCard.light")
                : theme.baseTheme === "legacy"
                  ? t("chat.themeCard.legacy")
                  : t("chat.themeCard.cozy")}
            </span>
            {theme.customCss && (
              <span className="theme-badge-css" title={t("chat.themeCard.cssTitle")}>
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
        <div className="theme-share-palette" title={t("chat.themeCard.paletteTitle")}>
          {colors.paper && (
            <div
              className="theme-swatch"
              style={{ background: colors.paper }}
              title={t("chat.themeCard.bg", { color: colors.paper })}
            />
          )}
          {colors.panel && (
            <div
              className="theme-swatch"
              style={{ background: colors.panel }}
              title={t("chat.themeCard.panels", { color: colors.panel })}
            />
          )}
          {colors.chatBg && (
            <div
              className="theme-swatch"
              style={{ background: colors.chatBg }}
              title={t("chat.themeCard.chat", { color: colors.chatBg })}
            />
          )}
          {colors.lavender && (
            <div
              className="theme-swatch accent"
              style={{ background: colors.lavender }}
              title={t("chat.themeCard.primaryAccent", { color: colors.lavender })}
            />
          )}
          {colors.lavenderSoft && (
            <div
              className="theme-swatch"
              style={{ background: colors.lavenderSoft }}
              title={t("chat.themeCard.secondaryAccent", { color: colors.lavenderSoft })}
            />
          )}
          {colors.coral && (
            <div
              className="theme-swatch"
              style={{ background: colors.coral }}
              title={t("chat.themeCard.alert", { color: colors.coral })}
            />
          )}
          {colors.mint && (
            <div
              className="theme-swatch"
              style={{ background: colors.mint }}
              title={t("chat.themeCard.positive", { color: colors.mint })}
            />
          )}
          {colors.ink && (
            <div
              className="theme-swatch"
              style={{ background: colors.ink }}
              title={t("chat.themeCard.text", { color: colors.ink })}
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
                <Check size={14} /> {t("chat.themeCard.applied")}
              </>
            ) : (
              <>
                <Download size={14} /> {t("chat.themeCard.installApply")}
              </>
            )}
          </button>
          <button
            type="button"
            className="theme-action-btn secondary"
            onClick={() => setShowPreview(true)}
          >
            <Eye size={14} /> {t("chat.themeCard.preview")}
          </button>
          <button
            type="button"
            className="theme-action-btn secondary"
            onClick={handleCopyCode}
            title={t("chat.themeCard.copyTitle")}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? t("chat.themeCard.copiedCode") : t("chat.themeCard.shareCode")}
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
                <Sparkles size={18} style={{ color: colors.lavender || "var(--lavender)" }} />
                <h3 className="font-bold text-base text-white">{theme.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">
                  {theme.baseTheme}
                </span>
              </div>
              <button
                type="button"
                className="profile-close"
                onClick={() => setShowPreview(false)}
                aria-label={t("chat.themeCard.closePreview")}
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
                  <span>{t("chat.themeCard.serverPreview")}</span>
                </div>
                <div className="mock-channel selected">{t("chat.themeCard.mockGeneral")}</div>
                <div className="mock-channel">{t("chat.themeCard.mockAnnouncements")}</div>
                <div className="mock-channel">{t("chat.themeCard.mockVoice")}</div>
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
                      {t("chat.themeCard.mockMsg1", { name: theme.name })}
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
                      {t("chat.themeCard.mockMsg2")}
                    </div>
                  </div>
                </div>

                <div className="mock-composer">
                  <span>{t("chat.themeCard.mockPlaceholder")}</span>
                  <button type="button" className="mock-send-btn">
                    {t("common.send")}
                  </button>
                </div>
              </div>
            </div>

            <div className="theme-preview-modal-footer">
              <span className="text-xs text-gray-400">
                {t("chat.themeCard.footerMeta", { corners: theme.corners ?? 16, backdrop: theme.backdrop ?? "plain" })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="discord-btn secondary-gray"
                  onClick={() => setShowPreview(false)}
                >
                  {t("common.close")}
                </button>
                <button
                  type="button"
                  className="discord-btn primary-indigo"
                  onClick={() => {
                    handleApply();
                    setShowPreview(false);
                  }}
                >
                  <Download size={14} /> {t("chat.themeCard.applyThis")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
