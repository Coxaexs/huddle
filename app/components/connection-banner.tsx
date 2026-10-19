"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n-context";

/**
 * Tells people when live updates have stopped. Without it, a dropped socket
 * looks like a quiet channel: messages stop arriving and nothing says why.
 *
 * Waits a moment before showing so the normal startup handshake and quick
 * blips (a laptop lid, a wifi hop) do not flash a warning.
 */
export function ConnectionBanner({ connected }: { connected: boolean }) {
  const { t } = useI18n();
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (connected && online) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), online ? 2500 : 0);
    return () => window.clearTimeout(timer);
  }, [connected, online]);

  if (!visible) return null;
  return (
    <div className="connection-banner" role="status" aria-live="polite">
      <span className="connection-banner-dot" aria-hidden="true" />
      {online
        ? t("shell.reconnecting")
        : t("shell.offline")}
    </div>
  );
}
