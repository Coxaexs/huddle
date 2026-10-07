import { currentUser, publicUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** "Skip for now" on the add-an-email prompt: stop asking, settings still offers it. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();

  await db
    .prepare("UPDATE users SET email_prompt_skipped = 1 WHERE id = ?")
    .bind(user.id)
    .run();
  return Response.json({ user: publicUser({ ...user, email_prompt_skipped: 1 }) });
}
