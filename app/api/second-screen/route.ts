import { currentUser, unauthorized, userColumns, type User } from "@/lib/auth";
import { channelAccess } from "@/lib/access";
import { listDms } from "@/lib/dms";
import {
  getSecondScreenState,
  hubState,
  manageSecondScreenPair,
  updateSecondScreenState,
} from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function publicOrigin(request: Request): string {
  const configured = bindings().PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${proto}://${host}`.replace(/\/+$/, "");
}

async function loadUserById(db: D1Database, userId: string): Promise<User | null> {
  return db
    .prepare(`SELECT ${userColumns()} FROM users WHERE id = ? LIMIT 1`)
    .bind(userId)
    .first<User>();
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (db) await ensureSchema(db);

  const user = await currentUser(request);
  const pairToken = new URL(request.url).searchParams.get("pair")?.trim() || "";

  // Paired read-only device mode (when not logged in to Hoffle)
  if (!user) {
    if (!pairToken) return unauthorized();
    const resolved = await manageSecondScreenPair({ action: "resolve", token: pairToken });
    if (!resolved?.userId) {
      return Response.json(
        { error: "This 2nd Screen pairing link has expired or been revoked." },
        { status: 401 },
      );
    }
    const ownerId = resolved.userId;
    const owner = db ? await loadUserById(db, ownerId) : null;
    if (!owner || owner.suspended_at) return unauthorized();

    const [state, hub] = await Promise.all([
      getSecondScreenState(ownerId),
      hubState().catch(() => null),
    ]);

    let activeChannelName: string | null = null;
    if (db && state.channelId) {
      const access = await channelAccess(db, state.channelId, owner);
      if (access.ok) activeChannelName = access.channel.name;
    }

    let activeVoiceChannelName: string | null = null;
    let ownerSeatedInVoice = false;
    let activeVoiceParticipants: Array<{
      id: string;
      connectionId: string;
      displayName: string;
      screenStreamId?: string | null;
      cameraStreamId?: string | null;
    }> = [];

    if (state.voiceChannelId) {
      const seats = hub?.voice[state.voiceChannelId] || [];
      ownerSeatedInVoice = seats.some((seat) => !seat.bot && seat.id === ownerId);
      if (db) {
        const access = await channelAccess(db, state.voiceChannelId, owner);
        if (access.ok) activeVoiceChannelName = access.channel.name;
      }
      if (ownerSeatedInVoice) {
        activeVoiceParticipants = seats.map((s) => ({
          id: s.id,
          connectionId: s.connectionId,
          displayName: s.displayName,
          screenStreamId: s.screenStreamId ?? null,
          cameraStreamId: s.cameraStreamId ?? null,
        }));
      }
    }

    return Response.json({
      state,
      pairedReadOnly: true,
      ownerName: owner.display_name || owner.username,
      activeChannelName,
      activeVoiceChannelName,
      ownerSeatedInVoice,
      activeVoiceParticipants,
    });
  }

  // Signed-in mode: full interactive access
  const [state, hub, servers, dms] = await Promise.all([
    getSecondScreenState(user.id),
    hubState().catch(() => null),
    db ? listServers(db, user.id) : Promise.resolve([]),
    db ? listDms(db, user.id) : Promise.resolve([]),
  ]);

  const textChannels: Array<{
    id: string;
    name: string;
    group: string;
    kind: string;
  }> = [];
  const voiceChannels: Array<{
    id: string;
    name: string;
    group: string;
    participants: number;
    hasScreenShare: boolean;
    selfSeated: boolean;
  }> = [];

  for (const server of servers) {
    for (const ch of server.channels || []) {
      if (ch.kind === "voice" || ch.kind === "stage") {
        const seats = hub?.voice[ch.id] || [];
        voiceChannels.push({
          id: ch.id,
          name: ch.name,
          group: server.name,
          participants: seats.filter((s) => !s.bot).length,
          hasScreenShare: seats.some((s) => Boolean(s.screenStreamId)),
          selfSeated: seats.some((s) => !s.bot && s.id === user.id),
        });
      } else {
        textChannels.push({
          id: ch.id,
          name: ch.name,
          group: server.name,
          kind: ch.kind,
        });
      }
    }
  }

  for (const dm of dms) {
    if (dm.hidden) continue;
    const label = dm.group
      ? dm.group.name || dm.group.members.map((m) => m.displayName).join(", ")
      : dm.user.displayName || dm.user.username;
    textChannels.push({
      id: dm.channelId,
      name: label,
      group: "Direct Messages",
      kind: "dm",
    });
    const seats = hub?.voice[dm.channelId] || [];
    if (seats.length > 0) {
      voiceChannels.push({
        id: dm.channelId,
        name: `Call: ${label}`,
        group: "Direct Messages",
        participants: seats.filter((s) => !s.bot).length,
        hasScreenShare: seats.some((s) => Boolean(s.screenStreamId)),
        selfSeated: seats.some((s) => !s.bot && s.id === user.id),
      });
    }
  }

  const mySeatedVoice = voiceChannels.find((v) => v.selfSeated) || null;
  const effectiveVoiceId = state.voiceChannelId || mySeatedVoice?.id || null;
  const activeSeats = effectiveVoiceId ? hub?.voice[effectiveVoiceId] || [] : [];
  const ownerSeatedInVoice = activeSeats.some((s) => !s.bot && s.id === user.id);

  return Response.json({
    state,
    pairedReadOnly: false,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
    },
    textChannels,
    voiceChannels,
    mySeatedVoiceId: mySeatedVoice?.id || null,
    ownerSeatedInVoice,
    activeVoiceParticipants: activeSeats.map((s) => ({
      id: s.id,
      connectionId: s.connectionId,
      displayName: s.displayName,
      screenStreamId: s.screenStreamId ?? null,
      cameraStreamId: s.cameraStreamId ?? null,
    })),
    dndPublicUrl:
      bindings().DND_PUBLIC_URL?.trim() || "https://dnd.deeppixel.online",
  });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    action?: "update" | "pair" | "rotate-pair" | "revoke-pair";
    patch?: Record<string, unknown>;
  };

  const action = body.action || "update";

  if (action === "pair" || action === "rotate-pair") {
    const res = await manageSecondScreenPair({
      action: action === "rotate-pair" ? "rotate" : "get",
      userId: user.id,
    });
    if (!res?.token) {
      return Response.json(
        { error: "Could not create a 2nd Screen pairing link." },
        { status: 503 },
      );
    }
    const origin = publicOrigin(request);
    return Response.json({
      token: res.token,
      expiresAt: res.expiresAt,
      url: `${origin}/hangout/screen?pair=${encodeURIComponent(res.token)}`,
      signedInUrl: `${origin}/hangout/screen`,
    });
  }

  if (action === "revoke-pair") {
    await manageSecondScreenPair({ action: "revoke", userId: user.id });
    return Response.json({ ok: true });
  }

  const state = await updateSecondScreenState(user.id, body.patch || {});
  return Response.json({ state });
}
