import { currentUser, unauthorized } from "@/lib/auth";
import { isRequestHandler, listRequests, submitRequest } from "@/lib/requests";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ requests: [], isHandler: false });
  }

  const user = await currentUser(request);
  if (!user) return unauthorized();

  await ensureSchema(db);

  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "true";
  const status = url.searchParams.get("status") || "all";

  const handler = isRequestHandler(user);
  const requests = await listRequests(db, user, { all, status });

  return Response.json({
    requests,
    isHandler: handler,
  });
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Database storage is not connected." },
      { status: 503 },
    );
  }

  const user = await currentUser(request);
  if (!user) return unauthorized();

  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    category?: string;
    details?: string;
  };

  const title = (body.title || "").trim();
  const details = (body.details || "").trim();
  const category = (body.category || "feature").trim();

  if (!title) {
    return Response.json(
      { error: "Please enter a title for your request." },
      { status: 400 },
    );
  }
  if (!details) {
    return Response.json(
      { error: "Please enter details for your request." },
      { status: 400 },
    );
  }

  try {
    const result = await submitRequest(
      db,
      {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar,
        color: user.color,
      },
      { title, category, details },
    );

    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit request.";
    return Response.json({ error: message }, { status: 400 });
  }
}
