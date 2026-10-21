import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LandingPage } from "../components/landing-page";
import { LANDING_COPY } from "../components/landing-copy";
import { SITE } from "../components/site-chrome";
import { isLandingHost } from "../lib/landing-host";

/** hoffle.online/tr: the landing page in Turkish. */
const copy = LANDING_COPY.tr;

export const metadata: Metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
  alternates: {
    canonical: `${SITE}/tr`,
    languages: { en: `${SITE}/`, tr: `${SITE}/tr`, "x-default": `${SITE}/` },
  },
  openGraph: {
    title: copy.meta.title,
    description: copy.meta.description,
    url: `${SITE}/tr`,
    siteName: "Hoffle",
    locale: copy.meta.ogLocale,
    alternateLocale: [LANDING_COPY.en.meta.ogLocale],
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Hoffle, Cozy ve MSN Messenger temalarında" }],
  },
  twitter: { card: "summary_large_image", title: copy.meta.title, description: copy.meta.description, images: ["/og.png"] },
};

export default async function TurkishLanding() {
  // Chat hosts (chat.hoffle.online, self-hosted ones) are the app, not the site.
  if (!isLandingHost((await headers()).get("host"))) redirect(`${SITE}/tr`);
  return <LandingPage lang="tr" />;
}
