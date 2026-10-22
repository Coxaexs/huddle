import { APP_URL, SiteShell } from "./site-chrome";
import { Hoffy } from "./hoffy";
import type { LandingLang } from "./landing-copy";

/**
 * hoffle.online/vs-discord (and /tr/vs-discord): Discord's free plan next to
 * Hoffle, row by row, and where Discord is still the better pick. Discord's
 * figures are dated in `source`; check them again before changing a row.
 */
type Row = { label: string; discord: string; hoffle: string; win?: "hoffle" | "discord" };

const COPY: Record<LandingLang, {
  title: string;
  lead: string;
  discord: string;
  rows: Row[];
  betterTitle: string;
  better: string[];
  moveTitle: string;
  moveSteps: string[];
  open: string;
  source: string;
}> = {
  en: {
    title: "Discord vs Hoffle",
    lead: "What you get on each without paying anything. Hoffle is made for groups of friends: everything is free, and moving over takes one link.",
    discord: "Discord (free)",
    rows: [
      { label: "Price", discord: "Free; Nitro is $9.99 a month (US)", hoffle: "Free. No paid tier, nothing locked", win: "hoffle" },
      { label: "Screen share", discord: "720p at 30 fps (1080p60 with Nitro)", hoffle: "1080p at 60 fps, with sound", win: "hoffle" },
      { label: "Custom invite link", discord: "Needs 14 server boosts (Level 3)", hoffle: "Free for every server", win: "hoffle" },
      { label: "Profile effects and decorations", discord: "Bought in the Shop or with Nitro", hoffle: "Free: effects, nameplates, frames and Looks", win: "hoffle" },
      { label: "Themes", discord: "A few colour themes, with Nitro", hoffle: "17 full themes, free, including MSN Messenger and Winamp", win: "hoffle" },
      { label: "Custom emoji in other servers", discord: "Nitro only", hoffle: "Free", win: "hoffle" },
      { label: "Ads", discord: "Sponsored Quests in the app", hoffle: "None", win: "hoffle" },
      { label: "File uploads", discord: "20 MB per file (500 MB with Nitro)", hoffle: "8 MB images, 20 MB PDFs, 40 MB video clips", win: "discord" },
      { label: "Bringing your server", discord: "", hoffle: "Paste a Discord template link: channels, roles and permissions come along" },
      { label: "Bots", discord: "Thousands of bots", hoffle: "discord.js and discord.py bots connect unchanged" },
      { label: "Source code", discord: "Closed", hoffle: "Open source (AGPL-3.0); host it yourself with Docker", win: "hoffle" },
      { label: "Phone", discord: "iOS and Android apps", hoffle: "In the browser, added to the Home Screen with notifications; apps on the way", win: "discord" },
    ],
    betterTitle: "Where Discord is the better pick",
    better: [
      "Big public communities with thousands of people, and the moderation tools and bots that come with them.",
      "Proper phone apps today. Hoffle runs in the phone's browser until its apps are out.",
      "If everyone you know is already there and happy, staying is fine. Hoffle is for groups that want something smaller and theirs.",
    ],
    moveTitle: "Moving your Discord server over",
    moveSteps: [
      "In Discord: Server Settings → Server Template → copy the link.",
      "In Hoffle: + → Create New, and paste the link where the name goes.",
      "Hoffle hands you a ready-made \"we're moving\" message with an invite link. Post it in your Discord.",
    ],
    open: "Open Hoffle",
    source: "Discord figures are from discord.com and Discord's help centre, checked October 2026 (the free upload limit rose to 20 MB in August 2026). Hoffle's upload limits are those of chat.hoffle.online.",
  },
  tr: {
    title: "Discord mu Hoffle mı?",
    lead: "Hiç para ödemeden ikisinde neler var. Hoffle arkadaş grupları için yapıldı: her şey ücretsiz ve taşınmak tek bir link.",
    discord: "Discord (ücretsiz)",
    rows: [
      { label: "Fiyat", discord: "Ücretsiz; Nitro aylık 9,99 $ (ABD)", hoffle: "Ücretsiz. Ücretli plan yok, kilitli özellik yok", win: "hoffle" },
      { label: "Ekran paylaşımı", discord: "30 fps'de 720p (Nitro ile 1080p60)", hoffle: "Sesiyle birlikte 60 fps'de 1080p", win: "hoffle" },
      { label: "Özel davet linki", discord: "14 sunucu takviyesi gerekir (Seviye 3)", hoffle: "Her sunucuya ücretsiz", win: "hoffle" },
      { label: "Profil efektleri ve süsler", discord: "Mağazadan ya da Nitro ile", hoffle: "Ücretsiz: efektler, isim plakaları, çerçeveler ve Görünümler", win: "hoffle" },
      { label: "Temalar", discord: "Nitro ile birkaç renk teması", hoffle: "MSN Messenger ve Winamp dahil 17 tam tema, ücretsiz", win: "hoffle" },
      { label: "Başka sunucularda özel emoji", discord: "Yalnızca Nitro ile", hoffle: "Ücretsiz", win: "hoffle" },
      { label: "Reklam", discord: "Uygulamada sponsorlu Görevler", hoffle: "Yok", win: "hoffle" },
      { label: "Türkiye'de erişim", discord: "Ekim 2024'te erişime engellendi", hoffle: "Engelsiz çalışır", win: "hoffle" },
      { label: "Dosya yükleme", discord: "Dosya başına 20 MB (Nitro ile 500 MB)", hoffle: "Resim 8 MB, PDF 20 MB, video klip 40 MB", win: "discord" },
      { label: "Sunucunu getirmek", discord: "", hoffle: "Discord şablon linkini yapıştır: kanallar, roller ve izinler gelir" },
      { label: "Botlar", discord: "Binlerce bot", hoffle: "discord.js ve discord.py botları değişmeden bağlanır" },
      { label: "Kaynak kod", discord: "Kapalı", hoffle: "Açık kaynak (AGPL-3.0); Docker ile kendin barındır", win: "hoffle" },
      { label: "Telefon", discord: "iOS ve Android uygulamaları", hoffle: "Tarayıcıda, bildirimlerle ana ekrana eklenir; uygulamalar yolda", win: "discord" },
    ],
    betterTitle: "Discord'un daha iyi olduğu yerler",
    better: [
      "Binlerce kişilik büyük topluluklar ve onlarla gelen moderasyon araçları ve botlar.",
      "Bugün düzgün telefon uygulamaları. Hoffle, uygulamaları çıkana kadar telefonun tarayıcısında çalışıyor.",
      "Tanıdığın herkes zaten oradaysa ve memnunsa kalmak da olur. Hoffle daha küçük ve kendilerine ait bir yer isteyen gruplar için.",
    ],
    moveTitle: "Discord sunucunu taşımak",
    moveSteps: [
      "Discord'da: Sunucu Ayarları → Sunucu Şablonu → linki kopyala.",
      "Hoffle'da: + → Yeni Oluştur, ve linki isim yerine yapıştır.",
      "Hoffle sana davet linkli hazır bir \"taşınıyoruz\" mesajı verir. Discord'una at.",
    ],
    open: "Hoffle'ı aç",
    source: "Discord rakamları discord.com ve Discord yardım merkezinden, Ekim 2026'da kontrol edildi (ücretsiz yükleme sınırı Ağustos 2026'da 20 MB'a çıktı). Hoffle'ın yükleme sınırları chat.hoffle.online'ınkilerdir.",
  },
};

