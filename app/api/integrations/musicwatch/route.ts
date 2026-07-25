import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function botBaseUrl(): URL {
  const configured =
    bindings().MUSICWATCH_BASE_URL?.trim() || "https://deeppixel.online";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported bot server URL.");
  }
  return url;
}

function publicBaseUrl(): URL {
  const configured =
    bindings().MUSICWATCH_PUBLIC_URL?.trim() || "https://deeppixel.online";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported public bot URL.");
  }
  return url;
}

/** Health probe for the Music + Watch bot shown in the sidebar. */
export async function GET() {
  try {
    const response = await fetch(new URL("/healthz", botBaseUrl()), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    return Response.json({
      online: response.ok,
      dashboardUrl: new URL("/musicbot/", publicBaseUrl()).toString(),
    });
  } catch {
    return Response.json({ online: false });
  }
}

/** Creates a synchronized Watch Together / ReelsTogether room. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: string;
    name?: string;
  };
  const mode = body.mode === "reels" ? "reels" : "watch";
  const name =
    body.name?.trim().slice(0, 40) ||
    (mode === "reels" ? "Huddle Reels Party" : "Huddle Watch Party");

  try {
    const response = await fetch(new URL("/watch/api/create", botBaseUrl()), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode, name }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return Response.json(
        { error: "The Music + Watch server could not create a room." },
        { status: 502 },
      );
    }

    const result = (await response.json()) as { url?: string };
    if (!result.url) {
      return Response.json(
        { error: "The Music + Watch server returned no room link." },
        { status: 502 },
      );
    }

    let roomUrl = new URL(result.url);
    if (!["http:", "https:"].includes(roomUrl.protocol)) {
      throw new Error("Unsupported room URL.");
    }
    // The bot reports loopback URLs; rewrite them to the public host.
    if (["127.0.0.1", "localhost"].includes(roomUrl.hostname)) {
      roomUrl = new URL(
        `${roomUrl.pathname}${roomUrl.search}`,
        publicBaseUrl(),
      );
    }
    return Response.json({ url: roomUrl.toString(), mode });
  } catch {
    return Response.json(
      { error: "The Music + Watch server is offline or unreachable." },
      { status: 502 },
    );
  }
}
