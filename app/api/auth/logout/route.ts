import {
  SESSION_COOKIE,
  LEGACY_SESSION_COOKIE,
  clearSessionCookie,
  destroySession,
  readCookie,
} from "@/lib/auth";
import {
  ACCOUNTS_COOKIE,
  accountsCookieAfterRemoval,
  clearAccountsCookie,
  openVault,
  vaultSecret,
} from "@/lib/multi-account";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = bindings().DB;
  const token = readCookie(request, SESSION_COOKIE) || readCookie(request, LEGACY_SESSION_COOKIE);
  let scope: "current" | "all" = "current";
  try {
    const body = (await request.json()) as { scope?: string };
    if (body?.scope === "all") scope = "all";
  } catch {
    // Empty or non-JSON logout body defaults to current session only.
  }

  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie(request));

  if (db) {
    if (scope === "all") {
      if (token) await destroySession(db, token);
      const vaultTokens = await openVault(readCookie(request, ACCOUNTS_COOKIE), await vaultSecret(db));
      for (const entry of vaultTokens) {
        if (entry.token !== token) await destroySession(db, entry.token);
      }
      headers.append("Set-Cookie", clearAccountsCookie(request));
    } else {
      if (token) await destroySession(db, token);
      const { cookie } = await accountsCookieAfterRemoval(db, request, {
        token: token ?? undefined,
      });
      headers.append("Set-Cookie", cookie);
    }
  } else {
    headers.append("Set-Cookie", clearAccountsCookie(request));
  }

  return Response.json({ ok: true }, { headers });
}
