import { createSession, sessionResponseHeaders, touchUser } from "@/lib/auth";
import { appBaseUrl, completeOAuthCallback, isOAuthProvider } from "@/lib/oauth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const baseUrl = appBaseUrl(request);

  if (!isOAuthProvider(provider)) {
    return Response.redirect(`${baseUrl}/?oauthError=oauth_failed`, 302);
  }

  const db = bindings().DB;
  if (!db) {
    return Response.redirect(`${baseUrl}/?oauthError=oauth_failed`, 302);
  }

  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    return Response.redirect(`${baseUrl}/?oauthError=oauth_cancelled`, 302);
  }

  const code = url.searchParams.get("code")?.trim() || "";
  const state = url.searchParams.get("state")?.trim() || "";
  if (!code || !state) {
    return Response.redirect(`${baseUrl}/?oauthError=invalid_state`, 302);
  }

  const result = await completeOAuthCallback(db, request, provider, code, state);
  if (result.kind === "error") {
    return Response.redirect(`${baseUrl}/?oauthError=${encodeURIComponent(result.code)}`, 302);
  }

  if (result.kind === "linked") {
    return Response.redirect(`${baseUrl}/?oauthLinked=${encodeURIComponent(result.provider)}`, 302);
  }

  await touchUser(db, result.user.id);
  const token = await createSession(db, result.user.id, request);
  const cookieHeaders = await sessionResponseHeaders(db, request, result.user.id, token);
  const destination = result.isNewUser ? `${baseUrl}/?welcome=1` : `${baseUrl}/`;

  const headers = new Headers(cookieHeaders);
  headers.set("Location", destination);
  return new Response(null, { status: 302, headers });
}
