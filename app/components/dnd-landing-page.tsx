import { Box, Coins, Dices, Map, Shield, Sparkles } from "lucide-react";
import type { LandingLang } from "./landing-copy";
import { APP_URL, REPO, SITE, SiteShell } from "./site-chrome";

/**
 * hoffle.online/dnd (and /tr/dnd): Dedicated Dungeons & Dragons & tabletop VTT
 * overview highlighting Hoffle's shipped 2D battlemap, 3D tabletop, 2014+2024
 * SRD tools, DM role authority, blind rolls, and party stash.
 */

export const DND_LANDING_PATH: Record<LandingLang, string> = {
  en: "/dnd",
  tr: "/tr/dnd",
};

export const DND_LANDING_META: Record<LandingLang, { title: string; description: string }> = {
  en: {
    title: "D&D & Virtual Tabletop Built Into Chat — Hoffle",
    description:
      "Play D&D 5e with a 2D battlemap (fog of war, AoE templates, initiative, HP tiers), 3D tabletop, full 2014 + 2024 SRD slash commands, blind GM rolls, and party loot splitter — free and open source.",
  },
  tr: {
    title: "Sohbetin İçine Yerleşik D&D ve Sanal Masaüstü — Hoffle",
    description:
      "2B savaş haritası (savaş sisi, AoE şablonları, inisiyatif, CP durumları), 3B masaüstü, eksiksiz 2014 + 2024 5e SRD komutları, gizli GM zarları ve parti hazinesiyle D&D 5e oynayın — tamamen ücretsiz ve açık kaynak.",
  },
};

type FeatureCard = {
  id: string;
  title: string;
  body: string;
};

type CompareRow = {
  feature: string;
  others: string;
  hoffle: string;
};

const COPY: Record<
  LandingLang,
  {
    heroTitle: string;
    heroBody: string;
    primaryCta: string;
    secondaryCta: string;
    featuresTitle: string;
    featuresLead: string;
    cards: FeatureCard[];
    compareTitle: string;
    compareLead: string;
    compareCaption: string;
    compareColFeature: string;
    compareColOthers: string;
    compareColHoffle: string;
    compareRows: CompareRow[];
    faqTitle: string;
    faqs: Array<{ q: string; a: string }>;
    ctaTitle: string;
    ctaBody: string;
    repoLink: string;
  }
