import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface TenorResult {
  id: string;
  content_description?: string;
  media_formats?: Record<string, { url?: string; dims?: number[] }>;
}

/**
 * GIF search, proxied so the API key never reaches the browser.
 *
 * Without TENOR_API_KEY the picker still works for anything you paste or
 * upload — it just cannot search. A key is free from
 * https://developers.google.com/tenor/guides/quickstart.
 */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const key = bindings().TENOR_API_KEY?.trim();
  if (!key) {
    return Response.json({
      gifs: [],
      configured: false,
      hint: "Set TENOR_API_KEY in .dev.vars to search GIFs. You can still paste a GIF link or upload one.",
    });
  }

  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim().slice(0, 80) || "";

  const endpoint = new URL(
    query
      ? "https://tenor.googleapis.com/v2/search"
      : "https://tenor.googleapis.com/v2/featured",
  );
  endpoint.searchParams.set("key", key);
  endpoint.searchParams.set("client_key", "huddle");
  endpoint.searchParams.set("limit", "24");
  endpoint.searchParams.set("media_filter", "tinygif,gif");
  endpoint.searchParams.set("contentfilter", "medium");
  if (query) endpoint.searchParams.set("q", query);

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return Response.json(
        { error: "GIF search is unavailable right now.", gifs: [] },
        { status: 502 },
      );
    }
    const data = (await response.json()) as { results?: TenorResult[] };
    return Response.json({
      configured: true,
      gifs: (data.results || [])
        .map((result) => ({
          id: result.id,
          description: result.content_description || "GIF",
          preview:
            result.media_formats?.tinygif?.url ||
            result.media_formats?.gif?.url ||
            "",
          url: result.media_formats?.gif?.url || "",
        }))
        .filter((gif) => gif.url),
    });
  } catch {
    return Response.json(
      { error: "GIF search is unavailable right now.", gifs: [] },
      { status: 502 },
    );
  }
}
