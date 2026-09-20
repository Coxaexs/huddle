import {
  SESSION_COOKIE,
  LEGACY_SESSION_COOKIE,
  clearSessionCookie,
  destroySession,
  readCookie,
} from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = bindings().DB;
  const token = readCookie(request, SESSION_COOKIE) || readCookie(request, LEGACY_SESSION_COOKIE);
  if (db && token) await destroySession(db, token);

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie(request) } },
  );
}
