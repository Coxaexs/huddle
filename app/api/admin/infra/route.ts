import { agentStatus } from "@/lib/ops-agent";
import { getMemoryRateLimitStats } from "@/lib/rate-limit";
import { bindings } from "@/lib/storage";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/**
 * Host status from the ops agent (who is serving, voice, services, backups),
 * plus this process's rate-limit buckets and the music helper's yt-dlp.
 */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { status, body } = await agentStatus();
  const helper = bindings().MUSIC_HELPER_BASE_URL || "http://127.0.0.1:8731";
  const musicHelper = await fetch(`${helper}/status`, { signal: AbortSignal.timeout(3000) })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  return Response.json(
    {
      ...(body && typeof body === "object" ? body : {}),
      rateLimits: getMemoryRateLimitStats(),
      musicHelper,
    },
    { status },
  );
}
