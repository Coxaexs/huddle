import { describe, expect, it } from "vitest";
import { HELP_CHAPTERS_BY_LANG, renderHelp, type HelpLang } from "./help";
import { foldText, helpChunks, helpTerms, searchHelp } from "./help-search";
import { HELP_TOC } from "./help-toc";

const LANGS: HelpLang[] = ["tr", "en"];

describe("help search", () => {
  it("keeps the app's light chapter list in step with the manual", () => {
    for (const lang of LANGS) {
      expect(HELP_TOC[lang].map(({ slug, title, icon }) => ({ slug, title, icon }))).toEqual(
        HELP_CHAPTERS_BY_LANG[lang].map(({ slug, title, icon }) => ({ slug, title, icon })),
      );
    }
  });

  it("links every section to an anchor that exists on its page", () => {
    for (const lang of LANGS) {
      const broken: string[] = [];
      for (const chapter of HELP_CHAPTERS_BY_LANG[lang]) {
        const ids = new Set([...renderHelp(chapter, lang).html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
        for (const chunk of helpChunks(chapter, lang)) {
          const hash = chunk.href.split("#")[1];
          if (hash && !ids.has(hash)) broken.push(chunk.href);
          expect(chunk.text).not.toMatch(/!\[|::video|<video/);
        }
      }
      expect(broken, `${lang} anchors`).toEqual([]);
    }
  });

  it("folds Turkish letters and cuts words to a stem", () => {
    expect(foldText("İkinci EKRAN ılık şık", "tr")).toBe("ikinci ekran ilik sik");
    expect(helpTerms("Sunucuya nasıl katılırım?", "tr")).toEqual(["sunuc", "katil"]);
  });

  it.each([
    ["tr", "Ekranımı nasıl paylaşırım?", "sesli-sohbet"],
    ["tr", "müzik botunu nasıl eklerim", "muzik"],
    ["tr", "discord sunucumu taşıyabilir miyim", "discord-gecis"],
    ["tr", "rol nasıl oluşturulur", "roller"],
    ["en", "How do I share my screen?", "voice-chat"],
    ["en", "add the music bot", "music"],
    ["en", "ban someone from my server", "moderation"],
    ["en", "change the theme", "themes"],
  ] as const)("%s: %s → %s", (lang, question, chapter) => {
    const hits = searchHelp(question, lang, 3);
    expect(hits.map((hit) => hit.chapterSlug)).toContain(chapter);
  });

  it("finds nothing for an empty or stop-word-only question", () => {
    expect(searchHelp("how do I", "en")).toEqual([]);
    expect(searchHelp("   ", "tr")).toEqual([]);
  });
});
