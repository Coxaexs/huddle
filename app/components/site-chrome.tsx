import type { ReactNode } from "react";

/**
 * The frame shared by hoffle.online's pages (the landing page and /docs):
 * fonts, colour tokens, header and footer.
 */

export const SITE = "https://hoffle.online";
export const REPO = "https://github.com/Coxaexs/huddle";
export const RELEASES = `${REPO}/releases/latest`;
export const APP_URL = "https://chat.hoffle.online";

/** Paste a Ko-fi / Buy Me a Coffee / GitHub Sponsors link to show the coffee links. */
export const SUPPORT_URL = "";

export function GithubMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/** The app icon and name, as in the browser tab and on the desktop. */
function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-bold tracking-tight ${className}`}>
      <img src="/favicon.svg?v=2" alt="" width={40} height={40} className="h-[1.6em] w-[1.6em] shadow-[0_2px_8px_-2px_rgba(106,77,219,.6)] rounded-[22%]" />
      <span className="text-(--violet)">Hoffle</span>
    </span>
  );
}

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#voice", label: "Voice" },
  { href: "/#msn", label: "MSN Messenger theme" },
  { href: "/#compare", label: "Compared to Discord" },
  { href: "/#download", label: "Download" },
  { href: "/docs", label: "Docs" },
];

/**
 * Wraps a page in the site frame. The `lp-root` class also switches off the
 * chat app's viewport scroll lock (see globals.css), before any JS runs.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="lp-root min-h-screen w-full overflow-x-clip bg-(--paper) text-(--ink) antialiased selection:bg-(--violet) selection:text-white">
      {/* React hoists these into <head>. */}
      <style>{`
        .lp-root {
          --paper: #ffffff;
          --paper-2: #f4f3f8;
          --card: #ffffff;
          --ink: #17151f;
          --ink-2: #45414f;
          --muted: #6b6676;
          --line: #e2e0e8;
          --violet: #6a4ddb;
          --coral: #6a4ddb;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        .lp-display {
          letter-spacing: -0.015em;
        }
        .lp-root a:focus-visible, .lp-root button:focus-visible, .lp-root summary:focus-visible {
          outline: 3px solid var(--violet); outline-offset: 3px; border-radius: 8px;
        }
      `}</style>

      <header className="border-b border-(--line)">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" aria-label="Hoffle home">
            <Wordmark className="text-[22px]" />
          </a>
          <nav aria-label="Main" className="hidden items-center gap-6 text-[15px] font-medium text-(--ink-2) lg:flex">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="hover:text-(--ink)">{item.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <a href={REPO} className="grid h-10 w-10 place-items-center rounded-full text-(--ink-2) hover:bg-(--paper-2) hover:text-(--ink)" aria-label="Hoffle on GitHub">
              <GithubMark className="h-5 w-5" />
            </a>
            <a href={APP_URL} className="inline-flex h-10 items-center rounded-lg bg-(--violet) px-4 text-sm font-semibold text-white hover:bg-(--ink)">
              Open Hoffle
            </a>
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-(--line) px-4 py-10 text-sm text-(--muted) sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <p>
              Hoffle is open source under the AGPL-3.0. Made by{" "}
              <a href="https://abdullahturk.com" rel="author" className="font-semibold text-(--ink) hover:underline">
                Abdullah Türk
              </a>
              .
            </p>
            <p className="text-xs">
              Hoffle is not affiliated with or endorsed by Discord Inc. Discord is a trademark of Discord Inc.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 font-semibold">
            <a href={APP_URL} className="hover:text-(--ink)">Web app</a>
            <a href="/#download" className="hover:text-(--ink)">Download</a>
            <a href="/docs" className="hover:text-(--ink)">Docs</a>
            <a href="/docs/self-hosting" className="hover:text-(--ink)">Self-hosting guide</a>
            <a href="/#faq" className="hover:text-(--ink)">FAQ</a>
            <a href={REPO} className="hover:text-(--ink)">GitHub</a>
            {SUPPORT_URL && <a href={SUPPORT_URL} className="hover:text-(--ink)">Support</a>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
