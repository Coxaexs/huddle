import type { PublicDiscoverServer } from "@/lib/discover";
import type { LandingLang } from "./landing-copy";
import { DiscoverClient } from "./discover-client";
import { SiteShell } from "./site-chrome";

export const DISCOVER_PATH: Record<LandingLang, string> = {
  en: "/discover",
  tr: "/tr/discover",
};

export const DISCOVER_META: Record<LandingLang, { title: string; description: string }> = {
  en: {
    title: "Discover Public Servers — Hoffle",
    description:
      "Browse open communities, D&D campaigns, gaming hangouts, study groups, and dev teams on Hoffle.",
  },
  tr: {
    title: "Açık Sunucuları Keşfet — Hoffle",
    description:
      "Hoffle üzerindeki herkese açık toplulukları, D&D kampanyalarını, oyun gruplarını, çalışma odalarını ve geliştirici ekiplerini keşfet.",
  },
};

const HERO_COPY: Record<LandingLang, { eyebrow: string; title: string; lead: string }> = {
  en: {
    eyebrow: "PUBLIC SERVER DIRECTORY",
    title: "Find your next hangout on Hoffle",
    lead: "Explore open communities, tabletop campaigns, study halls, and creator rooms — join directly with one click or preview web-public servers in your browser.",
  },
  tr: {
    eyebrow: "HERKESE AÇIK SUNUCU DİZİNİ",
    title: "Hoffle'da yeni topluluğunu bul",
    lead: "Açık toplulukları, D&D masalarını, çalışma odalarını ve yayıncı sunucularını keşfet — tek tıkla katıl ya da tarayıcıdan önizle.",
  },
};

export function DiscoverPage({
  lang = "en",
  initialServers = [],
  fetchOnMount = true,
}: {
  lang?: LandingLang;
  initialServers?: PublicDiscoverServer[];
  fetchOnMount?: boolean;
}) {
  const other: LandingLang = lang === "en" ? "tr" : "en";
  const hero = HERO_COPY[lang];

  return (
    <SiteShell lang={lang} alternate={{ href: DISCOVER_PATH[other], lang: other }}>
      <main lang={lang} className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--violet)">
              {hero.eyebrow}
            </p>
            <h1 className="lp-display mt-2 text-3xl font-normal leading-tight text-(--ink) sm:text-5xl">
              {hero.title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-(--ink-2) sm:text-lg">
              {hero.lead}
            </p>
          </div>

          <DiscoverClient
            lang={lang}
            initialServers={initialServers}
            fetchOnMount={fetchOnMount}
          />
        </div>
      </main>
    </SiteShell>
  );
}
