import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SITE, SiteShell } from "../../../components/site-chrome";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { loadWebMessages, loadWebServer, webChannelPath, webServerPath } from "@/lib/web-public";
import { joinUrl, primaryButton, ServerIcon, WEB_COPY, webLang } from "../../web-ui";

type Params = {
  params: Promise<{ slug: string; channel: string }>;
  searchParams: Promise<{ before?: string }>;
};

async function load(slug: string, channelKey: string) {
  const db = bindings().DB;
  if (!db) return null;
  await ensureSchema(db);
  const server = await loadWebServer(db, slug);
  if (!server) return null;
  const key = decodeURIComponent(channelKey);
  const channel = server.channels.find((c) => c.name === key) || server.channels.find((c) => c.id === key);
  return channel ? { db, server, channel } : null;
}

/** An ISO time from ?before=, or null. */
const cursor = (value: string | undefined) => (value && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value) ? value : null);

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/** Message text with its links clickable (nofollow: these are visitors' words). */
function linkify(text: string): ReactNode[] {
  return text.split(URL_PATTERN).map((part, i) =>
    i % 2 ? (
      <a key={i} href={part} rel="nofollow ugc noopener" target="_blank" className="break-all text-(--violet)">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug, channel: channelKey } = await params;
  const found = await load(slug, channelKey);
  if (!found) return { title: "Not found", robots: { index: false, follow: false } };
  const { db, server, channel } = found;
  const { messages } = await loadWebMessages(db, channel.id, cursor((await searchParams).before));
  const first = messages.find((m) => m.content.trim())?.content.replace(/\s+/g, " ").slice(0, 150);
  const description = channel.topic || first || `#${channel.name} on ${server.name}`;
  return {
    title: `#${channel.name} · ${server.name}`,
    description,
    alternates: { canonical: `${SITE}${webChannelPath(server, channel)}` },
    openGraph: { title: `#${channel.name} · ${server.name}`, description, siteName: "Hoffle", type: "website", images: [{ url: "/og.png", width: 1200, height: 630 }] },
    ...(messages.length ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function WebChannelPage({ params, searchParams }: Params) {
  const { slug, channel: channelKey } = await params;
  const found = await load(slug, channelKey);
  if (!found) notFound();
  const { db, server, channel } = found;
  const before = cursor((await searchParams).before);
  const { messages, older } = await loadWebMessages(db, channel.id, before);
  const lang = webLang((await headers()).get("accept-language"));
  const t = WEB_COPY[lang];
  const when = (iso: string) =>
    new Date(iso).toLocaleString(t.locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
  return (
    <SiteShell lang={lang}>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <a href={webServerPath(server)} className="flex items-center gap-3 no-underline">
          <ServerIcon server={server} size={40} />
          <span className="font-semibold text-(--ink)">{server.name}</span>
          <span className="text-sm text-(--muted)">· {t.allChannels}</span>
        </a>
        <h1 className="lp-display mt-6 text-3xl leading-tight"># {channel.name}</h1>
        {channel.topic && <p className="mt-2 text-(--ink-2)">{channel.topic}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={joinUrl(server)} className={primaryButton}>{t.join}</a>
          <span className="text-sm text-(--muted)">{t.reading}</span>
        </div>

        <section className="mt-8 rounded-xl border border-(--line)">
          {older && (
            <a href={`?before=${encodeURIComponent(older)}`} className="block border-b border-(--line) px-4 py-3 text-center text-sm font-semibold text-(--violet) no-underline">
              {t.older}
            </a>
          )}
          {messages.length ? (
            messages.map((message) => (
              <article key={message.id} className="flex gap-3 px-4 py-3">
                {message.avatarUrl ? (
                  <img src={message.avatarUrl} alt="" width={36} height={36} className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: message.color }}>
                    {message.avatar}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <strong className="text-(--ink)">{message.author}</strong>
                    <time dateTime={message.createdAt} className="text-xs text-(--muted)">{when(message.createdAt)}</time>
                  </p>
                  {message.content && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed text-(--ink-2)">{linkify(message.content)}</p>
                  )}
                  {message.images.map((src) => (
                    <img key={src} src={src} alt="" loading="lazy" className="mt-2 max-h-72 max-w-full rounded-lg" />
                  ))}
                </div>
              </article>
            ))
          ) : (
            <p className="px-4 py-8 text-center text-(--muted)">{t.empty}</p>
          )}
          {before && (
            <a href={webChannelPath(server, channel)} className="block border-t border-(--line) px-4 py-3 text-center text-sm font-semibold text-(--violet) no-underline">
              {t.newest}
            </a>
          )}
        </section>
      </main>
    </SiteShell>
  );
}
