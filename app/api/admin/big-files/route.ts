import { adminBigUploads, adminDeleteBigUpload, setBigUploadGrant, sweepBigUploads } from "@/lib/big-uploads";
import { bindings } from "@/lib/storage";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/** Who may send 2 GB files, and the big files alive right now. */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const bucket = bindings().BIG_UPLOADS;
  if (bucket) await sweepBigUploads(gate.db, bucket);
  return Response.json({ ...(await adminBigUploads(gate.db)), connected: Boolean(bucket) });
}

/** `{ userId, allowed }`: let someone send big files, or stop them. */
export async function POST(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const body = (await request.json().catch(() => ({}))) as { userId?: unknown; allowed?: unknown };
  if (typeof body.userId !== "string") return Response.json({ error: "Pick someone." }, { status: 400 });
  const result = await setBigUploadGrant(gate.db, body.userId, body.allowed !== false, gate.user);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(await adminBigUploads(gate.db));
}

/** `{ key }`: delete one big file before its 12 hours are up. */
export async function DELETE(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const bucket = bindings().BIG_UPLOADS;
  if (!bucket) return Response.json({ error: "Big-file storage is not connected." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { key?: unknown };
  if (typeof body.key !== "string") return Response.json({ error: "Pick a file." }, { status: 400 });
  const result = await adminDeleteBigUpload(gate.db, bucket, body.key, gate.user);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(await adminBigUploads(gate.db));
}
