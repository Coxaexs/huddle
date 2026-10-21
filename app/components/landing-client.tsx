"use client";

import { useEffect, useState } from "react";

/**
 * The few interactive bits of hoffle.online. Everything else on the landing
 * page is server-rendered, so it reads fine to crawlers and before hydration.
 */

/**
 * Light/dark switch for the site. The choice is only saved when it differs
 * from the system setting, so someone who flips back follows the system again.
 * The icons swap with CSS (see SiteShell), which keeps hydration consistent.
 */
export function SiteThemeToggle({ labels = { dark: "Dark", light: "Light", title: "Switch light or dark", aria: "Colour scheme" } }: { labels?: { dark: string; light: string; title: string; aria: string } }) {
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
      aria-label={labels.aria}
      aria-pressed={dark ?? undefined}
      title={labels.title}
      className="h-10 px-3 text-sm text-(--ink-2) underline-offset-4 hover:text-(--ink) hover:underline"
    >
      <span aria-hidden className="lp-if-light">{labels.dark}</span>
      <span aria-hidden className="lp-if-dark">{labels.light}</span>
    </button>
  );
}

type Platform = "windows" | "mac" | "linux" | "phone";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android/i.test(ua)) return "phone";
  if (/Mac/i.test(ua)) return "mac";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "windows";
}

/**
 * "Download for <your OS>", straight from this site (/download/<platform>).
 * Macs go to the download list instead, since a browser can't tell an Apple
 * chip from an Intel one; phones get the web app.
 */
export function DownloadButton({
  labels,
  hrefs,
  className = "",
}: {
  labels: Record<Platform | "generic", string>;
  hrefs: Record<Platform | "generic", string>;
  className?: string;
}) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => setPlatform(detectPlatform()), []);

  return (
    <a href={hrefs[platform ?? "generic"]} className={className}>
      {labels[platform ?? "generic"]}
    </a>
  );
}

export function CopyButton({ text, labels = { copy: "Copy", copied: "Copied" } }: { text: string; labels?: { copy: string; copied: string } }) {
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
      <span className="text-xs font-semibold text-white/80">{copied ? labels.copied : labels.copy}</span>
    </button>
  );
}
