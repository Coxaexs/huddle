import { currentUser, unauthorized, userColumns, type User } from "@/lib/auth";
import { bindings } from "@/lib/storage";
import { findChannel, isServerMember } from "@/lib/servers";
import { isDmMember } from "@/lib/dms";
import { DM_SERVER_ID } from "@/lib/schema";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { timeoutInChannel } from "@/lib/timeouts";
import { getSecondScreenState, hubState, manageSecondScreenPair, watchLiveKit } from "@/lib/hub-client";
import { SECOND_SCREEN_PREFIX } from "@/lib/second-screen";
import { LIVEKIT_TOKEN_TTL_MS } from "@/lib/livekit-sweep";
import { liveKitClients, permitInLiveKit } from "@/lib/livekit-admin";
import { can, hasPermission, Permission } from "@/lib/permissions";
import { channelOverwritePermissions, mayView } from "@/lib/channel-permissions";
import { authenticateBot, isBridgeBot } from "@/lib/bot-auth";

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
  const livekitUrlNl = b.LIVEKIT_URL?.trim();
  const livekitUrlDe = b.LIVEKIT_URL_DE?.trim() || "wss://livekit-de.hoffle.online";
  const apiKey = b.LIVEKIT_API_KEY?.trim();
  const apiSecret = b.LIVEKIT_API_SECRET?.trim();

  if ((!livekitUrlNl && !livekitUrlDe) || !apiKey || !apiSecret) {
    return Response.json({
      enabled: false,
      reason: "LiveKit SFU is not configured on this instance.",
    });
  }

  let user = await currentUser(request);
  const recorder = Boolean(
    b.RECORDER_SERVICE_TOKEN &&
      request.headers.get("authorization") ===
        `Bearer ${b.RECORDER_SERVICE_TOKEN}`,
  );

  const { searchParams } = new URL(request.url);
  const watchOnly = searchParams.get("watchOnly") === "1";
  const pairToken = searchParams.get("pair")?.trim() || "";
  const channelId = searchParams.get("channelId")?.trim();

  if (!user && !recorder && watchOnly && pairToken) {
    if (!channelId) {
      return Response.json({ error: "Missing channelId parameter" }, { status: 400 });
    }
    const resolved = await manageSecondScreenPair({ action: "resolve", token: pairToken });
    if (!resolved?.userId) return unauthorized();
    const [s2State, hub] = await Promise.all([
      getSecondScreenState(resolved.userId),
      hubState().catch(() => null),
    ]);
    const seated = (hub?.voice[channelId] || []).some(
      (seat) => !seat.bot && seat.id === resolved.userId,
    );
    if (!seated || s2State.voiceChannelId !== channelId) {
      return Response.json(
        { error: "Owner is not currently sharing that voice room to 2nd Screen." },
        { status: 403 },
      );
    }
    const owner = b.DB
      ? await b.DB.prepare(`SELECT ${userColumns()} FROM users WHERE id = ? LIMIT 1`)
          .bind(resolved.userId)
          .first<User>()
      : null;
    if (!owner || owner.suspended_at) return unauthorized();
    user = owner;
  }

  if (!user && !recorder) {
    // The Discord bridge, for one of its Discord people's seats.
    const bot = await authenticateBot(request).catch(() => null);
    if (!isBridgeBot(bot)) return unauthorized();
    return bridgeSeatToken(request, { livekitUrlNl, livekitUrlDe, apiKey, apiSecret });
  }
  if (!channelId) {
    return Response.json(
      { error: "Missing channelId parameter" },
      { status: 400 },
    );
  }

  // The hub's connection id for this tab, which is how every other client
  // knows this seat. It goes into the identity after the authenticated user,
  // so a client can only ever claim connections as itself — receivers check
  // the user half against the hub's roster before trusting the rest.
  const connectionId = searchParams.get("connectionId")?.trim() || "";
  if (connectionId && !/^[A-Za-z0-9_-]{1,64}$/.test(connectionId)) {
    return Response.json({ error: "Invalid connectionId" }, { status: 400 });
  }

  let channel: Awaited<ReturnType<typeof findChannel>> = null;
  /** This member's permissions in the room, or null when it has no overwrites. */
  let here: number | null = null;
  const db = b.DB;
  if (db && !recorder) {
    channel = await findChannel(db, channelId);
    // A room name is just a string to LiveKit, so an unknown one would mint a
    // private room for anyone who asked.
    if (!channel) {
      return Response.json({ error: "No such channel." }, { status: 404 });
    }
    // A DM or group call: the people in that conversation, nobody else.
    if (channel.server_id === DM_SERVER_ID) {
      if (!(await isDmMember(db, channelId, user!.id))) {
        return Response.json(
          { error: "You are not in this conversation." },
          { status: 403 },
        );
      }
    } else if (channel.server_id) {
      const isMember = await isServerMember(db, channel.server_id, user!.id);
      if (!isMember) {
        return Response.json(
          { error: "You are not a member of this server." },
          { status: 403 },
        );
      }
      here = await channelOverwritePermissions(db, user!.id, channelId, channel.server_id);
      if (here !== null && !mayView(here)) {
        return Response.json({ error: "No such channel." }, { status: 404 });
      }
      if (here !== null && !hasPermission(here, Permission.CONNECT)) {
        return Response.json({ error: "You can't join this voice channel." }, { status: 403 });
      }
    }
  }

  // Determine RTC region (Discord-style: explicit switch, channel setting, or auto)
  let targetRegion: "nl" | "de" = "nl";
  const explicitRegion = searchParams.get("region")?.trim();

  if (explicitRegion === "de" || explicitRegion === "nl") {
    targetRegion = explicitRegion;
  } else if (channel && channel.rtc_region === "de") {
    targetRegion = "de";
  } else if (channel && channel.rtc_region === "nl") {
    targetRegion = "nl";
  } else {
    // Auto-selection: check active participants in channel
    const state = await hubState().catch(() => null);
    const activeSeats = (state?.voice[channelId] || []).filter((p) => !p.bot);
    // If the room has 40 or more participants, route to Germany!
    if (activeSeats.length >= 40) {
      targetRegion = "de";
    } else {
      targetRegion = "nl";
    }
  }

  // Ensure graceful fallback if one region's URL is missing
  let livekitUrl = "";
  let effectiveRegion: "nl" | "de" = targetRegion;
  if (targetRegion === "de" && livekitUrlDe) {
    livekitUrl = livekitUrlDe;
  } else if (targetRegion === "nl" && livekitUrlNl) {
    livekitUrl = livekitUrlNl;
  } else {
    livekitUrl = livekitUrlNl || livekitUrlDe || "";
    effectiveRegion = livekitUrlNl ? "nl" : "de";
  }

  // A timed-out member may listen but not speak or share.
  const timedOut = db && user ? await timeoutInChannel(db, channelId, user.id) : null;
  // LiveKit itself refuses audio from anyone who may not be heard: a stage's
  // audience and anyone server-muted. The hub and every receiver enforce this
  // too; this makes a modified client unable to even send. Someone brought on
  // stage (or unmuted) fetches a fresh token and reconnects.
  const silenced = db && user ? await mayNotBeHeard(db, channelId, user.id, connectionId) : false;

  const base = user ? user.id : "recorder";
  const effectiveConnectionId = watchOnly
    ? `${SECOND_SCREEN_PREFIX}${(connectionId || crypto.randomUUID().slice(0, 12)).replace(/^screen_/, "").slice(0, 48)}`
    : connectionId;
  const identity = effectiveConnectionId ? `${base}|${effectiveConnectionId}` : base;
  const name = user ? user.display_name || user.username : "Session Recorder";

  // Short-lived: LiveKit checks the token only on connect (and refreshes it
  // for whoever stays connected), so a long one let a kicked or banned member
  // walk back in on it for a day. The hub removes anyone without a seat.
  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: LIVEKIT_TOKEN_TTL_MS / 1000,
  });

  // Channel permissions: no SPEAK is a listen-only seat; no VIDEO keeps it to the microphone.
  const mayNotSpeak = here !== null && !hasPermission(here, Permission.SPEAK);
  const mayNotShowVideo = here !== null && !hasPermission(here, Permission.VIDEO);
  const canPublish = watchOnly ? false : (!timedOut && !silenced && !mayNotSpeak);
  const canPublishSources = mayNotShowVideo ? [TrackSource.MICROPHONE] : [];
  at.addGrant({
    roomJoin: true,
    room: channelId,
    canPublish,
    ...(canPublish && canPublishSources.length ? { canPublishSources } : {}),
    canSubscribe: true,
    canPublishData: watchOnly ? false : !timedOut,
  });

  const token = await at.toJwt();
  if (!recorder) await watchLiveKit();

  // Brought on stage or server-unmuted while connected: hand the connection
  // it already has exactly what this token grants, so it need not reconnect.
  // Nothing is granted here that the token would not grant on a reconnect.
  const restored =
    !watchOnly && searchParams.get("restore") === "1" && user && connectionId && canPublish
      ? await permitInLiveKit(liveKitClients(b), channelId, identity, {
          canPublish: true,
          canPublishSources,
          canSubscribe: true,
          canPublishData: true,
        })
      : false;

  return Response.json({
    enabled: true,
    url: livekitUrl,
    region: effectiveRegion,
    token,
    identity,
    room: channelId,
    ...(restored ? { restored: true } : {}),
  });
}