> = {
  en: {
    heroTitle: "Your D&D table, built straight into voice chat.",
    heroBody:
      "Skip juggling Discord voice, paid VTT subscriptions, and fragile bot invites. Hoffle ships a live 2D tactical battlemap, a 3D Living Room tabletop, a full 2014 & 2024 5e SRD compendium, character sheets, blind GM rolls, and a shared party loot board — all free and open source.",
    primaryCta: "Open Hoffle",
    secondaryCta: "Self-host guide",
    featuresTitle: "Everything at the virtual table",
    featuresLead: "Every tool shares the same server roles, voice call, and text channel.",
    cards: [
      {
        id: "map",
        title: "2D Tactical Battlemap",
        body: "SVG fog-of-war with cover and reveal cutouts, feet distance ruler, sphere/cone/cube/line AoE spell templates, multi-scene prep and switching, GM hidden tokens, and player-facing monster HP status tiers.",
      },
      {
        id: "table3d",
        title: "3D Tabletop & Character Sheets",
        body: "Play together in a 3D room synced live with the 2D battlemap, complete with 3D dice rolls, spell slots, death saves, short rests with Hit Dice healing, and long rest recovery.",
      },
      {
        id: "dm",
        title: "Role-Unified GM Authority & Blind Rolls",
        body: "Assign one Game Master role in Server Settings and Hoffle respects it everywhere: battlemap controls, 3D table GM, Tavern VTT SSO, session recording, and /blindroll checks only DMs can inspect or reveal.",
      },
      {
        id: "srd",
        title: "Full 2014 & 2024 5e SRD Compendium",
        body: "Look up hundreds of spells, monsters, items, feats, subclasses, and conditions inline with /spell, /monster, /item, and /feat — plus clickable dice buttons and 1-click DM damage application directly from roll cards.",
      },
      {
        id: "rp",
        title: "In-Character Proxy & Party Stash",
        body: "Toggle /ic to speak with your character's name and portrait while keeping account attribution clear, split looted gold evenly down to the copper piece, and track shared party items and campaign quests.",
      },
      {
        id: "dock",
        title: "Unified Tabletop Dock & Ambience",
        body: "Open your sheet, 2D map, 3D room, Tavern VTT, Bard music, or Party Stash from one dock in chat or voice stage — and automatically swap voice music between combat and exploration.",
      },
    ],
    compareTitle: "No seat limits, no storage caps, no subscription fatigue",
    compareLead: "Compare Hoffle against stacking Discord with a paid virtual tabletop.",
    compareCaption: "Feature comparison between typical Discord + paid VTT setups and Hoffle",
    compareColFeature: "Feature",
    compareColOthers: "Discord + Paid VTT Stack",
    compareColHoffle: "Hoffle (Included Free)",
    compareRows: [
      {
        feature: "Monthly cost & paywalls",
        others: "Discord Nitro + VTT subscription for dynamic fog, slots, or scenes",
        hoffle: "$0. Dynamic fog cutouts, scenes, and 1080p60 screen share included",
      },
      {
        feature: "Rules compendium",
        others: "Third-party bots or separate paid digital sourcebooks",
        hoffle: "Bundled CC-BY-4.0 2014 & 2024 5e SRD data ready offline & self-hosted",
      },
      {
        feature: "Combat speed tools",
        others: "Copy roll totals manually across browser tabs to deduct HP",
        hoffle: "1-click damage (-Full / -½ / -2× / +Heal) + automatic CON Concentration DC prompts",
      },
      {
        feature: "GM privacy",
        others: "Manual whispers or cluttered private bot threads",
        hoffle: "Dedicated /blindroll pushed only to configured GM role holders, with 1-click Reveal",
      },
      {
        feature: "Ownership",
        others: "Proprietary SaaS silos",
        hoffle: "Open-source AGPL-3.0; run the managed cloud or docker compose at home",
      },
    ],
    faqTitle: "Frequently asked questions",
    faqs: [
      {
        q: "Does Hoffle support both 2014 and 2024 D&D 5e rules?",
        a: "Yes. Every server can pick 2014 or 2024 rules in Server Settings → Integrations, or look up entries explicitly across both bundled CC-BY-4.0 SRD datasets.",
      },
      {
        q: "Who gets Game Master controls on the battlemap and 3D table?",
        a: "Server owners, administrators, channel managers — plus any custom Hoffle Role you select as the Game Master Role in Server Settings.",
      },
      {
        q: "Can players connect existing Discord bots or custom homebrew?",
        a: "Yes. Servers support custom homebrew entries per campaign as well as Discord-compatible bot tokens.",
      },
    ],
    ctaTitle: "Ready for session zero?",
    ctaBody: "Spin up a server in seconds or host the full stack — battlemap and SRD bot included.",
    repoLink: "View source on GitHub",
  },
  tr: {
    heroTitle: "Sesli sohbetinin tam kalbindeki D&D masan.",
    heroBody:
      "Discord, ücretli VTT abonelikleri ve bozuk bot davetleri arasında sekme değiştirmeyi bırakın. Hoffle; canlı 2B savaş haritası, 3B Oturma Odası masası, eksiksiz 2014 & 2024 5e SRD rehberi, karakter kağıtları, gizli GM zarları ve ortak parti hazinesiyle gelir — tamamen ücretsiz ve açık kaynak.",
    primaryCta: "Hoffle'ı Aç",
    secondaryCta: "Kendi sunucunda kur",
    featuresTitle: "Sanal masadaki her şey tek yerde",
    featuresLead: "Her araç aynı sunucu rollerini, sesli aramayı ve metin kanalını paylaşır.",
    cards: [
      {
        id: "map",
        title: "2B Taktik Savaş Haritası",
        body: "Gizle/Aç kesikli SVG savaş sisi, fit cinsinden cetvel, küre/koni/küp/çizgi AoE büyü şablonları, çoklu sahne hazırlığı, GM gizli taş katmanı ve oyunculara özel can durumu aşamaları.",
      },
      {
        id: "table3d",
        title: "3B Masaüstü ve Karakter Kağıdı",
        body: "2B haritayla canlı senkronize çalışan 3B odada oynayın: 3B zarlar, büyü yuvaları, ölüm kurtarmaları, Can Zarı harcayan Kısa Dinlenme ve Uzun Dinlenme yenilemesi.",
      },
      {
        id: "dm",
        title: "Tek Rolle Birleşik GM Yetkisi ve Gizli Zarlar",
        body: "Sunucu Ayarlarından tek bir Oyun Yöneticisi rolü seçin; 2B harita, 3B masa, Tavern VTT SSO, oturum kaydı ve yalnızca GM'lerin görüp masaya açıklayabileceği /blindroll zarlarında geçerli olsun.",
      },
      {
        id: "srd",
        title: "Tam 2014 & 2024 5e SRD El Kitabı",
        body: "/spell, /monster, /item ve /feat komutlarıyla yüzlerce büyü, canavar, eşya ve yeteneği anında sohbete çağırın — tıklanabilir zarlar ve zar kartından tek tıkla hasar uygulama dahil.",
      },
      {
        id: "rp",
        title: "Karakter İçi Konuşma ve Parti Hazinesi",
        body: "/ic ile karakterinizin adı ve portresiyle yazarken gerçek hesap bilgisini koruyun, ganimet altınlarını bakırına kadar bölüştürün ve parti envanteriyle görev panosunu yönetin.",
      },
      {
        id: "dock",
        title: "Birleşik Masaüstü Paneli ve Müzik",
        body: "Karakter kağıdı, 2B harita, 3B masa, Tavern VTT, Ozan müziği veya Parti Hazinesini tek düğmeden açın; savaş başladığında ses kanalının müziği otomatik değişsin.",
      },
    ],
    compareTitle: "Koltuk sınırı yok, abonelik yorgunluğu yok",
    compareLead: "Discord üzerine ücretli VTT abonelikleri eklemekle Hoffle'ı karşılaştırın.",
    compareCaption: "Discord + ücretli VTT kurulumları ile Hoffle karşılaştırması",
    compareColFeature: "Özellik",
    compareColOthers: "Discord + Ücretli VTT",
    compareColHoffle: "Hoffle (Ücretsiz Dahil)",
    compareRows: [
      {
        feature: "Aylık ücret ve kilitler",
        others: "Discord Nitro + dinamik sis, sahne ve slotlar için VTT aboneliği",
        hoffle: "0 TL/$. Dinamik savaş sisi, sahneler ve 1080p60 ekran paylaşımı dahil",
      },
      {
        feature: "Kural arşivi",
        others: "Harici botlar veya ayrı satılan dijital kural kitapları",
        hoffle: "Çevrimdışı ve kendi sunucunuzda çalışan gömülü CC-BY-4.0 2014 & 2024 5e SRD",
      },
      {
        feature: "Savaş hızı araçları",
        others: "Hasar düşmek için sekmeler arasında sayı kopyalama",
        hoffle: "Zar kartından tek tıkla hasar (-Tam / -½ / -2× / +İyileş) + otomatik Konsantrasyon DC uyarısı",
      },
      {
        feature: "GM gizliliği",
        others: "Özel mesajlar veya kalabalık gizli bot kanalları",
        hoffle: "Yalnızca GM rolündekilere iletilen /blindroll zarları ve tek tıkla Masaya Açıkla",
      },
      {
        feature: "Sahiplik",
        others: "Kapalı platformlara bağımlılık",
        hoffle: "Açık kaynak AGPL-3.0; ister bulutta kullanın ister Docker ile kendiniz barındırın",
      },
    ],
    faqTitle: "Sık sorulan sorular",
    faqs: [
      {
        q: "Hoffle hem 2014 hem de 2024 D&D 5e kurallarını destekliyor mu?",
        a: "Evet. Her sunucu Sunucu Ayarları → Entegrasyonlar menüsünden varsayılan 2014 veya 2024 kural setini seçebilir ya da iki gömülü CC-BY-4.0 SRD veri tabanından da arama yapabilir.",
      },
      {
        q: "2B harita ve 3B masada GM yetkisini kimler alır?",
        a: "Sunucu sahipleri, yöneticiler ve kanal yetkililerinin yanı sıra Sunucu Ayarlarından Oyun Yöneticisi Rolü olarak seçtiğiniz özel Hoffle rolüne sahip herkes.",
      },
      {
        q: "Özel ev yapımı (homebrew) kurallar ekleyebilir miyiz?",
        a: "Evet. Her sunucu kendi kampanyasına özel büyü, canavar ve eşyalar ekleyebilir.",
      },
    ],
    ctaTitle: "İlk oturuma hazır mısınız?",
    ctaBody: "Saniyeler içinde sunucu açın ya da savaş haritası ve SRD botuyla kendi makinenizde çalıştırın.",
    repoLink: "GitHub'da kaynak kodu gör",
  },
};

