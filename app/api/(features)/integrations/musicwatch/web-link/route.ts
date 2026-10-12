import { currentUser, unauthorized } from "@/lib/auth";
import { botFetch, botSession } from "@/lib/musicbot";
import { can, Permission } from "@/lib/permissions";
import { findChannel, isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function publicBaseUrl(): URL {
  const url = new URL(
    bindings().MUSICWATCH_PUBLIC_URL?.trim() || "https://deeppixel.online",
  );
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported public bot URL.");
  }
  return url;
}

/**
 * Huddle's /web and /dj: a music dashboard (or DJ booth) link that controls
 * one voice room and skips the password, like the Discord bot's /web.
 */
export async function POST(request: Request) {
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
    voiceChannelId?: string;
    page?: string;
  };
  const channel = body.voiceChannelId
    ? await findChannel(db, body.voiceChannelId)
    : null;
  if (
    !channel ||
    channel.kind !== "voice" ||
    !(await isServerMember(db, channel.server_id, user.id)) ||
    !(await can(db, user.id, channel.server_id, Permission.CONNECT))
  ) {
    return Response.json(
      { error: "You can't open that voice room." },
      { status: 403 },
    );
  }

  try {
    const cookie = await botSession();
    const link = await botFetch("/api/admin/huddle-link", cookie, {
      method: "POST",
      body: JSON.stringify({ channel_id: channel.id }),
    });
    if (typeof link.token !== "string" || typeof link.guild_id !== "string") {
      throw new Error("The music bot returned no link.");
    }
    const url = new URL(
      body.page === "dj" ? "/musicbot/dj/" : "/musicbot/",
      publicBaseUrl(),
    );
    url.searchParams.set("guild_id", link.guild_id);
    url.hash = `token=${encodeURIComponent(link.token)}`;
    return Response.json({ url: url.toString() });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The music bot is offline or unreachable.",
      },
      { status: 502 },
    );
  }
}
