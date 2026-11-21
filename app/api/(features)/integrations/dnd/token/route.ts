import { fixtureTokenSvg } from "@/lib/battlemap-tokens";
import { dndBaseUrl } from "@/lib/dnd-url";

export const dynamic = "force-dynamic";

/**
 * Serves 2D tabletop token portraits for common D&D mobs (proxied from dndbot's
 * 5e token archive) and crisp SVG tokens for fixtures (chest, door, barrel,
 * torch, campfire, pillar, trap).
 */
export async function GET(request: Request) {
  const name = (new URL(request.url).searchParams.get("name") || "").trim().slice(0, 80);
  if (!name || /[\\<>]/.test(name)) {
    return Response.json({ error: "Missing or invalid token name." }, { status: 400 });
  }

  const fixtureSvg = fixtureTokenSvg(name);
  if (fixtureSvg) {
    return new Response(fixtureSvg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=604800",
      },
    });
  }

  try {
    const base = dndBaseUrl("http://127.0.0.1:8000");
    const upstream = await fetch(
      new URL(`/api/lookups/monsters/${encodeURIComponent(name)}/token`, base),
      { signal: AbortSignal.timeout(5000) },
    );
    if (!upstream.ok) {
      return Response.json({ error: "No token artwork found." }, { status: 404 });
    }
    const contentType = upstream.headers.get("content-type") || "image/webp";
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800",
      },
    });
  } catch {
    return Response.json({ error: "D&D token service unreachable." }, { status: 502 });
  }
}
