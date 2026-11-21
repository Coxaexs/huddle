"use client";

import { PhonePushSettings } from "../phone-push-settings";
import { DigestSettings } from "../digest-settings";
import { disableWebPush, enableWebPush } from "../../lib/web-push";
import { useI18n } from "../../lib/i18n-context";
import { useState } from "react";
import { MAX_KEYWORDS, MAX_KEYWORD_LENGTH, MIN_KEYWORD_LENGTH } from "@/lib/notify-prefs";
import { deviceTimeZone, setNotifyPrefs, useNotifyPrefs } from "../../lib/notify-prefs-store";

/** Desktop, phone and email notifications, which used to live under Appearance. */
export function NotificationsTab({
  notify,
  setNotify,
}: {
  notify: boolean;
  setNotify: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="appearance-switch">
        <span>
          <strong>{t("notificationSettings.enableDesktop")}</strong>
          <small>{t("notificationSettings.desktopDesc")}</small>
        </span>

        <input
          type="checkbox"
          checked={notify}
          onChange={(event) => {
            const on = event.target.checked;
            setNotify(on);
            window.localStorage.setItem("huddle-notify", on ? "on" : "off");
            // Subscribing asks for permission, so it has to happen here in the
            // click rather than on page load.
            void (on ? enableWebPush(true) : disableWebPush()).catch(() => undefined);
          }}
        />
      </label>

      <QuietHoursSetting />
      <KeywordSetting />

      <PhonePushSettings />
      <DigestSettings />
    </>
  );
}

/** A nightly window in which nothing pops up, chimes or is pushed to a phone. */
function QuietHoursSetting() {
  const { t } = useI18n();
  const { quiet } = useNotifyPrefs();
  // Saved with this device's time zone, so the server silences pushes at the
  // same local time the person picked here.
  const change = (patch: Partial<typeof quiet>) =>
    setNotifyPrefs((current) => ({ ...current, quiet: { ...current.quiet, ...patch, tz: deviceTimeZone() } }));
  return (
    <div className="notify-setting">
      <label className="appearance-switch">
        <span>
          <strong>{t("notificationSettings.quietHours")}</strong>
          <small>{t("notificationSettings.quietHoursDesc")}</small>
        </span>
        <input type="checkbox" checked={quiet.on} onChange={(event) => change({ on: event.target.checked })} />
      </label>
      {quiet.on && (
        <div className="notify-quiet-times">
          <label>
            <span>{t("notificationSettings.quietFrom")}</span>
            <input
              type="time"
              value={quiet.from}
              onChange={(event) => event.target.value && change({ from: event.target.value })}
            />
          </label>
          <label>
            <span>{t("notificationSettings.quietTo")}</span>
            <input
              type="time"
              value={quiet.to}
              onChange={(event) => event.target.value && change({ to: event.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

/** Words that notify like a mention when someone says them in a server. */
function KeywordSetting() {
  const { t } = useI18n();
  const { keywords } = useNotifyPrefs();
  const [draft, setDraft] = useState("");
  const full = keywords.length >= MAX_KEYWORDS;
  const add = () => {
    // Commas separate several words typed at once.
    const words = draft.split(",").map((word) => word.trim()).filter((word) => word.length >= MIN_KEYWORD_LENGTH);
    setDraft("");
    if (!words.length) return;
    setNotifyPrefs((current) => ({ ...current, keywords: [...current.keywords, ...words] }));
  };
  const remove = (word: string) =>
    setNotifyPrefs((current) => ({ ...current, keywords: current.keywords.filter((entry) => entry !== word) }));
  return (
    <div className="notify-setting notify-keywords">
      <div className="notify-keywords-head">
        <strong>{t("notificationSettings.keywords")}</strong>
        <small>{t("notificationSettings.keywordsDesc")}</small>
      </div>
      {keywords.length > 0 && (
        <ul className="notify-keyword-list">
          {keywords.map((word) => (
            <li key={word}>
              <span>{word}</span>
              <button
                type="button"
                onClick={() => remove(word)}
                aria-label={t("notificationSettings.keywordRemove", { word })}
                title={t("notificationSettings.keywordRemove", { word })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="notify-keyword-add"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          value={draft}
          maxLength={MAX_KEYWORD_LENGTH * 4}
          disabled={full}
          placeholder={full ? t("notificationSettings.keywordsFull") : t("notificationSettings.keywordPlaceholder")}
          aria-label={t("notificationSettings.keywords")}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={full || draft.trim().length < MIN_KEYWORD_LENGTH}>
          {t("notificationSettings.keywordAdd")}
        </button>
      </form>
    </div>
  );
}
