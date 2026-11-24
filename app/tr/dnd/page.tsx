import type { Metadata } from "next";
import { SITE } from "../../components/site-chrome";
import { DND_LANDING_META, DND_LANDING_PATH, DndLandingPage } from "../../components/dnd-landing-page";

const meta = DND_LANDING_META.tr;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: {
    canonical: `${SITE}${DND_LANDING_PATH.tr}`,
    languages: {
      en: `${SITE}${DND_LANDING_PATH.en}`,
      tr: `${SITE}${DND_LANDING_PATH.tr}`,
      "x-default": `${SITE}${DND_LANDING_PATH.en}`,
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

export default function DndLandingTurkishRoute() {
  return <DndLandingPage lang="tr" />;
}
