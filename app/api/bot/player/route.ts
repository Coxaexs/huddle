import { playerCommand, playerState } from "@/lib/hub-client";
import { resolveTrack } from "@/lib/music";
import type { PlayerAction } from "@/lib/protocol";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const token = bindings().BOT_TOKEN;
  return Boolean(
    token && request.headers.get("authorization") === `Bearer ${token}`,
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const channelId = new URL(request.url).searchParams.get("channelId") || "";
  if (!channelId) {
    return Response.json({ error: "Which voice channel?" }, { status: 400 });
  }
  return Response.json({ state: await playerState(channelId) });
}

/**
 * Drives a Huddle voice room's player from outside the browser — this is what
 * the music bot dashboard calls when you press play on a Huddle room.
 */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    action?: PlayerAction;
    query?: string;
    requestedBy?: string;
  };
  const channelId = body.channelId || "";
  const channel = await findChannel(db, channelId);
  if (!channel || channel.kind !== "voice") {
    return Response.json(
      { error: "That is not a Huddle voice channel." },
      { status: 404 },
    );
  }

  // `query` is the convenience form: resolve it, then play or queue it.
  if (body.query) {
    const track = await resolveTrack(
      body.query,
      body.requestedBy || "Music dashboard",
    ).catch((error: Error) => error);
    if (track instanceof Error) {
      return Response.json({ error: track.message }, { status: 502 });
    }
    return Response.json({
      state: await playerCommand(channelId, { name: "play", track }),
    });
  }

  if (!body.action) {
    return Response.json({ error: "No action given." }, { status: 400 });
  }
  return Response.json({
    state: await playerCommand(channelId, body.action),
  });
}
