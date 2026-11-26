"use client";

import { useEffect } from "react";
import { BookOpen, ExternalLink, GraduationCap, Keyboard, X } from "lucide-react";
import { apiUrl } from "../lib/client";
import { HELP_SITE, HELP_TOC, helpUrl } from "../lib/help-toc";
import { useI18n } from "../lib/i18n-context";
import { HelpAsk } from "./help-ask";

/**
 * The app's Help: ask the manual a question, jump to one of its chapters on
 * hoffle.online, or open the shortcuts and the tour. Loaded on first open.
 */

const CSS = `
  .help-dlg-backdrop { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 20px;
    background: rgba(0,0,0,.6); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
  .help-dlg { width: 100%; max-width: 640px; max-height: calc(100dvh - 40px); display: flex; flex-direction: column;
    background: var(--paper); color: var(--ink); border: 1px solid var(--line); border-radius: 16px;
    box-shadow: 0 24px 60px -20px rgba(0,0,0,.6); overflow: hidden; }
  .help-dlg-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px;
    border-bottom: 1px solid var(--line); background: var(--panel, var(--paper)); }
  .help-dlg-head h3 { margin: 0; font-size: 17px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
  .help-dlg-x { background: none; border: 0; color: var(--muted); cursor: pointer; display: grid; place-items: center;
    width: 32px; height: 32px; border-radius: 8px; }
  .help-dlg-x:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 8%, transparent); }
  .help-dlg-body { padding: 18px 20px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 22px; }
  .help-dlg-label { margin: 0 0 8px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .help-dlg-chapters { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; }
  .help-dlg-chapter { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line);
    color: var(--ink); text-decoration: none; font-size: 14px; font-weight: 600; line-height: 1.25; }
  .help-dlg-chapter:hover { border-color: var(--lavender); background: color-mix(in srgb, var(--lavender) 8%, transparent); }
  .help-dlg-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .help-dlg-action { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px; border-radius: 10px;
    border: 1px solid var(--line); background: transparent; color: var(--ink); font: inherit; font-size: 14px; font-weight: 600;
    cursor: pointer; text-decoration: none; }
  .help-dlg-action:hover { border-color: var(--lavender); }
  .help-dlg .hask { --hask-max: 38vh; }
`;

export function HelpDialog({
  onClose,
  onOpenShortcuts,
  onOpenTutorial,
}: {
  onClose: () => void;
  onOpenShortcuts?: () => void;
  onOpenTutorial?: () => void;
}) {
  const { t, locale } = useI18n();
  const lang = locale === "tr" ? "tr" : "en";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="help-dlg-backdrop" onClick={onClose}>
      <style>{CSS}</style>
      <div className="help-dlg" role="dialog" aria-modal="true" aria-label={t("help.title")} onClick={(event) => event.stopPropagation()}>
        <div className="help-dlg-head">
          <h3>
            <BookOpen size={18} aria-hidden="true" />
            {t("help.title")}
          </h3>
          <button type="button" className="help-dlg-x" onClick={onClose} aria-label={t("common.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="help-dlg-body">
          <section>
            <p className="help-dlg-label">{t("help.ask")}</p>
            <HelpAsk lang={lang} endpoint={apiUrl("/api/ai/help")} linkOrigin={HELP_SITE} bare autoFocus />
          </section>
          <section>
            <p className="help-dlg-label">{t("help.chapters")}</p>
            <div className="help-dlg-chapters">
              {HELP_TOC[lang].map((chapter) => (
                <a key={chapter.slug} className="help-dlg-chapter" href={helpUrl(lang, chapter.slug)} target="_blank" rel="noopener">
                  <span aria-hidden="true">{chapter.icon}</span>
                  {chapter.title}
                </a>
              ))}
            </div>
          </section>
          <div className="help-dlg-actions">
            <a className="help-dlg-action" href={helpUrl(lang)} target="_blank" rel="noopener">
              <ExternalLink size={15} aria-hidden="true" />
              {t("help.openGuide")}
            </a>
            {onOpenTutorial && (
              <button type="button" className="help-dlg-action" onClick={() => { onClose(); onOpenTutorial(); }}>
                <GraduationCap size={15} aria-hidden="true" />
                {t("help.tour")}
              </button>
            )}
            {onOpenShortcuts && (
              <button type="button" className="help-dlg-action" onClick={() => { onClose(); onOpenShortcuts(); }}>
                <Keyboard size={15} aria-hidden="true" />
                {t("help.shortcuts")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
