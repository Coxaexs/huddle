import {
  AVATAR_COLORS,
  currentUser,
  publicUser,
  unauthorized,
} from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string;
    avatar?: string;
    color?: string;
    /** Upload key from /api/uploads, or null to go back to the letter tile. */
    avatarKey?: string | null;
  };

  const displayName =
    body.displayName?.trim().slice(0, 40) || user.display_name;
  const avatar =
    body.avatar?.trim().slice(0, 2) ||
    displayName.slice(0, 1).toUpperCase() ||
    user.avatar;
  const color = AVATAR_COLORS.includes(body.color || "")
    ? (body.color as string)
    : user.color;

  const avatarUrl =
    body.avatarKey === null
      ? null
      : body.avatarKey
        ? `/hangout/api/uploads/${encodeURIComponent(body.avatarKey.slice(0, 240))}`
        : user.avatar_url || null;

  await db
    .prepare(
      "UPDATE users SET display_name = ?, avatar = ?, color = ?, avatar_url = ? WHERE id = ?",
    )
    .bind(displayName, avatar, color, avatarUrl, user.id)
    .run();

  // Everyone's member list and every message avatar should update at once.
  await publishStructureChange();

  return Response.json({
    user: publicUser({
      ...user,
      display_name: displayName,
      avatar,
      avatar_url: avatarUrl,
      color,
    }),
  });
}
