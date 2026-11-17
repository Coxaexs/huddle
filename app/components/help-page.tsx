import type { Metadata } from "next";
import {
  HELP_CHAPTERS,
  HELP_TITLE,
  helpHref,
  helpSections,
  renderHelp,
  type HelpChapter,
} from "../lib/help";
import { APP_URL, SITE, SiteShell } from "./site-chrome";

/** hoffle.online/help: the user manual, one page per chapter. */

export function helpMetadata(chapter?: HelpChapter): Metadata {
  const url = `${SITE}${helpHref(chapter)}`;
  const title = chapter ? `${chapter.title} · ${HELP_TITLE}` : HELP_TITLE;
  const description = chapter
    ? chapter.description
    : "Hoffle'ı adım adım anlatan kılavuz: sunucular, roller, sesli sohbet, müzik botu, DJ modu, Birlikte İzle, D&D araçları, temalar ve daha fazlası. Ekran görüntüleri ve kısa videolarla.";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Hoffle",
      locale: "tr_TR",
      type: "article",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Hoffle" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

const PROSE_CSS = `
  .doc-prose { color: var(--ink-2); font-size: 17px; line-height: 1.7; }
  .doc-prose > * + * { margin-top: 1.1em; }
  .doc-prose h2, .doc-prose h3, .doc-prose h4 { color: var(--ink); scroll-margin-top: 24px; }
  .doc-prose h2 {
    font-family: "Bricolage Grotesque", Nunito, sans-serif; font-weight: 800; letter-spacing: -0.02em;
    font-size: 28px; line-height: 1.2; margin-top: 2.2em; padding-top: 1.2em; border-top: 1px solid var(--line);
  }
  .doc-prose > h2:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
  .doc-prose h3 { font-size: 20px; font-weight: 800; line-height: 1.3; margin-top: 1.8em; }
  .doc-prose .doc-anchor { color: inherit; text-decoration: none; }
  .doc-prose .doc-anchor:hover::after { content: " #"; color: var(--muted); font-weight: 600; }
  .doc-prose a:not(.doc-anchor) { color: var(--violet); font-weight: 600; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
  .doc-prose strong { color: var(--ink); font-weight: 800; }
  .doc-prose ul { list-style: disc; padding-left: 1.3em; }
  .doc-prose ol { list-style: decimal; padding-left: 1.4em; }
  .doc-prose li + li { margin-top: .4em; }
  .doc-prose li > ul, .doc-prose li > ol, .doc-prose li > p { margin-top: .5em; }
  .doc-prose li::marker { color: var(--violet); }
  .doc-prose :not(pre) > code {
    background: var(--paper-2); color: var(--ink); border-radius: 5px; padding: .1em .35em;
    font-size: .88em; overflow-wrap: anywhere;
  }
  .doc-prose kbd {
    display: inline-block; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 6px;
    padding: 0 .4em; font-size: .85em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ink); background: var(--card);
  }
  .doc-prose blockquote {
    border-left: 3px solid var(--violet); background: var(--card); border-radius: 0 10px 10px 0;
    padding: .8em 1.1em; color: var(--ink-2);
  }
  .doc-prose figure { margin-top: 1.4em; margin-bottom: 1.4em; }
  .doc-prose figure img, .doc-prose figure video {
    display: block; width: 100%; height: auto; border-radius: 12px; border: 1px solid var(--line);
    background: #14121c;
  }
  .doc-prose figure video { aspect-ratio: 16 / 10; }
  .doc-prose figcaption { margin-top: .5em; font-size: 14px; color: var(--muted); text-align: center; }
  .doc-prose .doc-table { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
  .doc-prose table { width: 100%; border-collapse: collapse; font-size: 15px; line-height: 1.5; }
  .doc-prose th { background: var(--paper-2); color: var(--ink); text-align: left; font-weight: 800; }
  .doc-prose th, .doc-prose td { padding: 10px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .doc-prose tr:last-child td { border-bottom: 0; }
`;

function ChapterNav({ current }: { current?: string }) {
  return (
    <nav aria-label="Bölümler" className="min-w-0 lg:sticky lg:top-8 lg:self-start">
      <p className="mb-3 hidden text-xs font-bold uppercase tracking-wider text-(--muted) lg:block">Kılavuz</p>
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
        <li className="shrink-0">
          <a
            href="/help"
            aria-current={!current ? "page" : undefined}
            className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-[15px] font-semibold lg:rounded-lg lg:px-3 ${
              !current
                ? "bg-(--ink) text-(--paper)"
                : "border border-(--line) text-(--ink-2) hover:text-(--ink) lg:border-transparent lg:hover:bg-(--paper-2)"
            }`}
          >
            İçindekiler
          </a>
        </li>
        {HELP_CHAPTERS.map((chapter) => {
          const active = chapter.slug === current;
          return (
            <li key={chapter.slug} className="shrink-0">
              <a
                href={helpHref(chapter)}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-[15px] font-semibold lg:rounded-lg lg:px-3 ${
                  active
                    ? "bg-(--ink) text-(--paper)"
                    : "border border-(--line) text-(--ink-2) hover:text-(--ink) lg:border-transparent lg:hover:bg-(--paper-2)"
                }`}
              >
                <span aria-hidden className="mr-1.5">{chapter.icon}</span>
                {chapter.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function HelpIndexPage() {
  return (
    <SiteShell lang="tr">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pb-24 pt-10 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:pt-14">
        <ChapterNav />
        <main className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-sm font-semibold text-(--muted)">
            <a href="/tr" className="hover:text-(--ink)">Hoffle</a>
            <span aria-hidden> / </span>
            <span>Kılavuz</span>
          </nav>
          <h1 className="lp-display mt-3 text-3xl font-normal leading-tight sm:text-[40px]">{HELP_TITLE}</h1>
          <p className="mt-4 max-w-[68ch] text-[17px] leading-relaxed text-(--ink-2)">
            Hoffle'daki her özelliğin nasıl kullanıldığını ekran görüntüleri ve kısa, sessiz videolarla anlatıyoruz.
            Bir bölüm seç ya da aşağıdan doğrudan bir konuya atla. Hoffle'ı hemen denemek istersen{" "}
            <a href={APP_URL} className="font-semibold text-(--violet) underline underline-offset-2">chat.hoffle.online</a>{" "}
            adresine git; kurulum gerekmez.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            {HELP_CHAPTERS.map((chapter) => (
              <section key={chapter.slug} className="rounded-2xl border border-(--line) bg-(--card) p-5">
                <h2 className="text-xl font-extrabold text-(--ink)">
                  <a href={helpHref(chapter)} className="hover:text-(--violet)">
                    <span aria-hidden className="mr-2">{chapter.icon}</span>
                    {chapter.title}
                  </a>
                </h2>
                <p className="mt-1.5 text-[15px] leading-snug text-(--muted)">{chapter.description}</p>
                <ul className="mt-3 space-y-1 text-[15px]">
                  {helpSections(chapter).map((section) => (
                    <li key={section.id}>
                      <a href={`${helpHref(chapter)}#${section.id}`} className="text-(--ink-2) hover:text-(--violet)">
                        {section.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="mt-10 text-sm text-(--muted)">
            Kılavuz bölüm bölüm büyüyor; yeni bölümler eklendikçe burada görünür.
          </p>
        </main>
      </div>
    </SiteShell>
  );
}

export function HelpChapterPage({ chapter }: { chapter: HelpChapter }) {
  const { html, sections } = renderHelp(chapter);
  const index = HELP_CHAPTERS.findIndex((item) => item.slug === chapter.slug);
  const prev = HELP_CHAPTERS[index - 1];
  const next = HELP_CHAPTERS[index + 1];
  const url = `${SITE}${helpHref(chapter)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: chapter.title,
        description: chapter.description,
        url,
        inLanguage: "tr",
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#app` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Hoffle", item: `${SITE}/tr` },
          { "@type": "ListItem", position: 2, name: "Kılavuz", item: `${SITE}/help` },
          { "@type": "ListItem", position: 3, name: chapter.title, item: url },
        ],
      },
    ],
  };

  return (
    <SiteShell lang="tr">
      <style>{PROSE_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pb-24 pt-10 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:pt-14 xl:grid-cols-[230px_minmax(0,1fr)_200px]">
        <ChapterNav current={chapter.slug} />
        <main className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-sm font-semibold text-(--muted)">
            <a href="/tr" className="hover:text-(--ink)">Hoffle</a>
            <span aria-hidden> / </span>
            <a href="/help" className="hover:text-(--ink)">Kılavuz</a>
          </nav>
          <h1 className="lp-display mt-3 text-3xl font-normal leading-tight sm:text-[40px]">
            <span aria-hidden className="mr-2">{chapter.icon}</span>
            {chapter.title}
          </h1>
          <p className="mt-3 max-w-[68ch] text-[17px] text-(--muted)">{chapter.description}</p>
          <article className="doc-prose mt-8 max-w-[80ch]" dangerouslySetInnerHTML={{ __html: html }} />
          <div className="mt-16 flex flex-wrap justify-between gap-3 border-t border-(--line) pt-6 text-[15px] font-semibold">
            {prev ? (
              <a href={helpHref(prev)} className="text-(--violet) hover:underline">← {prev.title}</a>
            ) : (
              <a href="/help" className="text-(--violet) hover:underline">← İçindekiler</a>
            )}
            {next && <a href={helpHref(next)} className="text-(--violet) hover:underline">{next.title} →</a>}
          </div>
        </main>
        {sections.length > 2 && (
          <aside className="hidden xl:sticky xl:top-8 xl:block xl:max-h-[calc(100vh-4rem)] xl:self-start xl:overflow-y-auto">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-(--muted)">Bu sayfada</p>
            <ul className="space-y-2 border-l border-(--line) text-sm">
              {sections.map((entry) => (
                <li key={entry.id}>
                  <a href={`#${entry.id}`} className="-ml-px block border-l-2 border-transparent pl-3 leading-snug text-(--ink-2) hover:border-(--violet) hover:text-(--ink)">
                    {entry.text}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </SiteShell>
  );
}
