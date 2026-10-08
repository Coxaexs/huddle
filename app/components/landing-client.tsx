"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * The few interactive bits of hoffle.online. Everything else on the landing
 * page is server-rendered, so it reads fine to crawlers and before hydration.
 */

/**
 * Light/dark switch for the site. The choice is only saved when it differs
 * from the system setting, so someone who flips back follows the system again.
 * The icons swap with CSS (see SiteShell), which keeps hydration consistent.
 */
export function SiteThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.lpTheme === "dark");
    read();
    window.addEventListener("lp-theme-change", read);
    return () => window.removeEventListener("lp-theme-change", read);
  }, []);

  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.lpTheme === "dark" ? "light" : "dark";
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    try {
      if (next === system) localStorage.removeItem("hoffle-site-theme");
      else localStorage.setItem("hoffle-site-theme", next);
    } catch {
      /* the switch still works for this visit */
    }
    root.dataset.lpTheme = next;
    window.dispatchEvent(new Event("lp-theme-change"));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Dark mode"
      aria-pressed={dark ?? undefined}
      title="Switch light or dark mode"
      className="group grid h-10 w-10 place-items-center rounded-full hover:bg-(--paper-2)"
    >
      <Moon aria-hidden className="lp-if-light h-5 w-5 text-(--ink-2) group-hover:text-(--ink)" />
      <Sun aria-hidden className="lp-if-dark h-5 w-5 text-(--ink-2) group-hover:text-(--ink)" />
    </button>
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
