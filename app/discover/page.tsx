import type { Metadata } from "next";
import { queryPublicDirectory, type PublicDiscoverServer } from "@/lib/discover";
import { bindings } from "@/lib/storage";
import { SITE } from "../components/site-chrome";
import { DISCOVER_META, DISCOVER_PATH, DiscoverPage } from "../components/discover-page";

export const dynamic = "force-dynamic";

const meta = DISCOVER_META.en;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: {
    canonical: `${SITE}${DISCOVER_PATH.en}`,
    languages: {
      en: `${SITE}${DISCOVER_PATH.en}`,
      tr: `${SITE}${DISCOVER_PATH.tr}`,
      "x-default": `${SITE}${DISCOVER_PATH.en}`,
    },
  },
  openGraph: {
    title: meta.title,
    description: meta.description,
    siteName: "Hoffle",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
};

export default async function DiscoverRoute() {
  let initialServers: PublicDiscoverServer[] = [];
  try {
    const env = bindings();
    if (env.DB) {
      initialServers = await queryPublicDirectory(env.DB, {
        appUrl: env.PUBLIC_URL?.trim() || undefined,
      });
    }
  } catch {
    initialServers = [];
  }
  return <DiscoverPage lang="en" initialServers={initialServers} />;
}
