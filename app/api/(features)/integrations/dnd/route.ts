import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function dndBaseUrl(): URL {
  const configured =
    bindings().DND_BASE_URL?.trim() || "http://127.0.0.1:8732";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported D&D server URL.");
  }
  return url;
}

function dndPublicUrl(): URL {
  const configured =
    bindings().DND_PUBLIC_URL?.trim() || bindings().DND_BASE_URL?.trim() || "https://dnd.deeppixel.online";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported public D&D URL.");
  }
  return url;
}

/** Health probe for the D&D companion app shown in the sidebar. */
export async function GET() {
  try {
    const primary = await fetch(new URL("/docs", dndBaseUrl()), {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    if (primary.ok) {
      return Response.json({
        online: true,
        appUrl: new URL("/", dndPublicUrl()).toString(),
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
