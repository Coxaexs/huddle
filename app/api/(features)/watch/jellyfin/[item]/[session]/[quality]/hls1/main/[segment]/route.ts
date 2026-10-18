import { currentUser, unauthorized } from "@/lib/auth";
import { proxyConversion } from "@/lib/jellyfin-proxy";

export const dynamic = "force-dynamic";

/** A watch party's shared Jellyfin conversion: one segment (see lib/jellyfin-proxy.ts). */
export async function GET(
  request: Request,
  context: { params: Promise<{ item: string; session: string; quality: string; segment: string }> },
) {
  if (!(await currentUser(request))) return unauthorized();
  const { item, session, quality, segment } = await context.params;
  return proxyConversion({ item, session, quality, file: `hls1/main/${segment}` }, new URL(request.url).searchParams);
}
