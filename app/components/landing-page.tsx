import type { ReactNode } from "react";
import { CopyButton, DownloadButton, ThemeShowcase, type ShowcaseTheme } from "./landing-client";
import { APP_URL, GithubMark, RELEASES, REPO, SITE, SiteShell, SUPPORT_URL } from "./site-chrome";

/**
 * hoffle.online — the public landing page.
 *
 * Every claim on here should be something the app actually does today; if a
 * feature is removed, remove it here too. The screenshots in /public/shots are
 * of a throwaway demo instance with made-up people, never of real chats.
 *
 * This is a server component on purpose: all the copy is in the first HTML
 * response, which is what search engines and link previews read. Only the
 * theme tabs, the download button and the copy button hydrate.
 */

const SELF_HOST_GUIDE = "/docs/self-hosting";

const THEMES: ShowcaseTheme[] = [
  {
    id: "cozy",
    label: "Cozy",
    swatch: ["#16131f", "#2e2750", "#a78bfa"],
    image: "/shots/hoffle-cozy-theme",
    alt: "Hoffle's Cozy dark theme: a friend group's text channel with reactions, three friends in the Lounge voice channel and everyone online in the member list",
  },
  {
    id: "msn",
    label: "MSN Messenger",
    swatch: ["#e3edf9", "#1c5ec6", "#3fa82f"],
    image: "/shots/hoffle-msn-messenger-theme",
    alt: "Hoffle's MSN Messenger theme: messages shown as “Jonas says:”, display pictures, a Winks and Nudge toolbar and an Online (6) contact list",
  },
  {
    id: "light",
    label: "Light",
    swatch: ["#f2f3f5", "#ffffff", "#6b4feb"],
    image: "/shots/hoffle-light-theme",
    alt: "Hoffle's Light theme showing the same channel on a white background",
  },
  {
    id: "classic",
    label: "Classic",
    swatch: ["#1e1f22", "#313338", "#5865f2"],
    image: "/shots/hoffle-classic-theme",
    alt: "Hoffle's Classic charcoal theme showing the same channel",
  },
];

const FEATURES: { title: string; items: ReactNode[] }[] = [
  {
    title: "Voice and screen sharing",
    items: [
      "Noise suppression that runs on your own device, so the fan, the keyboard and the TV stay out of the call.",
      "Screen share at 1080p and 60 fps, with the game or movie audio included.",
      "Push-to-talk that keeps working while a game has focus (desktop app).",
      "Someone says something legendary? Hit Clip and the last 30 seconds are saved.",
      "Spatial audio seating and virtual backgrounds.",
    ],
  },
  {
    title: "Things to do together",
    items: [
      "A music bot the whole room shares: one queue, and everyone hears the same second of the same song.",
      "Watch together, a whiteboard, Draw & Guess, tier lists, polls and a soundboard.",
    ],
  },
  {
    title: "D&D night",
    items: [
      "Battlemaps with tokens and fog of war.",
      "3D dice with real physics, rolled where everyone can see them.",
      "A spell and monster compendium, so nobody has to leave the call to look something up.",
    ],
  },
  {
    title: "Chat",
    items: [
      "Threads, replies, reactions, custom emoji and stickers, GIFs and voice messages.",
      "Link previews, events with RSVPs, and search.",
    ],
  },
  {
    title: "Your Discord bots",
    items: [
      "Hoffle speaks the Discord bot API, so bots written with discord.js or discord.py connect without changes.",
      "A bridge for the channels you still keep on Discord.",
    ],
  },
  {
    title: "Make it yours",
    items: [
      "Themes you can make and share, profile banners, pride badges and a nickname per server.",
    ],
  },
];

