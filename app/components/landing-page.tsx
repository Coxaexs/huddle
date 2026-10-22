import type { ReactNode } from "react";
import { Coffee, Heart } from "./site-icons";
import { Hoffy } from "./hoffy";
import { VS_DISCORD_PATH } from "./vs-discord-page";
import { CopyButton, DownloadButton } from "./landing-client";
import { LiveChannel, MatrixRain, ThemeTour, type JoinLinks } from "./landing-demo";
import { LANDING_COPY, LANDING_PATH, type LandingCopy, type LandingLang } from "./landing-copy";
import {
  APP_URL,
  GithubMark,
  REPO,
  SITE,
  SiteShell,
  KOFI_URL,
  GITHUB_SPONSORS_URL,
  STATUS_URL,
  COMMUNITY_INVITE,
  COMMUNITY_URL,
  sectionHref,
} from "./site-chrome";
import { loadInvitePreview, type InvitePreview } from "@/lib/invite-preview";
import { readDownloadManifest, RELEASES_PAGE, type DownloadManifest, type DownloadPlatform } from "@/lib/downloads";
import { bindings } from "@/lib/storage";
import { BUILTIN_THEMES } from "@/lib/themes";

/**
 * hoffle.online — the public landing page.
 *
 * Every claim on here should be something the app actually does today; if a
 * feature is removed, remove it here too. The screenshots in /public/shots are
 * of a throwaway demo instance with made-up people, never of real chats.
 *
 * This is a server component on purpose: all the copy is in the first HTML
 * response, which is what search engines and link previews read. The live
 * #say-hi channel, the theme tour, the download button and the copy button
 * hydrate. The words are in landing-copy.ts, in English (/) and Turkish (/tr).
 */

const SELF_HOST_GUIDE = "/docs/self-hosting";

/** Real screenshots of a throwaway demo instance, listed for search engines. */
const SCREENSHOTS = [
  "/shots/hoffle-cozy-theme",
  "/shots/hoffle-msn-messenger-theme",
  "/shots/hoffle-light-theme",
  "/shots/hoffle-classic-theme",
];

const JOIN_LINKS: JoinLinks = {
  kofi: KOFI_URL,
  sponsors: GITHUB_SPONSORS_URL,
  selfHost: SELF_HOST_GUIDE,
  app: APP_URL,
  email: "info@hoffle.online",
};

const MUSIC_BOT_REPO = "https://github.com/Coxaexs/musicwatchtogether";

/** Where "Install Hoffle" goes: the app, which then offers the browser's own install. */
const INSTALL_URL = `${APP_URL}/?install`;

const SELF_HOST = `git clone ${REPO}.git hoffle
cd hoffle
docker compose up -d`;

function jsonLd(lang: LandingLang, copy: LandingCopy) {
  const url = lang === "en" ? `${SITE}/` : `${SITE}${LANDING_PATH[lang]}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: `${SITE}/`,
        name: "Hoffle",
        inLanguage: ["en", "tr"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE}/#app`,
        name: "Hoffle",
        url: `${SITE}/`,
        description:
          "A free, open-source chat app for friend groups: voice chat through LiveKit, 1080p60 screen sharing with sound, a shared music bot, D&D tools, and themes including MSN Messenger. Use it in the browser, on the desktop, or self-host it.",
        applicationCategory: "CommunicationApplication",
        operatingSystem: "Web, Windows, macOS, Linux, Android, iOS",
        isAccessibleForFree: true,
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        downloadUrl: `${SITE}${sectionHref(lang, "download")}`,
        installUrl: APP_URL,
        screenshot: SCREENSHOTS.map((image) => `${SITE}${image}-1280.webp`),
        image: `${SITE}/og.png`,
        sameAs: [REPO],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        inLanguage: lang,
        mainEntity: copy.faq.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}

/* ─── Theme tour ───────────────────────────────────────────────────────── */

const tourTitle = "lp-display text-3xl font-normal leading-tight sm:text-[44px]";

