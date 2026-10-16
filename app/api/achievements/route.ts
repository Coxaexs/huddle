import { currentUser, unauthorized, type PublicUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { listUserAchievements } from "@/lib/achievements";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const achievements = await listUserAchievements(db, user.id);

  return Response.json({
    achievements: achievements.map((a) => ({
      id: a.def.id,
      label: a.def.label,
      description: a.def.description,
      icon: a.def.icon,
      earned: a.earned,
      earnedAt: a.earnedAt,
      current: a.current,
      threshold: a.def.condition.threshold,
      progress: a.progress,
    })),
  });
}
