import {
  SESSION_COOKIE,
  currentUser,
  hashPassword,
  readCookie,
  unauthorized,
  validatePassword,
  verifyPassword,
} from "@/lib/auth";
import { bindings } from "@/lib/storage";
import { bumpRateLimit, clearRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();

  // Guessing the current password is bounded even for an already-authed session.
  const limit = await bumpRateLimit(db, `password-change:${user.id}`, 10, 900);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => ({}))) as {
    current?: string;
    next?: string;
  };
  const invalid = validatePassword(body.next || "");
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const row = await db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(body.current || "", row.password_hash))) {
    return Response.json(
      { error: "Your current password is not right." },
      { status: 403 },
    );
  }

  await clearRateLimit(db, `password-change:${user.id}`);

  await db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(await hashPassword(body.next as string), user.id)
    .run();

  // Sign every other device out, but keep this one signed in.
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    const keep = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const keepHex = [...new Uint8Array(keep)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    await db
      .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
      .bind(user.id, keepHex)
      .run();
  }

  return Response.json({ ok: true });
}
