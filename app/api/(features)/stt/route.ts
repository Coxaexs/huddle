import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Whether the server can caption with Duyu (live speech-to-text). The stream
 * itself is relayed by the worker at /api/stt/stream (worker/index.ts), since
 * a 101 cannot leave through the framework.
 */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  return Response.json({ configured: Boolean(bindings().SPEECH_API_KEY?.trim()) });
}
