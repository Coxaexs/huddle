import type { Metadata } from "next";
import { DOCS, docHref, renderDoc, type Doc } from "../lib/docs";
import { REPO, SITE, SiteShell } from "./site-chrome";

/** One page of hoffle.online/docs, rendered from the repo's markdown. */

export function docMetadata(doc: Doc): Metadata {
  const url = `${SITE}${docHref(doc)}`;
  const title = doc.slug ? `${doc.title} · Hoffle docs` : "Hoffle documentation";
  return {
    title,
    description: doc.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: doc.description,
      url,
      siteName: "Hoffle",
      locale: "en_US",
      type: "article",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Hoffle" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: doc.description,
      images: ["/og.png"],
    },
  };
}

export function DocsPage({ doc }: { doc: Doc }) {
  const { html, toc } = renderDoc(doc);
  const url = `${SITE}${docHref(doc)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: doc.title,
        description: doc.description,
        url,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#app` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Hoffle", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Docs", item: `${SITE}/docs` },
          ...(doc.slug ? [{ "@type": "ListItem", position: 3, name: doc.title, item: url }] : []),
        ],
      },
    ],
  };

  return (
    <SiteShell>
      <style>{`
        .doc-prose { color: var(--ink-2); font-size: 16.5px; line-height: 1.7; }
        .doc-prose > * + * { margin-top: 1.1em; }
        .doc-prose h2, .doc-prose h3, .doc-prose h4 { color: var(--ink); scroll-margin-top: 24px; }
        .doc-prose h2 {
          font-family: "Bricolage Grotesque", Nunito, sans-serif; font-weight: 800; letter-spacing: -0.02em;
          font-size: 30px; line-height: 1.15; margin-top: 2.2em; padding-top: 1.2em; border-top: 1px solid var(--line);
        }
        .doc-prose h3 { font-size: 20px; font-weight: 800; line-height: 1.3; margin-top: 1.8em; }
        .doc-prose h4 { font-size: 17px; font-weight: 800; margin-top: 1.5em; }
        .doc-prose .doc-anchor { color: inherit; text-decoration: none; }
        .doc-prose .doc-anchor:hover::after { content: " #"; color: var(--muted); font-weight: 600; }
        .doc-prose a:not(.doc-anchor) { color: var(--violet); font-weight: 600; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
        .doc-prose strong { color: var(--ink); font-weight: 800; }
        .doc-prose ul { list-style: disc; padding-left: 1.3em; }
        .doc-prose ol { list-style: decimal; padding-left: 1.4em; }
        .doc-prose li + li { margin-top: .35em; }
        .doc-prose li > ul, .doc-prose li > ol, .doc-prose li > pre, .doc-prose li > p { margin-top: .6em; }
        .doc-prose li::marker { color: var(--coral); }
        .doc-prose :not(pre) > code {
          background: var(--paper-2); color: var(--ink); border-radius: 5px; padding: .1em .35em;
          font-size: .88em; overflow-wrap: anywhere;
        }
        .doc-prose pre {
          background: #1a1523; color: #ece6fb; border-radius: 12px; padding: 16px 18px;
          overflow-x: auto; font-size: 14px; line-height: 1.6;
        }
        .doc-prose pre code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .doc-prose blockquote {
          border-left: 3px solid var(--coral); background: var(--card); border-radius: 0 10px 10px 0;
          padding: .8em 1.1em; color: var(--ink-2);
        }
        .doc-prose hr { border: 0; border-top: 1px solid var(--line); }
        .doc-prose .doc-table { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
        .doc-prose table { width: 100%; border-collapse: collapse; font-size: 15px; line-height: 1.5; }
        .doc-prose th { background: var(--paper-2); color: var(--ink); text-align: left; font-weight: 800; }
        .doc-prose th, .doc-prose td { padding: 10px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
        .doc-prose tr:last-child td { border-bottom: 0; }
        .doc-prose td code, .doc-prose th code { overflow-wrap: normal; white-space: nowrap; }
      `}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pb-24 pt-10 sm:px-6 lg:grid-cols-[190px_minmax(0,1fr)] lg:pt-14 xl:grid-cols-[190px_minmax(0,1fr)_190px]">
        {/* Doc list: a sidebar on wide screens, a row of links on phones. */}
        <nav aria-label="Documentation" className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <p className="mb-3 hidden text-xs font-bold uppercase tracking-wider text-(--muted) lg:block">Docs</p>
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {DOCS.map((item) => {
              const current = item.slug === doc.slug;
              return (
                <li key={item.slug} className="shrink-0">
                  <a
                    href={docHref(item)}
                    aria-current={current ? "page" : undefined}
                    className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-[15px] font-semibold lg:rounded-lg lg:px-3 ${
                      current
                        ? "bg-(--ink) text-(--paper)"
                        : "border border-(--line) text-(--ink-2) hover:text-(--ink) lg:border-transparent lg:hover:bg-(--paper-2)"
                    }`}
                  >
                    {item.navTitle}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-sm font-semibold text-(--muted)">
            <a href="/" className="hover:text-(--ink)">Hoffle</a>
            <span aria-hidden> / </span>
            {doc.slug ? <a href="/docs" className="hover:text-(--ink)">Docs</a> : <span>Docs</span>}
          </nav>
          <h1 className="lp-display mt-3 text-4xl font-extrabold leading-[1.02] sm:text-[52px]">{doc.title}</h1>
          <p className="mt-4 text-sm text-(--muted)">
            From <code className="rounded bg-(--paper-2) px-1.5 py-0.5 text-[13px] text-(--ink-2)">{doc.path}</code> in the repo.{" "}
            <a href={`${REPO}/edit/main/${doc.path}`} className="font-semibold text-(--violet) underline underline-offset-2">
              Suggest an edit
            </a>
          </p>
          <article className="doc-prose mt-8 max-w-[76ch]" dangerouslySetInnerHTML={{ __html: html }} />
        </main>

        {toc.length > 2 && (
          <aside className="hidden xl:sticky xl:top-8 xl:block xl:max-h-[calc(100vh-4rem)] xl:self-start xl:overflow-y-auto">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-(--muted)">On this page</p>
            <ul className="space-y-2 border-l border-(--line) text-sm">
              {toc.map((entry) => (
                <li key={entry.id}>
                  <a href={`#${entry.id}`} className="-ml-px block border-l-2 border-transparent pl-3 leading-snug text-(--ink-2) hover:border-(--coral) hover:text-(--ink)">
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
