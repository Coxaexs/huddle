import { currentUser } from "@/lib/auth";
import { isOAuthProvider, startOAuthFlow, type OAuthFlowMode } from "@/lib/oauth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isOAuthProvider(provider)) {
    return Response.json({ error: "Unknown OAuth provider." }, { status: 404 });
  }

  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }

  const url = new URL(request.url);
  const rawMode = url.searchParams.get("mode");
  const mode: OAuthFlowMode =
    rawMode === "link" ? "link" : rawMode === "add" ? "add" : "signin";
  const inviteCode = url.searchParams.get("invite") || null;

  let userId: string | null = null;
  if (mode === "link") {
    const user = await currentUser(request);
    if (!user) {
      return Response.json({ error: "Sign in first to link an account." }, { status: 401 });
    }
    userId = user.id;
  }

  const started = await startOAuthFlow(db, request, provider, {
    mode,
    inviteCode,
    userId,
  });

  if ("error" in started) {
    return Response.json({ error: started.error }, { status: started.status });
  }

  return Response.redirect(started.authorizeUrl, 302);
}
