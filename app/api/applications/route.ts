import {
  cleanApplicationName,
  hashAppToken,
  MAX_APPLICATIONS_PER_USER,
  mintAppToken,
  publicApplication,
  type ApplicationRow,
} from "@/lib/applications";
import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import { limitUser } from "@/lib/rate-limit";
import { backfillMusicApplication, ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const CREATE_LIMIT = { action: "application-create", limit: 10, windowSeconds: 3600 };

/** GET: the bots you made in the Developer Portal. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  // A new Hoffle has no owner when it first starts, so this can be the first chance.
  if (isInstanceAdmin(user)) await backfillMusicApplication(db);

  const { results } = await db
    .prepare("SELECT * FROM applications WHERE owner_id = ? ORDER BY created_at")
    .bind(user.id)
    .all<ApplicationRow>();
  return Response.json({
    applications: await Promise.all((results || []).map((app) => publicApplication(db, app))),
  });
}

/** POST { name }: makes a bot. Its token is shown once, here. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  if (user.signup_source === "guest") {
    return Response.json({ error: "Make a full account to create bots." }, { status: 403 });
  }
  const limited = await limitUser(db, CREATE_LIMIT, user.id);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = cleanApplicationName(body.name, isInstanceAdmin(user));
  if (typeof name !== "string") return Response.json(name, { status: 400 });

  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM applications WHERE owner_id = ?")
    .bind(user.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_APPLICATIONS_PER_USER) {
    return Response.json({ error: `You can have ${MAX_APPLICATIONS_PER_USER} bots at most.` }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const token = mintAppToken();
  await db
    .prepare(
      `INSERT INTO applications (id, owner_id, name, token_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, user.id, name, await hashAppToken(token), new Date().toISOString())
    .run();
  const app = await db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first<ApplicationRow>();
  return Response.json({ application: await publicApplication(db, app!), token }, { status: 201 });
}
