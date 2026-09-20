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

  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: {
      default: "Hoffle",
      template: "%s · Hoffle",
    },
    description: "An open-source, self-hostable Discord alternative for your favorite communities.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Hoffle",
      description: "An open-source, self-hostable Discord alternative for your favorite communities.",
      type: "website",
      images: [
        { url: "/og.png", width: 1730, height: 909, alt: "Hoffle" },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Hoffle",
      description: "An open-source, self-hostable Discord alternative for your favorite communities.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/hangout/manifest.json" />
      </head>
      <body>{children}</body>
    </html>
  );
}
