import { isGameLink } from "@/lib/steam";

export const dynamic = "force-dynamic";

/**
 * Hands a `steam://` link to Steam from the system browser. Older desktop
 * apps can't open game links themselves, but they do open web links in the
 * browser, so they open this page instead. Only the links in
 * lib/steam.ts GAME_LINK_PATTERN are accepted: nothing else can be launched
 * through here.
 */
export async function GET(request: Request) {
  const to = new URL(request.url).searchParams.get("to") || "";
  const ok = isGameLink(to);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Hoffle · Opening Steam</title>
<style>body{font:16px system-ui,sans-serif;background:#16161d;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}
main{max-width:420px;text-align:center}a.button{display:inline-block;background:#3d6df2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600}</style></head>
<body><main>${
    ok
      ? `<h1>Opening Steam…</h1><p>If nothing happens, press the button. Your browser may ask whether to open Steam.</p>
<p><a class="button" href="${to}">Open in Steam</a></p><p><small>You can close this tab afterwards.</small></p>
<script>location.href=${JSON.stringify(to)};</script>`
      : `<h1>That link can't be opened</h1><p>Hoffle only opens Steam game links here.</p>`
  }</main></body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
