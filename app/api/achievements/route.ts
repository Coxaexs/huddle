import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import {
  achievementRarity,
  earnedAchievementsFor,
  listUserAchievements,
  normalizeShowcase,
  setShowcase,
  tzFromRequest,
} from "@/lib/achievements";
import { publishMemberUpdate } from "@/lib/hub-client";

export const dynamic = "force-dynamic";

function storageMissing() {
  return Response.json({ error: "Storage is not connected." }, { status: 503 });
}

/**
 * Your own board (progress, rarity, showcase, and anything that just
 * unlocked), or with `?user=<id>` the achievements someone else has earned.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return storageMissing();
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const otherId = new URL(request.url).searchParams.get("user");
  if (otherId && otherId !== user.id) {
    const [earned, rarity] = await Promise.all([earnedAchievementsFor(db, otherId), achievementRarity(db)]);
    return Response.json({ earned, rarity });
  }

  const [{ progress, newlyEarned }, rarity, showcaseRow] = await Promise.all([
    listUserAchievements(db, user.id, { tzOffset: tzFromRequest(request) }),
    achievementRarity(db),
    db
      .prepare("SELECT achievement_showcase FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ achievement_showcase: string | null }>(),
  ]);
  let showcase: string[] = [];
  try {
    showcase = normalizeShowcase(JSON.parse(showcaseRow?.achievement_showcase || "[]"));
  } catch {
    // Empty.
  }

  return Response.json({
    achievements: progress.map((a) => ({
      id: a.def.id,
      earned: a.earned,
      earnedAt: a.earnedAt,
      current: a.current,
      threshold: a.def.condition.threshold,
      progress: a.progress,
    })),
    newlyEarned,
    rarity,
    showcase,
  });
}

/** Pins up to five earned achievements to your profile: `{ showcase: string[] }`. */
export async function PUT(request: Request) {
  const db = bindings().DB;
  if (!db) return storageMissing();
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { showcase?: unknown };
  const showcase = await setShowcase(db, user.id, body.showcase);
  void publishMemberUpdate(user.id);
  return Response.json({ showcase });
}
