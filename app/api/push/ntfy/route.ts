import { currentUser, unauthorized } from "@/lib/auth";
import { sendNtfy, validatePushEndpoint } from "@/lib/push";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Self-hosted phone notifications: the user's ntfy (or any UnifiedPush-style)
 * topic URL. Mentions, DMs, event reminders and incoming calls are POSTed
 * there, so a phone gets background pings without Apple/Google keys on our side.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ endpoint: null });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const row = await db
    .prepare(
      "SELECT endpoint, auth FROM push_subscriptions WHERE user_id = ? AND kind = 'ntfy' LIMIT 1",
    )
    .bind(user.id)
    .first<{ endpoint: string; auth: string }>();
  return Response.json({
    endpoint: row?.endpoint ?? null,
    hasToken: Boolean(row?.auth),
  });
}

export async function PUT(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    token?: string;
  };
  const endpoint = validatePushEndpoint(String(body.endpoint || "").slice(0, 1000));
  if (!endpoint) {
    return Response.json(
      {
        error:
          "Use a full https:// topic URL, e.g. https://ntfy.sh/your-secret-topic. Private addresses need HUDDLE_PUSH_ALLOW_PRIVATE=1 on the server.",
      },
      { status: 400 },
    );
  }
  const token = String(body.token || "").trim().slice(0, 500);

  // Prove it works before saving, so a typo shows up now rather than as
  // silence the next time someone calls.
  const test = await sendNtfy(endpoint, token, {
    title: "Hoffle",
    body: "Phone notifications are on. You'll get mentions, DMs and calls here.",
  }).catch((error: unknown) => error as Error);
  if (test instanceof Error || !test.ok) {
    const detail = test instanceof Error ? test.message : `HTTP ${test.status}`;
    return Response.json(
      { error: `The topic didn't accept a test notification (${detail}).` },
      { status: 400 },
    );
  }

  await db.batch([
    db
      .prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND kind = 'ntfy'")
      .bind(user.id),
    db
      .prepare(
        `INSERT OR REPLACE INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at, kind)
         VALUES (?, ?, '', ?, ?, 'ntfy')`,
      )
      .bind(endpoint, user.id, token, new Date().toISOString()),
  ]);
  return Response.json({ ok: true, endpoint });
}

export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: true });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await db
    .prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND kind = 'ntfy'")
    .bind(user.id)
    .run();
  return Response.json({ ok: true });
}
