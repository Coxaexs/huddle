import { adminVoiceRooms, setVoiceRegion, VOICE_REGIONS, type VoiceRegion } from "@/lib/admin-tools";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/** Every voice room and which LiveKit server it uses. */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  return Response.json({ rooms: await adminVoiceRooms(gate.db), regions: VOICE_REGIONS });
}

/** `{ channelId, region: "auto" | "nl" | "de" }` */
export async function PATCH(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const body = (await request.json().catch(() => ({}))) as { channelId?: unknown; region?: unknown };
  if (typeof body.channelId !== "string" || typeof body.region !== "string" || !Object.hasOwn(VOICE_REGIONS, body.region)) {
    return Response.json({ error: "Pick a voice room and a server." }, { status: 400 });
  }
  const ok = await setVoiceRegion(gate.db, body.channelId, body.region as VoiceRegion, gate.user);
  if (!ok) return Response.json({ error: "No such voice room." }, { status: 404 });
  return Response.json({ rooms: await adminVoiceRooms(gate.db) });
}
