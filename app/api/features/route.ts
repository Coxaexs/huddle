import { currentUser, unauthorized } from "@/lib/auth";
import { allDisabledFeatures, featureFlags } from "@/lib/features";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Public, per-host feature flags so the UI can hide disabled affordances. */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const env = bindings();
  return Response.json({ ...featureFlags(env), disabled: await allDisabledFeatures(env) });
}
