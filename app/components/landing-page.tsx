"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Bell,
  Bot,
  Check,
  ChevronDown,
  Coffee,
  Copy,
  Dices,
  Download,
  Globe,
  Headphones,
  Heart,
  MessageSquare,
  Mic,
  Monitor,
  Music2,
  Palette,
  PenTool,
  Scissors,
  Server,
  Smartphone,
  Sparkles,
  Star,
  Tv,
  Users,
  Volume2,
} from "lucide-react";

/**
 * hoffle.online — the public landing page.
 *
 * Every claim on here should be something the app actually does today; if a
 * feature is removed, remove it here too.
 */

/** Paste a Ko-fi / Buy Me a Coffee / GitHub Sponsors link to show the coffee button. */
const SUPPORT_URL = "";

const REPO = "https://github.com/Coxaexs/huddle";
const RELEASES = `${REPO}/releases/latest`;
const APP_URL = "https://chat.hoffle.online";

type Platform = "windows" | "mac" | "linux" | "phone";

const PLATFORMS: Record<Platform, { label: string; file: string; icon: React.ReactNode }> = {
  windows: { label: "Windows", file: ".exe installer", icon: <Monitor className="h-5 w-5" /> },
  mac: { label: "macOS", file: ".dmg · Apple Silicon & Intel", icon: <Monitor className="h-5 w-5" /> },
  linux: { label: "Linux", file: ".AppImage · Wayland & X11", icon: <Monitor className="h-5 w-5" /> },
  phone: { label: "Phone", file: "Open in your browser → Add to Home Screen", icon: <Smartphone className="h-5 w-5" /> },
};

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android/i.test(ua)) return "phone";
  if (/Mac/i.test(ua)) return "mac";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "windows";
}

/* ─── Small building blocks ────────────────────────────────────────────── */

/** lucide dropped brand logos, so the GitHub mark is inline. */
function Github({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(16px)",
        transition: `opacity .5s cubic-bezier(.16,1,.3,1) ${delay}ms, transform .5s cubic-bezier(.16,1,.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function PrimaryLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#7c5cfc] px-5 h-12 text-[15px] font-semibold text-white shadow-[0_8px_30px_-8px_rgba(124,92,252,.7)] transition hover:bg-[#6c4be8] hover:-translate-y-px ${className}`}
    >
      {children}
    </a>
  );
}

function GhostLink({ href, children, external = false, className = "" }: { href: string; children: React.ReactNode; external?: boolean; className?: string }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#2e2844] bg-[#1a1626] px-5 h-12 text-[15px] font-semibold text-[#ede9f6] transition hover:border-[#4a3f70] hover:bg-[#211c30] ${className}`}
    >
      {children}
    </a>
  );
}

