"use client";

import { PhonePushSettings } from "../phone-push-settings";
import { DigestSettings } from "../digest-settings";
import { disableWebPush, enableWebPush } from "../../lib/web-push";
import { useI18n } from "../../lib/i18n-context";

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

      <PhonePushSettings />
      <DigestSettings />
    </>
  );
}
