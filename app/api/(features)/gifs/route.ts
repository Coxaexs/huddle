import { currentUser, unauthorized } from "@/lib/auth";
import { klipySearch } from "@/lib/klipy";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * GIF search, proxied through Klipy so the API key never reaches the browser.
 *
 * Without KLIPY_API_KEY the picker still works for anything you paste or upload —
 * it just cannot search. A key is free from https://klipy.com/developers.
 */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const key = bindings().KLIPY_API_KEY?.trim();
  if (!key) {
    return Response.json({
      gifs: [],
      configured: false,
      hint: "Set KLIPY_API_KEY in .dev.vars to search GIFs. You can still paste a GIF link or upload one.",
    });
  }

  const query = new URL(request.url).searchParams.get("q") || "";

  try {
    const gifs = await klipySearch(key, "gifs", query);
    return Response.json({ configured: true, gifs });
  } catch {
    return Response.json(
      { error: "GIF search is unavailable right now.", gifs: [] },
      { status: 502 },
    );
  }
}
