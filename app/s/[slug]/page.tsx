import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SITE, SiteShell } from "../../components/site-chrome";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { loadWebServer, webChannelPath, webServerPath } from "@/lib/web-public";
import { joinUrl, primaryButton, ServerIcon, WEB_COPY, webLang } from "../web-ui";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const db = bindings().DB;
  if (!db) return null;
  await ensureSchema(db);
  return loadWebServer(db, slug);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const server = await load((await params).slug);
  if (!server) return { title: "Not found", robots: { index: false, follow: false } };
  const lang = webLang((await headers()).get("accept-language"));
  const description =
    server.description ||
    WEB_COPY[lang].serverDescription(server.name, server.channels.slice(0, 4).map((c) => `#${c.name}`).join(", "));
  return {
    title: server.name,
    description,
    alternates: { canonical: `${SITE}${webServerPath(server)}` },
    openGraph: { title: `${server.name} on Hoffle`, description, siteName: "Hoffle", type: "website", images: [{ url: "/og.png", width: 1200, height: 630 }] },
  };
}

export default async function WebServerPage({ params }: Params) {
  const server = await load((await params).slug);
  if (!server) notFound();
  const lang = webLang((await headers()).get("accept-language"));
  const t = WEB_COPY[lang];
  return (
    <SiteShell lang={lang}>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <header className="flex items-center gap-4">
          <ServerIcon server={server} />
          <div className="min-w-0">
            <h1 className="lp-display text-3xl leading-tight sm:text-4xl">{server.name}</h1>
            <p className="mt-1 text-(--muted)">{t.members(server.memberCount)}</p>
          </div>
        </header>
        {server.description && <p className="mt-5 text-lg leading-relaxed text-(--ink-2)">{server.description}</p>}
        <a href={joinUrl(server)} className={`${primaryButton} mt-6`}>{t.join}</a>
        <h2 className="mt-12 text-sm font-semibold uppercase tracking-wider text-(--muted)">{t.channels}</h2>
        {server.channels.length ? (
          <ul className="mt-3 divide-y divide-(--line) overflow-hidden rounded-xl border border-(--line)">
            {server.channels.map((channel) => (
              <li key={channel.id}>
                <a href={webChannelPath(server, channel)} className="flex flex-col gap-0.5 px-4 py-3 no-underline hover:bg-(--paper-2)">
                  <span className="font-semibold text-(--ink)"># {channel.name}</span>
                  {channel.topic && <span className="text-sm text-(--muted)">{channel.topic}</span>}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-(--muted)">{t.empty}</p>
        )}
        <p className="mt-10 text-sm text-(--muted)">{t.about}</p>
      </main>
    </SiteShell>
  );
}
