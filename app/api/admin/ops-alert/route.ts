import { timingSafeEqual } from "@/lib/auth";
import { publishMessage } from "@/lib/hub-client";
import { deliverOpsAlert, parseOpsAlert } from "@/lib/ops-alerts";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The ops agent reports systemd units that just failed on home or Oracle; every
 * instance admin gets a note and a push. Only the agent's ADMIN_AGENT_TOKEN
 * gets in, no session.
 */
export async function POST(request: Request) {
  const env = bindings();
  const token = env.ADMIN_AGENT_TOKEN;
  if (!token) return Response.json({ error: "ADMIN_AGENT_TOKEN is not set." }, { status: 503 });
  if (!timingSafeEqual(request.headers.get("authorization") || "", `Bearer ${token}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.DB) return Response.json({ error: "Database not connected." }, { status: 503 });
  const alert = parseOpsAlert(await request.json().catch(() => null));
  if (!alert) return Response.json({ error: "Bad alert" }, { status: 400 });
  await ensureSchema(env.DB);
  const notes = await deliverOpsAlert(env.DB, alert);
  for (const note of notes) {
    await publishMessage(note.channelId, note.message, [note.userId]);
  }
  return Response.json({ delivered: notes.length });
}
