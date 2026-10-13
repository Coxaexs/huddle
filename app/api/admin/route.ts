import { adminAudit, adminFeatures, adminOverview, adminServers, adminUsers } from "@/lib/admin";
import { bindings } from "@/lib/storage";
import { requireInstanceAdmin } from "./guard";

export const dynamic = "force-dynamic";

/** Everything /admin shows except host status, in one round trip. */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { db } = gate;
  const env = bindings();
  const overview = await adminOverview(db, env.UPLOADS);
  const [users, servers, audit, features] = await Promise.all([
    adminUsers(db, new Set(overview.online.map((person) => person.id))),
    adminServers(db),
    adminAudit(db),
    adminFeatures(db, env),
  ]);
  return Response.json({ overview, users, servers, audit, features });
}
