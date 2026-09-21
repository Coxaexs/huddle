import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const b = bindings();
    if (b.DB) {
      await ensureSchema(b.DB);
      // Quick query to confirm DB readiness
      await b.DB.prepare("SELECT 1").first();
    }

    return Response.json(
      {
        status: "ok",
        uptime: typeof process !== "undefined" ? Math.floor(process.uptime?.() || 0) : 0,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        status: "degraded",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
