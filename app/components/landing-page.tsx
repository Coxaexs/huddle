import type { ReactNode } from "react";
import { Coffee, Heart } from "lucide-react";
import { CopyButton, DownloadButton } from "./landing-client";
import { LiveChannel, MatrixRain, ThemeTour, type JoinLinks } from "./landing-demo";
import { APP_URL, GithubMark, RELEASES, REPO, SITE, SiteShell, KOFI_URL, GITHUB_SPONSORS_URL } from "./site-chrome";

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
 * hydrate.
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
  email: "info@hoffle.online",
};

const MUSIC_BOT_REPO = "https://github.com/Coxaexs/musicwatchtogether";

const FEATURES: { title: string; items: ReactNode[] }[] = [
  {
    title: "Voice and screen sharing",
    items: [
      "Noise suppression (RNNoise) runs on your own device, so fans, keyboards and the TV stay out of the call.",
      "Screen share up to 1080p at 60 fps with the game or film audio, plus 24 fps film modes that stay smooth.",
      "Push-to-talk that keeps working while a game has focus (desktop app).",
      "Clip saves the last 30 seconds of the call.",
      "Spatial audio seating and virtual backgrounds.",
    ],
  },
  {
    title: "Music and watching together",
    items: [
      <>
        A music bot with one shared queue, synced so everyone hears the same second of the song. It's{" "}
        <a href={MUSIC_BOT_REPO} className="font-semibold text-(--violet) underline decoration-dotted underline-offset-2">
          its own open-source project
        </a>{" "}
        and also plays in Discord voice channels.
      </>,
      "A two-deck DJ booth, lyrics, and Watch Together rooms for YouTube and reels.",
      "A whiteboard, Draw & Guess, tier lists, polls and a soundboard.",
    ],
  },
  {
    title: "D&D",
    items: [
      "Battlemaps with tokens and fog of war.",
      "3D dice with physics, rolled where everyone can see them.",
      "A spell and monster compendium inside the call.",
    ],
  },
  {
    title: "Chat",
    items: [
      "Threads, replies, reactions, custom emoji and stickers, GIFs and voice messages.",
      "Link previews, events with RSVPs, and search with filters.",
    ],
  },
  {
    title: "Discord bots",
    items: [
      "Hoffle implements the Discord bot API, so bots written with discord.js or discord.py connect without code changes.",
      "A bridge mirrors channels you still keep on Discord.",
    ],
  },
  {
    title: "Themes",
    items: [
      "Twelve built in: Cozy, Light, Legacy, Amber, Midnight, Sunset, Dark Academia, Vampire, Cyberpunk, Matrix, and MSN Messenger in light and dark. Plus themes you write in CSS and share.",
      "Profile banners, pride badges and a nickname per server.",
    ],
  },
];

/**
 * Discord's side is its free plan, from discord.com/nitro and Discord's help
 * centre. Check these again before changing them; they move.
 */
const COMPARISON: { label: string; discord: string; hoffle: string }[] = [
  { label: "Price", discord: "Free; Nitro is $9.99 a month (US)", hoffle: "Free, no paid tier" },
  { label: "Screen share", discord: "720p at 30 fps (1080p60 and up with Nitro)", hoffle: "Up to 1080p at 60 fps, with audio" },
  { label: "File uploads", discord: "10 MB per file", hoffle: "8 MB images, 20 MB PDFs, 40 MB video clips" },
  { label: "Mic quality", discord: "64 kbps default, up to 96 kbps", hoffle: "64 kbps Opus with packet redundancy" },
  { label: "Custom emoji in other servers", discord: "Nitro only", hoffle: "Free" },
  { label: "People in one voice room", discord: "Up to 99 (25 with video)", hoffle: "No set limit; the server's upload is the limit, about 4 Mbps per 1080p viewer" },
  { label: "Source code", discord: "Closed", hoffle: "Open source, AGPL-3.0" },
  { label: "Host it yourself", discord: "No", hoffle: "Yes, with Docker" },
  { label: "Bots", discord: "Yes", hoffle: "discord.js and discord.py bots connect unchanged" },
  { label: "Phone", discord: "iOS and Android apps", hoffle: "Phone browser, added to the home screen" },
];

