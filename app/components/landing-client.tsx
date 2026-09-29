"use client";

import { useEffect, useState } from "react";

/**
 * The few interactive bits of hoffle.online. Everything else on the landing
 * page is server-rendered, so it reads fine to crawlers and before hydration.
 */

export interface ShowcaseTheme {
  id: string;
  label: string;
  /** Swatches for the tab: background, panel, accent. */
  swatch: [string, string, string];
  /** Path without the "-1280.webp" / "-2560.webp" suffix. */
  image: string;
  alt: string;
}

export function ThemeShowcase({ themes }: { themes: ShowcaseTheme[] }) {
  const [active, setActive] = useState(themes[0].id);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--muted)">Real screenshots. Same app, four of its themes:</p>
        <div role="tablist" aria-label="App theme" className="flex flex-wrap gap-1.5">
          {themes.map((theme) => {
            const selected = theme.id === active;
            return (
              <button
                key={theme.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`shot-${theme.id}`}
                onClick={() => setActive(theme.id)}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 transition ${
                  selected ? "border-(--ink) bg-(--ink)" : "border-(--line) bg-(--card) hover:border-(--ink-2)"
                }`}
              >
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 rounded-full ring-1 ring-black/15"
                  style={{ background: `linear-gradient(90deg, ${theme.swatch[0]} 0 33%, ${theme.swatch[1]} 33% 66%, ${theme.swatch[2]} 66%)` }}
                />
                {/* The chat app's global `button` rule resets colour and font, so they live on the span. */}
                <span className={`text-sm font-semibold ${selected ? "text-(--paper)" : "text-(--ink-2)"}`}>{theme.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-(--line) bg-[#16131f] shadow-[0_40px_80px_-40px_rgba(40,28,10,.45)]">
        {themes.map((theme, index) => (
          <img
            key={theme.id}
            id={`shot-${theme.id}`}
            role="tabpanel"
            hidden={theme.id !== active}
            src={`${theme.image}-1280.webp`}
            srcSet={`${theme.image}-1280.webp 1280w, ${theme.image}-2560.webp 2560w`}
            sizes="(min-width: 1200px) 1152px, 100vw"
            width={1280}
            height={800}
            alt={theme.alt}
            loading={index === 0 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : "auto"}
            decoding="async"
            className="block h-auto w-full"
          />
        ))}
      </div>
    </div>
  );
}

type Platform = "windows" | "mac" | "linux" | "phone";

const PLATFORM_LABEL: Record<Platform, string> = {
  windows: "Windows",
  mac: "macOS",
  linux: "Linux",
  phone: "your phone",
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android/i.test(ua)) return "phone";
  if (/Mac/i.test(ua)) return "mac";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "windows";
}

/** "Download for <your OS>"; phones get sent to the web app instead. */
export function DownloadButton({ releases, appUrl, className = "" }: { releases: string; appUrl: string; className?: string }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => setPlatform(detectPlatform()), []);

  const phone = platform === "phone";
  return (
    <a href={phone ? appUrl : releases} className={className}>
      {platform === null ? "Download the desktop app" : phone ? "Open it on your phone" : `Download for ${PLATFORM_LABEL[platform]}`}
    </a>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      className="rounded-md border border-white/15 px-2.5 py-1 transition hover:bg-white/10"
    >
      <span className="text-xs font-semibold text-white/80">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
