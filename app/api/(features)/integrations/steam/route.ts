import { currentUser, unauthorized } from "@/lib/auth";
import { publicOrigin } from "@/lib/public-origin";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { steamLoginUrl, steamPresence, verifySteamLogin } from "@/lib/steam";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** How long a "Sign in through Steam" ticket stays usable. */
const STATE_TTL_MS = 15 * 60_000;
const BASE = "/hangout/api/integrations/steam";

function returnTo(origin: string, nonce: string): string {
  return `${origin}${BASE}?state=${encodeURIComponent(nonce)}`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The page the browser lands on after Steam: says what happened, links back. */
function resultPage(origin: string, ok: boolean, text: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Hoffle · Steam</title>
<style>body{font:16px system-ui,sans-serif;background:#16161d;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}
main{max-width:420px;text-align:center}h1{font-size:22px}a{color:#8fb8ff}</style></head>
<body><main><h1>${ok ? "Steam linked ✓" : "Steam wasn't linked"}</h1><p>${escapeHtml(text)}</p>
<p><a href="${origin}/hangout">Back to Hoffle</a></p></main></body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * GET: your link status ({ linked, persona, keyConfigured }), or, with
 * ?state=…&openid.*, Steam sending you back after signing in.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  await ensureSchema(db);
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  const nonce = url.searchParams.get("state");

  if (nonce) {
    const ticket = await db
      .prepare("SELECT user_id, expires_at FROM steam_link_states WHERE nonce = ?")
      .bind(nonce.slice(0, 64))
      .first<{ user_id: string; expires_at: number }>();
    if (!ticket || ticket.expires_at < Date.now()) {
      return resultPage(origin, false, "That sign-in link expired. Start again from Settings → Activities in Hoffle.");
    }
    const steamId = await verifySteamLogin(url.searchParams, returnTo(origin, nonce));
    if (!steamId) {
      return resultPage(origin, false, "Steam didn't confirm the sign-in. Try again from Settings → Activities.");
    }
    // A ticket works once.
    await db.prepare("DELETE FROM steam_link_states WHERE nonce = ?").bind(nonce).run();
    const presence = await steamPresence(steamId, bindings().STEAM_WEB_API_KEY?.trim());
    const persona = presence?.personaName || "";
    await db.batch([
      // One Hoffle account per Steam account: signing in again moves the link.
      db.prepare("DELETE FROM steam_links WHERE steam_id = ? OR user_id = ?").bind(steamId, ticket.user_id),
      db
        .prepare("INSERT INTO steam_links (user_id, steam_id, persona, linked_at) VALUES (?, ?, ?, ?)")
        .bind(ticket.user_id, steamId, persona, new Date().toISOString()),
    ]);
    return resultPage(
      origin,
      true,
      `${persona ? `Signed in as ${persona}. ` : ""}Friends you let in can now join your Steam games from Hoffle in one click. You can close this tab.`,
    );
  }

  const user = await currentUser(request);
  if (!user) return unauthorized();
  const row = await db
    .prepare("SELECT persona FROM steam_links WHERE user_id = ?")
    .bind(user.id)
    .first<{ persona: string }>();
  return Response.json({
    linked: Boolean(row),
    persona: row?.persona || null,
    keyConfigured: Boolean(bindings().STEAM_WEB_API_KEY?.trim()),
  });
}

/** POST: a fresh "Sign in through Steam" link for the signed-in user. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const limited = await limitUser(db, { action: "steam-link", limit: 10, windowSeconds: 600 }, user.id);
  if (limited) return limited;
  const origin = publicOrigin(request);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  await db.batch([
    db.prepare("DELETE FROM steam_link_states WHERE expires_at < ? OR user_id = ?").bind(Date.now(), user.id),
    db
      .prepare("INSERT INTO steam_link_states (nonce, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(nonce, user.id, Date.now() + STATE_TTL_MS),
  ]);
  return Response.json({ url: steamLoginUrl(returnTo(origin, nonce), origin) });
}

/** DELETE: unlink Steam. */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await db.prepare("DELETE FROM steam_links WHERE user_id = ?").bind(user.id).run();
  return Response.json({ linked: false });
}
