import { recordAudit } from "@/lib/audit";
import { adminFeatures, INSTANCE_AUDIT } from "@/lib/admin";
import { runtimeDisabledFeatures, setRuntimeDisabledFeatures, SIDE_FEATURES } from "@/lib/features";
import { bindings } from "@/lib/storage";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/** `{ disabled: string[] }`: the side features to switch off from the panel. */
export async function POST(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const body = (await request.json().catch(() => ({}))) as { disabled?: unknown };
  if (!Array.isArray(body.disabled)) {
    return Response.json({ error: "Send the list of features to switch off." }, { status: 400 });
  }
  const before = new Set(await runtimeDisabledFeatures(gate.db));
  const after = await setRuntimeDisabledFeatures(
    gate.db,
    body.disabled.filter((id): id is string => typeof id === "string"),
  );
  const turnedOff = after.filter((id) => !before.has(id));
  const turnedOn = [...before].filter((id) => !after.includes(id));
  for (const [ids, verb] of [[turnedOff, "off"], [turnedOn, "on"]] as const) {
    for (const id of ids) {
      await recordAudit(gate.db, {
        serverId: INSTANCE_AUDIT,
        actor: gate.user,
        action: `feature.${verb}`,
        targetId: id,
        targetName: SIDE_FEATURES[id],
      });
    }
  }
  return Response.json({ features: await adminFeatures(gate.db, bindings()) });
}