/**
 * A token for a Discord person's seat. The seat must already exist in the
 * hub, in this room, as a Discord seat: the identity is that seat's user and
 * connection, so receivers match it to the roster like anyone's. It can only
 * ever publish a microphone, and nothing while the seat may not be heard.
 */
async function bridgeSeatToken(
  request: Request,
  lk: { livekitUrlNl?: string; livekitUrlDe: string; apiKey: string; apiSecret: string },
): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId")?.trim() || "";
  const connectionId = searchParams.get("connectionId")?.trim() || "";
  if (!channelId || !/^[A-Za-z0-9_-]{1,64}$/.test(connectionId)) {
    return Response.json({ error: "channelId and connectionId are required" }, { status: 400 });
  }
  const state = await hubState().catch(() => null);
  const seats = state?.voice[channelId] || [];
  const seat = seats.find((person) => person.connectionId === connectionId && person.discord === true);
  if (!seat) return Response.json({ error: "No such Discord seat in that room." }, { status: 403 });

  // The same choice a member joining now would get (no explicit switch).
  const db = bindings().DB;
  const channel = db ? await findChannel(db, channelId) : null;
  const wanted: "nl" | "de" =
    channel?.rtc_region === "de" || channel?.rtc_region === "nl"
      ? channel.rtc_region
      : seats.filter((person) => !person.bot).length >= 40
        ? "de"
        : "nl";
  const region: "nl" | "de" = wanted === "de" || !lk.livekitUrlNl ? "de" : "nl";
  const url = region === "de" ? lk.livekitUrlDe : lk.livekitUrlNl!;

  // A linked person's seat is their account: a timeout here silences it as it
  // would their own tab (a Discord stand-in has no Hoffle account to time out).
  const timedOut =
    db && !seat.id.startsWith("discord:") ? await timeoutInChannel(db, channelId, seat.id) : null;

  const identity = `${seat.id}|${connectionId}`;
  const at = new AccessToken(lk.apiKey, lk.apiSecret, {
    identity,
    name: seat.displayName,
    ttl: LIVEKIT_TOKEN_TTL_MS / 1000,
  });
  at.addGrant({
    roomJoin: true,
    room: channelId,
    canPublish: !timedOut && !seat.serverMuted && seat.speakAllowed !== false,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
  });
  const token = await at.toJwt();
  await watchLiveKit();
  return Response.json({ enabled: true, url, region, token, identity, room: channelId });
}

/** True when this seat should not be able to send audio or video at all. */
async function mayNotBeHeard(
  db: D1Database,
  channelId: string,
  userId: string,
  connectionId: string,
): Promise<boolean> {
  const muted = await db
    .prepare("SELECT 1 FROM server_mutes WHERE target_id = ?")
    .bind(userId)
    .first()
    .catch(() => null);
  if (muted) return true;
  const channel = await findChannel(db, channelId);
  if (channel?.kind !== "stage") return false;
  // The hub's seat is the truth once it exists (a host may have brought this
  // person up); before the join lands, the member's SPEAK permission decides,
  // exactly as the hub will.
  const state = await hubState();
  const seat = state?.voice[channelId]?.find((person) => person.connectionId === connectionId);
  if (seat && typeof seat.speakAllowed === "boolean") return !seat.speakAllowed;
  return !(await can(db, userId, channel.server_id, Permission.SPEAK).catch(() => false));
}
