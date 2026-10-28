"use client";

import { Bell, Eye, GraduationCap, Languages, Layers, Lock, LogOut, Mic, Palette, ShieldCheck, type LucideIcon } from "lucide-react";
import { BUILTIN_THEMES, type Theme } from "@/lib/themes";
import type { PublicUser } from "@/lib/users";
import { useI18n } from "../../lib/i18n-context";
import { Avatar } from "../avatar";
import { Hoffy } from "../hoffy";
import type { Tab } from "./types";

/** The looks offered right on the home page; the rest are under "More looks". */
const QUICK_LOOKS = ["linen", "linen-dark", "cozy", "light"];

/**
 * Settings in the simple interface (app/lib/ui-mode.ts): one page of big
 * picture tiles instead of a sidebar of sixteen tabs. Each tile opens the
 * page it names; "Show everything" goes back to the full interface.
 */
export function SimpleSettingsHome({
  user,
  avatar,
  avatarUrl,
  color,
  displayName,
  activeThemeId,
  onPickTheme,
  onOpen,
  onEditProfile,
  onShowEverything,
  onSignOut,
}: {
  user: PublicUser;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  displayName: string;
  activeThemeId: string;
  onPickTheme: (theme: Theme) => void;
  onOpen: (tab: Tab) => void;
  onEditProfile: () => void;
  onShowEverything: () => void;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const looks = QUICK_LOOKS.map((id) => BUILTIN_THEMES.find((theme) => theme.id === id)).filter((theme): theme is Theme => Boolean(theme));
  const tiles: { tab: Tab; icon: LucideIcon; tone: string; title: string; hint: string }[] = [
    { tab: "voice", icon: Mic, tone: "teal", title: t("simpleSettings.sound"), hint: t("simpleSettings.soundHint") },
    { tab: "notifications", icon: Bell, tone: "amber", title: t("simpleSettings.alerts"), hint: t("simpleSettings.alertsHint") },
    { tab: "language", icon: Languages, tone: "blue", title: t("simpleSettings.language"), hint: t("simpleSettings.languageHint") },
    { tab: "accessibility", icon: Eye, tone: "purple", title: t("simpleSettings.textSize"), hint: t("simpleSettings.textSizeHint") },
    { tab: "password", icon: ShieldCheck, tone: "green", title: t("simpleSettings.account"), hint: t("simpleSettings.accountHint") },
    { tab: "privacy", icon: Lock, tone: "coral", title: t("simpleSettings.privacy"), hint: t("simpleSettings.privacyHint") },
    { tab: "tutorial", icon: GraduationCap, tone: "pink", title: t("simpleSettings.tour"), hint: t("simpleSettings.tourHint") },
  ];

  return (
    <div className="simple-settings">
      <div className="simple-settings-hello">
        <Hoffy size={64} pose="wave" face="happy" motion="wave" id="simple-settings-hoffy" />
        <div>
          <h3>{t("simpleSettings.hi", { name: displayName || user.displayName })}</h3>
          <p>{t("simpleSettings.lead")}</p>
        </div>
      </div>

      <div className="simple-settings-grid">
        <button type="button" className="simple-tile simple-tile-you" onClick={onEditProfile}>
          <Avatar className="simple-tile-avatar" size={56} avatar={avatar} avatarUrl={avatarUrl} color={color} />
          <strong>{t("simpleSettings.you")}</strong>
          <small>{t("simpleSettings.youHint")}</small>
        </button>

        <div className="simple-tile simple-tile-look">
          <span className="simple-tile-art tone-pink"><Palette size={26} aria-hidden="true" /></span>
          <strong>{t("simpleSettings.look")}</strong>
          <span className="simple-looks" role="radiogroup" aria-label={t("simpleSettings.look")}>
            {looks.map((theme) => (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={activeThemeId === theme.id}
                className={`simple-look ${activeThemeId === theme.id ? "active" : ""}`}
                title={theme.name}
                onClick={() => onPickTheme(theme)}
              >
                <span className="simple-look-swatch" style={{ background: theme.colors.paper }}>
                  <span style={{ background: theme.colors.panel }} />
                  <span style={{ background: theme.colors.lavender }} />
                </span>
                <span className="simple-look-name">{theme.name}</span>
              </button>
            ))}
          </span>
          <button type="button" className="simple-tile-link" onClick={() => onOpen("appearance")}>{t("simpleSettings.moreLooks")}</button>
        </div>

        {tiles.map(({ tab, icon: Icon, tone, title, hint }) => (
          <button key={tab} type="button" className="simple-tile" onClick={() => onOpen(tab)}>
            <span className={`simple-tile-art tone-${tone}`}><Icon size={26} aria-hidden="true" /></span>
            <strong>{title}</strong>
            <small>{hint}</small>
          </button>
        ))}
      </div>

      <div className="simple-settings-foot">
        <button type="button" className="simple-settings-everything" onClick={onShowEverything}>
          <Layers size={16} aria-hidden="true" />
          {t("simpleSettings.everything")}
        </button>
        <button type="button" className="simple-settings-signout" onClick={onSignOut}>
          <LogOut size={16} aria-hidden="true" />
          {t("userSettings.logOut")}
        </button>
      </div>
    </div>
  );
}
