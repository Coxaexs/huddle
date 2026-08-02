import { currentUser, unauthorized } from "@/lib/auth";
import { livekitConfig, livekitToken } from "@/lib/livekit";

export const dynamic = "force-dynamic";

/**
 * Hands a browser the LiveKit WebSocket URL + a signed access token so it can
 * join the SFU room for a voice channel.
 *
 * Edge-to-edge safety: when the SFU is not configured this returns
 * `{ configured: false }` and the client simply keeps using the mesh, so this
 * endpoint can ship to production without deploying an SFU.
 */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  if (!livekitConfig()) {
    return Response.json({ configured: false });
  }

  const room = new URL(request.url).searchParams.get("room");
  if (!room) {
    return Response.json({ error: "missing room" }, { status: 400 });
  }

  const join = await livekitToken({
    identity: user.id,
    name: user.display_name || user.username,
    room,
  });
  if (!join) {
    return Response.json({ configured: false });
  }

  return Response.json({ configured: true, ...join });
}