const COMPARISON: { label: string; discord: string; hoffle: string }[] = [
  { label: "Price", discord: "Free, with Nitro for the good stuff", hoffle: "Free. There is no paid tier" },
  { label: "Screen share", discord: "720p on the free plan", hoffle: "1080p60 with sound, for everyone" },
  { label: "Themes", discord: "A few colour themes, Nitro only", hoffle: "Free themes, custom CSS, shareable" },
  { label: "Ads", discord: "Sponsored Quests", hoffle: "None, and no trackers" },
  { label: "Source code", discord: "Closed", hoffle: "Open source, AGPL-3.0" },
  { label: "Run it yourself", discord: "No", hoffle: "One docker compose command" },
  { label: "Existing bots", discord: "Yes", hoffle: "discord.js and discord.py bots connect as-is" },
  { label: "Phone", discord: "Native apps", hoffle: "Works in the phone's browser; add it to your home screen" },
  { label: "Huge public servers", discord: "Built for it", hoffle: "Not really. Voice is peer-to-peer and suits about 8 people, unless the server adds LiveKit" },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is Hoffle actually free?",
    a: "Yes. There's no paid tier and nothing is locked. The code is open source under the AGPL-3.0, so it stays that way.",
  },
  {
    q: "How do I get in?",
    a: "chat.hoffle.online is invite-only for now, so ask a friend who's already on it for an invite code. If none of your friends are, host your own Hoffle; the first account on a new server becomes the owner and can invite everyone else.",
  },
  {
    q: "Do my friends have to install anything?",
    a: "No. Everything works in the browser. The desktop app adds push-to-talk that works in games, a proper screen-share picker with desktop audio, and notifications in your taskbar or dock.",
  },
  {
    q: "How many people fit in a voice call?",
    a: "Voice is peer-to-peer by default, which works well for friend groups up to about 8 people. For bigger rooms, whoever runs the server can switch on the optional LiveKit media server.",
  },
  {
    q: "Is there a phone app?",
    a: "Open chat.hoffle.online on your phone and add it to your home screen. For notifications while it's closed, install the free ntfy app and paste your topic into Hoffle's settings. No Google or Apple account needed.",
  },
  {
    q: "Who can read my messages?",
    a: "Whoever runs the server you're on, the same as with any chat app. There are no ads and no trackers. If you'd rather that be you, host it yourself and your data never leaves your machine.",
  },
  {
    q: "Is the MSN theme a joke?",
    a: "Only partly. It's a complete theme: Luna-blue windows, “says:” in front of every message, emoticons that turn into pictures, sign-in toasts, nudges, winks and handwriting. Pick it in Settings.",
  },
];

const SELF_HOST = `git clone ${REPO}.git hoffle
cd hoffle
docker compose up -d`;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: `${SITE}/`,
      name: "Hoffle",
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#app`,
      name: "Hoffle",
      url: `${SITE}/`,
      description:
        "A free, open-source Discord alternative for friend groups: voice chat, 1080p60 screen sharing with sound, a shared music bot, D&D tools and themes including MSN Messenger. Use it in the browser, on the desktop, or self-host it.",
      applicationCategory: "CommunicationApplication",
      operatingSystem: "Web, Windows, macOS, Linux, Android, iOS",
      isAccessibleForFree: true,
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      downloadUrl: RELEASES,
      installUrl: APP_URL,
      screenshot: THEMES.map((theme) => `${SITE}${theme.image}-1280.webp`),
      image: `${SITE}/og.png`,
      sameAs: [REPO],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE}/#faq`,
      mainEntity: FAQS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

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
  "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-bold transition";
const primaryButton = `${button} bg-(--ink) text-(--paper) hover:bg-(--violet)`;
const secondaryButton = `${button} border border-(--line) bg-(--card) text-(--ink) hover:border-(--ink)`;

/* ─── Page ─────────────────────────────────────────────────────────────── */