function TourCopy({ title, titleClass, intro, points, tone }: { title: ReactNode; titleClass: string; intro: string; points: string[]; tone: string }) {
  return (
    <div className={tone}>
      <h2 className={titleClass}>{title}</h2>
      <p className="mt-5 max-w-md text-[17px] leading-relaxed opacity-90">{intro}</p>
      <ul className="mt-5 max-w-md list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed opacity-90">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

/** A real screenshot in a window drawn for its theme, with a sign-in toast, like the MSN slide. */
function ThemeShot({
  image,
  alt,
  frame,
  titleBar,
  title,
  controls,
  toast,
}: {
  image: string;
  alt: string;
  frame: string;
  titleBar: string;
  title: ReactNode;
  controls: ReactNode;
  toast: ReactNode;
}) {
  return (
    <div className="relative">
      <figure className={`overflow-hidden ${frame}`}>
        <div className={`flex h-8 items-center gap-2 px-3 text-[13px] ${titleBar}`}>
          <span className="truncate">{title}</span>
          <span className="ml-auto flex items-center gap-[5px]" aria-hidden>{controls}</span>
        </div>
        <img
          src={`${image}-1280.webp`}
          srcSet={`${image}-1280.webp 1280w, ${image}-2560.webp 2560w`}
          sizes="(min-width: 1024px) 660px, 100vw"
          width={1280}
          height={800}
          loading="lazy"
          decoding="async"
          alt={alt}
          className="block h-auto w-full"
        />
      </figure>
      <div aria-hidden className="absolute -bottom-10 right-3 w-60 sm:-right-4">{toast}</div>
    </div>
  );
}

function tourSlides(t: LandingCopy["tour"]) {
  return [
    {
      id: "msn",
      label: "MSN Messenger",
      background: "linear-gradient(180deg,#1f5fcf 0%,#4a8fe8 45%,#a9d0f5 78%,#d9ecfb 100%)",
      content: (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-[46%] left-1/2 h-[66%] w-[160%] -translate-x-1/2 rounded-[50%]"
            style={{ background: "radial-gradient(ellipse at 50% 20%,#8fd35a 0%,#5aa82e 45%,#3b7f1c 100%)" }}
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[5fr_7fr]">
            <div className="text-white">
              <h2 className="lp-display text-3xl font-normal leading-tight [text-shadow:0_1px_0_rgba(0,40,120,.35)] sm:text-[44px]">
                {t.msn.title}
              </h2>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/90">{t.msn.intro}</p>
              <ul className="mt-5 max-w-md list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-white/90">
                {t.msn.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <ul className="lp-msn mt-6 flex flex-wrap gap-2 text-sm" aria-label={t.msn.emoticons}>
                {[
                  [";)", "😉"],
                  ["(Y)", "👍"],
                  ["<3", "❤️"],
                  [":$", "😳"],
                ].map(([typed, shown]) => (
                  <li key={typed} className="rounded border border-white/40 bg-white/15 px-2.5 py-1 font-semibold">
                    <code className="font-mono">{typed}</code> <span aria-hidden>→</span> {shown}
                  </li>
                ))}
              </ul>
            </div>

            {/* An XP-style window around the real screenshot. */}
            <div className="relative">
              <figure className="lp-msn overflow-hidden rounded-t-[9px] rounded-b-[3px] border border-[#0831d9] bg-[#ece9d8] shadow-[0_30px_60px_-20px_rgba(0,30,90,.6)]">
                <div
                  className="flex h-8 items-center gap-2 px-2.5 text-[13px] font-bold text-white [text-shadow:1px_1px_0_#0a1e6e]"
                  style={{ background: "linear-gradient(180deg,#3d95ff 0%,#0a5fe8 12%,#0654d8 55%,#0a4fc8 88%,#0843b0 100%)" }}
                >
                  <Buddy className="h-5 w-5" />
                  <span className="truncate">general - Conversation</span>
                  <span className="ml-auto flex gap-[3px]" aria-hidden>
                    <span className="grid h-[21px] w-[21px] place-items-center rounded-[3px] border border-white/80 bg-[#2a74f0] text-[11px] leading-none">_</span>
                    <span className="grid h-[21px] w-[21px] place-items-center rounded-[3px] border border-white/80 bg-[#2a74f0] text-[11px] leading-none">□</span>
                    <span className="grid h-[21px] w-[21px] place-items-center rounded-[3px] border border-white/80 bg-[#e0441c] text-[12px] leading-none">×</span>
                  </span>
                </div>
                <img
                  src="/shots/hoffle-msn-messenger-theme-1280.webp"
                  srcSet="/shots/hoffle-msn-messenger-theme-1280.webp 1280w, /shots/hoffle-msn-messenger-theme-2560.webp 2560w"
                  sizes="(min-width: 1024px) 660px, 100vw"
                  width={1280}
                  height={800}
                  loading="lazy"
                  decoding="async"
                  alt={t.msn.alt}
                  className="block h-auto w-full"
                />
                <figcaption className="sr-only">{t.msn.title}</figcaption>
              </figure>
              {/* The sign-in toast. */}
              <div
                aria-hidden
                className="lp-msn absolute -bottom-10 right-3 flex w-56 items-center gap-2.5 rounded-[3px] border border-[#7f9db9] p-3 text-[13px] shadow-lg sm:-right-4"
                style={{ background: "linear-gradient(180deg,#ffffff 0%,#dce9fb 100%)" }}
              >
                <Buddy className="h-9 w-9 shrink-0" />
                <p className="leading-snug text-[#1a1a1a]">
                  <b>Kai</b> {t.msn.toast}
                </p>
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      id: "vampire",
      label: "Vampire",
      background: "radial-gradient(120% 70% at 50% 115%, #6a0f20 0%, #2a070e 45%, #0a0607 100%)",
      content: (
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[5fr_7fr]">
          <TourCopy
            tone="text-[#f3e7e7]"
            titleClass={`${tourTitle} font-normal [font-family:'Pirata_One',Georgia,serif] [text-shadow:0_0_24px_rgba(200,16,46,.6)] sm:text-[60px]`}
            title="Vampire"
            intro={t.vampire.intro}
            points={t.vampire.points}
          />
          <ThemeShot
            image="/shots/hoffle-vampire-theme"
            alt={t.vampire.alt}
            frame="rounded-lg border border-[#c8102e]/50 bg-[#0a0607] shadow-[0_30px_70px_-20px_rgba(200,16,46,.55)]"
            titleBar="border-b border-[#c8102e]/30 bg-[linear-gradient(180deg,#2a070e,#140609)] text-[#f3e7e7] [font-family:'Pirata_One',Georgia,serif] text-[16px] tracking-[.02em]"
            title="general · Tuesday Crew"
            controls={["#5e1421", "#5e1421", "#c8102e"].map((color, i) => (
              <span key={i} className="h-3 w-3 rounded-full" style={{ background: color }} />
            ))}
            toast={
              <div className="flex items-center gap-3 rounded-lg border border-[#c8102e]/50 bg-[#140a0d] p-3 text-[13px] text-[#f3e7e7] shadow-[0_10px_30px_rgba(0,0,0,.6),0_0_20px_rgba(200,16,46,.25)]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#b9a6f7] font-bold text-[#15121f]">L</span>
                <p className="leading-snug"><b>Lou</b> {t.vampire.toast}</p>
              </div>
            }
          />
        </div>
      ),
    },
    {
      id: "cyberpunk",
      label: "Cyberpunk",
      background:
        "repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 1px, transparent 1px 3px), linear-gradient(160deg, #07070b 0%, #0c0c16 55%, #1a1a05 100%)",
      content: (
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[5fr_7fr]">
          <TourCopy
            tone="text-[#eafcff] [font-family:Rajdhani,sans-serif] font-medium"
            titleClass={`${tourTitle} uppercase tracking-[.06em] text-[#fcee0a] [text-shadow:-2px_0_rgba(255,42,109,.8),2px_0_rgba(0,240,255,.8)] sm:text-[56px]`}
            title="Cyberpunk"
            intro={t.cyberpunk.intro}
            points={t.cyberpunk.points}
          />
          <ThemeShot
            image="/shots/hoffle-cyberpunk-theme"
            alt={t.cyberpunk.alt}
            frame="border border-[#00f0ff]/50 bg-[#07070b] shadow-[0_0_40px_rgba(0,240,255,.15)] [clip-path:polygon(0_0,calc(100%-16px)_0,100%_16px,100%_100%,0_100%)]"
            titleBar="bg-[#fcee0a] font-bold uppercase tracking-[.08em] text-[#07070b] [font-family:Rajdhani,sans-serif]"
            title="#general // Tuesday Crew"
            controls={["▁", "▢", "✕"].map((glyph) => (
              <span key={glyph} className="mr-3 font-mono text-[12px]">{glyph}</span>
            ))}
            toast={
              <div className="flex items-center gap-3 border border-[#00f0ff]/60 bg-[#0c0c13] p-3 text-[13px] text-[#eafcff] shadow-[0_0_24px_rgba(0,240,255,.2)] [clip-path:polygon(0_0,calc(100%-12px)_0,100%_12px,100%_100%,0_100%)] [font-family:Rajdhani,sans-serif]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[2px] bg-[#7fd6c2] font-bold text-[#07070b]">K</span>
                <p className="font-mono text-[12px] uppercase leading-snug tracking-[.08em] text-[#00f0ff]">
                  <b className="text-[#fcee0a]">Kai</b> {t.cyberpunk.toast}
                </p>
              </div>
            }
          />
        </div>
      ),
    },
    {
      id: "matrix",
      label: "Matrix",
      background: "radial-gradient(90% 70% at 50% 0%, #022b10 0%, #000c04 55%, #000400 100%)",
      content: (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">
            <MatrixRain />
          </div>
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[5fr_7fr]">
            <TourCopy
              tone="text-[#c8ffd8] font-mono"
              titleClass={`${tourTitle} font-normal [font-family:'Share_Tech_Mono',ui-monospace,monospace] text-[#b9ffd0] [text-shadow:0_0_14px_rgba(0,255,102,.6)] sm:text-[56px]`}
              title={<>Matrix<span className="animate-pulse text-[#00ff66]">_</span></>}
              intro={t.matrix.intro}
              points={t.matrix.points}
            />
            <ThemeShot
              image="/shots/hoffle-matrix-theme"
              alt={t.matrix.alt}
              frame="rounded border border-[#00ff66]/35 bg-[#000400] shadow-[0_0_50px_rgba(0,255,102,.15)]"
              titleBar="border-b border-[#00ff66]/25 bg-[#010a04] text-[#7dffae] [font-family:'Share_Tech_Mono',ui-monospace,monospace]"
              title="~/tuesday-crew/general"
              controls={[0, 1, 2].map((i) => (
                <span key={i} className="h-2.5 w-2.5 rounded-full border border-[#00ff66]/60" />
              ))}
              toast={
                <div className="rounded border border-[#00ff66]/40 bg-[#000c05] p-3 text-[13px] text-[#c8ffd8] shadow-[0_0_24px_rgba(0,255,102,.2)] [font-family:'Share_Tech_Mono',ui-monospace,monospace]">
                  <p className="leading-snug">{t.matrix.toast[0]} <b className="text-[#00ff66]">Mira</b>…</p>
                  <p className="mt-0.5 text-[#5fae7a]">{t.matrix.toast[1]}</p>
                </div>
              }
            />
          </div>
        </>
      ),
    },
  ];
}

/* ─── Bits ─────────────────────────────────────────────────────────────── */

/** The two-person Messenger buddy icon, drawn from scratch. */
function Buddy({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <circle cx="12" cy="9" r="5" fill="#3fa82f" />
      <path d="M3 27c0-6 4-10 9-10s9 4 9 10z" fill="#3fa82f" />
      <circle cx="21" cy="11" r="4.5" fill="#2b7fd9" />
      <path d="M13 28c0-5.5 3.6-9 8-9s8 3.5 8 9z" fill="#2b7fd9" />
    </svg>
  );
}

const button =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-semibold transition";
const primaryButton = `${button} bg-(--violet-fill) text-white hover:bg-(--violet-fill-hover)`;
const secondaryButton = `${button} border border-(--line) bg-(--card) text-(--ink) hover:border-(--ink)`;
const sectionTitle = "lp-display text-3xl font-normal leading-tight sm:text-4xl";
const link = "font-semibold text-(--violet) underline decoration-dotted underline-offset-2";

/* ─── Downloads ────────────────────────────────────────────────────────── */

const MB = 1024 * 1024;

/** The desktop downloads on this server, or GitHub's release page until a copy is in. */
async function downloads(): Promise<DownloadManifest | null> {
  try {
    return await readDownloadManifest(bindings().UPLOADS);
  } catch {
    return null;
  }
}

function downloadRows(copy: LandingCopy["download"], manifest: DownloadManifest | null) {
  const size = (platform: DownloadPlatform) => {
    const file = manifest?.files.find((f) => f.platform === platform);
    return file ? `, ${Math.round(file.size / MB)} MB` : "";
  };
  const href = (platform: DownloadPlatform) =>
    manifest?.files.some((f) => f.platform === platform) ? `/download/${platform}` : RELEASES_PAGE;
  return [
    { name: copy.rows.windows, file: copy.files.windows + size("windows"), href: href("windows") },
    { name: copy.rows.macArm, file: copy.files.macArm + size("mac-arm64"), href: href("mac-arm64") },
    { name: copy.rows.macIntel, file: copy.files.macIntel + size("mac-intel"), href: href("mac-intel") },
    { name: copy.rows.linux, file: copy.files.linux + size("linux"), href: href("linux") },
    { name: copy.rows.lite, file: copy.files.lite, href: href("windows-lite"), extra: { label: "Mac", href: href("mac-lite") } },
  ];
}

/** Below this many members "3 members" reads as empty, so the line leaves the numbers out. */
const COMMUNITY_COUNT_FROM = 25;

/** The community server, once its invite exists; until then the site doesn't mention it. */
async function community(): Promise<NonNullable<InvitePreview["server"]> | null> {
  try {
    const db = bindings().DB;
    return db ? ((await loadInvitePreview(db, COMMUNITY_INVITE))?.server ?? null) : null;
  } catch {
    return null;
  }
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export async function LandingPage({ lang = "en" }: { lang?: LandingLang }) {
  const copy = LANDING_COPY[lang];
  const other: LandingLang = lang === "en" ? "tr" : "en";
  const [manifest, lounge] = await Promise.all([downloads(), community()]);
  const themeNames = BUILTIN_THEMES.map((theme) => theme.name);
  const themesLine = copy.themesLine(
    themeNames.length,
    `${themeNames.slice(0, -1).join(", ")} ${lang === "tr" ? "ve" : "and"} ${themeNames[themeNames.length - 1]}`,
  );
  const downloadHrefs = {
    windows: manifest ? "/download/windows" : sectionHref(lang, "download"),
    linux: manifest ? "/download/linux" : sectionHref(lang, "download"),
    mac: sectionHref(lang, "download"),
    phone: APP_URL,
    generic: sectionHref(lang, "download"),
  };
  const downloadLabels = {
    windows: copy.hero.downloadFor("Windows"),
    mac: copy.hero.downloadFor("Mac"),
    linux: copy.hero.downloadFor("Linux"),
    phone: copy.hero.onPhone,
    generic: copy.hero.downloadGeneric,
  };

  return (
    <SiteShell lang={lang} alternate={{ href: LANDING_PATH[other], lang: other }}>
      <style>{`
        .lp-msn { font-family: "Segoe UI", Tahoma, Verdana, "DejaVu Sans", sans-serif; }
        .lp-faq summary { list-style: none; cursor: pointer; }
        .lp-faq summary::-webkit-details-marker { display: none; }
        .lp-faq summary::after { content: "+"; font-size: 22px; line-height: 1; color: var(--muted); transition: transform .2s; }
        .lp-faq details[open] summary::after { transform: rotate(45deg); }
      `}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(lang, copy)) }} />

      <main lang={lang}>
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="px-4 pt-14 sm:px-6 sm:pt-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-start justify-between gap-8">
              <h1 className="lp-display max-w-[22ch] text-4xl font-normal leading-[1.1] sm:text-[56px]">{copy.hero.title}</h1>
              {/* A wrapper does the hiding: .hoffy sets its own display. */}
              <span className="hidden shrink-0 md:block">
                <Hoffy size={170} motion="boot" id="hoffy-hero" label="Hoffy, the Hoffle mascot" />
              </span>
            </div>
            <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <p className="max-w-[62ch] text-lg leading-relaxed text-(--ink-2)">{copy.hero.body}</p>
              <div className="flex flex-wrap gap-3">
                <a href={APP_URL} className={primaryButton}>{copy.hero.open}</a>
                <DownloadButton labels={downloadLabels} hrefs={downloadHrefs} className={secondaryButton} />
              </div>
            </div>
            <div className="mt-12 sm:mt-14">
              <LiveChannel links={JOIN_LINKS} copy={copy.live} />
            </div>
            {lounge && (
              <div className="mt-5 flex flex-col gap-4 rounded-xl border border-(--line) bg-(--paper-2) p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-[70ch] leading-relaxed text-(--ink-2)">{copy.community.line(lounge.memberCount >= COMMUNITY_COUNT_FROM ? lounge.memberCount : null, lounge.onlineCount)}</p>
                <a href={COMMUNITY_URL} className={`${primaryButton} shrink-0`}>{copy.community.button}</a>
              </div>
            )}
          </div>
        </section>

        {/* ── Coming from Discord ──────────────────────────────────── */}
        <section id="move" className="scroll-mt-4 border-y border-(--line) bg-(--paper-2) px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[2fr_3fr] lg:items-start">
            <div>
              <h2 className={sectionTitle}>{copy.moving.title}</h2>
              <p className="mt-4 max-w-md leading-relaxed text-(--ink-2)">{copy.moving.lead}</p>
              <a href={VS_DISCORD_PATH[lang]} className={`${link} mt-5 inline-block`}>{copy.moving.compare}</a>
            </div>
            <ol className="grid gap-4 sm:grid-cols-3">
              {copy.moving.steps.map((step, i) => (
                <li key={step} className="rounded-xl border border-(--line) bg-(--card) p-5">
                  <span className="lp-display text-3xl text-(--violet)">{i + 1}</span>
                  <p className="mt-2 text-[15px] leading-relaxed text-(--ink-2)">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────── */}
        <section id="features" className="scroll-mt-4 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <h2 className={sectionTitle}>{copy.features.title}</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-(--ink-2)">{copy.features.lead}</p>
            <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {copy.features.groups.map((group) => (
                <div key={group.title}>
                  <h3 className="text-lg font-medium">{group.title}</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-(--ink-2) marker:text-(--muted)">
                    {group.lead === "musicBot" && (
                      <li>
                        {copy.features.musicBotLead}{" "}
                        <a href={MUSIC_BOT_REPO} className={link}>{copy.features.musicBotLink}</a>{" "}
                        {copy.features.musicBotTail}
                      </li>
                    )}
                    {group.lead === "themes" && <li>{themesLine}</li>}
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Theme tour ───────────────────────────────────────────── */}
        <ThemeTour slides={tourSlides(copy.tour)} controls={copy.tour.controls} />

        {/* ── Compared to Discord ──────────────────────────────────── */}
        <section id="compare" className="scroll-mt-4 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-4xl">
            <h2 className={sectionTitle}>{copy.compare.title}</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-(--ink-2)">{copy.compare.lead}</p>
            <div className="mt-8 overflow-x-auto rounded-xl border border-(--line)">
              <table className="w-full min-w-[560px] border-collapse text-left text-[14px] sm:text-[15px]">
                <caption className="sr-only">{copy.compare.caption}</caption>
                <thead>
                  <tr className="border-b border-(--line) bg-(--paper-2) text-sm">
                    <th scope="col" className="w-[28%] px-4 py-3 font-semibold text-(--muted)"><span className="sr-only">{copy.compare.featureColumn}</span></th>
                    <th scope="col" className="w-[34%] px-4 py-3 font-semibold">{copy.compare.discord}</th>
                    <th scope="col" className="w-[38%] px-4 py-3 font-semibold">Hoffle</th>
                  </tr>
                </thead>
                <tbody>
                  {copy.compare.rows.map((row) => (
                    <tr key={row.label} className="border-b border-(--line) last:border-b-0">
                      <th scope="row" className="px-4 py-3 align-top font-semibold">{row.label}</th>
                      <td className="px-4 py-3 align-top text-(--ink-2)">{row.discord}</td>
                      <td className="px-4 py-3 align-top">{row.hoffle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <a href={VS_DISCORD_PATH[lang]} className={`${link} mt-4 inline-block`}>{copy.compare.full}</a>
            <p className="mt-3 text-sm text-(--muted)">{copy.compare.source}</p>
          </div>
        </section>

        {/* ── Download ─────────────────────────────────────────────── */}
        <section id="download" className="scroll-mt-4 px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-6xl items-start gap-14 lg:grid-cols-[7fr_5fr]">
            <div>
              <h2 className={sectionTitle}>{copy.download.title}</h2>
              <p className="mt-3 max-w-xl leading-relaxed text-(--ink-2)">{copy.download.lead}</p>

              <div className="mt-8 rounded-xl border border-(--line) bg-(--card) p-5">
                <h3 className="text-lg font-medium">{copy.download.browserTitle}</h3>
                <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-(--ink-2)">{copy.download.browserBody}</p>
                <a href={INSTALL_URL} className={`${primaryButton} mt-4`}>{copy.download.browserButton}</a>
              </div>

              <h3 className="mt-10 text-lg font-medium">{copy.download.desktopTitle}</h3>
              <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-(--ink-2)">{copy.download.desktopBody}</p>
              <ul className="mt-4 divide-y divide-(--line) border-y border-(--line)">
                {downloadRows(copy.download, manifest).map((row) => (
                  <li key={row.name} className="flex items-center gap-4 py-4">
                    <span className="w-36 shrink-0 font-bold">{row.name}</span>
                    <span className="min-w-0 flex-1 text-sm text-(--muted)">{row.file}</span>
                    <a href={row.href} className="shrink-0 text-sm font-semibold text-(--violet) hover:underline">
                      {row.extra ? "Windows" : copy.download.action} →
                    </a>
                    {row.extra && (
                      <a href={row.extra.href} className="shrink-0 text-sm font-semibold text-(--violet) hover:underline">
                        {row.extra.label} →
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {manifest && <p className="mt-3 text-sm text-(--muted)">{copy.download.version(manifest.version)}</p>}
              {(!manifest?.signed.windows || !manifest?.signed.mac) && (
                <div className="mt-4 space-y-2 text-sm leading-relaxed text-(--ink-2)">
                  {!manifest?.signed.windows && <p>{copy.download.windowsUnsigned}</p>}
                  {!manifest?.signed.mac && <p>{copy.download.macUnsigned}</p>}
                </div>
              )}

              <h3 className="mt-10 text-lg font-medium">{copy.download.phoneTitle}</h3>
              <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-(--ink-2)">{copy.download.phoneBody}</p>
            </div>
            <div className="mx-auto w-full max-w-[300px] lg:mt-20">
              <div className="rounded-[44px] border-[10px] border-(--slab) bg-(--slab) shadow-[0_30px_60px_-35px_rgba(20,15,40,.5)]">
                <img
                  src="/shots/hoffle-phone-780.webp"
                  width={390}
                  height={844}
                  loading="lazy"
                  decoding="async"
                  alt={copy.download.phoneAlt}
                  className="block h-auto w-full rounded-[34px]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Will it last? ────────────────────────────────────────── */}
        <section id="staying" className="scroll-mt-4 border-y border-(--line) bg-(--paper-2) px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[2fr_3fr]">
            <div>
              <h2 className={sectionTitle}>{copy.staying.title}</h2>
              <p className="mt-4 max-w-md leading-relaxed text-(--ink-2)">{copy.staying.lead}</p>
              <a href={STATUS_URL} className={`${secondaryButton} mt-6`}>
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#3ba55d]" />
                {copy.staying.status}
              </a>
            </div>
            <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {copy.staying.points.map((point) => (
                <div key={point.title}>
                  <dt className="font-bold">{point.title}</dt>
                  <dd className="mt-1.5 text-[15px] leading-relaxed text-(--ink-2)">{point.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Voice (LiveKit) ──────────────────────────────────────── */}
        <section id="voice" className="scroll-mt-4 border-b border-(--line) bg-(--paper-2) px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[2fr_3fr]">
            <div>
              <h2 className={sectionTitle}>{copy.voice.title}</h2>
              <p className="mt-4 max-w-md leading-relaxed text-(--ink-2)">{copy.voice.lead}</p>
            </div>
            <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {copy.voice.points.map((point) => (
                <div key={point.title}>
                  <dt className="font-bold">{point.title}</dt>
                  <dd className="mt-1.5 text-[15px] leading-relaxed text-(--ink-2)">{point.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Self-host ────────────────────────────────────────────── */}
        <section id="self-host" className="scroll-mt-4 bg-(--slab) px-4 py-20 text-white sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className={sectionTitle}>{copy.selfHost.title}</h2>
              <p className="mt-4 max-w-lg leading-relaxed text-white/75">{copy.selfHost.body}</p>
              <ul className="mt-5 list-disc space-y-1.5 pl-5 text-[15px] text-white/85 marker:text-white/40">
                {copy.selfHost.points.map((point) => (
                  <li key={point}>{withCode(point)}</li>
                ))}
              </ul>
              <a href={SELF_HOST_GUIDE} className="mt-7 inline-block font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
                {copy.selfHost.guide}
              </a>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0e0b14]">
              <div className="flex h-11 items-center justify-between border-b border-white/10 px-4">
                <span className="font-mono text-xs text-white/50">terminal</span>
                <CopyButton text={SELF_HOST} labels={{ copy: copy.selfHost.copy, copied: copy.selfHost.copied }} />
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[14px] leading-7 text-[#b8f5c9]">
                {SELF_HOST.split("\n").map((line) => (
                  <div key={line}><span className="select-none text-white/35">$ </span>{line}</div>
                ))}
                <div className="text-white/45">{copy.selfHost.after}</div>
              </pre>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-4 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_2fr]">
            <h2 className={sectionTitle}>{copy.faq.title}</h2>
            <div className="lp-faq divide-y divide-(--line) border-y border-(--line)">
              {copy.faq.items.map((item, i) => (
                <details key={item.q} open={i === 0} className="group py-1">
                  <summary className="flex items-center justify-between gap-6 py-4 text-lg font-semibold">{item.q}</summary>
                  <p className="max-w-[62ch] pb-5 leading-relaxed text-(--ink-2)">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── About ────────────────────────────────────────────────── */}
        <section className="border-t border-(--line) px-4 py-16 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl leading-relaxed text-(--ink-2)">{copy.about.body}</p>
            <div className="flex flex-wrap gap-3">
              {lounge && <a href={COMMUNITY_URL} className={secondaryButton}>{copy.community.button}</a>}
              <a href={REPO} className={secondaryButton}>
                <GithubMark className="h-4 w-4" /> {copy.about.github}
              </a>
              {KOFI_URL && (
                <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                  <Coffee className="h-4 w-4" /> {copy.about.kofi}
                </a>
              )}
              {GITHUB_SPONSORS_URL && (
                <a href={GITHUB_SPONSORS_URL} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                  <Heart className="h-4 w-4 text-[#ea4aaa]" /> {copy.about.sponsors}
                </a>
              )}
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}

/** Self-host bullets name Docker flags ("--profile livekit"); those read as code. */
function withCode(text: string): ReactNode {
  const match = text.match(/^(.*?)(--profile \w+)$/);
  if (!match) return text;
  return (
    <>
      {match[1]}
      <code className="text-[14px]">{match[2]}</code>
    </>
  );
}
