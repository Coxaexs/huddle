import { isDownloadPlatform, readDownloadManifest, downloadFilePath, RELEASES_PAGE } from "@/lib/downloads";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * /download/windows, /download/mac-arm64, …: the newest copy of that app on
 * this server (lib/downloads.ts). Until one has been copied in, GitHub.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isDownloadPlatform(platform)) return new Response("Not found", { status: 404 });
  const manifest = await readDownloadManifest(bindings().UPLOADS);
  const file = manifest?.files.find((f) => f.platform === platform);
  const location = file ? downloadFilePath(file) : RELEASES_PAGE;
  return new Response(null, {
    status: 302,
    // Relative, so it keeps https: the worker itself only sees plain http.
    headers: { Location: location, "Cache-Control": "public, max-age=300" },
  });
}
