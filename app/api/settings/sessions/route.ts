import { currentSessionId, currentUser, unauthorized } from "@/lib/auth";
import { listSessions, revokeSession } from "@/lib/account-security";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The devices signed in to your account:
 *   GET                      the list, newest use first
 *   DELETE {id}              sign that one out
 *   DELETE {others: true}    sign out everywhere except here
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  return Response.json({ sessions: await listSessions(db, user.id, await currentSessionId(request)) });
}

export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; others?: unknown };
  const here = await currentSessionId(request);

  if (body.others === true) {
    const sessions = await listSessions(db, user.id, here);
    for (const session of sessions) {
      if (!session.current) await revokeSession(db, user.id, session.id);
    }
    return Response.json({ sessions: await listSessions(db, user.id, here) });
  }
  if (typeof body.id !== "string" || !(await revokeSession(db, user.id, body.id))) {
    return Response.json({ error: "That device is already signed out." }, { status: 404 });
  }
  return Response.json({ sessions: await listSessions(db, user.id, here) });
}
