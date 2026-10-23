import { buildId } from "@/lib/build-id";

export const dynamic = "force-dynamic";

/**
 * The build this server runs. Open pages compare it with their own and offer
 * a reload when they differ (components/update-banner.tsx), so a fix reaches
 * a window that was left open, including the desktop apps' windows.
 */
export async function GET() {
  return Response.json({ build: buildId }, { headers: { "cache-control": "no-store" } });
}
