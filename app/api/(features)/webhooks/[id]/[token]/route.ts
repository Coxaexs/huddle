import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { handleWebhookRequest, webhookError } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; token: string }> };

/**
 * The public URL a webhook is: no cookie, the token in the path is the
 * credential. Takes Discord's execute-webhook body.
 */
async function handle(request: Request, props: Params) {
  const db = bindings().DB;
  if (!db) return webhookError(503, 0, "Storage is not connected.");
  await ensureSchema(db);
  const { id, token } = await props.params;
  return handleWebhookRequest(db, request, [id, token], { origin: new URL(request.url).origin, basePath: "/hangout" });
}

export const GET = handle;
export const POST = handle;
