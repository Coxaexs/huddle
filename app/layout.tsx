import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";
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
      description: "Voice and chat for your friends.",
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
    alternates: { canonical: `${site}/` },
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/hangout/manifest.json" />
        {/* Safari skips SVG favicons and falls back to a letter, so it gets PNGs. */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=2" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=2" />
      </head>
      <body>{children}</body>
    </html>
  );
}
