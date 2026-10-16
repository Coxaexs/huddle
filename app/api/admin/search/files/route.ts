import { requireInstanceAdmin } from "../../guard";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** List uploaded files whose name matches `q`, across the whole instance. */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
  const bucket = bindings().UPLOADS;
  if (!bucket) return Response.json({ files: [] });

  const files: Array<{
    key: string;
    name: string;
    size: number;
    uploaded: string;
    contentType: string;
  }> = [];

  let cursor: string | undefined;
  do {
    // Listing is prefix-free, so we page through and match by name in memory.
    // Capped so one admin search can't scan a huge bucket forever.
    if (files.length >= 200) break;
    const page = await bucket.list({ limit: 1000, cursor });
    for (const object of page.objects) {
      if (files.length >= 200) break;
      const name = object.key.includes("--")
        ? object.key.split("--").slice(1).join("--")
        : object.key;
      if (!q || name.toLowerCase().includes(q)) {
        files.push({
          key: object.key,
          name,
          size: object.size,
          uploaded: object.uploaded.toISOString(),
          contentType: object.httpMetadata?.contentType || "application/octet-stream",
        });
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return Response.json({ files });
}
