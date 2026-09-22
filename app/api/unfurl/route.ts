import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import {
  fetchPreview,
  imageProxyKey,
  isSafePublicUrl,
  signImageUrl,
  type LinkPreview,
} from "@/lib/unfurl";

export const dynamic = "force-dynamic";

const FRESH_MS = 24 * 60 * 60 * 1000;
/** Pages with nothing to show are retried sooner, in case that was a blip. */
const EMPTY_FRESH_MS = 60 * 60 * 1000;
/** Bump when the scraper changes, so old (possibly empty) results are skipped. */
const CACHE_VERSION = "v2";

/** Link preview for one URL: cached in D1, fetched on a miss. */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const raw = new URL(request.url).searchParams.get("url")?.slice(0, 2000) || "";
  const url = isSafePublicUrl(raw);
  const db = bindings().DB;
  // Without storage there is no signing key, so no way to proxy images.
  if (!url || !db) return respond(null);
  await ensureSchema(db);
  const key = `${CACHE_VERSION}:${url.toString()}`;

  let preview: LinkPreview | null = null;
  const cached = await db
    .prepare("SELECT data, fetched_at FROM link_previews WHERE url = ?")
    .bind(key)
    .first<{ data: string | null; fetched_at: string }>();
  const age = cached ? Date.now() - Date.parse(cached.fetched_at) : Infinity;
  if (cached && age < (cached.data ? FRESH_MS : EMPTY_FRESH_MS)) {
    preview = cached.data ? (JSON.parse(cached.data) as LinkPreview) : null;
  } else {
    preview = await fetchPreview(url.toString()).catch(() => null);
    await db
      .prepare(
        "INSERT OR REPLACE INTO link_previews (url, data, fetched_at) VALUES (?, ?, ?)",
      )
      .bind(key, preview ? JSON.stringify(preview) : null, new Date().toISOString())
      .run()
      .catch(() => undefined);
  }

  // Images go through our proxy so viewers' IPs never reach the linked site.
  if (preview?.image) {
    const signingKey = await imageProxyKey(db).catch(() => null);
    preview = signingKey
      ? { ...preview, image: await signImageUrl(signingKey, preview.image) }
      : { ...preview, image: undefined };
  }
  return respond(preview);
}

function respond(preview: LinkPreview | null) {
  return Response.json(
    { preview },
    { headers: { "cache-control": "private, max-age=3600" } },
  );
}
