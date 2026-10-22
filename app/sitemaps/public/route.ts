import { SITE } from "../../components/site-chrome";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { listWebPages } from "@/lib/web-public";

export const dynamic = "force-dynamic";

/** The servers and channels readable on the web (lib/web-public.ts), for search engines. */
export async function GET() {
  const db = bindings().DB;
  const pages = db ? (await ensureSchema(db), await listWebPages(db)) : [];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map(
      (page) =>
        `  <url><loc>${SITE}${page.path.replace(/&/g, "&amp;")}</loc>${page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : ""}</url>`,
    ),
    "</urlset>",
    "",
  ].join("\n");
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
