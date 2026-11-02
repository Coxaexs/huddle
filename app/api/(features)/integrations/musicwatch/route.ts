import { currentUser, unauthorized } from "@/lib/auth";
import { channelOverwritePermissions, mayView } from "@/lib/channel-permissions";
import { botFetch, botSession } from "@/lib/musicbot";
import { MUSIC_BOT_MISSING, musicBotInServer } from "@/lib/music-bot";
import { can, hasPermission, Permission } from "@/lib/permissions";
import { publicOrigin } from "@/lib/public-origin";
import { limitUser } from "@/lib/rate-limit";
import { findChannel, isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";
import { isSafeProfileImage } from "@/lib/users";

export const dynamic = "force-dynamic";

function botBaseUrl(): URL {
  const configured =
    bindings().MUSICWATCH_BASE_URL?.trim() || "https://deeppixel.online";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported bot server URL.");
  }
  return url;
}

function publicBaseUrl(): URL {
  const configured =
    bindings().MUSICWATCH_PUBLIC_URL?.trim() || "https://deeppixel.online";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported public bot URL.");
  }
  return url;
}

/** Health probe for the Music + Watch bot shown in the sidebar. */
export async function GET() {
  try {
    const response = await fetch(new URL("/healthz", botBaseUrl()), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    return Response.json({
      online: response.ok,
      dashboardUrl: new URL("/musicbot/", publicBaseUrl()).toString(),
    });
  } catch {
    return Response.json({ online: false });
  }
}

/** Tickets are cheap, but each one is a call to the bot. */
const TICKET_LIMIT = { action: "musicwatch-ticket", limit: 30, windowSeconds: 60 };

/**
 * Watch Together and Reels Together, the music bot's voice-room activities.
 *
 * `{channelId, mode}` gives the member who asks a one-time link into that
 * voice room's Watch or Reels room, carrying who they are: their name and
 * picture, host if they started the activity, moderator if they can manage
 * the server. `{channelId, action: "add", q}` puts a link or a search on the
 * room's Watch Together queue (/watch <link>), `{action: "seed", q}` tells
 * Reels Together what this member is into (/reels <topics>).
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    mode?: string;
    action?: string;
    q?: string;
  };
  const channel = body.channelId ? await findChannel(db, String(body.channelId).slice(0, 64)) : null;
  // The same test as joining the room's voice (api/voice/token): a member of
  // its server, let in by the channel's overwrites when it has any.
  const here =
    channel && channel.kind === "voice" && (await isServerMember(db, channel.server_id, user.id))
      ? await channelOverwritePermissions(db, user.id, channel.id, channel.server_id)
      : undefined;
  if (!channel || here === undefined || (here !== null && !(mayView(here) && hasPermission(here, Permission.CONNECT)))) {
    return Response.json({ error: "You can't open that voice room." }, { status: 403 });
  }
  if (!(await musicBotInServer(db, channel.server_id))) {
    return Response.json({ error: MUSIC_BOT_MISSING }, { status: 409 });
  }
  const limited = await limitUser(db, TICKET_LIMIT, user.id);
  if (limited) return limited;

  const action = body.action === "add" || body.action === "seed" ? body.action : "ticket";
  const mode = action === "add" ? "watch" : action === "seed" || body.mode === "reels" ? "reels" : "watch";
  const avatarUrl = isSafeProfileImage(user.avatar_url)
    ? new URL(user.avatar_url!, publicOrigin(request)).toString()
    : "";
  const person = {
    id: user.id,
    name: user.display_name,
    avatar: user.avatar,
    avatar_url: avatarUrl,
    color: user.color,
  };

  try {
    const cookie = await botSession();
    if (action === "ticket") {
      const activity = await db
        .prepare("SELECT created_by FROM room_activities WHERE channel_id = ? AND kind = ?")
        .bind(channel.id, mode)
        .first<{ created_by: string }>();
      const moderator =
        (await can(db, user.id, channel.server_id, Permission.MANAGE_CHANNELS)) ||
        (await can(db, user.id, channel.server_id, Permission.MODERATE));
      const issued = await botFetch("/api/admin/watch-ticket", cookie, {
        method: "POST",
        body: JSON.stringify({
          mode,
          channel_id: channel.id,
          room_name: channel.name,
          user: person,
          host: activity?.created_by === user.id,
          moderator,
        }),
      });
      if (typeof issued.ticket !== "string" || typeof issued.room !== "string" || typeof issued.path !== "string") {
        throw new Error("The Music + Watch bot returned no ticket.");
      }
      const url = new URL(issued.path, publicBaseUrl());
      url.searchParams.set("room", issued.room);
      url.hash = `ticket=${encodeURIComponent(issued.ticket)}`;
      return Response.json({ url: url.toString(), mode });
    }

    const q = String(body.q || "").trim().slice(0, 1000);
    if (!q) {
      return Response.json(
        { error: action === "add" ? "Give a link or something to search for." : "Name a topic or two." },
        { status: 400 },
      );
    }
    const result = await botFetch("/api/admin/watch-command", cookie, {
      method: "POST",
      body: JSON.stringify({ mode, channel_id: channel.id, room_name: channel.name, action, q, user: person }),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "The Music + Watch bot is offline or unreachable.",
      },
      { status: 502 },
    );
  }
}