export const VS_DISCORD_PATH: Record<LandingLang, string> = { en: "/vs-discord", tr: "/tr/vs-discord" };

export function VsDiscordPage({ lang = "en" }: { lang?: LandingLang }) {
  const t = COPY[lang];
  const other: LandingLang = lang === "en" ? "tr" : "en";
  const cell = (win: Row["win"], side: "discord" | "hoffle") =>
    win === side ? "font-semibold text-(--ink)" : "text-(--ink-2)";
  return (
    <SiteShell lang={lang} alternate={{ href: VS_DISCORD_PATH[other], lang: other }}>
      <main lang={lang} className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="lp-display text-4xl leading-tight sm:text-5xl">{t.title}</h1>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-(--ink-2)">{t.lead}</p>
            </div>
            <Hoffy size={140} motion="wave" id="hoffy-vs" className="self-center" />
          </div>

          <div className="mt-10 overflow-x-auto rounded-xl border border-(--line)">
            <table className="w-full min-w-[600px] border-collapse text-left text-[14px] sm:text-[15px]">
              <thead>
                <tr className="border-b border-(--line) bg-(--paper-2) text-sm">
                  <th scope="col" className="w-[26%] px-4 py-3"><span className="sr-only">—</span></th>
                  <th scope="col" className="w-[34%] px-4 py-3 font-semibold">{t.discord}</th>
                  <th scope="col" className="w-[40%] px-4 py-3 font-semibold">Hoffle</th>
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row) => (
                  <tr key={row.label} className="border-b border-(--line) last:border-b-0">
                    <th scope="row" className="px-4 py-3 align-top font-semibold">{row.label}</th>
                    <td className={`px-4 py-3 align-top ${cell(row.win, "discord")}`}>{row.discord || "—"}</td>
                    <td className={`px-4 py-3 align-top ${cell(row.win, "hoffle")}`}>{row.hoffle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-14 grid gap-10 md:grid-cols-2">
            <section>
              <h2 className="lp-display text-2xl">{t.moveTitle}</h2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 leading-relaxed text-(--ink-2) marker:font-semibold marker:text-(--violet)">
                {t.moveSteps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <a
                href={APP_URL}
                className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-(--violet-fill) px-5 text-[15px] font-semibold text-white no-underline transition hover:bg-(--violet-fill-hover)"
              >
                {t.open}
              </a>
            </section>
            <section>
              <h2 className="lp-display text-2xl">{t.betterTitle}</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-(--ink-2) marker:text-(--muted)">
                {t.better.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </section>
          </div>

          <p className="mt-12 text-sm text-(--muted)">{t.source}</p>
        </div>
      </main>
    </SiteShell>
  );
}

export const VS_DISCORD_META: Record<LandingLang, { title: string; description: string }> = {
  en: {
    title: "Discord vs Hoffle: free screen sharing, themes and custom links",
    description: "Discord's free plan next to Hoffle, row by row: 1080p screen sharing, free custom invite links, profile effects and 17 themes, no ads. And how to move your server with one link.",
  },
  tr: {
    title: "Discord mu Hoffle mı? Ücretsiz ekran paylaşımı, temalar, özel linkler",
    description: "Discord'un ücretsiz planı ve Hoffle yan yana: 1080p ekran paylaşımı, ücretsiz özel davet linki, profil efektleri, 17 tema, reklam yok. Ve sunucunu tek linkle taşıma.",
  },
};
