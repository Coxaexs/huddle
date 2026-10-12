import { searchMessages } from "@/lib/admin-tools";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/** `?q=&mode=words|regex&server=&author=&deleted=1&dms=1` across the instance. */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const params = new URL(request.url).searchParams;
  const result = await searchMessages(gate.db, {
    query: params.get("q") || "",
    mode: params.get("mode") === "regex" ? "regex" : "words",
    serverId: params.get("server") || null,
    author: params.get("author"),
    includeDeleted: params.get("deleted") === "1",
    includeDms: params.get("dms") === "1",
  });
  if ("error" in result) return Response.json(result, { status: 400 });
  return Response.json(result);
}
