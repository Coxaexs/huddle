"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/app/lib/i18n-context";
import { resetLayout, setCustomizing, setLayout, useLayoutPrefs } from "@/app/lib/layout-store";
import {
  CHANNEL_SIDES,
  MEMBER_SIDES,
  isDefaultLayout,
  type ChannelsSide,
  type MembersSide,
} from "@/lib/layout-prefs";

/** Themes that draw a whole window of their own and keep their own layout. */
export function themeOwnsLayout(themeId: string | undefined): boolean {
  return Boolean(themeId && (themeId === "winamp" || themeId === "teamspeak" || themeId.startsWith("msn")));
}

export function useThemeOwnsLayout(): boolean {
  const [owns, setOwns] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setOwns(themeOwnsLayout(root.dataset.customThemeId));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-custom-theme-id"] });
    return () => observer.disconnect();
  }, []);
  return owns;
}

/** A tiny drawing of the window with the moved panel highlighted. */
function Diagram({ channels, members, highlight }: { channels: ChannelsSide; members: MembersSide; highlight: "channels" | "members" }) {
  return (
    <span className={`layout-diagram chan-${channels} mem-${members} hl-${highlight}`} aria-hidden="true">
      <i className="ld-chan" />
      <i className="ld-chat" />
      <i className="ld-mem" />
    </span>
  );
}

/**
 * Where the channel list and member list sit: four sides for channels (like
 * a browser's tab strip or sidebar), two for members. Used in Settings →
 * Appearance and, compact, in the Customize tray.
 */
export function LayoutPicker({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const layout = useLayoutPrefs();
  const owned = useThemeOwnsLayout();

  const channelOptions = (
    <div className="layout-options" role="radiogroup" aria-label={t("layout.channels")}>
      {CHANNEL_SIDES.map((side) => (
        <button
          type="button"
          role="radio"
          aria-checked={layout.channels === side}
          key={side}
          className={`layout-option ${layout.channels === side ? "active" : ""}`}
          onClick={() => setLayout((current) => ({ ...current, channels: side }))}
        >
          <Diagram channels={side} members={layout.members} highlight="channels" />
          <span>{t(`layout.side.${side}`)}</span>
        </button>
      ))}
    </div>
  );
  const memberOptions = (
    <div className="layout-options" role="radiogroup" aria-label={t("layout.members")}>
      {MEMBER_SIDES.map((side) => (
        <button
          type="button"
          role="radio"
          aria-checked={layout.members === side}
          key={side}
          className={`layout-option ${layout.members === side ? "active" : ""}`}
          onClick={() => setLayout((current) => ({ ...current, members: side }))}
        >
          <Diagram channels={layout.channels} members={side} highlight="members" />
          <span>{t(`layout.side.${side}`)}</span>
        </button>
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className="layout-picker layout-picker-compact">
        <div className="layout-picker-group">
          <span className="layout-picker-label">{t("layout.channels")}</span>
          {channelOptions}
        </div>
        <div className="layout-picker-group">
          <span className="layout-picker-label">{t("layout.members")}</span>
          {memberOptions}
        </div>
        {owned && <p className="layout-picker-note">{t("layout.themeOwns")}</p>}
      </div>
    );
  }

  return (
    <section className="layout-picker">
      <div className="layout-picker-head">
        <div>
          <span className="settings-label">{t("layout.title")}</span>
          <p className="modal-hint">{t("layout.desc")}</p>
        </div>
        {!isDefaultLayout(layout) && (
          <button type="button" className="layout-reset" onClick={resetLayout}>
            {t("layout.reset")}
          </button>
        )}
      </div>
      <div className="layout-picker-group">
        <span className="layout-picker-label">{t("layout.channels")}</span>
        {channelOptions}
      </div>
      <div className="layout-picker-group">
        <span className="layout-picker-label">{t("layout.members")}</span>
        {memberOptions}
      </div>
      {owned && <p className="layout-picker-note">{t("layout.themeOwns")}</p>}
      <p className="layout-picker-note">{t("layout.phoneNote")}</p>
      <button
        type="button"
        className="layout-customize-btn"
        onClick={() => setCustomizing(true)}
      >
        {t("layout.customize")}
      </button>
    </section>
  );
}