function SectionHead({ kicker, title, sub }: { kicker: string; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-[#9e83fc]">{kicker}</p>
      <h2 className="text-3xl font-extrabold tracking-tight text-[#f4f1fa] sm:text-[42px] sm:leading-[1.1]">{title}</h2>
      {sub && <p className="mt-4 text-[15px] leading-relaxed text-[#a39cbf] sm:text-base">{sub}</p>}
    </Reveal>
  );
}

/* ─── Hero illustration: a call in progress ───────────────────────────── */

function CallPreview() {
  const people = [
    { name: "mira", color: "#7c5cfc", speaking: true },
    { name: "jonas", color: "#10b981", speaking: false },
    { name: "kai", color: "#f59e0b", speaking: false, muted: true },
    { name: "lou", color: "#ec4899", speaking: false },
  ];
  return (
    <div className="relative mx-auto max-w-5xl">
      <div aria-hidden className="pointer-events-none absolute -inset-x-10 -top-10 -bottom-10 rounded-[40px] bg-[radial-gradient(ellipse_at_center,rgba(124,92,252,.28),transparent_65%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-[#2d2745] bg-[#14111d] shadow-2xl">
        <div className="flex h-10 items-center gap-2 border-b border-[#241f35] bg-[#110f18] px-4">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 flex items-center gap-1.5 text-xs text-[#7d749a]">
            <Volume2 className="h-3.5 w-3.5 text-emerald-400" /> Game night · 4 in voice
          </span>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-[1fr_200px] sm:p-4">
          {/* The shared screen */}
          <div className="relative aspect-video overflow-hidden rounded-xl bg-[linear-gradient(135deg,#1d2a4a,#2b1d4a_55%,#3a1d3a)]">
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <Tv className="mx-auto mb-2 h-10 w-10 text-white/70" />
                <p className="text-sm font-semibold text-white/80">mira is sharing their screen</p>
                <p className="text-xs text-white/50">1080p · 60 fps · with game audio</p>
              </div>
            </div>
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> LIVE
            </span>
          </div>
          {/* People */}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-1">
            {people.map((p) => (
              <div
                key={p.name}
                className={`flex items-center gap-2 rounded-xl border bg-[#1a1626] p-2 sm:p-2.5 ${p.speaking ? "border-emerald-500/70" : "border-[#28223c]"}`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${p.speaking ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#1a1626]" : ""}`}
                  style={{ background: p.color }}
                >
                  {p.name[0].toUpperCase()}
                </span>
                <span className="hidden truncate text-sm font-medium text-[#d9d3ec] sm:inline">{p.name}</span>
                {p.muted ? (
                  <Mic className="ml-auto hidden h-3.5 w-3.5 text-red-400 sm:block" />
                ) : (
                  <Headphones className="ml-auto hidden h-3.5 w-3.5 text-[#7d749a] sm:block" />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-[#241f35] bg-[#110f18] px-4 py-2.5 text-xs text-[#9d95bc]">
          <span className="flex items-center gap-2 truncate">
            <Music2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span className="truncate">Now playing for everyone · lofi beats to raid to</span>
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <AudioLines className="h-3.5 w-3.5 text-[#9e83fc]" /> Background voices removed
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export function LandingPage() {
  const [platform, setPlatform] = useState<Platform>("windows");
  const [copied, setCopied] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => setPlatform(detectPlatform()), []);

  // The chat app's CSS locks the page to the viewport; the landing page scrolls.
  useEffect(() => {
    const targets = [document.body, document.documentElement];
    targets.forEach((el) => {
      el.classList.add("landing-page-active");
      el.style.overflowY = "auto";
      el.style.height = "auto";
    });
    document.body.style.overflowX = "hidden";
    return () => {
      targets.forEach((el) => {
        el.classList.remove("landing-page-active");
        el.style.overflowY = "";
        el.style.height = "";
      });
      document.body.style.overflowX = "";
    };
  }, []);

  const selfHost = `git clone ${REPO}.git hoffle
cd hoffle
docker compose up -d`;

  const copy = () => {
    void navigator.clipboard?.writeText(selfHost);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const current = PLATFORMS[platform];
  const downloadHref = platform === "phone" ? APP_URL : RELEASES;

  const features = [
    { icon: <Mic className="h-5 w-5" />, color: "text-[#9e83fc]", title: "Voice that sounds good", body: "Noise suppression that runs on your own device and removes fans, keyboards, even the TV in the background. Push-to-talk works while you're in a game." },
    { icon: <Tv className="h-5 w-5" />, color: "text-emerald-400", title: "Screen share at 1080p60, with sound", body: "Share a game or a movie with the audio included. Full-screen it, hide the call grid, done. No subscription tier." },
    { icon: <Music2 className="h-5 w-5" />, color: "text-amber-400", title: "Music for the whole room", body: "A built-in music bot everyone controls together: one queue, one play button, everyone hears the same song at the same time." },
    { icon: <Dices className="h-5 w-5" />, color: "text-rose-400", title: "D&D night, built in", body: "Battlemaps with tokens and fog of war, 3D physics dice, a spell and monster compendium, and a session recorder for the highlight reel." },
    { icon: <PenTool className="h-5 w-5" />, color: "text-sky-400", title: "Stuff to do together", body: "Whiteboard, Draw & Guess, watch-together, tier lists, polls and a soundboard. For the nights nobody can decide on a game." },
    { icon: <Scissors className="h-5 w-5" />, color: "text-[#9e83fc]", title: "Clip that!", body: "Someone said something legendary? One button saves the last 30 seconds of the call." },
    { icon: <MessageSquare className="h-5 w-5" />, color: "text-emerald-400", title: "Chat that keeps up", body: "Threads, replies, reactions, custom emoji and stickers, GIFs, voice messages, link previews, events with RSVPs, and search." },
    { icon: <Bot className="h-5 w-5" />, color: "text-amber-400", title: "Your Discord bots still work", body: "Hoffle speaks the Discord bot API, so bots written with discord.js or discord.py connect as they are. There's also a bridge for channels you keep on Discord." },
    { icon: <Palette className="h-5 w-5" />, color: "text-rose-400", title: "Make it yours", body: "Themes you can share, profile banners, pride badges, spatial audio seating, virtual backgrounds, and nicknames per server." },
  ];

  const faqs = [
    { q: "Is it actually free?", a: "Yes. No paid tier and no locked features. The code is open source (AGPL-3.0). If you want to support development, there's a coffee button below, but you don't have to." },
    { q: "Do I need to host a server?", a: "No. Make an account on chat.hoffle.online and invite your friends. Self-hosting is there if you want your own instance; it's one Docker command." },
    { q: "Can my friends join without installing anything?", a: "Yes. Everything works in the browser. The desktop app adds global push-to-talk, a proper screen-share picker, and notifications in your taskbar." },
    { q: "How big can a voice room be?", a: "Voice is peer-to-peer by default, which is great for friend groups of up to around 8 people. For bigger rooms, a server admin can turn on the optional LiveKit media server." },
    { q: "What about my phone?", a: "Open chat.hoffle.online and add it to your home screen. For notifications even when it's closed, add a free ntfy topic in Settings. No Google or Apple account is needed." },
    { q: "Who can read my messages?", a: "Whoever runs the server you're on, same as any chat app. There are no ads and no trackers. If that should be you, self-host it and your data never leaves your machine." },
  ];

  return (
    <div className="lp-root min-h-screen w-full bg-[#100e17] font-sans text-[#ede9f6] antialiased selection:bg-[#7c5cfc] selection:text-white">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[#221d33]/80 bg-[#100e17]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#7c5cfc] text-lg font-extrabold text-white">h</span>
            <span className="text-lg font-bold tracking-tight">Hoffle</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-[#a39cbf] md:flex">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#download" className="hover:text-white">Download</a>
            <a href="#self-host" className="hover:text-white">Self-host</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <a href="#support" className="hover:text-white">Support</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub" className="hidden h-9 w-9 place-items-center rounded-lg text-[#a39cbf] hover:bg-[#1a1626] hover:text-white sm:grid">
              <Github className="h-5 w-5" />
            </a>
            <a href={APP_URL} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#7c5cfc] px-3.5 text-sm font-semibold text-white hover:bg-[#6c4be8]">
              Open Hoffle <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section id="top" className="px-4 pb-20 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2e2646] bg-[#1a1528] px-3.5 py-1.5 text-xs font-semibold text-[#c4b5fd]">
              <Heart className="h-3.5 w-3.5 text-rose-400" /> Free & open source · no paid tier
            </span>
          </Reveal>
          <Reveal delay={60}>
            <h1 className="text-[44px] font-extrabold leading-[1.05] tracking-tight text-white sm:text-7xl">
              Hang out with your
              <br />
              <span className="text-[#a78bfa]">friends, not a platform.</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#a39cbf] sm:text-lg">
              Hoffle is a voice and chat app for friend groups, gaming squads and D&D tables. Crisp
              voice, screen sharing with sound, music together, and all of it free. Use ours or run
              your own.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <PrimaryLink href={downloadHref}>
                <Download className="h-4 w-4" />
                {platform === "phone" ? "Open Hoffle" : `Download for ${current.label}`}
              </PrimaryLink>
              <GhostLink href={APP_URL}>
                <Globe className="h-4 w-4 text-[#a39cbf]" /> Open in browser
              </GhostLink>
            </div>
            <p className="mt-4 text-xs text-[#6f6889]">
              Also on <a href="#download" className="underline decoration-dotted hover:text-[#a39cbf]">Windows, macOS, Linux and phones</a>. No credit card, no ads.
            </p>
          </Reveal>
        </div>
        <Reveal delay={260} className="mt-16">
          <CallPreview />
        </Reveal>
      </section>

      {/* ── Why ─────────────────────────────────────────────────────── */}
      <section className="border-y border-[#1f1b2e] bg-[#13101c] px-4 py-14">
        <div className="mx-auto grid max-w-5xl gap-8 text-center sm:grid-cols-3">
          {[
            { icon: <Sparkles className="h-5 w-5" />, t: "Nothing behind a paywall", d: "HD screen share, big uploads and custom emoji are free for everyone." },
            { icon: <Users className="h-5 w-5" />, t: "Made for small groups", d: "No algorithm, no discovery feed, no one selling your attention." },
            { icon: <Server className="h-5 w-5" />, t: "Yours if you want it", d: "Run it on a spare PC or a cheap server. All your data sits in one folder." },
          ].map((item, i) => (
            <Reveal key={item.t} delay={i * 70}>
              <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[#221c33] text-[#b8a7ff]">{item.icon}</div>
              <h3 className="font-bold text-white">{item.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#a39cbf]">{item.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section id="features" className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHead
            kicker="What's inside"
            title={<>Everything for a good night in, <span className="text-[#a78bfa]">in one app.</span></>}
            sub="No bots to invite for basic stuff, no extra apps to install for game night."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 60}>
                <div className="h-full rounded-2xl border border-[#261f3a] bg-[#15121f] p-6 transition hover:-translate-y-0.5 hover:border-[#3c3457]">
                  <div className={`mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[#1f1a30] ${f.color}`}>{f.icon}</div>
                  <h3 className="text-[17px] font-bold text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#a39cbf]">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Download ────────────────────────────────────────────────── */}
      <section id="download" className="border-t border-[#1f1b2e] bg-[#13101c] px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionHead
            kicker="Download"
            title="Get Hoffle on every device."
            sub="The desktop app adds push-to-talk that works in games, desktop audio in screen shares, and notifications in your taskbar or dock."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(PLATFORMS) as Platform[]).map((key, i) => {
              const p = PLATFORMS[key];
              const mine = key === platform;
              return (
                <Reveal key={key} delay={i * 60}>
                  <a
                    href={key === "phone" ? APP_URL : RELEASES}
                    className={`flex h-full flex-col rounded-2xl border p-5 transition hover:-translate-y-0.5 ${mine ? "border-[#7c5cfc] bg-[#1d1830]" : "border-[#261f3a] bg-[#15121f] hover:border-[#3c3457]"}`}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#241d38] text-[#c4b5fd]">{p.icon}</span>
                      {mine && <span className="rounded-full bg-[#7c5cfc]/20 px-2 py-0.5 text-[11px] font-semibold text-[#c4b5fd]">Your device</span>}
                    </div>
                    <span className="font-bold text-white">{p.label}</span>
                    <span className="mt-1 text-xs leading-relaxed text-[#8d85aa]">{p.file}</span>
                    <span className="mt-auto pt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#b8a7ff]">
                      {key === "phone" ? "Open" : "Download"} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </a>
                </Reveal>
              );
            })}
          </div>
          <Reveal delay={200}>
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#261f3a] bg-[#15121f] p-5 text-sm text-[#a39cbf]">
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <p>
                <span className="font-semibold text-white">Phone notifications without Big Tech.</span>{" "}
                Install the free <a href="https://ntfy.sh" target="_blank" rel="noreferrer" className="text-[#b8a7ff] underline decoration-dotted">ntfy</a> app,
                paste your topic into Hoffle's settings, and you'll get mentions, DMs and incoming calls even with the app closed.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Self-host ───────────────────────────────────────────────── */}
      <section id="self-host" className="px-4 py-24">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-[#9e83fc]">Self-host</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-[40px] sm:leading-[1.1]">Your own Hoffle in one command.</h2>
            <p className="mt-4 leading-relaxed text-[#a39cbf]">
              Runs on a spare PC, a Raspberry Pi-class box or a cheap server. The first account you make becomes the owner, and everything
              (accounts, messages, uploads) lives in a single <code className="rounded bg-[#221c33] px-1.5 py-0.5 text-[13px] text-[#c4b5fd]">./state</code> folder you can back up by copying it.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-[#cfc8e3]">
              {["No configuration needed for a first run", "Optional TURN relay for friends on strict networks", "Optional LiveKit for big voice rooms", "Point the desktop app at your server from its menu"].map((line) => (
                <li key={line} className="flex items-start gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{line}</li>
              ))}
            </ul>
            <a href={`${REPO}/blob/main/docs/self-hosting.md`} target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-[#b8a7ff] hover:text-white">
              Read the self-hosting guide <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </Reveal>
          <Reveal delay={100}>
            <div className="overflow-hidden rounded-2xl border border-[#2b2540] bg-[#0c0a12] shadow-xl">
              <div className="flex h-11 items-center justify-between border-b border-[#1f1b2e] px-4">
                <span className="font-mono text-xs text-[#7d749a]">terminal</span>
                <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-md border border-[#2a253d] px-2.5 py-1 text-xs text-[#cfc8e3] hover:bg-[#1a1626]">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-sm leading-7 text-emerald-300">
                {selfHost.split("\n").map((line) => (
                  <div key={line}><span className="select-none text-[#5b5374]">$ </span>{line}</div>
                ))}
                <div className="text-[#7d749a]"># open http://localhost:8730 and make your account</div>
              </pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section id="faq" className="border-t border-[#1f1b2e] bg-[#13101c] px-4 py-24">
        <div className="mx-auto max-w-3xl">
          <SectionHead kicker="FAQ" title="Questions people ask." />
          <div className="space-y-3">
            {faqs.map((item, i) => {
              const open = openFaq === i;
              return (
                <Reveal key={item.q} delay={i * 40}>
                  <div className="rounded-2xl border border-[#261f3a] bg-[#15121f]">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-white"
                    >
                      {item.q}
                      <ChevronDown className={`h-4 w-4 shrink-0 text-[#8d85aa] transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open && <p className="px-5 pb-5 text-sm leading-relaxed text-[#a39cbf]">{item.a}</p>}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Support ─────────────────────────────────────────────────── */}
      <section id="support" className="px-4 py-24">
        <Reveal className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-[#3a2f5c] bg-[linear-gradient(160deg,#211a36,#161222)] p-8 text-center sm:p-14">
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
              <Coffee className="h-7 w-7" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Made by one person, for friends.</h2>
            <p className="mx-auto mt-4 max-w-lg leading-relaxed text-[#b3abcc]">
              Hoffle has no investors and no ads. If it made your game nights better, a coffee pays for the servers and keeps new features coming.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {SUPPORT_URL && (
                <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-xl bg-amber-400 px-5 text-[15px] font-bold text-[#1d1500] transition hover:-translate-y-px hover:bg-amber-300">
                  <Coffee className="h-4 w-4" /> Buy me a coffee
                </a>
              )}
              <GhostLink href={REPO} external>
                <Star className="h-4 w-4 text-amber-300" /> Star on GitHub
              </GhostLink>
            </div>
            <p className="mt-5 text-xs text-[#7d749a]">Telling one friend about Hoffle helps just as much.</p>
          </div>
        </Reveal>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────── */}
      <section className="px-4 pb-24">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">Your friends are waiting.</h2>
          <p className="mx-auto mt-4 max-w-md text-[#a39cbf]">Make a server, send one invite link, and you're in voice in under a minute.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PrimaryLink href={downloadHref}>
              <Download className="h-4 w-4" />
              {platform === "phone" ? "Open Hoffle" : `Download for ${current.label}`}
            </PrimaryLink>
            <GhostLink href={APP_URL}>Open in browser</GhostLink>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-[#1f1b2e] px-4 py-10 text-sm text-[#7d749a]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#7c5cfc] text-xs font-extrabold text-white">h</span>
            <span className="font-semibold text-[#ede9f6]">Hoffle</span>
            <span>· open source under AGPL-3.0</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <a href={APP_URL} className="hover:text-white">Web app</a>
            <a href="#download" className="hover:text-white">Download</a>
            <a href={`${REPO}/blob/main/docs/self-hosting.md`} target="_blank" rel="noreferrer" className="hover:text-white">Self-hosting</a>
            <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-white">GitHub</a>
            {SUPPORT_URL && <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="hover:text-white">Support</a>}
          </div>
        </div>
      </footer>
    </div>
  );
}
