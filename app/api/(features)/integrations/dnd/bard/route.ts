import { currentUser, unauthorized } from "@/lib/auth";
import { channelAccess } from "@/lib/access";
import { dndBotToken } from "@/lib/bot-auth";
import { dndBaseUrl } from "@/lib/dnd-url";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function bardHeaders(): Promise<{ base: URL; auth: string } | null> {
  const secret = bindings().BOT_TOKEN;
  if (!secret) return null;
  try {
    const base = dndBaseUrl();
    return { base, auth: `Bearer ${await dndBotToken(secret)}` };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const cfg = await bardHeaders();
  if (!cfg) return Response.json({ available: false });
  try {
    const res = await fetch(new URL("/api/hoffle/bard/state", cfg.base), {
      headers: { Authorization: cfg.auth },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return Response.json({ available: false });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ available: false });
  }
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const cfg = await bardHeaders();
  if (!cfg) {
    return Response.json({ error: "D&D Companion not configured." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    channelId?: string | null;
    cmd?: string;
    payload?: Record<string, unknown>;
  } | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (action !== "join" && action !== "leave" && action !== "command") {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  const channelId = typeof body?.channelId === "string" ? body.channelId.slice(0, 64) : undefined;
  if (channelId) {
    const db = bindings().DB;
    if (db) {
      const access = await channelAccess(db, channelId, user);
      if (!access.ok) return access.response;
    }
  }
  try {
    const res = await fetch(new URL("/api/hoffle/bard/action", cfg.base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: cfg.auth,
      },
      body: JSON.stringify({
        action,
        room: channelId,
        cmd: body?.cmd,
        payload: body?.payload ?? {},
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ error: "Could not reach Bard service." }, { status: 502 });
  }
}
