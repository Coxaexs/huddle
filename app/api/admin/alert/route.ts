import { timingSafeEqual } from "@/lib/auth";
import { alertOperators } from "@/lib/operator-alerts";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALERT_LIMIT = { action: "operator-alert", limit: 30, windowSeconds: 3600 };

/**
 * Rings the admins' phones from outside Hoffle. The mail worker
 * (deploy/mail-alert) calls this when a takedown order or other legal mail
 * arrives. Off until OPERATOR_ALERT_TOKEN is set.
 */
export async function POST(request: Request) {
  const env = bindings();
  const db = env.DB;
  const token = env.OPERATOR_ALERT_TOKEN?.trim();
  if (!db || !token) return Response.json({ error: "Alerts are not set up." }, { status: 503 });
  const sent = request.headers.get("authorization") || "";
  if (!timingSafeEqual(sent, `Bearer ${token}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await limitUser(db, ALERT_LIMIT, "mail-worker");
  if (limited) return limited;
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { title?: string; body?: string };
  const title = String(body.title || "").trim().slice(0, 120);
  const text = String(body.body || "").trim().slice(0, 300);
  if (!title) return Response.json({ error: "What is the alert about?" }, { status: 400 });

  await alertOperators(db, { title, body: text, tag: "operator-alert" });
  return Response.json({ ok: true });
}
