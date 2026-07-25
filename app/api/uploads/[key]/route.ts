import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> },
) {
  const bucket = bindings().UPLOADS;
  if (!bucket) return new Response("Not found", { status: 404 });

  const { key } = await context.params;
  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type":
        object.httpMetadata?.contentType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
