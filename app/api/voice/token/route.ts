import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";
import { findChannel, isServerMember } from "@/lib/servers";
import { AccessToken } from "livekit-server-sdk";
import { timeoutInChannel } from "@/lib/timeouts";

export const dynamic = "force-dynamic";

/**
 * Mint an authenticated LiveKit access token for joining a voice room.
 *
 * If LiveKit credentials are not configured on the server, this responds with
 * `{ enabled: false }`, instructing the client to seamlessly fall back to
 * WebRTC P2P Mesh mode.
 */
export async function GET(request: Request) {
  const b = bindings();
  const livekitUrl = b.LIVEKIT_URL?.trim();
  const apiKey = b.LIVEKIT_API_KEY?.trim();
  const apiSecret = b.LIVEKIT_API_SECRET?.trim();

  if (!livekitUrl || !apiKey || !apiSecret) {
    return Response.json({
      enabled: false,
      reason: "LiveKit SFU is not configured on this instance.",
    });
  }

  const user = await currentUser(request);
  const recorder = Boolean(
    b.RECORDER_SERVICE_TOKEN &&
      request.headers.get("authorization") ===
        `Bearer ${b.RECORDER_SERVICE_TOKEN}`,
  );

  if (!user && !recorder) return unauthorized();

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId")?.trim();
  if (!channelId) {
    return Response.json(
      { error: "Missing channelId parameter" },
      { status: 400 },
    );
  }

  const db = b.DB;
  if (db && !recorder) {
    const channel = await findChannel(db, channelId);
    if (channel?.server_id) {
      const isMember = await isServerMember(db, channel.server_id, user!.id);
      if (!isMember) {
        return Response.json(
          { error: "You are not a member of this server." },
          { status: 403 },
        );
      }
    }
  }

  // A timed-out member may listen but not speak or share.
  const timedOut = db && user ? await timeoutInChannel(db, channelId, user.id) : null;

  const identity = user ? user.id : "recorder";
  const name = user ? user.display_name || user.username : "Session Recorder";

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: "24h",
  });

  at.addGrant({
    roomJoin: true,
    room: channelId,
    canPublish: !timedOut,
    canSubscribe: true,
    canPublishData: !timedOut,
  });

  const token = await at.toJwt();

  return Response.json({
    enabled: true,
    url: livekitUrl,
    token,
    identity,
    room: channelId,
  });
}
