import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const DEFAULT_ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * ICE servers for voice. Set HUDDLE_ICE_SERVERS to a JSON array to add a TURN
 * server — friends behind strict NATs need one to connect at all.
 */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const configured = bindings().HUDDLE_ICE_SERVERS?.trim();
  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      if (Array.isArray(parsed) && parsed.length) {
        return Response.json({ iceServers: parsed });
      }
    } catch {
      // Fall through to the defaults rather than breaking voice entirely.
    }
  }
  return Response.json({ iceServers: DEFAULT_ICE });
}
