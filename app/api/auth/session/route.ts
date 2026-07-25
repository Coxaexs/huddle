import { currentUser, publicUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Who am I, and does this Huddle still need its first account? */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  await ensureSchema(db);

  const user = await currentUser(request);
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM users")
    .first<{ count: number }>();

  return Response.json({
    user: user ? publicUser(user) : null,
    // With no accounts yet, the first signup claims the place and skips the
    // invite requirement.
    bootstrap: (count?.count ?? 0) === 0,
  });
}
