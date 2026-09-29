import { describe, expect, it } from "vitest";
import { DOCS, docHref, renderDoc } from "./docs";

const rendered = new Map(DOCS.map((doc) => [docHref(doc), renderDoc(doc).html]));

function ids(html: string): Set<string> {
  return new Set([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/ href="([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));
}

describe("published docs", () => {
  it("drops each file's title heading, since the page renders its own h1", () => {
    for (const html of rendered.values()) expect(html).not.toContain("<h1");
  });

  it("gives headings the same anchors GitHub does", () => {
    const selfHosting = rendered.get("/docs/self-hosting")!;
    expect(ids(selfHosting)).toContain("putting-hoffle-on-the-internet-https");
    expect(ids(selfHosting)).toContain("single-container-install-unraid-truenas-synology");
    expect(ids(rendered.get("/docs/bots")!)).toContain("hoffles-own-bot-api");
  });

  // A renamed heading or file in the markdown should fail here, not 404 on the site.
  it("has no links to missing pages or anchors", () => {
    const broken: string[] = [];
    for (const [page, html] of rendered) {
      for (const href of hrefs(html)) {
        if (!href.startsWith("#") && !href.startsWith("/")) continue;
        const [path, hash] = href.startsWith("#") ? [page, href.slice(1)] : href.split("#");
        const target = rendered.get(path);
        if (!target || (hash && !ids(target).has(hash))) broken.push(`${page} -> ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("sends links to unpublished repo files to GitHub", () => {
    const hrefsOnIndex = hrefs(rendered.get("/docs")!);
    expect(hrefsOnIndex).toContain("https://github.com/Coxaexs/huddle/blob/main/LICENSE");
    expect(hrefsOnIndex).toContain("https://github.com/Coxaexs/huddle/blob/main/docs/spatial-audio.md");
    expect(hrefsOnIndex.some((href) => href.endsWith(".md") && !href.startsWith("https://"))).toBe(false);
  });
});
