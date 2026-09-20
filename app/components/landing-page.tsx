"use client";

import { useState } from "react";
import {
  Server,
  Shield,
  Headphones,
  Radio,
  Terminal,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Cpu,
  Lock,
  Flame,
  Volume2,
  Tv,
  Music,
  Users,
  Compass,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export function LandingPage() {
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"docker" | "compose" | "nginx" | "config">("docker");

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
    image: ghcr.io/coxaexs/hoffle:latest # or build locally
    container_name: hoffle
    restart: unless-stopped
    ports:
      - "8730:8730" # Web App & WebSocket
      - "8731:8731" # Music Resolver
    volumes:
      - ./state:/app/state # SQLite D1 database & uploaded media
      - ./.dev.vars:/app/.dev.vars:ro`;

  const nginxSnippet = `server {
    listen 443 ssl http2;
    server_name chat.hoffle.online;

    client_max_body_size 45M;

    # Realtime WebSocket
    location /api/realtime {
        proxy_pass http://127.0.0.1:8730;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Main Web App
    location / {
        proxy_pass http://127.0.0.1:8730;
        proxy_set_header Host $host;
    }
}`;

  const configSnippet = `# .dev.vars - Configuration & Secrets
BOOTSTRAP_CODE=your_secret_admin_code
BOT_TOKEN=a_strong_random_token_for_bots
MUSICWATCH_PASSWORD=optional_password_for_music_ui
HUDDLE_ICE_SERVERS=[{"urls":["stun:stun.cloudflare.com:3478"]}]`;

  return (
    <div className="min-h-screen bg-[#16131f] text-[#e8e3f5] font-['Nunito',sans-serif] antialiased selection:bg-[#a78bfa] selection:text-white">
      {/* Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#16131f]/85 border-b border-white/[0.07]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] bg-gradient-to-tr from-[#6b4feb] to-[#a78bfa] flex items-center justify-center font-black text-xl text-white shadow-lg shadow-[#a78bfa]/20">
              h
            </div>
            <span className="text-xl font-extrabold tracking-tight text-[#e8e3f5] flex items-center gap-2">
              Hoffle
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#2e2750] text-[#a78bfa] border border-[#a78bfa]/30 font-bold">
                Open Source
              </span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-[#9d95bc]">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#comparison" className="hover:text-white transition-colors">Discord vs Hoffle</a>
            <a href="#self-host" className="hover:text-white transition-colors">Self-Host Guide</a>
            <a href="#audio" className="hover:text-white transition-colors">Audio Specs</a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/Coxaexs/huddle"
              target="_blank"
              rel="noreferrer"
              className="p-2.5 rounded-xl border border-white/[0.08] hover:bg-white/[0.05] text-[#9d95bc] hover:text-white transition-colors"
              title="GitHub Repository"
            >
              <ExternalLink size={18} />
            </a>
            <a
              href="https://chat.hoffle.online"
              className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#6b4feb] to-[#a78bfa] hover:brightness-110 text-white shadow-lg shadow-[#7b63e6]/25 transition-all flex items-center gap-2"
            >
              Launch Web App <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 pb-20 px-6">
        {/* Glow gradients */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-[#7b63e6]/15 blur-[120px] pointer-events-none rounded-full" />
        
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-medium text-[#b5a7ff] mb-8">
            <Sparkles size={14} className="text-[#a99af5]" />
            <span>The Self-Hostable Discord & TeamSpeak Alternative</span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
            Your Community.<br />
            <span className="bg-gradient-to-r from-[#9b85ff] via-[#b6a7ff] to-[#71ece3] bg-clip-text text-transparent">
              Your Rules. Your Server.
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg sm:text-xl text-white/60 mb-10 leading-relaxed">
            Hoffle gives your friends crystal-clear voice rooms, 1080p60 screen sharing, synchronized music bots, and interactive D&D battlemaps. Zero subscription paywalls, 100% data sovereignty.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/hangout"
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base bg-gradient-to-r from-[#6b4feb] to-[#8d72ff] hover:from-[#765bf7] hover:to-[#9981ff] text-white shadow-xl shadow-[#7b63e6]/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              Open Web App <ChevronRight size={18} />
            </a>
            <a
              href="#self-host"
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 text-white transition-all flex items-center justify-center gap-2"
            >
              <Terminal size={18} /> Self-Host in 60s
            </a>
          </div>

          {/* Quick stats pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 max-w-4xl mx-auto">
            <div className="p-4 rounded-2xl bg-[#1a1628] border border-white/[0.07] shadow-md">
              <div className="text-2xl font-black text-[#e8e3f5]">100%</div>
              <div className="text-xs text-[#9d95bc] mt-1 font-semibold">Open Source & AGPL</div>
            </div>
            <div className="p-4 rounded-2xl bg-[#1a1628] border border-white/[0.07] shadow-md">
              <div className="text-2xl font-black text-[#4ade80]">1080p60</div>
              <div className="text-xs text-[#9d95bc] mt-1 font-semibold">Screen Share (No Nitro)</div>
            </div>
            <div className="p-4 rounded-2xl bg-[#1a1628] border border-white/[0.07] shadow-md">
              <div className="text-2xl font-black text-[#a78bfa]">Opus HD</div>
              <div className="text-xs text-[#9d95bc] mt-1 font-semibold">Low-Latency Audio</div>
            </div>
            <div className="p-4 rounded-2xl bg-[#1a1628] border border-white/[0.07] shadow-md">
              <div className="text-2xl font-black text-[#f59e6e]">SQLite D1</div>
              <div className="text-xs text-[#9d95bc] mt-1 font-semibold">Zero-Bloat Database</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6 border-t border-white/[0.07] bg-[#1a1628]/40">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#e8e3f5] mb-4">
              Everything great about Discord, minus the corporate clutter.
            </h2>
            <p className="text-[#9d95bc] text-base font-medium">
              Built for gamers, D&D parties, and close friend groups who want high-performance voice and chat without being tracked or upsold.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-8 rounded-[20px] bg-[#1a1628] border border-white/[0.07] hover:border-[#a78bfa]/40 hover:-translate-y-1 transition-all shadow-md">
              <div className="w-12 h-12 rounded-xl bg-[#2e2750] border border-[#a78bfa]/30 flex items-center justify-center text-[#a78bfa] mb-6">
                <Volume2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-[#e8e3f5] mb-2">High-Fidelity Voice</h3>
              <p className="text-sm text-[#9d95bc] leading-relaxed">
                Adaptive WebRTC audio using the Opus codec with noise suppression, automatic gain control, and spatial stereo panning.
              </p>
            </div>

            <div className="p-8 rounded-[20px] bg-[#1a1628] border border-white/[0.07] hover:border-[#a78bfa]/40 hover:-translate-y-1 transition-all shadow-md">
              <div className="w-12 h-12 rounded-xl bg-[#1e2e28] border border-[#4ade80]/30 flex items-center justify-center text-[#4ade80] mb-6">
                <Tv size={24} />
              </div>
              <h3 className="text-xl font-bold text-[#e8e3f5] mb-2">Free HD Screen Sharing</h3>
              <p className="text-sm text-[#9d95bc] leading-relaxed">
                Stream your games or workspace up to 1080p 60fps with system audio passthrough. Never pay a monthly fee just to share crisp video.
              </p>
            </div>

            <div className="p-8 rounded-[20px] bg-[#1a1628] border border-white/[0.07] hover:border-[#a78bfa]/40 hover:-translate-y-1 transition-all shadow-md">
              <div className="w-12 h-12 rounded-xl bg-[#332028] border border-[#f59e6e]/30 flex items-center justify-center text-[#f59e6e] mb-6">
                <Music size={24} />
              </div>
              <h3 className="text-xl font-bold text-[#e8e3f5] mb-2">Synced Music Bot</h3>
              <p className="text-sm text-[#9d95bc] leading-relaxed">
                Integrated yt-dlp resolver streams synchronized music directly into your voice room. Anyone in the channel can queue, play, and seek.
              </p>
            </div>

            <div className="p-8 rounded-[20px] bg-[#1a1628] border border-white/[0.07] hover:border-[#a78bfa]/40 hover:-translate-y-1 transition-all shadow-md">
              <div className="w-12 h-12 rounded-xl bg-[#2e2750] border border-[#a78bfa]/30 flex items-center justify-center text-[#a78bfa] mb-6">
                <Compass size={24} />
              </div>
              <h3 className="text-xl font-bold text-[#e8e3f5] mb-2">D&D Battlemaps & 3D Dice</h3>
              <p className="text-sm text-[#9d95bc] leading-relaxed">
                Built-in real-time tabletop battlemaps with fog of war, character tokens, session recording, and physics-driven 3D dice rolls.
              </p>
            </div>

            <div className="p-8 rounded-[20px] bg-[#1a1628] border border-white/[0.07] hover:border-[#a78bfa]/40 hover:-translate-y-1 transition-all shadow-md">
              <div className="w-12 h-12 rounded-xl bg-[#1e2e28] border border-[#4ade80]/30 flex items-center justify-center text-[#4ade80] mb-6">
                <Lock size={24} />
              </div>
              <h3 className="text-xl font-bold text-[#e8e3f5] mb-2">Total Privacy & Control</h3>
              <p className="text-sm text-[#9d95bc] leading-relaxed">
                Your database, sessions, and files live on your own host. No ad trackers, no telemetry SDKs, and no machine learning scraping your chat logs.
              </p>
            </div>

            <div className="p-8 rounded-[20px] bg-[#1a1628] border border-white/[0.07] hover:border-[#a78bfa]/40 hover:-translate-y-1 transition-all shadow-md">
              <div className="w-12 h-12 rounded-xl bg-[#2e2750] border border-[#a78bfa]/30 flex items-center justify-center text-[#a78bfa] mb-6">
                <Server size={24} />
              </div>
              <h3 className="text-xl font-bold text-[#e8e3f5] mb-2">One-Command Self-Hosting</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Runs as a single Docker container or native systemd unit. Minimal memory footprint (~150MB RAM) runs easily on a $4/mo VPS.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Matrix */}
      <section id="comparison" className="py-20 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              How does Hoffle compare?
            </h2>
            <p className="text-white/60">
              A quick look at why self-hosters are choosing Hoffle over proprietary services.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-sm font-semibold text-white/40">
                  <th className="py-4 px-6">Feature</th>
                  <th className="py-4 px-6 text-[#9b85ff]">Hoffle</th>
                  <th className="py-4 px-6">Discord</th>
                  <th className="py-4 px-6">TeamSpeak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                <tr>
                  <td className="py-4 px-6 font-medium text-white">Self-Hostable</td>
                  <td className="py-4 px-6 text-emerald-400 font-semibold">Yes (100% your data)</td>
                  <td className="py-4 px-6 text-rose-400">No (Centralized cloud)</td>
                  <td className="py-4 px-6 text-emerald-400">Yes (Server binary)</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-medium text-white">Open Source</td>
                  <td className="py-4 px-6 text-emerald-400 font-semibold">Yes (Full source access)</td>
                  <td className="py-4 px-6 text-rose-400">No (Proprietary)</td>
                  <td className="py-4 px-6 text-rose-400">No (Proprietary)</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-medium text-white">1080p 60fps Screen Share</td>
                  <td className="py-4 px-6 text-emerald-400 font-semibold">Free for everyone</td>
                  <td className="py-4 px-6 text-amber-400">Paywalled ($9.99/mo Nitro)</td>
                  <td className="py-4 px-6 text-rose-400">Limited / Not standard</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-medium text-white">Web Browser Client</td>
                  <td className="py-4 px-6 text-emerald-400 font-semibold">Yes (Full features)</td>
                  <td className="py-4 px-6 text-emerald-400">Yes</td>
                  <td className="py-4 px-6 text-rose-400">No (Desktop app only)</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-medium text-white">Synced Music Bot</td>
                  <td className="py-4 px-6 text-emerald-400 font-semibold">Built-in (yt-dlp)</td>
                  <td className="py-4 px-6 text-amber-400">Third-party (often banned)</td>
                  <td className="py-4 px-6 text-amber-400">Third-party plugins</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-medium text-white">Privacy & Telemetry</td>
                  <td className="py-4 px-6 text-emerald-400 font-semibold">Zero tracking</td>
                  <td className="py-4 px-6 text-rose-400">Heavy telemetry & ads</td>
                  <td className="py-4 px-6 text-emerald-400">Private server logs</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Interactive Self-Host Guide */}
      <section id="self-host" className="py-20 px-6 border-t border-white/5 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#7b63e6]/10 border border-[#7b63e6]/20 text-xs font-semibold text-[#a99af5] mb-4">
              <Terminal size={14} /> 60-Second Setup
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Deploy Hoffle on your own server.
            </h2>
            <p className="text-white/60">
              Choose your deployment method below. All data persists under <code className="text-[#a99af5] bg-white/[0.05] px-2 py-0.5 rounded">./state</code> so backups are as simple as copying a directory.
            </p>
          </div>

          {/* Tab selector */}
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            <button
              onClick={() => setActiveTab("docker")}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "docker"
                  ? "bg-[#7b63e6] text-white shadow-lg shadow-[#7b63e6]/20"
                  : "bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              1. One-Liner Quickstart
            </button>
            <button
              onClick={() => setActiveTab("compose")}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "compose"
                  ? "bg-[#7b63e6] text-white shadow-lg shadow-[#7b63e6]/20"
                  : "bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              2. Docker Compose
            </button>
            <button
              onClick={() => setActiveTab("nginx")}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "nginx"
                  ? "bg-[#7b63e6] text-white shadow-lg shadow-[#7b63e6]/20"
                  : "bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              3. Reverse Proxy (Nginx)
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "config"
                  ? "bg-[#7b63e6] text-white shadow-lg shadow-[#7b63e6]/20"
                  : "bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              4. Environment Secrets
            </button>
          </div>

          {/* Terminal / Code Card */}
          <div className="rounded-2xl bg-[#12151e] border border-white/10 overflow-hidden shadow-2xl">
            <div className="px-6 py-4 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-3 text-xs font-mono text-white/40">
                  {activeTab === "docker" && "terminal"}
                  {activeTab === "compose" && "docker-compose.yml"}
                  {activeTab === "nginx" && "/etc/nginx/sites-available/hoffle.conf"}
                  {activeTab === "config" && ".dev.vars"}
                </span>
              </div>

              <button
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
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/80 transition-colors"
              >
                {copiedTab === activeTab ? (
                  <>
                    <Check size={14} className="text-emerald-400" /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy
                  </>
                )}
              </button>
            </div>

            <div className="p-6 font-mono text-sm leading-relaxed overflow-x-auto">
              {activeTab === "docker" && (
                <pre className="text-emerald-300">
                  <code>{dockerCommand}</code>
                </pre>
              )}
              {activeTab === "compose" && (
                <pre className="text-white/80">
                  <code>{composeSnippet}</code>
                </pre>
              )}
              {activeTab === "nginx" && (
                <pre className="text-white/80">
                  <code>{nginxSnippet}</code>
                </pre>
              )}
              {activeTab === "config" && (
                <pre className="text-white/80">
                  <code>{configSnippet}</code>
                </pre>
              )}
            </div>
          </div>

          <div className="mt-8 p-6 rounded-xl bg-white/[0.02] border border-white/5 text-sm text-white/60">
            <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Shield size={16} className="text-[#a99af5]" /> First Signup & Bootstrap Note
            </h4>
            <p>
              When launching Hoffle for the first time on the public internet, set <code className="text-white bg-white/10 px-1.5 py-0.5 rounded font-mono">BOOTSTRAP_CODE</code> in your secrets file. The very first user will claim the instance with this code and automatically become the instance administrator. Subsequent users must be invited via server invite links.
            </p>
          </div>
        </div>
      </section>

      {/* Audio Specifications Section */}
      <section id="audio" className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Real-Time Audio Under The Hood
            </h2>
            <p className="text-white/60">
              Understanding how Hoffle delivers voice packets compared to TeamSpeak and Discord.
            </p>
          </div>

          <div className="space-y-6 text-sm text-white/70 leading-relaxed">
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
              <h3 className="text-base font-semibold text-white mb-2">Why does TeamSpeak feel so responsive?</h3>
              <p>
                TeamSpeak uses a custom binary protocol over raw UDP with the Opus codec. Because it is a compiled C++ desktop application, it sends UDP voice frames straight to the operating system network stack with minimal buffering and zero browser security sandbox mediation.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
              <h3 className="text-base font-semibold text-white mb-2">What does Discord use?</h3>
              <p>
                Discord uses <strong>WebRTC over UDP with Opus</strong>! Instead of connecting clients in a peer-to-peer mesh, Discord runs an SFU (Selective Forwarding Unit). Each client sends 1 audio stream to Discord's server, which then mirrors those packets to everyone in the channel.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
              <h3 className="text-base font-semibold text-white mb-2">How Hoffle handles voice:</h3>
              <p>
                Hoffle supports <strong>WebRTC P2P Mesh</strong> out of the box (zero server media costs, end-to-end between friends). For larger servers, Hoffle's modular architecture supports routing through an SFU (LiveKit) for Discord-level scaling.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 text-center text-xs text-white/40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#6b4feb] flex items-center justify-center font-bold text-xs text-white">
              h
            </div>
            <span className="font-semibold text-white/80">Hoffle</span> — An open source Discord alternative.
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/Coxaexs/huddle" className="hover:text-white transition-colors">
              GitHub
            </a>
            <a href="/hangout" className="hover:text-white transition-colors">
              Web App
            </a>
            <a href="#self-host" className="hover:text-white transition-colors">
              Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
