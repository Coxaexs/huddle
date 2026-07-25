import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

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
      default: "Huddle",
      template: "%s · Huddle",
    },
    description: "A tiny private place for your favorite people.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Huddle",
      description: "A tiny private place for your favorite people.",
      type: "website",
      images: [
        { url: "/og.png", width: 1730, height: 909, alt: "Huddle" },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Huddle",
      description: "A tiny private place for your favorite people.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
