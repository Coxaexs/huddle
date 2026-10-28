import { calendarEventsFor, calendarOwner } from "@/lib/calendar";
import { buildIcs } from "@/lib/ics";
import { checkMemoryRateLimit } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Calendar apps refresh hourly; this keeps a misbehaving one from hammering. */
const FEED_LIMIT = { action: "calendar-feed", limit: 30, windowSeconds: 60 };

/** `/api/events/calendar/{token}.ics`: the iCalendar feed calendar apps subscribe to. */
export async function GET(request: Request, props: { params: Promise<{ file: string }> }) {
  const db = bindings().DB;
  if (!db) return new Response("Storage is not connected.", { status: 503 });
  await ensureSchema(db);
  const { file } = await props.params;
  const token = file.replace(/\.ics$/i, "");
  if (!checkMemoryRateLimit(FEED_LIMIT, token).allowed) return new Response("Slow down.", { status: 429 });
  const userId = await calendarOwner(db, token);
  if (!userId) return new Response("This calendar link was reset or never existed.", { status: 404 });
  // The worker only sees plain http; PUBLIC_URL or the proxy's headers say where people reach it.
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  const origin = (bindings().PUBLIC_URL?.trim() || `${proto}://${host}`).replace(/\/+$/, "");
  const ics = buildIcs(await calendarEventsFor(db, userId, origin), { name: "Hoffle events" });
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="hoffle.ics"',
      "cache-control": "private, max-age=300",
    },
  });
}
