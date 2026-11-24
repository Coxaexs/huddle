import {
  clearSessionCookie,
  destroySession,
  publicUser,
  readCookie,
  SESSION_COOKIE,
  LEGACY_SESSION_COOKIE,
  sessionCookie,
  userColumns,
  type User,
} from "@/lib/auth";
import {
  buildAccountsCookie,
  listValidAccounts,
  MAX_VAULT_ACCOUNTS,
  accountsCookieAfterRemoval,
  sha256Hex,
  vaultSecret,
} from "@/lib/multi-account";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** List saved valid sessions in the browser's multi-account vault. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ accounts: [], maxAccounts: MAX_VAULT_ACCOUNTS });
  }
  const { accounts, entries, changed } = await listValidAccounts(db, request);
  const headers = new Headers();
  if (changed) {
    headers.append("Set-Cookie", await buildAccountsCookie(request, entries, await vaultSecret(db)));
  }
  return Response.json(
    { accounts, maxAccounts: MAX_VAULT_ACCOUNTS },
    { headers },
  );
}

/** Switch the active `hoffle_session` cookie to another account in the vault. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Database unavailable." }, { status: 500 });
  await ensureSchema(db);

  let body: { userId?: string };
  try {
    body = (await request.json()) as { userId?: string };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!targetUserId) {
    return Response.json({ error: "Missing userId." }, { status: 400 });
  }

  const { entries } = await listValidAccounts(db, request);
  const match = entries.find((entry) => entry.userId === targetUserId);
  if (!match) {
    return Response.json({ error: "Saved session not found or expired." }, { status: 404 });
  }

  const user = await db
    .prepare(
      `SELECT ${userColumns("u")}
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND u.id = ? AND u.suspended_at IS NULL`,
    )
    .bind(await sha256Hex(match.token), targetUserId)
    .first<User>();

  if (!user) {
    const { cookie } = await accountsCookieAfterRemoval(db, request, { userId: targetUserId });
    return Response.json(
      { error: "Saved session is no longer valid." },
      { status: 401, headers: { "Set-Cookie": cookie } },
    );
  }

  const reordered = [match, ...entries.filter((e) => e.userId !== targetUserId)];
  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookie(request, match.token));
  headers.append("Set-Cookie", await buildAccountsCookie(request, reordered, await vaultSecret(db)));

  return Response.json({ ok: true, user: publicUser(user) }, { headers });
}

/** Remove one saved account from the vault and revoke its session. */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Database unavailable." }, { status: 500 });
  await ensureSchema(db);

  const url = new URL(request.url);
  let targetUserId = url.searchParams.get("userId")?.trim() || "";
  if (!targetUserId) {
    try {
      const body = (await request.json()) as { userId?: string };
      targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
    } catch {
      // Optional body.
    }
  }
  if (!targetUserId) {
    return Response.json({ error: "Missing userId." }, { status: 400 });
  }

  const { entries } = await listValidAccounts(db, request);
  const removed = entries.find((e) => e.userId === targetUserId);
  const currentToken = readCookie(request, SESSION_COOKIE) || readCookie(request, LEGACY_SESSION_COOKIE);
  if (removed) {
    await destroySession(db, removed.token);
  }

  const { entries: remaining, cookie } = await accountsCookieAfterRemoval(db, request, {
    userId: targetUserId,
  });

  const headers = new Headers();
  const clearedActive = Boolean(removed && currentToken && removed.token === currentToken);
  if (clearedActive) {
    headers.append("Set-Cookie", clearSessionCookie(request));
  }
  headers.append("Set-Cookie", cookie);

  return Response.json({ ok: true, clearedActive, remainingCount: remaining.length }, { headers });
}
