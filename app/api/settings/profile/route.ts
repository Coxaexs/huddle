import {
  AVATAR_COLORS,
  currentUser,
  publicUser,
  unauthorized,
} from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
import { bindings } from "@/lib/storage";
import { normalizeProfileImage } from "@/lib/profile-media";
import { checkProfileCss } from "@/lib/themes";
import { normalizePrideBadges, normalizeSocialLinks } from "@/lib/users";

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
    bannerKey?: string | null;
    bannerUrl?: string | null;
    bio?: string;
    pronouns?: string;
    tagline?: string;
    customStatus?: string | null;
    prideBadges?: unknown;
    spotifyActivity?: { song: string; artist: string; albumArt?: string; isPlaying?: boolean } | null;
    socialLinks?: unknown;
    avatarFrame?: string;
    customCss?: string | null;
    customTheme?: string | null;
    quickReactions?: unknown;
    hiddenEmojis?: unknown;
  };

  const displayName =
    body.displayName?.trim().slice(0, 40) || user.display_name;
  const avatar =
    body.avatar?.trim().slice(0, 2) ||
    displayName.slice(0, 1).toUpperCase() ||
    user.avatar;

  const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const color =
    typeof body.color === "string" && hexPattern.test(body.color.trim())
      ? body.color.trim()
      : AVATAR_COLORS.includes(body.color || "")
        ? (body.color as string)
        : user.color;

  const avatarImage = await normalizeProfileImage(
    db,
    body.avatarUrl !== undefined
      ? body.avatarUrl
      : body.avatarKey === null
        ? null
        : body.avatarKey
          ? `/hangout/api/uploads/${encodeURIComponent(body.avatarKey.slice(0, 240))}`
          : user.avatar_url || null,
    "Avatar",
  );
  if (!avatarImage.ok) return Response.json({ error: avatarImage.error }, { status: 400 });
  const avatarUrl = avatarImage.url;

  const banner = await normalizeProfileImage(
    db,
    body.bannerUrl !== undefined
      ? body.bannerUrl
      : body.bannerKey === null
        ? null
        : body.bannerKey
          ? `/hangout/api/uploads/${encodeURIComponent(body.bannerKey.slice(0, 240))}`
          : user.banner_url || null,
    "Banner",
    true,
  );
  if (!banner.ok) return Response.json({ error: banner.error }, { status: 400 });
  const bannerUrl = banner.url;

  const bio = body.bio !== undefined ? body.bio.trim().slice(0, 500) : (user as { bio?: string }).bio || "";
  const pronouns = body.pronouns !== undefined ? body.pronouns.trim().slice(0, 40) : (user as { pronouns?: string }).pronouns || "";
  const tagline =
    body.tagline !== undefined
      ? (body.tagline ? body.tagline.trim().slice(0, 100) : "")
      : (user as { tagline?: string | null }).tagline || "";
  const customStatus =
    body.customStatus !== undefined
      ? (body.customStatus ? body.customStatus.trim().slice(0, 120) : null)
      : (user as { custom_status?: string | null }).custom_status || null;

  let customCss = user.custom_css || null;
  if (body.customCss !== undefined) {
    customCss = body.customCss || null;
    if (customCss) {
      const checked = checkProfileCss(customCss);
      if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
    }
  }
  const customTheme =
    body.customTheme !== undefined
      ? (body.customTheme ? body.customTheme.slice(0, 100) : null)
      : (user as { custom_theme?: string | null }).custom_theme || null;

  const prideBadges =
    body.prideBadges !== undefined
      ? normalizePrideBadges(body.prideBadges)
      : normalizePrideBadges(
          (() => {
            try {
              return JSON.parse(user.pride_badges || "[]");
            } catch {
              return [];
            }
          })(),
        );

  let spotifyActivity = user.spotify_activity || null;
  if (body.spotifyActivity !== undefined) {
    const activity = body.spotifyActivity;
    if (!activity || typeof activity.song !== "string" || typeof activity.artist !== "string") {
      spotifyActivity = null;
    } else {
      const art = await normalizeProfileImage(db, activity.albumArt, "Album art");
      if (!art.ok) return Response.json({ error: art.error }, { status: 400 });
      spotifyActivity = JSON.stringify({
        song: activity.song.slice(0, 200),
        artist: activity.artist.slice(0, 200),
        ...(art.url ? { albumArt: art.url } : {}),
        ...(typeof activity.isPlaying === "boolean" ? { isPlaying: activity.isPlaying } : {}),
      });
    }
  }

  const socialLinks =
    body.socialLinks !== undefined
      ? JSON.stringify(normalizeSocialLinks(body.socialLinks))
      : user.social_links || "[]";

  const avatarFrame =
    body.avatarFrame !== undefined
      ? (body.avatarFrame ? body.avatarFrame.trim().slice(0, 30) : "none")
      : (user as { avatar_frame?: string | null }).avatar_frame || "none";

  let quickReactions: string = (user as { quick_reactions?: string | null }).quick_reactions || "[]";
  if (body.quickReactions !== undefined) {
    if (Array.isArray(body.quickReactions)) {
      const sanitized = body.quickReactions
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 48))
        .filter(Boolean)
        .slice(0, 20);
      quickReactions = JSON.stringify(sanitized);
    } else {
      quickReactions = "[]";
    }
  }

  let hiddenEmojis: string = (user as { hidden_emojis?: string | null }).hidden_emojis || "[]";
  if (body.hiddenEmojis !== undefined) {
    if (Array.isArray(body.hiddenEmojis)) {
      const sanitized = body.hiddenEmojis
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 48))
        .filter(Boolean)
        .slice(0, 50);
      hiddenEmojis = JSON.stringify(sanitized);
    } else {
      hiddenEmojis = "[]";
    }
  }

  await db
    .prepare(
      "UPDATE users SET display_name = ?, avatar = ?, color = ?, avatar_url = ?, banner_url = ?, bio = ?, pronouns = ?, tagline = ?, custom_status = ?, pride_badges = ?, spotify_activity = ?, social_links = ?, avatar_frame = ?, custom_css = ?, custom_theme = ?, quick_reactions = ?, hidden_emojis = ? WHERE id = ?",
    )
    .bind(
      displayName,
      avatar,
      color,
      avatarUrl,
      bannerUrl,
      bio,
      pronouns,
      tagline,
      customStatus,
      JSON.stringify(prideBadges),
      spotifyActivity,
      socialLinks,
      avatarFrame,
      customCss,
      customTheme,
      quickReactions,
      hiddenEmojis,
      user.id,
    )
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
      tagline,
      custom_status: customStatus,
      pride_badges: JSON.stringify(prideBadges),
      spotify_activity: spotifyActivity,
      social_links: socialLinks,
      avatar_frame: avatarFrame,
      color,
      custom_css: customCss,
      custom_theme: customTheme,
      quick_reactions: quickReactions,
      hidden_emojis: hiddenEmojis,
    }),
  });
}
