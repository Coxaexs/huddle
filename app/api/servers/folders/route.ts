import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import type { ServerFolder } from "@/lib/server-folders";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_FOLDERS = 50;

/** Cleans a client-sent folder list: well-formed, no server in two folders. */
function sanitizeFolders(raw: unknown): ServerFolder[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const folders: ServerFolder[] = [];
  for (const item of raw.slice(0, MAX_FOLDERS)) {
    if (!item || typeof item !== "object") continue;
    const folder = item as Record<string, unknown>;
    if (typeof folder.id !== "string" || !folder.id) continue;
    const serverIds = (Array.isArray(folder.serverIds) ? folder.serverIds : [])
      .filter((id): id is string => typeof id === "string" && !!id && !seen.has(id))
      .slice(0, 200);
    serverIds.forEach((id) => seen.add(id));
    if (!serverIds.length) continue;
    folders.push({
      id: folder.id.slice(0, 64),
      name: typeof folder.name === "string" ? folder.name.trim().slice(0, 40) : "",
      color:
        typeof folder.color === "string" && /^#[0-9a-f]{6}$/i.test(folder.color)
          ? folder.color
          : "#5865f2",
      serverIds,
    });
  }
  return folders;
}

/** Your server folders. Kept on the account so they follow you across devices. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ folders: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const row = await db
    .prepare("SELECT folders FROM server_folders WHERE user_id = ?")
    .bind(user.id)
    .first<{ folders: string }>();
  let folders: ServerFolder[] = [];
  try {
    folders = sanitizeFolders(row ? JSON.parse(row.folders) : []);
  } catch {
    folders = [];
  }
  return Response.json({ folders });
}

export async function PUT(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { folders?: unknown };
  const folders = sanitizeFolders(body.folders);
  await db
    .prepare(
      `INSERT INTO server_folders (user_id, folders, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET folders = excluded.folders, updated_at = excluded.updated_at`,
    )
    .bind(user.id, JSON.stringify(folders), new Date().toISOString())
    .run();
  return Response.json({ folders });
}
