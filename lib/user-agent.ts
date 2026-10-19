/**
 * A short, human name for the device a session signed in from, such as
 * "Firefox on Windows" or "Hoffle app on Android". Good enough to recognise
 * your own devices in Settings → Security; it is not a fingerprint.
 */
export function describeUserAgent(ua: string | null | undefined): string {
  const { browser, os } = userAgentParts(ua);
  return os ? `${browser} on ${os}` : browser;
}

/**
 * The browser (or app) and system separately, so the interface can phrase
 * "Firefox on Windows" in its own language. The generic names ("Unknown
 * device", "Hoffle app", "A browser"…) are fixed English ids the client
 * translates; the rest are product names.
 */
export function userAgentParts(ua: string | null | undefined): { browser: string; os: string | null } {
  if (!ua) return { browser: "Unknown device", os: null };

  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : null;

  // Hoffle's own apps first: they wrap a browser engine, so they also match it.
  const app = /Hoffle|Huddle|Electron|Tauri/i.test(ua)
    ? "Hoffle desktop app"
    : /; wv\)|Capacitor/.test(ua)
      ? "Hoffle app"
      : null;
  const browser =
    app ??
    (/Edg\//.test(ua)
      ? "Edge"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /SamsungBrowser/.test(ua)
            ? "Samsung Internet"
            : /Chrome\/|CriOS/.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : /discord\.py|discord\.js|DiscordBot|python|node|curl/i.test(ua)
                  ? "A script or bot"
                  : "A browser");

  return { browser, os };
}
