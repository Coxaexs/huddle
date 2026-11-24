import { canSeeServer } from "@/lib/access";
import { currentUser, unauthorized, type User } from "@/lib/auth";
import { dndBotToken } from "@/lib/bot-auth";
import { snowflakeFor } from "@/lib/discord/snowflake";
import { isServerDm, userHasAnyGmRole } from "@/lib/dnd-rules";
import { dndBaseUrl, dndPublicUrl } from "@/lib/dnd-url";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALLOWED_ROUTES = new Set([
  "sheet",
  "map",
  "world",
  "compendium",
  "bard",
  "party",
  "new",
  "display",
  "vtt",
]);

function normalizeRoute(raw: unknown): string {
  if (typeof raw !== "string") return "sheet";
  const cleaned = raw.trim().replace(/^#?\/?/, "").split("?")[0];
  return ALLOWED_ROUTES.has(cleaned) ? cleaned : "sheet";
}

function isHoffleAdmin(user: User): boolean {
  return Boolean(user.is_admin);
}

async function resolveHasDmRole(user: User, serverId: string | null): Promise<boolean> {
  const db = bindings().DB;
  if (!db) return false;
  await ensureSchema(db);
  if (serverId) {
    if (!(await canSeeServer(db, serverId, user))) return false;
    return isServerDm(db, user.id, serverId);
  }
  return userHasAnyGmRole(db, user.id);
}

async function handleSso(
  user: User,
  route: string,
  mode: "user" | "display",
  serverId: string | null,
): Promise<Response> {
  const b = bindings();
  const secret = b.BOT_TOKEN?.trim();
  if (!secret) {
    return Response.json(
      { error: "D&D bot bridge is not configured on Hoffle." },
      { status: 503 },
    );
  }
  const dndBase = dndBaseUrl("http://127.0.0.1:8000").toString().replace(/\/+$/, "");
  const dndPublic = (dndPublicUrl("https://dnd.deeppixel.online")?.toString() || "https://dnd.deeppixel.online").replace(/\/+$/, "");

  const snowflake = mode === "display" ? "" : await snowflakeFor("user", user.id);
  const isAdmin = mode === "display" ? false : isHoffleAdmin(user);
  const hasDmRole = mode === "display" ? false : await resolveHasDmRole(user, serverId);

  let upstream: Response;
  try {
    upstream = await fetch(`${dndBase}/api/auth/hoffle-sso`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await dndBotToken(secret)}`,
      },
      body: JSON.stringify({
        user_id: snowflake,
        username: user.display_name || user.username,
        can_gm: isAdmin || hasDmRole,
        is_admin: isAdmin,
        mode,
        route,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return Response.json(
      { error: "Could not reach the D&D companion server." },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const detail = (await upstream.json().catch(() => ({}))) as { detail?: string };
    return Response.json(
      { error: detail.detail || "D&D companion rejected SSO handoff." },
      { status: upstream.status === 401 ? 502 : upstream.status },
    );
  }

  const data = (await upstream.json()) as {
    token: string;
    is_gm?: boolean;
    path: string;
  };
  return Response.json({
    url: `${dndPublic}${data.path}`,
    isGm: Boolean(data.is_gm),
    mode,
  });
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const params = new URL(request.url).searchParams;
  const route = normalizeRoute(params.get("route"));
  const mode = params.get("mode") === "display" ? "display" : "user";
  const serverId = params.get("serverId")?.trim().slice(0, 64) || null;
  return handleSso(user, route, mode, serverId);
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as {
    route?: string;
    mode?: string;
    serverId?: string | null;
  };
  const route = normalizeRoute(body.route);
  const mode = body.mode === "display" ? "display" : "user";
  const serverId = typeof body.serverId === "string" && body.serverId.trim() ? body.serverId.trim().slice(0, 64) : null;
  return handleSso(user, route, mode, serverId);
}