const VOICE_POINTS: { title: string; body: string }[] = [
  {
    title: "Everyone uploads once",
    body: "Calls go through a LiveKit media server. You send your mic and screen to the server once and it forwards them, so a room isn't capped at the 6 to 8 people a peer-to-peer call can carry.",
  },
  {
    title: "A slow connection only affects itself",
    body: "Screen shares are sent in two sizes (simulcast). A viewer on a weak connection gets the smaller one, and the sharer and everyone else keep the full picture.",
  },
  {
    title: "Modes for films and for desktops",
    body: "Film modes run at 24 fps and give up resolution before frames, so movies don't stutter. Desktop modes keep text sharp and give up frames first.",
  },
  {
    title: "Fewer dropouts",
    body: "Mic audio is sent with redundant packets, so a lost packet is rebuilt instead of heard as a gap. If the media server can't be reached, the call falls back to peer-to-peer.",
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is it free?",
    a: "Yes. There's no paid tier and nothing is locked. The code is AGPL-3.0, so it stays open.",
  },
  {
    q: "How do I get in?",
    a: "chat.hoffle.online is invite-only for now. Ask someone who's on it for an invite code, support Hoffle with $5 on Ko-fi or GitHub Sponsors and you'll get one by email, or email info@hoffle.online and ask for one. Or run your own: the first account on a new server becomes the owner and can invite everyone else.",
  },
  {
    q: "Do my friends have to install anything?",
    a: "No, it works in the browser. The desktop app adds push-to-talk that works in games, a screen-share picker with desktop audio, and taskbar or dock notifications.",
  },
  {
    q: "How many people fit in a voice call?",
    a: "On chat.hoffle.online calls go through LiveKit, so there's no fixed limit; the server's upload speed is what runs out first. A self-hosted server without LiveKit uses peer-to-peer calls, which work well up to about 8 people.",
  },
  {
    q: "Is there a phone app?",
    a: "Open chat.hoffle.online on your phone and add it to your home screen. For notifications while it's closed, install the free ntfy app and paste your topic into Hoffle's settings.",
  },
  {
    q: "Who can read my messages?",
    a: "Whoever runs the server you're on, like with any chat app. There are no ads or trackers. If you'd rather that be you, host it yourself.",
  },
  {
    q: "What does the MSN Messenger theme change?",
    a: "The whole layout, not only the colours: a contact list with groups, “says:” before each message, display pictures, personal emoticons, nudges, winks, handwriting, chat backgrounds, sign-in toasts with their own sounds, and an MSN Today window. Pick it in Settings → Appearance.",
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
        "A free, open-source chat app for friend groups: voice chat through LiveKit, 1080p60 screen sharing with sound, a shared music bot, D&D tools, and themes including MSN Messenger. Use it in the browser, on the desktop, or self-host it.",
      applicationCategory: "CommunicationApplication",
      operatingSystem: "Web, Windows, macOS, Linux, Android, iOS",
      isAccessibleForFree: true,
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      downloadUrl: RELEASES,
      installUrl: APP_URL,
      screenshot: SCREENSHOTS.map((image) => `${SITE}${image}-1280.webp`),
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

/* ─── Theme tour ───────────────────────────────────────────────────────── */

const tourTitle = "lp-display text-3xl font-bold leading-tight sm:text-[44px]";

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

const TOUR_SLIDES = [
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
            <h2 className="lp-display text-3xl font-bold leading-tight [text-shadow:0_1px_0_rgba(0,40,120,.35)] sm:text-[44px]">
              The MSN Messenger theme
            </h2>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/90">
              A full second interface for Hoffle, modelled on Windows Live Messenger. It changes the layout and
              behaviour, not only the colours: messages read “Mira says:”, friends signing in show a toast, and a
              nudge shakes the other person's window.
            </p>
            <ul className="mt-5 max-w-md list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-white/90">
              <li>A contact list with your own groups, and a quiet list</li>
              <li>Display pictures, personal emoticons, winks and handwriting</li>
              <li>Statuses like Be Right Back and Out to Lunch</li>
              <li>A sound for each event, picked in its Sounds settings</li>
              <li>MSN Today: who's around, unread conversations and what's playing</li>
            </ul>
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
          intro="Gothic midnight: blood red on black velvet. Channel names and server titles are set in blackletter and glow faintly red."
          points={[
            "Blackletter headings with a red glow",
            "Velvet gradients down the sidebars and member list",
            "The message box glows red while you type",
            "Red text selection, and a matching scrollbar",
          ]}
        />
        <ThemeShot
          image="/shots/hoffle-vampire-theme"
          alt="Hoffle's Vampire theme: the Tuesday Crew server in blackletter with a red glow, a friend group's channel and six people online"
          frame="rounded-lg border border-[#c8102e]/50 bg-[#0a0607] shadow-[0_30px_70px_-20px_rgba(200,16,46,.55)]"
          titleBar="border-b border-[#c8102e]/30 bg-[linear-gradient(180deg,#2a070e,#140609)] text-[#f3e7e7] [font-family:'Pirata_One',Georgia,serif] text-[16px] tracking-[.02em]"
          title="general · Tuesday Crew"
          controls={["#5e1421", "#5e1421", "#c8102e"].map((color, i) => (
            <span key={i} className="h-3 w-3 rounded-full" style={{ background: color }} />
          ))}
          toast={
            <div className="flex items-center gap-3 rounded-lg border border-[#c8102e]/50 bg-[#140a0d] p-3 text-[13px] text-[#f3e7e7] shadow-[0_10px_30px_rgba(0,0,0,.6),0_0_20px_rgba(200,16,46,.25)]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#b9a6f7] font-bold text-[#15121f]">L</span>
              <p className="leading-snug"><b>Lou</b> has risen.</p>
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
          intro="A neon street terminal: acid yellow and cyan on black, hard clipped corners, and faint CRT scanlines over everything."
          points={[
            "Headings with a red and cyan chromatic split",
            "Clipped corners on server icons, channels and the message box",
            "Monospace cyan labels and timestamps",
            "Faint CRT scanlines across the whole app",
          ]}
        />
        <ThemeShot
          image="/shots/hoffle-cyberpunk-theme"
          alt="Hoffle's Cyberpunk theme: acid yellow on black, the selected channel as a clipped yellow tab and cyan labels"
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
                <b className="text-[#fcee0a]">Kai</b> jacked in
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
            tone="text-[#c8ffd8] [font-family:'Geist_Mono',ui-monospace,monospace]"
            titleClass={`${tourTitle} font-normal [font-family:'Share_Tech_Mono',ui-monospace,monospace] text-[#b9ffd0] [text-shadow:0_0_14px_rgba(0,255,102,.6)] sm:text-[56px]`}
            title={<>Matrix<span className="animate-pulse text-[#00ff66]">_</span></>}
            intro="Phosphor green on black, monospace type, and digital rain falling behind slightly see-through panels."
            points={[
              "Digital rain behind the glass, or one still frame if you've asked for reduced motion",
              "A blinking cursor after the channel name",
              "The selected channel reads like a terminal's highlighted line",
              "Monospace everywhere",
            ]}
          />
          <ThemeShot
            image="/shots/hoffle-matrix-theme"
            alt="Hoffle's Matrix theme: phosphor green monospace text over digital rain"
            frame="rounded border border-[#00ff66]/35 bg-[#000400] shadow-[0_0_50px_rgba(0,255,102,.15)]"
            titleBar="border-b border-[#00ff66]/25 bg-[#010a04] text-[#7dffae] [font-family:'Share_Tech_Mono',ui-monospace,monospace]"
            title="~/tuesday-crew/general"
            controls={[0, 1, 2].map((i) => (
              <span key={i} className="h-2.5 w-2.5 rounded-full border border-[#00ff66]/60" />
            ))}
            toast={
              <div className="rounded border border-[#00ff66]/40 bg-[#000c05] p-3 text-[13px] text-[#c8ffd8] shadow-[0_0_24px_rgba(0,255,102,.2)] [font-family:'Share_Tech_Mono',ui-monospace,monospace]">
                <p className="leading-snug">Wake up, <b className="text-[#00ff66]">Mira</b>…</p>
                <p className="mt-0.5 text-[#5fae7a]">Sam has joined the Lounge.</p>
              </div>
            }
          />
        </div>
      </>
    ),
  },
];

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
const sectionTitle = "lp-display text-3xl font-bold leading-tight sm:text-4xl";
const link = "font-semibold text-(--violet) underline decoration-dotted underline-offset-2";

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
            <h1 className="lp-display max-w-[22ch] text-4xl font-bold leading-[1.1] sm:text-[56px]">
              A chat app for small groups, with voice, screen sharing and game night built in.
            </h1>
            <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <p className="max-w-[62ch] text-lg leading-relaxed text-(--ink-2)">
                I started Hoffle for my own friend group, who spent most evenings in a Discord call. It has the
                things we used every night: voice, 1080p screen sharing with sound, a music bot, and D&amp;D tools.
                It's free and open source, and it runs in the browser, as a desktop app, or on your own server.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href={APP_URL} className={primaryButton}>Open Hoffle</a>
                <DownloadButton releases={RELEASES} appUrl={APP_URL} className={secondaryButton} />
              </div>
            </div>
            <div className="mt-12 sm:mt-14">
              <LiveChannel links={JOIN_LINKS} />
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────── */}
        <section id="features" className="scroll-mt-4 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <h2 className={sectionTitle}>Features</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-(--ink-2)">
              All of this is in the app today, for everyone.
            </p>
            <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((group) => (
                <div key={group.title}>
                  <h3 className="text-lg font-bold">{group.title}</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-(--ink-2) marker:text-(--muted)">
                    {group.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Voice (LiveKit) ──────────────────────────────────────── */}
        <section id="voice" className="scroll-mt-4 border-y border-(--line) bg-(--paper-2) px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[2fr_3fr]">
            <div>
              <h2 className={sectionTitle}>How voice works</h2>
              <p className="mt-4 max-w-md leading-relaxed text-(--ink-2)">
                Since October 2026, calls on chat.hoffle.online run through{" "}
                <a href="https://livekit.io" className={link}>LiveKit</a>, an open-source media server. Before
                that, every call was peer-to-peer, which got heavy past about 8 people or when several people
                watched one screen share. Self-hosted servers can turn it on with a Docker profile and three settings.
              </p>
            </div>
            <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {VOICE_POINTS.map((point) => (
                <div key={point.title}>
                  <dt className="font-bold">{point.title}</dt>
                  <dd className="mt-1.5 text-[15px] leading-relaxed text-(--ink-2)">{point.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Theme tour ───────────────────────────────────────────── */}
        <ThemeTour slides={TOUR_SLIDES} />

        {/* ── Compared to Discord ──────────────────────────────────── */}
        <section id="compare" className="scroll-mt-4 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-4xl">
            <h2 className={sectionTitle}>Compared to Discord</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-(--ink-2)">
              Discord's free plan next to Hoffle, in numbers. Discord is the better choice for large public
              communities and has proper phone apps; Hoffle is aimed at groups of friends.
            </p>
            <div className="mt-8 overflow-x-auto rounded-xl border border-(--line)">
              <table className="w-full min-w-[560px] border-collapse text-left text-[14px] sm:text-[15px]">
                <caption className="sr-only">Hoffle compared with Discord&apos;s free plan</caption>
                <thead>
                  <tr className="border-b border-(--line) bg-(--paper-2) text-sm">
                    <th scope="col" className="w-[28%] px-4 py-3 font-semibold text-(--muted)"><span className="sr-only">Feature</span></th>
                    <th scope="col" className="w-[34%] px-4 py-3 font-semibold">Discord (free)</th>
                    <th scope="col" className="w-[38%] px-4 py-3 font-semibold">Hoffle</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row.label} className="border-b border-(--line) last:border-b-0">
                      <th scope="row" className="px-4 py-3 align-top font-semibold">{row.label}</th>
                      <td className="px-4 py-3 align-top text-(--ink-2)">{row.discord}</td>
                      <td className="px-4 py-3 align-top">{row.hoffle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-(--muted)">
              Discord figures are from{" "}
              <a href="https://discord.com/nitro" className="underline underline-offset-2">discord.com/nitro</a>{" "}
              and Discord's help centre, October 2026. Hoffle's upload limits are those of chat.hoffle.online.
            </p>
          </div>
        </section>

        {/* ── Download ─────────────────────────────────────────────── */}
        <section id="download" className="scroll-mt-4 border-y border-(--line) bg-(--paper-2) px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[7fr_5fr]">
            <div>
              <h2 className={sectionTitle}>Download</h2>
              <p className="mt-3 max-w-xl leading-relaxed text-(--ink-2)">
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
                      <span className="w-24 shrink-0 font-bold">{row.name}</span>
                      <span className="min-w-0 flex-1 text-sm text-(--muted)">{row.file}</span>
                      <span className="shrink-0 text-sm font-semibold text-(--violet) group-hover:underline">{row.action} →</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-6 max-w-xl text-sm leading-relaxed text-(--ink-2)">
                <b className="text-(--ink)">Phone notifications without a Google or Apple account:</b> install the free{" "}
                <a href="https://ntfy.sh" className={link}>ntfy</a>{" "}
                app and paste your topic into Hoffle's settings. Mentions, DMs and calls then arrive with the app closed.
              </p>
            </div>
            <div className="mx-auto w-full max-w-[300px]">
              <div className="rounded-[44px] border-[10px] border-(--slab) bg-(--slab) shadow-[0_30px_60px_-35px_rgba(20,15,40,.5)]">
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
        <section id="self-host" className="scroll-mt-4 bg-(--slab) px-4 py-20 text-white sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className={sectionTitle}>Run your own</h2>
              <p className="mt-4 max-w-lg leading-relaxed text-white/75">
                Hoffle runs on a spare PC, a home server or a small VPS with Docker. The first account you create
                becomes the owner. Accounts, messages and uploads all live in one{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-[14px]">state</code> folder, so a backup is
                a copy of that folder.
              </p>
              <ul className="mt-5 list-disc space-y-1.5 pl-5 text-[15px] text-white/85 marker:text-white/40">
                <li>No configuration needed for a first run</li>
                <li>LiveKit for bigger voice rooms: <code className="text-[14px]">--profile livekit</code></li>
                <li>
                  The full{" "}
                  <a href={MUSIC_BOT_REPO} className="underline decoration-dotted underline-offset-2">music bot</a>:{" "}
                  <code className="text-[14px]">--profile musicbot</code>
                </li>
                <li>A TURN relay for friends on strict networks: <code className="text-[14px]">--profile turn</code></li>
                <li>The desktop app can point at your server from its menu</li>
              </ul>
              <a href={SELF_HOST_GUIDE} className="mt-7 inline-block font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
                Self-hosting guide, step by step
              </a>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0e0b14]">
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
        <section id="faq" className="scroll-mt-4 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_2fr]">
            <h2 className={sectionTitle}>Questions</h2>
            <div className="lp-faq divide-y divide-(--line) border-y border-(--line)">
              {FAQS.map((item, i) => (
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
            <p className="max-w-2xl leading-relaxed text-(--ink-2)">
              Hoffle is a one-person project with no ads and no investors. Bug reports and pull requests are
              welcome on GitHub.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={REPO} className={secondaryButton}>
                <GithubMark className="h-4 w-4" /> Hoffle on GitHub
              </a>
              {KOFI_URL && (
                <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                  <Coffee className="h-4 w-4" /> Support on Ko-fi
                </a>
              )}
              {GITHUB_SPONSORS_URL && (
                <a href={GITHUB_SPONSORS_URL} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                  <Heart className="h-4 w-4 text-[#ea4aaa]" /> GitHub Sponsors
                </a>
              )}
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
