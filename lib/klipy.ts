/**
 * Thin client for the Klipy content API (GIFs + stickers), which replaced Tenor.
 *
 * The API key is embedded in the path: `https://api.klipy.com/api/v1/{KEY}/...`.
 * Search takes `q`, `per_page`, `page`; the trending endpoint omits `q`. The
 * envelope is `{ result, data: { data: [...items], has_next } }`.
 *
 * Each item carries a `file` object keyed by size (hd/md/sm/xs) then format
 * (gif/webp/mp4), each `{ url, width, height }`. Sticker items are usually
 * transparent webp. We extract a small preview and a larger send URL defensively
 * so a change in Klipy's exact key names degrades to "nothing matched" rather
 * than throwing.
 */

export interface KlipyItem {
  id: string;
  description: string;
  /** Small looping preview for the grid. */
  preview: string;
  /** Full-size URL that gets posted into the channel. */
  url: string;
}

export type KlipyKind = "gifs" | "stickers";

interface MediaFile {
  url?: string;
  [key: string]: unknown;
}

type SizeBucket = Record<string, MediaFile | undefined>;

function pickUrl(
  file: Record<string, SizeBucket | undefined> | undefined,
  sizes: string[],
  formats: string[],
): string {
  if (!file) return "";
  for (const size of sizes) {
    const bucket = file[size];
    if (!bucket) continue;
    for (const format of formats) {
      const media = bucket[format];
      if (media?.url) return media.url;
    }
  }
  // Last resort: any url anywhere in the file object.
  for (const bucket of Object.values(file)) {
    for (const media of Object.values(bucket || {})) {
      if (media?.url) return media.url;
    }
  }
  return "";
}

function mapItem(raw: unknown, kind: KlipyKind): KlipyItem | null {
  const item = raw as {
    id?: string | number;
    slug?: string;
    title?: string;
    file?: Record<string, SizeBucket | undefined>;
  };
  // Stickers prefer transparent webp; GIFs prefer gif then webp.
  const formats = kind === "stickers" ? ["webp", "gif", "mp4"] : ["gif", "webp", "mp4"];
  const preview = pickUrl(item.file, ["sm", "xs", "md", "hd"], formats);
  const url = pickUrl(item.file, ["md", "hd", "sm", "xs"], formats);
  const chosen = url || preview;
  if (!chosen) return null;
  return {
    id: String(item.id ?? item.slug ?? crypto.randomUUID()),
    description: item.title || (kind === "stickers" ? "Sticker" : "GIF"),
    preview: preview || chosen,
    url: chosen,
  };
}

/** Search or trend Klipy content. Returns [] on any failure. */
export async function klipySearch(
  key: string,
  kind: KlipyKind,
  query: string,
): Promise<KlipyItem[]> {
  const clean = query.trim().slice(0, 80);
  const path = clean ? "search" : "trending";
  const endpoint = new URL(
    `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/${kind}/${path}`,
  );
  endpoint.searchParams.set("per_page", "24");
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("customer_id", "huddle");
  if (clean) endpoint.searchParams.set("q", clean);

  const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Klipy ${response.status}`);
  const body = (await response.json()) as {
    data?: { data?: unknown[] };
    result?: boolean;
  };
  const items = body.data?.data || [];
  return items
    .map((item) => mapItem(item, kind))
    .filter((item): item is KlipyItem => item !== null);
}