function iconFor(id: string) {
  switch (id) {
    case "map":
      return <Map size={18} aria-hidden="true" />;
    case "table3d":
      return <Box size={18} aria-hidden="true" />;
    case "dm":
      return <Shield size={18} aria-hidden="true" />;
    case "srd":
      return <Sparkles size={18} aria-hidden="true" />;
    case "rp":
      return <Coins size={18} aria-hidden="true" />;
    default:
      return <Dices size={18} aria-hidden="true" />;
  }
}

function dndJsonLd(lang: LandingLang, c: (typeof COPY)[LandingLang]) {
  const url = `${SITE}${DND_LANDING_PATH[lang]}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Hoffle Virtual Tabletop & D&D",
        url,
        applicationCategory: "GameApplication",
        operatingSystem: "Web, Windows, macOS, Linux",
        isAccessibleForFree: true,
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
        sameAs: [REPO],
      },
      {
        "@type": "FAQPage",
        mainEntity: c.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

export function DndLandingPage({ lang = "en" }: { lang?: LandingLang }) {
  const other: LandingLang = lang === "en" ? "tr" : "en";
  const c = COPY[lang];

  return (
    <SiteShell lang={lang} alternate={{ href: DND_LANDING_PATH[other], lang: other }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dndJsonLd(lang, c)) }}
      />

      <main lang={lang}>
        <section className="px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
          <div className="mx-auto max-w-5xl">
            <h1 className="lp-display max-w-[22ch] text-4xl font-normal leading-[1.1] sm:text-[52px]">
              {c.heroTitle}
            </h1>
            <p className="mt-5 max-w-[64ch] text-lg leading-relaxed text-(--ink-2)">
              {c.heroBody}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={APP_URL}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-(--violet-fill) px-5 text-[15px] font-semibold text-white transition hover:bg-(--violet-fill-hover)"
              >
                {c.primaryCta}
              </a>
              <a
                href="/docs/self-hosting"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-(--line) bg-(--card) px-5 text-[15px] font-semibold text-(--ink) transition hover:border-(--violet)"
              >
                {c.secondaryCta}
              </a>
            </div>
          </div>
        </section>

        <section className="border-t border-(--line) bg-(--paper-2) px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="lp-display text-3xl font-normal sm:text-4xl">{c.featuresTitle}</h2>
            <p className="mt-2.5 max-w-2xl text-(--ink-2)">{c.featuresLead}</p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {c.cards.map((card) => (
                <article
                  key={card.id}
                  className="rounded-xl border border-(--line) bg-(--card) p-6"
                >
                  <div className="flex items-center gap-2.5 text-(--violet)">
                    {iconFor(card.id)}
                    <h3 className="text-base font-semibold text-(--ink)">{card.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-(--ink-2)">{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="lp-display text-3xl font-normal sm:text-4xl">{c.compareTitle}</h2>
            <p className="mt-2.5 max-w-2xl text-(--ink-2)">{c.compareLead}</p>
            <div className="mt-8 overflow-x-auto rounded-xl border border-(--line)">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">{c.compareCaption}</caption>
                <thead>
                  <tr className="border-b border-(--line) bg-(--paper-2)">
                    <th scope="col" className="px-4 py-3 font-semibold text-(--muted)">
                      {c.compareColFeature}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {c.compareColOthers}
                    </th>
                    <th scope="col" className="bg-(--violet-tint) px-4 py-3 font-semibold text-(--violet)">
                      {c.compareColHoffle}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.compareRows.map((row) => (
                    <tr key={row.feature} className="border-b border-(--line) last:border-b-0">
                      <th scope="row" className="px-4 py-3 align-top font-semibold">
                        {row.feature}
                      </th>
                      <td className="px-4 py-3 align-top text-(--ink-2)">{row.others}</td>
                      <td className="bg-(--violet-tint) px-4 py-3 align-top font-medium">
                        {row.hoffle}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-t border-(--line) bg-(--paper-2) px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-4xl space-y-10">
            <div>
              <h2 className="lp-display text-3xl font-normal">{c.faqTitle}</h2>
              <div className="mt-6 space-y-3">
                {c.faqs.map((faq) => (
                  <details
                    key={faq.q}
                    className="rounded-xl border border-(--line) bg-(--card) p-4"
                  >
                    <summary className="cursor-pointer font-semibold">{faq.q}</summary>
                    <p className="mt-2 text-sm leading-relaxed text-(--ink-2)">{faq.a}</p>
                  </details>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-(--line) bg-(--card) p-8">
              <h2 className="lp-display text-2xl font-normal sm:text-3xl">{c.ctaTitle}</h2>
              <p className="mt-2 text-(--ink-2)">{c.ctaBody}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={APP_URL}
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-(--violet-fill) px-5 text-sm font-semibold text-white hover:bg-(--violet-fill-hover)"
                >
                  {c.primaryCta}
                </a>
                <a
                  href={REPO}
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-(--line) px-5 text-sm font-semibold text-(--ink) hover:border-(--violet)"
                >
                  {c.repoLink}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
