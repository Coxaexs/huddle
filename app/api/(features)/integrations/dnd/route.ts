import { dndBaseUrl, dndPublicUrl } from "@/lib/dnd-url";

export const dynamic = "force-dynamic";

/** Health probe for the D&D companion app shown in the sidebar. */
export async function GET() {
  try {
    const primary = await fetch(new URL("/docs", dndBaseUrl()), {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    if (primary.ok) {
      const pub = dndPublicUrl("https://dnd.deeppixel.online")!;
      return Response.json({
        online: true,
        appUrl: new URL("/", pub).toString(),
      });
    }
  } catch {
    // try fallback
  }

  // Fallback to public hosted compendium
  try {
    const fallback = await fetch(new URL("/docs", "https://dnd.deeppixel.online"), {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    if (fallback.ok) {
      return Response.json({
        online: true,
        appUrl: "https://dnd.deeppixel.online/",
      });
    }
  } catch {
    // offline
  }

  return Response.json({ online: false });
}
