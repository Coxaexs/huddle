import { currentUser, unauthorized } from "@/lib/auth";
import { klipySearch } from "@/lib/klipy";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Sticker search, proxied through Klipy (same key as GIFs). */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const key = bindings().KLIPY_API_KEY?.trim();
  if (!key) {
    return Response.json({
      stickers: [],
      configured: false,
      hint: "Set KLIPY_API_KEY in .dev.vars to search stickers.",
    });
  }

  const query = new URL(request.url).searchParams.get("q") || "";
  try {
    const stickers = await klipySearch(key, "stickers", query);
    return Response.json({ configured: true, stickers });
  } catch {
    return Response.json(
      { error: "Sticker search is unavailable right now.", stickers: [] },
      { status: 502 },
    );
  }
}
