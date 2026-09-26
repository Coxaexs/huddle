import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  // Health checks must never be cached: a cached 200 would hide an outage from
  // whatever is polling this.
  const headers = { "cache-control": "no-store" };

  try {
    const b = bindings();
    // Per-dependency status lets a status page say *what* is down. Only
    // up/down/missing and a latency are exposed, never error text.
    const checks: Record<string, { status: "ok" | "missing"; ms?: number }> = {};
    if (b.DB) {
      const started = Date.now();
      await ensureSchema(b.DB);
      // Quick query to confirm DB readiness
      await b.DB.prepare("SELECT 1").first();
      checks.database = { status: "ok", ms: Date.now() - started };
    } else {
      checks.database = { status: "missing" };
    }
    checks.storage = { status: b.UPLOADS ? "ok" : "missing" };

    return Response.json(
      {
        status: "ok",
        checks,
        uptime: typeof process !== "undefined" ? Math.floor(process.uptime?.() || 0) : 0,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers },
    );
  } catch (error) {
    // This endpoint is unauthenticated, and a driver error can name tables,
    // columns or on-disk paths. Log it for the operator who runs the server
    // instead of returning it to whoever asked.
    console.error("health check failed:", error);
    return Response.json(
      { status: "degraded", timestamp: new Date().toISOString() },
      { status: 503, headers },
    );
  }
}
