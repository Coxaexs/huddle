"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Volume2,
  Tv,
  Music2,
  Compass,
  Lock,
  Server,
  GitFork,
  HardDrive,
  Check,
  X,
  Minus,
  Copy,
  ChevronRight,
  ArrowRight,
  ExternalLink,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Layers,
  Network,
  Sparkles,
  Radio,
  SlidersHorizontal,
  Play,
  Pause,
  Users,
  MessageSquare,
  Menu,
  FileCode,
  Globe,
  Headphones,
  Mic,
  MicOff,
  Share2,
  ThumbsUp,
  Heart,
  Flame,
} from "lucide-react";

/* ─── Scroll-reveal hook ───────────────────────────────────────────────── */
function useReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/* ─── Reveal Component ─────────────────────────────────────────────────── */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── shadcn/ui Primitive Components (Cozy Theme, Zero Gradients) ────────── */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "sm" | "default" | "lg" | "icon";
  children: React.ReactNode;
}

function Button({
  variant = "default",
  size = "default",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#7c5cfc] disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer";

  const variants = {
    default: "bg-[#7c5cfc] text-white hover:bg-[#6c4be8] shadow-sm",
    secondary:
      "bg-[#201c2e] text-[#ede9f6] border border-[#2e2844] hover:bg-[#272237] hover:border-[#3a3256]",
    outline:
      "border border-[#2a253d] bg-transparent text-[#ede9f6] hover:bg-[#1c182a] hover:border-[#383152]",
    ghost: "text-[#9d95bc] hover:text-[#ede9f6] hover:bg-[#1a1626]",
  };

  const sizes = {
    sm: "h-8 px-3 text-xs gap-1.5",
    default: "h-10 px-4 py-2 gap-2",
    lg: "h-12 px-6 text-base gap-2.5 rounded-xl font-semibold",
    icon: "h-9 w-9 p-0",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

interface BadgeProps {
  variant?: "default" | "secondary" | "outline" | "success" | "warning";
  className?: string;
  children: React.ReactNode;
}

function Badge({ variant = "default", className = "", children }: BadgeProps) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border";

  const variants = {
    default: "bg-[#282142] text-[#b8a7ff] border-[#3d3264]",
    secondary: "bg-[#1c182a] text-[#9d95bc] border-[#2a253d]",
    outline: "bg-transparent text-[#ede9f6] border-[#2a253d]",
    success: "bg-[#132c23] text-[#4ade80] border-[#1b4837]",
    warning: "bg-[#2e2513] text-[#fbbf24] border-[#4b3b19]",
  };

  return (
    <span className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}

function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-[#2a253d] bg-[#181523] text-[#ede9f6] shadow-sm transition-all duration-200 hover:border-[#3c3457] hover:bg-[#1b1728] ${className}`}
    >
      {children}
    </div>
  );
}

function CardHeader({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>{children}</div>
  );
}

function CardTitle({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      className={`text-base font-semibold leading-tight tracking-tight text-[#ede9f6] ${className}`}
    >
      {children}
    </h3>
  );
}

function CardDescription({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={`text-xs text-[#9d95bc] leading-relaxed ${className}`}>
      {children}
    </p>
  );
}

function CardContent({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`p-6 pt-0 ${className}`}>{children}</div>;
}

/* ─── Main Landing Page Component ──────────────────────────────────────── */

export function LandingPage() {
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"docker" | "compose" | "nginx" | "config">("docker");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(true);

  // Ensure window scrolling is completely active and not blocked by chat CSS
  useEffect(() => {
    document.body.classList.add("landing-page-active");
    document.documentElement.classList.add("landing-page-active");
    document.body.style.overflowY = "auto";
    document.body.style.overflowX = "hidden";
    document.body.style.height = "auto";
    document.documentElement.style.overflowY = "auto";
    document.documentElement.style.height = "auto";

    return () => {
      document.body.classList.remove("landing-page-active");
      document.documentElement.classList.remove("landing-page-active");
      document.body.style.overflowY = "";
      document.body.style.overflowX = "";
      document.body.style.height = "";
      document.documentElement.style.overflowY = "";
      document.documentElement.style.height = "";
    };
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(id);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const dockerCommand = `git clone https://github.com/Coxaexs/huddle.git hoffle
cd hoffle
docker compose up -d`;

  const composeSnippet = `services:
  hoffle:
    container_name: hoffle
    restart: unless-stopped
    ports:
      - "8730:8730"   # Single external port
    volumes:
      - ./state:/app/state
      - ./.dev.vars:/app/.dev.vars:ro
  # Integrated music-bot & dnd-bot run internally without host exposure`;

  const nginxSnippet = `server {
    listen 443 ssl http2;
    server_name chat.yourdomain.com;
    client_max_body_size 45M;

    # Real-Time WebSocket Endpoint
    location /api/realtime {
        proxy_pass http://127.0.0.1:8730;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # App Web Interface & Static Content
    location / {
        proxy_pass http://127.0.0.1:8730;
        proxy_set_header Host $host;
    }
}`;

  const configSnippet = `# .dev.vars — Configuration & Security
# Change BOOTSTRAP_CODE before making server public!
BOOTSTRAP_CODE=your_custom_admin_secret_key

BOT_TOKEN=random_secure_bot_token
MUSICWATCH_PASSWORD=optional_shared_password

# STUN / TURN servers for peer-to-peer NAT traversal
HUDDLE_ICE_SERVERS=[{"urls":["stun:stun.cloudflare.com:3478"]}]`;

  const navLinks = [
    { href: "#features", label: "Features" },
    { href: "#comparison", label: "Comparison" },
    { href: "#self-host", label: "Self-Host" },
    { href: "#architecture", label: "Architecture" },
  ];

  return (
    <div className="lp-root min-h-screen w-full bg-[#121019] text-[#ede9f6] font-sans antialiased selection:bg-[#7c5cfc] selection:text-white">
      {/* ── Top Navigation (shadcn-inspired navbar) ────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-[#252036] bg-[#121019]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7c5cfc] text-white font-bold text-lg shadow-sm">
              h
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-[#ede9f6]">
                Hoffle
              </span>
              <Badge variant="default" className="hidden sm:inline-flex">
                v0.9 · Open Source
              </Badge>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#9d95bc]">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-[#ede9f6]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop Action Buttons */}
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/Coxaexs/huddle"
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline" size="sm" className="hidden sm:flex">
                <GitFork className="h-4 w-4 text-[#9d95bc]" />
                <span>GitHub</span>
              </Button>
            </a>
            <a href="/hangout">
              <Button variant="default" size="sm">
                <span>Launch App</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </a>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-[#2a253d] bg-[#181523] text-[#9d95bc] hover:text-[#ede9f6]"
              aria-label="Toggle Navigation"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileOpen && (
          <div className="border-b border-[#252036] bg-[#14111d] px-6 py-4 md:hidden flex flex-col gap-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-[#9d95bc] hover:text-[#ede9f6] py-1.5"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2 border-t border-[#252036] flex gap-2">
              <a
                href="https://github.com/Coxaexs/huddle"
                target="_blank"
                rel="noreferrer"
                className="w-full"
              >
                <Button variant="outline" size="sm" className="w-full">
                  <GitFork className="h-4 w-4" /> GitHub
                </Button>
              </a>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero Section ─────────────────────────────────────────────── */}
      <section className="relative px-4 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-4xl text-center">
          {/* Status Badge */}
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#322a4d] bg-[#1e1930] px-3 py-1 text-xs font-medium text-[#c4b5fd] mb-6 shadow-sm">
              <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
              <span>Self-Hostable Discord & TeamSpeak Alternative</span>
              <span className="text-[#655986]">·</span>
              <span className="text-emerald-400 font-semibold">AGPLv3 Licensed</span>
            </div>
          </Reveal>

          {/* Headline (Crisp, High-Contrast, Zero Gradients) */}
          <Reveal delay={60}>
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-[#f4f1fa] leading-[1.1] mb-6">
              Your Community.
              <br />
              <span className="text-[#9e83fc]">Your Rules. Your Server.</span>
            </h1>
          </Reveal>

          {/* Subtitle */}
          <Reveal delay={120}>
            <p className="mx-auto max-w-2xl text-base sm:text-lg text-[#9d95bc] leading-relaxed mb-8">
              High-fidelity WebRTC voice rooms, 1080p60 screen sharing, synchronized music playback,
              and tabletop party battlemaps. Zero subscriptions, zero ad trackers, and 100% data ownership.
            </p>
          </Reveal>

          {/* CTA Buttons */}
          <Reveal delay={180}>
            <div className="flex flex-wrap items-center justify-center gap-3.5">
              <a href="/hangout">
                <Button variant="default" size="lg">
                  <span>Open Web App</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <a href="#self-host">
                <Button variant="secondary" size="lg">
                  <Terminal className="h-4 w-4 text-[#9d95bc]" />
                  <span>Self-Host in 60s</span>
                </Button>
              </a>
              <a
                href="https://github.com/Coxaexs/huddle"
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="outline" size="lg">
                  <ExternalLink className="h-4 w-4 text-[#9d95bc]" />
                  <span>Source Code</span>
                </Button>
              </a>
            </div>
          </Reveal>

          {/* Minimalist Specs Row */}
          <Reveal delay={240}>
            <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "License", value: "AGPL-3.0", sub: "100% Free & Open" },
                { label: "Screen Share", value: "1080p60", sub: "No Nitro Paywall" },
                { label: "Voice Codec", value: "Opus 48kHz", sub: "Direct P2P Mesh" },
                { label: "Memory Footprint", value: "~150MB", sub: "Runs on $4/mo VPS" },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#262038] bg-[#161321] p-4 text-center"
                >
                  <div className="text-xl font-bold tracking-tight text-[#ede9f6]">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[#9d95bc]">
                    {stat.label}
                  </div>
                  <div className="text-[11px] text-[#716a8a]">{stat.sub}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* ── Figma-Designed Interactive App Preview Mockup ───────────── */}
        <div className="mx-auto mt-16 max-w-5xl">
          <Reveal delay={300}>
            <div className="rounded-2xl border border-[#2d2745] bg-[#161322] shadow-2xl overflow-hidden">
              {/* Window Header / Titlebar */}
              <div className="flex h-11 items-center justify-between border-b border-[#252037] bg-[#12101b] px-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#3d3356]" />
                  <div className="h-3 w-3 rounded-full bg-[#3d3356]" />
                  <div className="h-3 w-3 rounded-full bg-[#3d3356]" />
                  <div className="ml-3 hidden sm:flex items-center gap-2 text-xs font-medium text-[#7d749a]">
                    <Globe className="h-3.5 w-3.5 text-[#7c5cfc]" />
                    <span>chat.hoffle.online</span>
                    <span className="text-[#3d3356]">/</span>
                    <span>cozy-haven</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="text-[11px] py-0 px-2">
                    Connected · 18ms
                  </Badge>
                </div>
              </div>

              {/* Workspace Layout Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 min-h-[380px]">
                {/* Left Mini Server Rail */}
                <div className="hidden sm:flex md:col-span-1 flex-col items-center gap-3 border-r border-[#221d33] bg-[#110f18] py-4">
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#7c5cfc] text-white font-bold shadow-sm">
                    H
                    <div className="absolute -left-3 top-2 h-6 w-1 rounded-r bg-white" />
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1d192c] text-[#9d95bc] hover:text-[#ede9f6] border border-[#2c2642]">
                    <Compass className="h-4 w-4" />
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1d192c] text-[#9d95bc] hover:text-[#ede9f6] border border-[#2c2642]">
                    <Music2 className="h-4 w-4" />
                  </div>
                </div>

                {/* Channels & Voice Sidebar */}
                <div className="hidden md:flex md:col-span-3 flex-col justify-between border-r border-[#221d33] bg-[#14121e] p-3 text-xs">
                  <div className="space-y-4">
                    {/* Server Header */}
                    <div className="flex items-center justify-between px-2 py-1 font-bold text-[#ede9f6]">
                      <span>Cozy Haven Guild</span>
                      <SlidersHorizontal className="h-3.5 w-3.5 text-[#7d749a]" />
                    </div>

                    {/* Text Channels */}
                    <div className="space-y-1">
                      <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#686082]">
                        Text Channels
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-[#211c30] px-2.5 py-1.5 font-medium text-[#ede9f6] border border-[#2d2642]">
                        <MessageSquare className="h-3.5 w-3.5 text-[#8c6ffc]" />
                        <span>general-chat</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[#8880a4] hover:bg-[#1a1727] hover:text-[#ede9f6]">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>dnd-sessions</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[#8880a4] hover:bg-[#1a1727] hover:text-[#ede9f6]">
                        <FileCode className="h-3.5 w-3.5" />
                        <span>code-snippets</span>
                      </div>
                    </div>

                    {/* Voice Channels */}
                    <div className="space-y-1">
                      <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#686082]">
                        Voice Lounges
                      </div>
                      <div className="rounded-lg bg-[#1a1628] p-2 border border-[#28223d]">
                        <div className="flex items-center justify-between font-semibold text-[#c8bdf5] mb-2">
                          <div className="flex items-center gap-1.5">
                            <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Campfire Voice</span>
                          </div>
                          <Badge variant="success" className="text-[10px] px-1.5 py-0">
                            3 active
                          </Badge>
                        </div>
                        {/* Voice Participants */}
                        <div className="space-y-1 pl-2">
                          <div className="flex items-center justify-between text-[#d6cfea]">
                            <div className="flex items-center gap-2">
                              <div className="h-5 w-5 rounded-full bg-[#7c5cfc] ring-2 ring-emerald-500/80 flex items-center justify-center text-[10px] font-bold text-white">
                                A
                              </div>
                              <span className="font-medium">Alex (speaking)</span>
                            </div>
                            <Mic className="h-3 w-3 text-emerald-400" />
                          </div>
                          <div className="flex items-center justify-between text-[#8d85aa]">
                            <div className="flex items-center gap-2">
                              <div className="h-5 w-5 rounded-full bg-[#3d325a] flex items-center justify-center text-[10px] font-medium text-white">
                                S
                              </div>
                              <span>Sarah</span>
                            </div>
                            <Headphones className="h-3 w-3 text-[#7d749a]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Synchronized Music Bar Preview */}
                  <div className="rounded-xl border border-[#2a243e] bg-[#1b172a] p-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#ede9f6] mb-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <Music2 className="h-3 w-3 text-[#7c5cfc]" />
                        <span className="truncate">Lofi Study & Code · Synced</span>
                      </div>
                      <button
                        onClick={() => setPlayingPreview(!playingPreview)}
                        className="text-[#9d95bc] hover:text-white"
                      >
                        {playingPreview ? (
                          <Pause className="h-3 w-3" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    <div className="h-1 w-full rounded-full bg-[#27213b] overflow-hidden">
                      <div className="h-full w-2/3 bg-[#7c5cfc] rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="md:col-span-8 flex flex-col justify-between p-4 sm:p-6 bg-[#161322]">
                  {/* Channel Topbar */}
                  <div className="flex items-center justify-between border-b border-[#231e35] pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#ede9f6]">
                        # general-chat
                      </span>
                      <span className="text-xs text-[#716a8a]">
                        The sanctuary for cozy late-night discussions.
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#9d95bc]">
                      <Users className="h-3.5 w-3.5" />
                      <span>12 online</span>
                    </div>
                  </div>

                  {/* Messages Feed */}
                  <div className="space-y-4">
                    {/* Message 1 */}
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-[#352c50] flex items-center justify-center font-semibold text-xs text-[#c4b5fd]">
                        E
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-[#ede9f6]">Elena</span>
                          <span className="text-[10px] text-[#6d6487]">10:42 PM</span>
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                            Host
                          </Badge>
                        </div>
                        <p className="text-xs text-[#b8b0cf] leading-relaxed">
                          Just migrated our community server off proprietary cloud hosting to
                          our own VPS. Audio latency is sitting right at 15ms!
                        </p>
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="inline-flex items-center gap-1 rounded-md border border-[#2e2746] bg-[#1d182e] px-2 py-0.5 text-[11px] text-[#c4b5fd]">
                            <ThumbsUp className="h-3 w-3 text-emerald-400" /> 6
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md border border-[#2e2746] bg-[#1d182e] px-2 py-0.5 text-[11px] text-[#c4b5fd]">
                            <Heart className="h-3 w-3 text-rose-400" /> 4
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Message 2 */}
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-[#273a32] flex items-center justify-center font-semibold text-xs text-emerald-400">
                        M
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-[#ede9f6]">Marcus</span>
                          <span className="text-[10px] text-[#6d6487]">10:44 PM</span>
                        </div>
                        <p className="text-xs text-[#b8b0cf] leading-relaxed">
                          1080p 60fps streaming is working flawlessly without any Nitro subscriptions.
                          The D&D battlemap session is ready for tomorrow night.
                        </p>
                        <div className="rounded-lg border border-[#28223e] bg-[#12101b] p-2.5 font-mono text-[11px] text-[#a499c8]">
                          <div className="text-[#685e87]"># Verify server stats in CLI:</div>
                          <div className="text-emerald-400">curl http://localhost:8730/api/health</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Input Mockup */}
                  <div className="mt-4 rounded-xl border border-[#28223c] bg-[#12101b] px-3 py-2.5 flex items-center justify-between text-xs text-[#6e6689]">
                    <span>Message #general-chat...</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] py-0">
                        Markdown enabled
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Features Grid (shadcn Cards) ─────────────────────────────── */}
      <section
        id="features"
        className="border-t border-[#252036] bg-[#14111d] px-4 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center mb-16">
              <Badge variant="secondary" className="mb-3">
                Built For Sovereignty
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#ede9f6] mb-4">
                Everything you love about Discord,{" "}
                <span className="text-[#9e83fc]">crafted without the corporate bloat.</span>
              </h2>
              <p className="text-sm sm:text-base text-[#9d95bc] leading-relaxed">
                Designed specifically for gaming squads, D&D groups, and friend circles who demand
                uncompromising voice performance and authentic data privacy.
              </p>
            </div>
          </Reveal>

          {/* 8 Feature Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: <Volume2 className="h-5 w-5 text-[#9e83fc]" />,
                title: "Adaptive Opus Voice",
                desc: "Low-latency WebRTC mesh audio with built-in noise suppression, automatic gain control, and spatial stereo panning.",
                tag: "Opus 48kHz",
                delay: 0,
              },
              {
                icon: <Tv className="h-5 w-5 text-emerald-400" />,
                title: "Free 1080p60 Streaming",
                desc: "Stream crisp desktop gameplay or creative workflows up to 1080p 60fps with native system audio passthrough.",
                tag: "Zero Paywalls",
                delay: 50,
              },
              {
                icon: <Music2 className="h-5 w-5 text-amber-400" />,
                title: "Synced Music Bot",
                desc: "Integrated yt-dlp media resolver streaming synchronized music into voice channels. Shared queue with skip & seek controls.",
                tag: "Built-In",
                delay: 100,
              },
              {
                icon: <Compass className="h-5 w-5 text-[#9e83fc]" />,
                title: "Tabletop Battlemaps & 3D Dice",
                desc: "Interactive live battlemaps with fog of war, character tokens, session recording, and physics-driven 3D dice rolls.",
                tag: "Virtual Tabletop",
                delay: 150,
              },
              {
                icon: <Lock className="h-5 w-5 text-emerald-400" />,
                title: "Total Data Sovereignty",
                desc: "No third-party trackers, no telemetry scraping, and no behavioral ad targeting. All files and databases stay on your server.",
                tag: "Zero Telemetry",
                delay: 200,
              },
              {
                icon: <Server className="h-5 w-5 text-[#9e83fc]" />,
                title: "Single-Container Deploy",
                desc: "Packaged as lightweight Docker services consuming ~150MB of RAM. Effortlessly host on an affordable $4/mo VPS.",
                tag: "~150MB RAM",
                delay: 250,
              },
              {
                icon: <MessageSquare className="h-5 w-5 text-amber-400" />,
                title: "Discord Bridge",
                desc: "Bidirectional real-time bridge connecting your self-hosted Hoffle rooms with Discord channels for seamless transition.",
                tag: "2-Way Sync",
                delay: 300,
              },
              {
                icon: <HardDrive className="h-5 w-5 text-emerald-400" />,
                title: "One-Folder Backups",
                desc: "All state, accounts, channels, and uploads reside in ./state. Stop containers and copy a single folder for full recovery.",
                tag: "SQLite D1",
                delay: 350,
              },
            ].map((f, i) => (
              <Reveal key={i} delay={f.delay}>
                <Card className="h-full flex flex-col justify-between">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#221c33] border border-[#302747]">
                        {f.icon}
                      </div>
                      <Badge variant="secondary" className="text-[11px] font-mono">
                        {f.tag}
                      </Badge>
                    </div>
                    <CardTitle>{f.title}</CardTitle>
                    <CardDescription>{f.desc}</CardDescription>
                  </CardHeader>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison Section (shadcn Table) ────────────────────────── */}
      <section
        id="comparison"
        className="border-t border-[#252036] bg-[#121019] px-4 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <div className="mx-auto max-w-xl text-center mb-14">
              <Badge variant="secondary" className="mb-3">
                Feature Comparison
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#ede9f6] mb-3">
                How does Hoffle compare?
              </h2>
              <p className="text-sm text-[#9d95bc]">
                A clear, transparent look at why self-hosters are choosing Hoffle over legacy apps.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="rounded-xl border border-[#28223c] bg-[#161322] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-[#28223c] bg-[#1b172a] text-[#9d95bc]">
                      <th className="py-3.5 px-4 sm:px-6 font-semibold">Capability</th>
                      <th className="py-3.5 px-4 sm:px-6 font-semibold text-[#b8a7ff] bg-[#211c33]">
                        Hoffle
                      </th>
                      <th className="py-3.5 px-4 sm:px-6 font-semibold">Discord</th>
                      <th className="py-3.5 px-4 sm:px-6 font-semibold">TeamSpeak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#231e33]">
                    {[
                      {
                        cap: "Self-Hostable",
                        hoffle: "Yes (100% Owned)",
                        discord: "No (Centralized Cloud)",
                        ts: "Yes (Server Binary)",
                        status: ["good", "bad", "good"],
                      },
                      {
                        cap: "Open Source Code",
                        hoffle: "Yes (AGPL-3.0)",
                        discord: "No (Proprietary)",
                        ts: "No (Proprietary)",
                        status: ["good", "bad", "bad"],
                      },
                      {
                        cap: "1080p 60fps Streaming",
                        hoffle: "Included Free",
                        discord: "Paywalled ($9.99/mo)",
                        ts: "Unsupported / Plugin",
                        status: ["good", "bad", "bad"],
                      },
                      {
                        cap: "Web Browser Client",
                        hoffle: "Full Feature Web App",
                        discord: "Web Client Available",
                        ts: "Desktop App Only",
                        status: ["good", "good", "bad"],
                      },
                      {
                        cap: "Synced Music Bot",
                        hoffle: "Built-in (yt-dlp)",
                        discord: "Third-party (Banned)",
                        ts: "Third-party Plugins",
                        status: ["good", "meh", "meh"],
                      },
                      {
                        cap: "Data Privacy & Telemetry",
                        hoffle: "Zero Tracking",
                        discord: "Telemetry & Ads",
                        ts: "Private Server Logs",
                        status: ["good", "bad", "good"],
                      },
                      {
                        cap: "Discord Bridge",
                        hoffle: "Native 2-Way Sync",
                        discord: "Native",
                        ts: "None",
                        status: ["good", "good", "bad"],
                      },
                      {
                        cap: "Resource Footprint",
                        hoffle: "~150MB RAM (Node+Go)",
                        discord: "Heavy Electron Client",
                        ts: "Lightweight C++",
                        status: ["good", "bad", "good"],
                      },
                    ].map((row, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-[#1a1628] transition-colors"
                      >
                        <td className="py-3 px-4 sm:px-6 font-medium text-[#ede9f6]">
                          {row.cap}
                        </td>
                        <td className="py-3 px-4 sm:px-6 bg-[#1e1930] font-medium text-[#ede9f6]">
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <Check className="h-4 w-4" />
                            <span>{row.hoffle}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 sm:px-6 text-[#9d95bc]">
                          <div className="flex items-center gap-1.5">
                            {row.status[1] === "good" && (
                              <Check className="h-4 w-4 text-emerald-400" />
                            )}
                            {row.status[1] === "bad" && (
                              <X className="h-4 w-4 text-[#8a7f9d]" />
                            )}
                            {row.status[1] === "meh" && (
                              <Minus className="h-4 w-4 text-amber-400" />
                            )}
                            <span>{row.discord}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 sm:px-6 text-[#9d95bc]">
                          <div className="flex items-center gap-1.5">
                            {row.status[2] === "good" && (
                              <Check className="h-4 w-4 text-emerald-400" />
                            )}
                            {row.status[2] === "bad" && (
                              <X className="h-4 w-4 text-[#8a7f9d]" />
                            )}
                            {row.status[2] === "meh" && (
                              <Minus className="h-4 w-4 text-amber-400" />
                            )}
                            <span>{row.ts}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Self-Host Guide (shadcn Tabs & Code Block) ───────────────── */}
      <section
        id="self-host"
        className="border-t border-[#252036] bg-[#14111d] px-4 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <div className="mx-auto max-w-xl text-center mb-10">
              <Badge variant="secondary" className="mb-3">
                Deployment Guide
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#ede9f6] mb-3">
                Deploy Hoffle on your own server.
              </h2>
              <p className="text-sm text-[#9d95bc] leading-relaxed">
                All persistent data is held in the{" "}
                <code className="rounded bg-[#221c33] px-1.5 py-0.5 font-mono text-xs text-[#c4b5fd]">
                  ./state
                </code>{" "}
                directory. Easy to run, update, and back up.
              </p>
            </div>
          </Reveal>

          {/* Tabs Navigation (shadcn Tabs style) */}
          <Reveal delay={80}>
            <div className="flex justify-center mb-6">
              <div className="inline-flex rounded-lg border border-[#2c2542] bg-[#12101b] p-1 text-xs font-medium">
                {(
                  [
                    { id: "docker", label: "1. Quickstart" },
                    { id: "compose", label: "2. docker-compose.yml" },
                    { id: "nginx", label: "3. Nginx Reverse Proxy" },
                    { id: "config", label: "4. Secrets (.dev.vars)" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-md px-3.5 py-1.5 transition-all select-none cursor-pointer ${
                      activeTab === tab.id
                        ? "bg-[#7c5cfc] text-white shadow-sm font-semibold"
                        : "text-[#9d95bc] hover:text-[#ede9f6]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Code Viewer Box */}
          <Reveal delay={140}>
            <div className="rounded-xl border border-[#2b2540] bg-[#100e18] shadow-lg overflow-hidden">
              {/* Box Topbar */}
              <div className="flex h-11 items-center justify-between border-b border-[#221d33] bg-[#151220] px-4">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#3d3356]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#3d3356]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#3d3356]" />
                  <span className="ml-2 font-mono text-xs text-[#7d749a]">
                    {activeTab === "docker" && "bash terminal"}
                    {activeTab === "compose" && "docker-compose.yml"}
                    {activeTab === "nginx" && "/etc/nginx/sites-available/hoffle.conf"}
                    {activeTab === "config" && ".dev.vars"}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const content =
                      activeTab === "docker"
                        ? dockerCommand
                        : activeTab === "compose"
                        ? composeSnippet
                        : activeTab === "nginx"
                        ? nginxSnippet
                        : configSnippet;
                    copyToClipboard(content, activeTab);
                  }}
                  className="h-7 text-xs px-2.5"
                >
                  {copiedTab === activeTab ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Code Pre Area */}
              <div className="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto text-[#c7bddf]">
                {activeTab === "docker" && (
                  <pre className="text-emerald-400">
                    <code>{dockerCommand}</code>
                  </pre>
                )}
                {activeTab === "compose" && (
                  <pre>
                    <code>{composeSnippet}</code>
                  </pre>
                )}
                {activeTab === "nginx" && (
                  <pre>
                    <code>{nginxSnippet}</code>
                  </pre>
                )}
                {activeTab === "config" && (
                  <pre>
                    <code>{configSnippet}</code>
                  </pre>
                )}
              </div>
            </div>
          </Reveal>

          {/* Bootstrap Administrator Notice (Cozy Alert Card) */}
          <Reveal delay={200}>
            <div className="mt-5 rounded-xl border border-[#403522] bg-[#1e1913] p-4 text-xs text-[#d1c29e] leading-relaxed flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#ede9f6]">
                  Initial Bootstrap & Administrator Claim:
                </span>{" "}
                Ensure you configure{" "}
                <code className="rounded bg-[#2a221a] px-1.5 py-0.5 font-mono text-amber-300">
                  BOOTSTRAP_CODE
                </code>{" "}
                in your environment prior to launching public access. The first user to register
                claims instance governance. Further accounts join via invitation tokens.
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Architecture & Audio Deep Dive ───────────────────────────── */}
      <section
        id="architecture"
        className="border-t border-[#252036] bg-[#121019] px-4 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <div className="mx-auto max-w-xl text-center mb-14">
              <Badge variant="secondary" className="mb-3">
                Protocol Architecture
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#ede9f6] mb-3">
                Real-Time Audio Under The Hood
              </h2>
              <p className="text-sm text-[#9d95bc]">
                A comparative look at voice packet delivery across TeamSpeak, Discord, and Hoffle.
              </p>
            </div>
          </Reveal>

          <div className="space-y-4">
            {[
              {
                icon: <Cpu className="h-5 w-5 text-amber-400" />,
                title: "Why does TeamSpeak feel exceptionally responsive?",
                body: "TeamSpeak relies on a proprietary binary protocol over raw UDP coupled with the Opus codec. As a compiled native C++ desktop binary, it transmits UDP voice frames directly into the host operating system network stack with minimal buffering and zero browser sandbox mediation.",
                delay: 0,
              },
              {
                icon: <Layers className="h-5 w-5 text-[#9e83fc]" />,
                title: "How does Discord handle voice routing?",
                body: "Discord routes WebRTC over UDP using Opus. Rather than connecting peer-to-peer, Discord routes streams via centralized SFUs (Selective Forwarding Units). Each participant pushes a single stream to Discord servers, which then distribute the packets to all channel members.",
                delay: 80,
              },
              {
                icon: <Network className="h-5 w-5 text-emerald-400" />,
                title: "How Hoffle delivers voice:",
                body: "Hoffle provides WebRTC P2P Mesh out-of-the-box for close-knit groups (zero media server bandwidth fees, fully encrypted peer-to-peer). For larger servers, Hoffle's modular backend supports routing through an SFU (LiveKit) for enterprise Discord-grade scale.",
                delay: 160,
              },
            ].map((arch, i) => (
              <Reveal key={i} delay={arch.delay}>
                <Card className="p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#201c30] border border-[#2e2744]">
                      {arch.icon}
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-[#ede9f6] mb-2">
                        {arch.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-[#9d95bc] leading-relaxed">
                        {arch.body}
                      </p>
                    </div>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Call to Action Banner (shadcn Cozy Box) ───────────────────── */}
      <section className="border-t border-[#252036] bg-[#14111d] px-4 py-20 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <div className="rounded-2xl border border-[#352c52] bg-[#1a1628] p-8 sm:p-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#26203a] border border-[#372e54]">
                <Sparkles className="h-6 w-6 text-[#9e83fc]" />
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[#ede9f6] mb-4">
                Ready to own your community?
              </h2>
              <p className="mx-auto max-w-lg text-sm sm:text-base text-[#9d95bc] leading-relaxed mb-8">
                Your voice, your files, your rules. No subscriptions, no tracking, and no corporate
                intermediaries between you and your circle.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <a href="/hangout">
                  <Button variant="default" size="lg">
                    <span>Try Hoffle Now</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
                <a
                  href="https://github.com/Coxaexs/huddle"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="secondary" size="lg">
                    <GitFork className="h-4 w-4" />
                    <span>Star on GitHub</span>
                  </Button>
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-[#252036] bg-[#100e17] px-4 py-12 text-xs text-[#766f8e]">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#7c5cfc] font-bold text-white text-xs">
              h
            </div>
            <span className="font-semibold text-[#ede9f6]">Hoffle</span>
            <span>— Open source Discord alternative.</span>
            <Badge variant="success" className="text-[10px] py-0 px-2">
              AGPL-3.0
            </Badge>
          </div>

          <div className="flex items-center gap-6 font-medium">
            <a
              href="https://github.com/Coxaexs/huddle"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#ede9f6] transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://github.com/Coxaexs/huddle/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#ede9f6] transition-colors"
            >
              AGPLv3 License
            </a>
            <a href="/hangout" className="hover:text-[#ede9f6] transition-colors">
              Web App
            </a>
            <a href="#self-host" className="hover:text-[#ede9f6] transition-colors">
              Self-Host Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