export function LandingPage() {
  return (
    <SiteShell>
      <style>{`
        .lp-msn { font-family: "Segoe UI", Tahoma, Verdana, "DejaVu Sans", sans-serif; }
        .lp-faq summary { list-style: none; cursor: pointer; }
        .lp-faq summary::-webkit-details-marker { display: none; }
        .lp-faq summary::after { content: "+"; font-size: 22px; line-height: 1; color: var(--muted); transition: transform .2s; }
        .lp-faq details[open] summary::after { transform: rotate(45deg); }
      `}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main>
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="px-4 pt-14 sm:px-6 sm:pt-20">
          <div className="mx-auto max-w-6xl">
            <h1 className="lp-display max-w-[15ch] text-[44px] font-extrabold leading-[0.98] sm:text-[76px]">
              Voice chat for your friends, minus the Nitro upsell.
            </h1>
            <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <p className="max-w-[60ch] text-lg leading-relaxed text-(--ink-2)">
                Hoffle is a free, open-source Discord alternative for small groups. Voice chat, screen sharing at
                1080p with sound, music everyone hears at the same time, and a D&amp;D table, without a paid tier.
                Use it in your browser, on your desktop, or on your own server.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href={APP_URL} className={primaryButton}>Open Hoffle</a>
                <DownloadButton releases={RELEASES} appUrl={APP_URL} className={secondaryButton} />
              </div>
            </div>
            <div className="mt-14 sm:mt-16">
              <ThemeShowcase themes={THEMES} />
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────── */}
        <section id="features" className="scroll-mt-4 px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_2fr]">
            <div>
              <h2 className="lp-display text-4xl font-extrabold leading-[1.02] sm:text-5xl">What's in it</h2>
              <p className="mt-4 max-w-sm leading-relaxed text-(--ink-2)">
                Everything here works today and costs nothing. No bots to invite for the basics, no second app for game night.
              </p>
            </div>
            <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
              {FEATURES.map((group) => (
                <div key={group.title} className="border-t-2 border-(--ink) pt-4">
                  <h3 className="lp-display text-xl font-extrabold">{group.title}</h3>
                  <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-(--ink-2)">
                    {group.items.map((item, i) => (
                      <li key={i} className="relative pl-4 before:absolute before:left-0 before:top-[0.7em] before:h-[2px] before:w-2 before:bg-(--coral)">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── MSN ──────────────────────────────────────────────────── */}
        <section
          id="msn"
          aria-labelledby="msn-title"
          className="relative scroll-mt-4 overflow-hidden px-4 pb-28 pt-20 sm:px-6 sm:pt-24"
          style={{ background: "linear-gradient(180deg,#1f5fcf 0%,#4a8fe8 45%,#a9d0f5 78%,#d9ecfb 100%)" }}
        >
          {/* A rolling green hill, in the spirit of a certain desktop wallpaper. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-[38%] left-1/2 h-[70%] w-[160%] -translate-x-1/2 rounded-[50%]"
            style={{ background: "radial-gradient(ellipse at 50% 20%,#8fd35a 0%,#5aa82e 45%,#3b7f1c 100%)" }}
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[5fr_7fr]">
            <div className="text-white">
              <h2 id="msn-title" className="lp-display text-4xl font-extrabold leading-[1.02] [text-shadow:0_2px_0_rgba(0,40,120,.35)] sm:text-[56px]">
                Yes, there's an MSN Messenger theme.
              </h2>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/90">
                Switch it on and Hoffle turns into Windows Live Messenger, circa 2006. Every message starts with “Mira says:”,
                friends sign in with a toast and a chime, and you can nudge someone until their window shakes.
              </p>
              <ul className="lp-msn mt-6 flex flex-wrap gap-2 text-sm" aria-label="Emoticons that turn into pictures when you send them">
                {[
                  [":)", "🙂"],
                  [";)", "😉"],
                  ["(Y)", "👍"],
                  ["<3", "❤️"],
                  [":$", "😳"],
                ].map(([typed, shown]) => (
                  <li key={typed} className="rounded border border-white/40 bg-white/15 px-2.5 py-1 font-semibold backdrop-blur-sm">
                    <code className="font-mono">{typed}</code> <span aria-hidden>→</span> {shown}
                  </li>
                ))}
              </ul>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/85">
                Also included: display pictures, winks, handwriting, chat backgrounds, and statuses like Be Right Back and Out to Lunch.
              </p>
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
                  alt="A Hoffle channel in the MSN Messenger theme, with “says:” before each message and a Winks, Voice Clip, Handwriting, Backgrounds and Nudge toolbar"
                  className="block h-auto w-full"
                />
                <figcaption className="sr-only">Hoffle with the MSN Messenger theme turned on.</figcaption>
              </figure>
              {/* The sign-in toast. */}
              <div
                aria-hidden
                className="lp-msn absolute -bottom-10 right-3 flex w-56 items-center gap-2.5 rounded-[3px] border border-[#7f9db9] p-3 text-[13px] shadow-lg sm:-right-4"
                style={{ background: "linear-gradient(180deg,#ffffff 0%,#dce9fb 100%)" }}
              >
                <Buddy className="h-9 w-9 shrink-0" />
                <p className="leading-snug text-[#1a1a1a]">
                  <b>Kai</b> has just signed in.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── vs Discord ───────────────────────────────────────────── */}
        <section id="vs-discord" className="scroll-mt-4 px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-4xl">
            <h2 className="lp-display text-4xl font-extrabold leading-[1.02] sm:text-5xl">Hoffle vs. Discord, honestly</h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-(--ink-2)">
              Discord is great at huge public communities. Hoffle is for the group chat you actually talk in, and it
              doesn't hold the nice parts back for subscribers.
            </p>
            <div className="mt-10 overflow-hidden rounded-2xl border border-(--line) bg-(--card)">
              <table className="w-full border-collapse text-left text-[13px] sm:text-[15px]">
                <caption className="sr-only">Hoffle compared with Discord&apos;s free plan</caption>
                <thead>
                  <tr className="border-b border-(--line) text-sm">
                    <th scope="col" className="w-[24%] px-3 py-3 font-semibold text-(--muted) sm:px-5 sm:py-4"><span className="sr-only">Feature</span></th>
                    <th scope="col" className="w-[33%] px-3 py-3 font-bold text-(--ink-2) sm:px-5 sm:py-4">Discord</th>
                    <th scope="col" className="w-[43%] bg-(--paper-2) px-3 py-3 font-extrabold sm:px-5 sm:py-4">Hoffle</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row.label} className="border-b border-(--line) last:border-b-0">
                      <th scope="row" className="px-3 py-3 align-top font-bold sm:px-5 sm:py-4">{row.label}</th>
                      <td className="px-3 py-3 align-top text-(--ink-2) sm:px-5 sm:py-4">{row.discord}</td>
                      <td className="bg-(--paper-2) px-3 py-3 align-top font-semibold sm:px-5 sm:py-4">{row.hoffle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Download ─────────────────────────────────────────────── */}
        <section id="download" className="scroll-mt-4 border-y border-(--line) bg-(--paper-2) px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[7fr_5fr]">
            <div>
              <h2 className="lp-display text-4xl font-extrabold leading-[1.02] sm:text-5xl">Get Hoffle</h2>
              <p className="mt-4 max-w-xl leading-relaxed text-(--ink-2)">
                The browser version does nearly everything. The desktop app adds push-to-talk that works in games,
                desktop audio in screen shares, and notifications in your taskbar or dock.
              </p>
              <ul className="mt-8 divide-y divide-(--line) border-y border-(--line)">
                {[
                  { name: "Windows", file: ".exe installer", href: RELEASES, action: "Download" },
                  { name: "macOS", file: ".dmg, Apple Silicon and Intel", href: RELEASES, action: "Download" },
                  { name: "Linux", file: ".AppImage, Wayland and X11", href: RELEASES, action: "Download" },
                  { name: "Browser", file: "Chrome, Firefox, Edge, Safari", href: APP_URL, action: "Open" },
                  { name: "Phone", file: "Open it in your browser, then Add to Home Screen", href: APP_URL, action: "Open" },
                ].map((row) => (
                  <li key={row.name}>
                    <a href={row.href} className="group flex items-center gap-4 py-4">
                      <span className="w-24 shrink-0 font-extrabold">{row.name}</span>
                      <span className="min-w-0 flex-1 text-sm text-(--muted)">{row.file}</span>
                      <span className="shrink-0 text-sm font-bold text-(--violet) group-hover:underline">{row.action} →</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-6 max-w-xl text-sm leading-relaxed text-(--ink-2)">
                <b className="text-(--ink)">Notifications on your phone, no Big Tech account.</b> Install the free{" "}
                <a href="https://ntfy.sh" className="font-semibold text-(--violet) underline decoration-dotted underline-offset-2">ntfy</a>{" "}
                app, paste your topic into Hoffle's settings, and mentions, DMs and calls come through with the app closed.
              </p>
            </div>
            <div className="mx-auto w-full max-w-[300px]">
              <div className="rounded-[44px] border-[10px] border-(--ink) bg-(--ink) shadow-[0_40px_70px_-35px_rgba(40,28,10,.6)]">
                <img
                  src="/shots/hoffle-phone-780.webp"
                  width={390}
                  height={844}
                  loading="lazy"
                  decoding="async"
                  alt="Hoffle on a phone: the same channel in the Cozy theme with the message box at the bottom"
                  className="block h-auto w-full rounded-[34px]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Self-host ────────────────────────────────────────────── */}
        <section id="self-host" className="scroll-mt-4 bg-(--ink) px-4 py-24 text-(--paper) sm:px-6 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="lp-display text-4xl font-extrabold leading-[1.02] sm:text-5xl">Host your own in one command</h2>
              <p className="mt-5 max-w-lg leading-relaxed text-white/75">
                It runs on a spare PC, a small home server or a cheap VPS. The first account you make becomes the owner,
                and everything (accounts, messages, uploads) lives in one <code className="rounded bg-white/10 px-1.5 py-0.5 text-[14px]">./state</code> folder
                that you back up by copying it.
              </p>
              <ul className="mt-6 space-y-2 text-[15px] text-white/85">
                {[
                  "Nothing to configure for a first run",
                  "Optional TURN relay for friends on strict networks",
                  "Optional LiveKit for big voice rooms",
                  "Point the desktop app at your server from its menu",
                ].map((line) => (
                  <li key={line} className="relative pl-4 before:absolute before:left-0 before:top-[0.7em] before:h-[2px] before:w-2 before:bg-(--coral)">{line}</li>
                ))}
              </ul>
              <a href={SELF_HOST_GUIDE} className="mt-8 inline-block font-bold text-white underline decoration-(--coral) decoration-2 underline-offset-4 hover:decoration-white">
                Read the self-hosting guide
              </a>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e0b14]">
              <div className="flex h-11 items-center justify-between border-b border-white/10 px-4">
                <span className="font-mono text-xs text-white/50">terminal</span>
                <CopyButton text={SELF_HOST} />
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[14px] leading-7 text-[#b8f5c9]">
                {SELF_HOST.split("\n").map((line) => (
                  <div key={line}><span className="select-none text-white/35">$ </span>{line}</div>
                ))}
                <div className="text-white/45"># then open http://localhost:8730 and make your account</div>
              </pre>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-4 px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_2fr]">
            <h2 className="lp-display text-4xl font-extrabold leading-[1.02] sm:text-5xl">Questions</h2>
            <div className="lp-faq divide-y divide-(--line) border-y border-(--line)">
              {FAQS.map((item, i) => (
                <details key={item.q} open={i === 0} className="group py-1">
                  <summary className="flex items-center justify-between gap-6 py-4 text-lg font-bold">{item.q}</summary>
                  <p className="max-w-[62ch] pb-5 leading-relaxed text-(--ink-2)">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing ──────────────────────────────────────────────── */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-(--coral) px-6 py-14 text-white sm:px-14 sm:py-16">
            <h2 className="lp-display max-w-[18ch] text-4xl font-extrabold leading-[1.02] sm:text-[52px]">
              Made by one person, for their friends.
            </h2>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/90">
              No investors, no ads, no roadmap to a paid tier. If Hoffle made your game nights better, star it on
              GitHub or tell one friend about it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={REPO} className={`${button} bg-white text-(--ink) hover:bg-(--paper)`}>
                <GithubMark className="h-4 w-4" /> Star on GitHub
              </a>
              {SUPPORT_URL && (
                <a href={SUPPORT_URL} className={`${button} border border-white/60 text-white hover:bg-white/10`}>Buy me a coffee</a>
              )}
            </div>
          </div>
        </section>
      </main>

    </SiteShell>
  );
}
