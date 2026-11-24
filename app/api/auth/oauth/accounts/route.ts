import { currentUser } from "@/lib/auth";
import { configuredOAuthProviders, isOAuthProvider, type LinkedOAuthAccount } from "@/lib/oauth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** List OAuth providers linked to the signed-in account. */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Database unavailable." }, { status: 503 });
  await ensureSchema(db);

  const rows = await db
    .prepare(
      `SELECT provider, email, display_name, created_at
         FROM oauth_accounts
        WHERE user_id = ?
        ORDER BY created_at ASC`,
    )
    .bind(user.id)
    .all<{
      provider: string;
      email: string | null;
      display_name: string | null;
      created_at: number;
    }>();

  const accounts: LinkedOAuthAccount[] = rows.results
    .filter((row) => isOAuthProvider(row.provider))
    .map((row) => ({
      provider: row.provider as LinkedOAuthAccount["provider"],
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
    }));

  return Response.json({
    accounts,
    available: configuredOAuthProviders(),
  });
}

/** Unlink an OAuth provider from the signed-in account. */
export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Database unavailable." }, { status: 503 });
  await ensureSchema(db);

  const url = new URL(request.url);
  let provider = url.searchParams.get("provider")?.trim() || "";
  if (!provider) {
    try {
      const body = (await request.json()) as { provider?: string };
      provider = typeof body.provider === "string" ? body.provider.trim() : "";
    } catch {
      // Optional body.
    }
  }
  if (!isOAuthProvider(provider)) {
    return Response.json({ error: "Invalid OAuth provider." }, { status: 400 });
  }

  await db
    .prepare("DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?")
    .bind(user.id, provider)
    .run();

  return Response.json({ ok: true, provider });
}
