import type { Metadata } from "next";
import { SITE } from "../components/site-chrome";
import { VS_DISCORD_META, VS_DISCORD_PATH, VsDiscordPage } from "../components/vs-discord-page";

const meta = VS_DISCORD_META.en;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: {
    canonical: `${SITE}${VS_DISCORD_PATH.en}`,
    languages: { en: `${SITE}${VS_DISCORD_PATH.en}`, tr: `${SITE}${VS_DISCORD_PATH.tr}`, "x-default": `${SITE}${VS_DISCORD_PATH.en}` },
  },
  openGraph: { title: meta.title, description: meta.description, siteName: "Hoffle", type: "website", images: [{ url: "/og.png", width: 1200, height: 630 }] },
};

export default function VsDiscordRoute() {
  return <VsDiscordPage lang="en" />;
}
