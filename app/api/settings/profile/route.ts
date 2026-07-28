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
    avatarKey?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    bio?: string;
    pronouns?: string;
    spotifyActivity?: { song: string; artist: string; albumArt?: string; isPlaying?: boolean } | null;
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
    body.avatarUrl !== undefined
      ? body.avatarUrl
      : body.avatarKey === null
        ? null
        : body.avatarKey
          ? `/hangout/api/uploads/${encodeURIComponent(body.avatarKey.slice(0, 240))}`
          : user.avatar_url || null;

  const bannerUrl = body.bannerUrl !== undefined ? body.bannerUrl : (user as { banner_url?: string }).banner_url || null;
  const bio = body.bio !== undefined ? body.bio.trim().slice(0, 500) : (user as { bio?: string }).bio || "";
  const pronouns = body.pronouns !== undefined ? body.pronouns.trim().slice(0, 40) : (user as { pronouns?: string }).pronouns || "";
  const spotifyActivity =
    body.spotifyActivity !== undefined
      ? body.spotifyActivity
        ? JSON.stringify(body.spotifyActivity)
        : null
      : (user as { spotify_activity?: string }).spotify_activity || null;

  await db
    .prepare(
      "UPDATE users SET display_name = ?, avatar = ?, color = ?, avatar_url = ?, banner_url = ?, bio = ?, pronouns = ?, spotify_activity = ? WHERE id = ?",
    )
    .bind(displayName, avatar, color, avatarUrl, bannerUrl, bio, pronouns, spotifyActivity, user.id)
    .run();

  // Everyone's member list and every message avatar should update at once.
  await publishStructureChange();

  return Response.json({
    user: publicUser({
      ...user,
      display_name: displayName,
      avatar,
      avatar_url: avatarUrl,
      banner_url: bannerUrl,
      bio,
      pronouns,
      color,
    }),
  });
}
