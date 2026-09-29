import { Marked, Renderer, type Token, type Tokens } from "marked";
import readme from "../../README.md?raw";
import bots from "../../docs/bots.md?raw";
import configuration from "../../docs/configuration.md?raw";
import selfHosting from "../../docs/self-hosting.md?raw";

/**
 * The repo's user-facing markdown, published at hoffle.online/docs. The
 * markdown files stay the source of truth: edit them, and the site follows on
 * the next build.
 *
 * The other files in docs/ are design notes for contributors and stay on
 * GitHub; links to them are pointed there.
 */

const REPO = "https://github.com/Coxaexs/huddle";

export interface Doc {
  /** URL segment under /docs; "" is /docs itself. */
  slug: string;
  /** Path in the repo, for resolving relative links and "Edit on GitHub". */
  path: string;
  title: string;
  /** Shorter label for the sidebar. */
  navTitle: string;
  /** For the meta description and search results; about 150 characters. */
  description: string;
  source: string;
}

export const DOCS: Doc[] = [
  {
    slug: "",
    path: "README.md",
    title: "Hoffle documentation",
    navTitle: "Overview",
    description:
      "Start here: what Hoffle does, the five-minute Docker quick start, everyday commands, search operators and how the pieces fit together.",
    source: readme,
  },
  {
    slug: "self-hosting",
    path: "docs/self-hosting.md",
    title: "Self-hosting guide",
    navTitle: "Self-hosting guide",
    description:
      "Run your own Hoffle, step by step: install Docker, invite friends, put it on the internet with HTTPS, back it up, update it and fix voice problems.",
    source: selfHosting,
  },
  {
    slug: "configuration",
    path: "docs/configuration.md",
    title: "Configuration reference",
    navTitle: "Configuration",
    description:
      "Every Hoffle setting: ports, security and rate limits, web address, voice and TURN servers, LiveKit, GIF search and push notifications.",
    source: configuration,
  },
  {
    slug: "bots",
    path: "docs/bots.md",
    title: "Bots",
    navTitle: "Bots",
    description:
      "Run unmodified discord.js and discord.py bots on Hoffle, switch on the built-in music and D&D bots, or post messages with a simple HTTP API.",
    source: bots,
  },
];

export function findDoc(slug: string): Doc | undefined {
  return DOCS.find((doc) => doc.slug === slug);
}

export function docHref(doc: Doc): string {
  return doc.slug ? `/docs/${doc.slug}` : "/docs";
}

export interface TocEntry {
  id: string;
  text: string;
}

export interface RenderedDoc {
  html: string;
  toc: TocEntry[];
}

/** Anchor ids the way GitHub makes them, so links like #backups keep working. */
function makeSlugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

function plainText(tokens: Token[] | undefined): string {
  return (tokens || [])
    .map((token) => {
      if ("tokens" in token && token.tokens) return plainText(token.tokens);
      return "text" in token ? token.text : "";
    })
    .join("");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Resolves `../README.md#x` against the directory of `from`, giving a repo path. */
function resolveRepoPath(from: string, target: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/** Relative links point at other pages here, or at the file on GitHub. */
function rewriteHref(href: string, from: string): string {
  if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return href;
  const [target, hash] = href.split("#");
  const path = resolveRepoPath(from, target);
  const doc = DOCS.find((candidate) => candidate.path === path);
  const suffix = hash ? `#${hash}` : "";
  if (doc) return `${docHref(doc)}${suffix}`;
  return `${REPO}/blob/main/${path}${suffix}`;
}

export function renderDoc(doc: Doc): RenderedDoc {
  const tokens = new Marked({ gfm: true }).lexer(doc.source);

  // The page supplies its own <h1>, so the file's title heading is dropped.
  const first = tokens.findIndex((token) => token.type !== "space");
  if (first >= 0 && tokens[first].type === "heading" && (tokens[first] as Tokens.Heading).depth === 1) {
    tokens.splice(first, 1);
  }

  const toc: TocEntry[] = [];
  const slug = makeSlugger();
  const defaults = new Renderer();

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(token) {
        const text = plainText(token.tokens);
        const id = slug(text);
        if (token.depth === 2) toc.push({ id, text });
        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${escapeAttr(id)}"><a class="doc-anchor" href="#${escapeAttr(id)}">${inner}</a></h${token.depth}>\n`;
      },
      link(token) {
        const href = rewriteHref(token.href, doc.path);
        const external = /^https?:/i.test(href) && !href.startsWith("https://hoffle.online");
        const title = token.title ? ` title="${escapeAttr(token.title)}"` : "";
        const rel = external ? ` rel="noopener"` : "";
        return `<a href="${escapeAttr(href)}"${title}${rel}>${this.parser.parseInline(token.tokens)}</a>`;
      },
      table(token) {
        // Wide tables scroll inside their own box instead of the page.
        return `<div class="doc-table">${defaults.table.call(this, token)}</div>\n`;
      },
    },
  });

  const html = marked.parser(tokens);
  return { html, toc };
}
