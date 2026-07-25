import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const DEFAULT_ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * ICE servers for voice.
 *
 * Without a TURN server, two people behind carrier-grade NAT negotiate happily
 * and then sit there with black video and silence, because nothing can carry
 * the media. So this reports which configuration it actually used: a silent
 * fallback to plain STUN looks identical to a working setup until someone
 * cannot hear anyone.
 */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const configured = bindings().HUDDLE_ICE_SERVERS?.trim();
  if (!configured) {
    return Response.json({
      iceServers: DEFAULT_ICE,
      source: "default",
      note: "HUDDLE_ICE_SERVERS is not set: no TURN server, so anyone behind a strict NAT will connect but hear nothing.",
    });
  }

  try {
    const parsed = JSON.parse(configured);
    if (Array.isArray(parsed) && parsed.length) {
      return Response.json({ iceServers: parsed, source: "configured" });
    }
    return Response.json({
      iceServers: DEFAULT_ICE,
      source: "default",
      note: "HUDDLE_ICE_SERVERS parsed but was not a non-empty array.",
    });
  } catch (error) {
    console.error("HUDDLE_ICE_SERVERS is not valid JSON", error);
    return Response.json({
      iceServers: DEFAULT_ICE,
      source: "default",
      note: `HUDDLE_ICE_SERVERS is set but is not valid JSON (${configured.length} characters, starts with ${JSON.stringify(configured.slice(0, 12))}).`,
    });
  }
}
