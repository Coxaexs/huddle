import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function dndBaseUrl(): URL {
  const configured =
    bindings().DND_BASE_URL?.trim() || "https://dnd.deeppixel.online";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported D&D server URL.");
  }
  return url;
}

function dndPublicUrl(): URL {
  const configured =
    bindings().DND_PUBLIC_URL?.trim() || "https://dnd.deeppixel.online";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported public D&D URL.");
  }
  return url;
}

/** Health probe for the D&D companion app shown in the sidebar. */
export async function GET() {
  try {
    const response = await fetch(new URL("/docs", dndBaseUrl()), {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return Response.json({
      online: response.ok,
      appUrl: new URL("/", dndPublicUrl()).toString(),
    });
  } catch {
    return Response.json({ online: false });
  }
}
