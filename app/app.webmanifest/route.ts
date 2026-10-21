export const dynamic = "force-dynamic";

/**
 * The web app manifest, so "Install Hoffle" in Chrome, Edge or Safari works.
 *
 * It has to cover the page it's installed from: chat.hoffle.online and
 * self-hosted servers serve the app at /, deeppixel.online at /hangout/. The
 * page asking for it says which (its Referer), so the scope follows that.
 */
export function GET(request: Request) {
  let root = "/hangout/";
  try {
    const referer = request.headers.get("referer");
    if (referer && !new URL(referer).pathname.startsWith("/hangout")) root = "/";
  } catch {
    // No usable Referer: the prefixed path works everywhere.
  }
  const manifest = {
    id: "/hangout/",
    name: "Hoffle",
    short_name: "Hoffle",
    description: "Voice, screen sharing and game night for your friend group.",
    start_url: root,
    scope: root,
    display: "standalone",
    background_color: "#11131a",
    theme_color: "#7b63e6",
    categories: ["social", "games"],
    icons: [
      { src: "/hangout/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/hangout/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/hangout/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      // Private: the scope depends on the page asking, which a shared cache can't see.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
