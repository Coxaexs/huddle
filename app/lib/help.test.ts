import { describe, expect, it } from "vitest";
import { HELP_CHAPTERS_EN, HELP_CHAPTERS_TR, findHelpChapter, helpHref, renderHelp } from "./help";

describe("help manual", () => {
  it("keeps Turkish and English chapters paired 1-to-1", () => {
    expect(HELP_CHAPTERS_EN.length).toBe(HELP_CHAPTERS_TR.length);
    for (const tr of HELP_CHAPTERS_TR) {
      const en = findHelpChapter(tr.alternateSlug, "en");
      expect(en, `Missing English chapter for ${tr.slug}`).toBeDefined();
      expect(en?.alternateSlug).toBe(tr.slug);
    }
  });

  it("renders valid internal help links and anchors in both languages", () => {
    for (const [lang, chapters] of [
      ["tr", HELP_CHAPTERS_TR],
      ["en", HELP_CHAPTERS_EN],
    ] as const) {
      const rendered = new Map(chapters.map((chapter) => [helpHref(chapter, lang), renderHelp(chapter, lang).html]));
      const base = helpHref(undefined, lang);
      const broken: string[] = [];
      for (const [page, html] of rendered) {
        for (const match of html.matchAll(/ href="([^"]+)"/g)) {
          const href = match[1].replace(/&amp;/g, "&");
          if (!href.startsWith("#") && !href.startsWith(base)) continue;
          const [path, hash] = href.startsWith("#") ? [page, href.slice(1)] : href.split("#");
          if (path === base && !hash) continue;
          const target = rendered.get(path);
          if (!target) {
            broken.push(`${page} -> ${href}`);
            continue;
          }
          if (hash) {
            const ids = new Set([...target.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
            if (!ids.has(hash)) broken.push(`${page} -> ${href}`);
          }
        }
      }
      expect(broken, `Broken ${lang} help links`).toEqual([]);
    }
  });
});
