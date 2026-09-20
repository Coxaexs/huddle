import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

export const viewport = {
  themeColor: "#7b63e6",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ||
    requestHeaders.get("host") ||
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ||
    (host.startsWith("localhost") ? "http" : "https");

  const baseUrl = `${protocol}://${host}`;
  const isProd = host.includes("hoffle.online") || host.includes("hoffle.com");
  const canonicalUrl = isProd ? "https://hoffle.online" : baseUrl;

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: "Hoffle · Open-Source Discord Alternative",
      template: "%s · Hoffle",
    },
    description:
      "An open-source, self-hostable Discord alternative for your favorite communities. Enjoy crystal-clear WebRTC voice, 1080p60 screen sharing, synchronized music bots, and total privacy.",
    keywords: [
      "Hoffle",
      "Discord alternative",
      "open source discord",
      "self hosted chat",
      "voice chat",
      "WebRTC voice chat",
      "screen share",
      "music bot",
      "gaming voice channels",
      "free discord alternative",
      "private community chat",
    ],
    authors: [{ name: "Hoffle", url: "https://hoffle.online" }],
    creator: "Hoffle",
    publisher: "Hoffle",
    alternates: {
      canonical: canonicalUrl,
    },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
      apple: "/favicon.svg",
    },
    openGraph: {
      title: "Hoffle · Open-Source Discord Alternative",
      description:
        "An open-source, self-hostable Discord alternative for your favorite communities. High-fidelity voice, screen share, and zero subscriptions.",
      url: canonicalUrl,
      siteName: "Hoffle",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1730,
          height: 909,
          alt: "Hoffle - Open Source Discord Alternative",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Hoffle · Open-Source Discord Alternative",
      description:
        "An open-source, self-hostable Discord alternative for your favorite communities.",
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

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Hoffle",
  applicationCategory: "CommunicationApplication",
  operatingSystem: "Web, Windows, macOS, Linux, iOS, Android",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "An open-source, self-hostable Discord alternative for your favorite communities with high-fidelity voice, screen share, and zero subscriptions.",
  url: "https://hoffle.online",
  image: "https://hoffle.online/og.png",
  author: {
    "@type": "Organization",
    name: "Hoffle",
    url: "https://hoffle.online",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/hangout/manifest.json" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
