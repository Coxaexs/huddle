import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";
import "./redesign.css";
import "./theme-flavors.css";
import "./retro-skins.css";
import "./refresh.css";
import "./theme-fx.css";
import "./cosmetics.css";
import "./cosmetics-extra.css";
import "./profile-style.css";
import "./theme-panels.css";
import "./achievements.css";
import "./command-buttons.css";
import "./hoffy.css";
import "./channel-permissions.css";
import "./easy.css";
import { I18nProvider } from "./lib/i18n-context";
import { InstallPrompt } from "./components/install-prompt";
import { INSTALL_EVENT_SCRIPT } from "./lib/install-event";
import { isLandingHost } from "./lib/landing-host";

export const viewport = {
  themeColor: "#7b63e6",
  width: "device-width",
  initialScale: 1,
  // Stops iOS zooming in whenever a text box gets focus (it does that for
  // inputs under 16px) and then staying zoomed.
  maximumScale: 1,
  // Lets the page reach under the notch/status bar so env(safe-area-inset-*)
  // reports real values; the layout pads itself (see globals.css).
  viewportFit: "cover",
};

const LANDING_TITLE = "Hoffle: the free, open-source Discord alternative";
const LANDING_DESCRIPTION =
  "Voice chat, 1080p screen sharing with sound, music together and D&D tools for your friends. Free, open source, no Nitro. Browser, desktop or self-hosted.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ||
    requestHeaders.get("host") ||
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ||
    (host.startsWith("localhost") ? "http" : "https");

  // The purple "H" app icon, the same one the desktop and phone apps use.
  // Browsers that skip SVG favicons fetch /favicon.ico; Safari wants a PNG.
  const icons = {
    icon: "/favicon.svg?v=2",
    shortcut: "/favicon.ico?v=2",
    apple: "/apple-touch-icon.png?v=2",
  };

  // Chat instances (chat.hoffle.online, deeppixel.online/hangout, anyone's
  // self-hosted server) are login screens; keep them out of search results so
  // they don't compete with the landing page or expose private servers.
  if (!isLandingHost(host)) {
    return {
      metadataBase: new URL(`${protocol}://${host}`),
      title: { default: "Hoffle", template: "%s · Hoffle" },
      description: "Hoffle: open-source voice channels, screen sharing and text chat with servers, DMs and friends.",
      icons,
      robots: { index: false, follow: false },
    };
  }

  const site = "https://hoffle.online";
  return {
    metadataBase: new URL(site),
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    authors: [{ name: "coxaexs", url: "https://github.com/Coxaexs" }],
    // www.hoffle.online and hoffle.com serve the same page; this is the one to index.
    alternates: {
      canonical: `${site}/`,
      languages: { en: `${site}/`, tr: `${site}/tr`, "x-default": `${site}/` },
    },
    icons,
    openGraph: {
      title: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      url: `${site}/`,
      siteName: "Hoffle",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "Hoffle in its Cozy and MSN Messenger themes",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      images: ["/og.png"],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    verification: {
      google:
        process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
        process.env.GOOGLE_SITE_VERIFICATION ||
        undefined,
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The worker marks hoffle.online/tr (worker/index.ts); everything else is English
  // until the app's own language setting takes over on the client.
  const requestHeaders = await headers();
  const lang = requestHeaders.get("x-hoffle-lang") === "tr" ? "tr" : "en";
  const app = !isLandingHost(requestHeaders.get("host"));
  return (
    <html lang={lang} data-site-lang={app ? undefined : lang}>
      <head>
        <link rel="manifest" href="/hangout/app.webmanifest" />
        {/* Safari skips SVG favicons and falls back to a letter, so it gets PNGs. */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=2" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=2" />
        {app && <script dangerouslySetInnerHTML={{ __html: INSTALL_EVENT_SCRIPT }} />}
      </head>
      <body>
        <I18nProvider>
          {children}
          {app && <InstallPrompt />}
        </I18nProvider>
      </body>
    </html>
  );
}
