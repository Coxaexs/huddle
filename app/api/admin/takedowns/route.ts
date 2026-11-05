import { timingSafeEqual } from "@/lib/auth";
import { alertOperators } from "@/lib/operator-alerts";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { listTakedowns, takeDown, TAKEDOWN_ACTOR, type TakedownOutcome } from "@/lib/takedowns";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

const MAX_LINKS = 20;
/** Even a real-looking mail can only do so much before a person looks. */
const MAIL_LIMIT = { action: "takedown-mail", limit: 10, windowSeconds: 3600 };

export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  await ensureSchema(gate.db);
  return Response.json({ takedowns: await listTakedowns(gate.db) });
}

/**
 * POST { links, from?, subject? }. The mail worker (deploy/mail-alert) calls
 * this with OPERATOR_ALERT_TOKEN for a verified order; an admin calls it from
 * the Takedowns tab with a link pasted by hand.
 */
export async function POST(request: Request) {
  const env = bindings();
  const token = env.OPERATOR_ALERT_TOKEN?.trim();
  const fromMail = Boolean(token && timingSafeEqual(request.headers.get("authorization") || "", `Bearer ${token}`));

  const gate = fromMail ? null : await requireInstanceAdmin(request);
  if (gate && "response" in gate) return gate.response;
  const db = gate ? gate.db : env.DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  await ensureSchema(db);
  if (fromMail) {
    const limited = await limitUser(db, MAIL_LIMIT, "mail-worker");
    if (limited) return limited;
  }

  const body = (await request.json().catch(() => ({}))) as { links?: unknown; from?: unknown; subject?: unknown };
  const links = [...new Set(Array.isArray(body.links) ? body.links.filter((link) => typeof link === "string") : [])] as string[];
  if (!links.length) return Response.json({ error: "Paste a link to the message or file." }, { status: 400 });

  const origin = {
    source: fromMail ? "order-mail" : "admin",
    detail: fromMail ? `${String(body.from || "")}: ${String(body.subject || "")}` : "Pasted in the admin panel",
    actor: gate ? gate.user : TAKEDOWN_ACTOR,
  };
  const outcomes: Record<TakedownOutcome, number> = { down: 0, already: 0, unmatched: 0 };
  for (const link of links.slice(0, MAX_LINKS)) outcomes[await takeDown(db, link, origin)] += 1;
  const skipped = Math.max(0, links.length - MAX_LINKS);

  if (fromMail && outcomes.down) {
    const left = outcomes.unmatched + skipped;
    await alertOperators(db, {
      title: `Took down ${outcomes.down} from an order`,
      body: left ? `${left} more could not be matched: do those by hand.` : "Check the Takedowns tab.",
      tag: "takedown",
    }).catch(() => undefined);
  }
  return Response.json({ ...outcomes, skipped });
}
