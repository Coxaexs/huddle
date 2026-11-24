"use client";

import { useEffect, useMemo, useState } from "react";
import { Compass, ExternalLink, Search, Users } from "lucide-react";
import type { PublicDiscoverServer } from "@/lib/discover";
import { DISCOVER_CATEGORIES, type DiscoverCategory } from "@/lib/server-templates";
import type { LandingLang } from "./landing-copy";
import { APP_URL } from "./site-chrome";

const COPY: Record<
  LandingLang,
  {
    searchLabel: string;
    searchPlaceholder: string;
    allCategories: string;
    categories: Record<DiscoverCategory, string>;
    membersLabel: (count: number) => string;
    joinServer: string;
    readWeb: string;
    emptyTitle: string;
    emptyBody: string;
    listCtaTitle: string;
    listCtaBody: string;
    listCtaButton: string;
  }
> = {
  en: {
    searchLabel: "Search public servers",
    searchPlaceholder: "Search servers by name or topic…",
    allCategories: "All",
    categories: {
      community: "Community",
      gaming: "Gaming",
      dnd: "D&D & Tabletop",
      study: "Study & Co-working",
      creative: "Art & Creators",
      tech: "Tech & Dev",
      music: "Music",
      other: "Books & Other",
    },
    membersLabel: (count) => `${count} ${count === 1 ? "member" : "members"}`,
    joinServer: "Join server",
    readWeb: "Read on web",
    emptyTitle: "No matching public servers yet",
    emptyBody: "Try another keyword or category — or open Hoffle and list your own community in seconds.",
    listCtaTitle: "Running a community or D&D campaign?",
    listCtaBody: "Pick a starter template in Hoffle and turn on Public Listing in Server Settings to appear here.",
    listCtaButton: "Launch Hoffle",
  },
  tr: {
    searchLabel: "Açık sunucularda ara",
    searchPlaceholder: "Ada veya konuya göre sunucu ara…",
    allCategories: "Tümü",
    categories: {
      community: "Topluluk",
      gaming: "Oyun",
      dnd: "D&D ve Masaüstü",
      study: "Çalışma ve Ders",
      creative: "Sanat ve Üreticiler",
      tech: "Yazılım ve Teknoloji",
      music: "Müzik",
      other: "Kitap ve Diğer",
    },
    membersLabel: (count) => `${count} üye`,
    joinServer: "Katıl",
    readWeb: "Web'de oku",
    emptyTitle: "Eşleşen herkese açık sunucu henüz yok",
    emptyBody: "Başka bir kelime veya kategori dene — ya da kendi topluluğunu saniyeler içinde burada listele.",
    listCtaTitle: "Bir topluluk ya da D&D kampanyası mı yönetiyorsun?",
    listCtaBody: "Hoffle'da bir başlangıç şablonu seç ve Sunucu Ayarları'ndan Herkese Açık Listeleme'yi açarak burada görün.",
    listCtaButton: "Hoffle'ı Aç",
  },
};

export function DiscoverClient({
  lang,
  initialServers = [],
  fetchOnMount = true,
}: {
  lang: LandingLang;
  initialServers?: PublicDiscoverServer[];
  fetchOnMount?: boolean;
}) {
  const c = COPY[lang];
  const [servers, setServers] = useState<PublicDiscoverServer[]>(initialServers);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | DiscoverCategory>("all");

  useEffect(() => {
    if (!fetchOnMount) return;
    let alive = true;
    void fetch("/hangout/api/discover")
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{ servers?: PublicDiscoverServer[] }>)
          : null,
      )
      .then((data) => {
        if (alive && data && Array.isArray(data.servers) && data.servers.length > 0) {
          setServers(data.servers);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fetchOnMount]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return servers.filter((srv) => {
      if (category !== "all" && srv.discoverCategory !== category) return false;
      if (q && !srv.name.toLowerCase().includes(q) && !srv.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [servers, query, category]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <div className="relative max-w-xl">
          <label htmlFor="discover-search" className="sr-only">
            {c.searchLabel}
          </label>
          <Search
            size={18}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-(--muted)"
          />
          <input
            id="discover-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={c.searchPlaceholder}
            className="h-12 w-full rounded-xl border border-(--line) bg-(--card) pl-11 pr-4 text-[15px] text-(--ink) placeholder:text-(--muted)"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={c.allCategories}>
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              category === "all"
                ? "bg-(--violet-fill) text-white"
                : "border border-(--line) bg-(--card) text-(--ink-2) hover:border-(--violet)"
            }`}
          >
            {c.allCategories}
          </button>
          {DISCOVER_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={category === cat}
              onClick={() => setCategory(cat)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                category === cat
                  ? "bg-(--violet-fill) text-white"
                  : "border border-(--line) bg-(--card) text-(--ink-2) hover:border-(--violet)"
              }`}
            >
              {c.categories[cat]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-(--line) bg-(--card) p-10 text-center">
          <Compass size={32} aria-hidden className="mx-auto text-(--violet)" />
          <h2 className="lp-display mt-3 text-2xl font-normal text-(--ink)">{c.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-(--ink-2)">{c.emptyBody}</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((srv) => (
            <article
              key={srv.id}
              className="flex flex-col justify-between rounded-2xl border border-(--line) bg-(--card) p-5 transition hover:border-(--violet)"
            >
              <div>
                <div className="flex items-center gap-3">
                  {srv.iconUrl ? (
                    <img
                      src={srv.iconUrl}
                      alt=""
                      className="h-12 w-12 rounded-xl object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-base font-bold text-white"
                      style={{ background: srv.color || "#7b63e6" }}
                      aria-hidden="true"
                    >
                      {srv.icon}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-(--ink)">{srv.name}</h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-(--muted)">
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} aria-hidden /> {c.membersLabel(srv.memberCount)}
                      </span>
                      <span>· {c.categories[srv.discoverCategory]}</span>
                    </div>
                  </div>
                </div>
                {srv.description && (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-(--ink-2)">
                    {srv.description}
                  </p>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <a
                  href={srv.joinUrl}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-(--violet-fill) px-4 text-sm font-semibold text-white transition hover:bg-(--violet-fill-hover)"
                >
                  {c.joinServer}
                </a>
                {srv.webPublic && (
                  <a
                    href={`/s/${encodeURIComponent((srv.vanityCode || srv.id).toLowerCase())}`}
                    className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-(--line) px-3 text-sm font-semibold text-(--ink) hover:border-(--violet)"
                  >
                    <ExternalLink size={14} aria-hidden />
                    {c.readWeb}
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-(--line) bg-(--paper-2) p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <h2 className="text-lg font-semibold text-(--ink)">{c.listCtaTitle}</h2>
          <p className="mt-1 text-sm text-(--ink-2)">{c.listCtaBody}</p>
        </div>
        <a
          href={APP_URL}
          className="mt-4 inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-(--violet-fill) px-5 text-sm font-semibold text-white transition hover:bg-(--violet-fill-hover) sm:mt-0"
        >
          {c.listCtaButton}
        </a>
      </div>
    </div>
  );
}
