import type { ReactNode } from "react";
import { Coffee, Heart } from "lucide-react";
import { SiteThemeToggle } from "./landing-client";

/**
 * The frame shared by hoffle.online's pages (the landing page and /docs):
 * fonts, colour tokens, header and footer.
 */

export const SITE = "https://hoffle.online";
export const REPO = "https://github.com/Coxaexs/huddle";
export const RELEASES = `${REPO}/releases/latest`;
export const APP_URL = "https://chat.hoffle.online";

export const KOFI_URL = "https://ko-fi.com/abdullahturk";
export const GITHUB_SPONSORS_URL = "https://github.com/sponsors/Coxaexs";
export const SUPPORT_URL = KOFI_URL;

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
  { href: "/#themes", label: "Themes" },
  { href: "/#compare", label: "Compared to Discord" },
  { href: "/#download", label: "Download" },
  { href: "/docs", label: "Docs" },
];

const LIGHT_TOKENS = `
  --paper: #ffffff;
  --paper-2: #f4f3f8;
  --card: #ffffff;
  --ink: #17151f;
  --ink-2: #45414f;
  --muted: #6b6676;
  --line: #e2e0e8;
  --violet: #6a4ddb;
  --coral: #6a4ddb;
  --violet-fill: #6a4ddb;
  --violet-fill-hover: #17151f;
  --slab: #17151f;
`;

const DARK_TOKENS = `
  --paper: #0f0d15;
  --paper-2: #16131e;
  --card: #1b1825;
  --ink: #eeebf5;
  --ink-2: #c3bdd0;
  --muted: #958ea6;
  --line: #2b2736;
  --violet: #a993ff;
  --coral: #a993ff;
  --violet-fill: #6a4ddb;
  --violet-fill-hover: #7d63ec;
  --slab: #08070c;
`;

/** localStorage key for a light/dark choice that differs from the system's. */
const SITE_THEME_KEY = "hoffle-site-theme";

/**
 * Runs before the page paints: picks light or dark from a saved choice, else
 * from the system, and follows the system when it changes (unless the visitor
 * chose otherwise). Lives on <html> as data-lp-theme.
 */
const THEME_SCRIPT = `(function(){var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function saved(){try{var s=localStorage.getItem("${SITE_THEME_KEY}");return s==="light"||s==="dark"?s:null}catch(e){return null}}function apply(){d.dataset.lpTheme=saved()||(m.matches?"dark":"light")}apply();m.addEventListener&&m.addEventListener("change",function(){if(!saved()){apply();window.dispatchEvent(new Event("lp-theme-change"))}})})();`;

/**
 * Wraps a page in the site frame. The `lp-root` class also switches off the
 * chat app's viewport scroll lock (see globals.css), before any JS runs.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="lp-root min-h-screen w-full overflow-x-clip bg-(--paper) text-(--ink) antialiased selection:bg-(--violet) selection:text-white">
      {/* React hoists these into <head>. */}
      <style>{`
        .lp-root {${LIGHT_TOKENS}
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        html[data-lp-theme="dark"] .lp-root {${DARK_TOKENS}}
        @media (prefers-color-scheme: dark) {
          html:not([data-lp-theme]) .lp-root {${DARK_TOKENS}}
        }
        html[data-lp-theme="dark"] { color-scheme: dark; }
        html[data-lp-theme="dark"] body { background: #0f0d15; }
        html[data-lp-theme="light"] { color-scheme: light; }
        html[data-lp-theme="light"] body { background: #ffffff; }
        html[data-lp-theme="dark"] .lp-if-light, html:not([data-lp-theme="dark"]) .lp-if-dark { display: none; }
        .lp-display {
          letter-spacing: -0.015em;
        }
        .lp-root a:focus-visible, .lp-root button:focus-visible, .lp-root summary:focus-visible {
          outline: 3px solid var(--violet); outline-offset: 3px; border-radius: 8px;
        }
      `}</style>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />

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
            <SiteThemeToggle />
            <a href={REPO} className="grid h-10 w-10 place-items-center rounded-full text-(--ink-2) hover:bg-(--paper-2) hover:text-(--ink)" aria-label="Hoffle on GitHub">
              <GithubMark className="h-5 w-5" />
            </a>
            {KOFI_URL && (
              <a
                href={KOFI_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-10 w-10 place-items-center rounded-full text-(--ink-2) hover:bg-(--paper-2) hover:text-(--ink)"
                aria-label="Support Hoffle on Ko-fi"
                title="Support Hoffle on Ko-fi"
              >
                <Coffee className="h-5 w-5" />
              </a>
            )}
            {GITHUB_SPONSORS_URL && (
              <a
                href={GITHUB_SPONSORS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-10 w-10 place-items-center rounded-full text-(--ink-2) hover:bg-(--paper-2) hover:text-(--ink)"
                aria-label="Sponsor Hoffle on GitHub"
                title="Sponsor Hoffle on GitHub"
              >
                <Heart className="h-5 w-5" />
              </a>
            )}
            <a href={APP_URL} className="inline-flex h-10 items-center rounded-lg bg-(--violet-fill) px-4 text-sm font-semibold text-white hover:bg-(--violet-fill-hover)">
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
            {KOFI_URL && <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" className="hover:text-(--ink)">Ko-fi</a>}
            {GITHUB_SPONSORS_URL && <a href={GITHUB_SPONSORS_URL} target="_blank" rel="noopener noreferrer" className="hover:text-(--ink)">Sponsors</a>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
