import { currentUser } from "@/lib/auth";
import { loadInvitePreview } from "@/lib/invite-preview";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ valid: false, error: "Database not connected" }, { status: 503 });
  }
  await ensureSchema(db);

  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase();
  if (!code) {
    return Response.json({ valid: false, error: "Invite code is required." }, { status: 400 });
  }

  const preview = await loadInvitePreview(db, code);
  if (!preview) {
    return Response.json({
      valid: false,
      code,
      error: "This invite may be invalid or expired.",
    });
  }

  const user = await currentUser(request);
  const isMember = Boolean(user && preview.server && (await isServerMember(db, preview.server.id, user.id)));

  return Response.json({
    valid: true,
    code: preview.code,
    server: preview.server
      ? {
          id: preview.server.id,
          name: preview.server.name,
          icon: preview.server.icon,
          color: preview.server.color,
          bannerUrl: preview.server.bannerUrl,
          memberCount: preview.server.memberCount,
          onlineCount: preview.server.onlineCount,
        }
      : null,
    inviter: preview.inviter,
    isMember,
  });
}
