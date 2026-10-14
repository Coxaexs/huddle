import { currentUser, unauthorized } from "@/lib/auth";
import { BIG_UPLOAD_LIFETIME_MS, BIG_UPLOAD_MAX_BYTES, BIG_UPLOAD_PART_BYTES } from "@/lib/big-upload-key";
import {
  abortBigUpload,
  canUploadBig,
  completeBigUpload,
  putBigUploadPart,
  startBigUpload,
} from "@/lib/big-uploads";
import { publishEventsChanged } from "@/lib/hub-client";
import { limitUser, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Big temporary files (lib/big-uploads.ts), for people an admin picked:
 *   GET                         whether you may, and the limits
 *   POST {action:"start"}       name + size → key, uploadId, part size
 *   PUT  ?key=&part=N           one part as the raw body
 *   POST {action:"complete"}    key + parts[{partNumber, etag}]
 *   POST {action:"abort"}       key
 */
async function context(request: Request) {
  const db = bindings().DB;
  const bucket = bindings().BIG_UPLOADS;
  if (!db || !bucket) {
    return { response: Response.json({ error: "Big-file storage is not connected." }, { status: 503 }) };
  }
  const user = await currentUser(request);
  if (!user) return { response: unauthorized() };
  await ensureSchema(db);
  return { db, bucket, user };
}

function reply<T extends object>(result: T | { error: string; status: number }, status = 200) {
  if ("error" in result && "status" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result, { status });
}

export async function GET(request: Request) {
  const ctx = await context(request);
  if ("response" in ctx) return ctx.response;
  return Response.json({
    allowed: await canUploadBig(ctx.db, ctx.user),
    maxBytes: BIG_UPLOAD_MAX_BYTES,
    partBytes: BIG_UPLOAD_PART_BYTES,
    lifetimeMs: BIG_UPLOAD_LIFETIME_MS,
  });
}

export async function POST(request: Request) {
  const ctx = await context(request);
  if ("response" in ctx) return ctx.response;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    key?: string;
    name?: unknown;
    size?: unknown;
    parts?: unknown;
  };
  const key = typeof body.key === "string" ? body.key.slice(0, 240) : "";
  if (body.action === "start") {
    const limited = await limitUser(ctx.db, WRITE_RATE_LIMITS.upload, ctx.user.id);
    if (limited) return limited;
    const result = await startBigUpload(ctx.db, ctx.bucket, ctx.user, body);
    // The hub's alarm deletes it once its 12 hours are up.
    if (!("error" in result)) await publishEventsChanged();
    return reply(result, 201);
  }
  if (body.action === "complete") {
    return reply(await completeBigUpload(ctx.db, ctx.bucket, ctx.user, key, body.parts));
  }
  if (body.action === "abort") {
    return reply(await abortBigUpload(ctx.db, ctx.bucket, ctx.user, key));
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}

export async function PUT(request: Request) {
  const ctx = await context(request);
  if ("response" in ctx) return ctx.response;
  const params = new URL(request.url).searchParams;
  const key = (params.get("key") || "").slice(0, 240);
  const part = Number(params.get("part"));
  const declared = Number(request.headers.get("content-length"));
  if (declared > BIG_UPLOAD_PART_BYTES) {
    return Response.json({ error: "That part is too large." }, { status: 413 });
  }
  const bytes = await request.arrayBuffer();
  return reply(await putBigUploadPart(ctx.db, ctx.bucket, ctx.user, key, part, bytes));
}
