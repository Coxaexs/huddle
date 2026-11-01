import { currentUser, unauthorized } from "@/lib/auth";
import { loadServiceStatus } from "@/lib/discord-bridge";
import { accountLinkFor, newAccountCode, pendingAccountCode, unlinkAccount } from "@/lib/discord-accounts";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const CODE_LIMIT = { action: "discord-account-code", limit: 10, windowSeconds: 600 };

/**
 * Settings → Profile → Connections → Discord: link your Discord account so
 * what you say on a bridged Discord server shows as you here, and the other
 * way round. See lib/discord-accounts.ts.
 */
async function signedIn(request: Request) {
  const db = bindings().DB;
  if (!db) return { error: Response.json({ error: "Storage is not connected." }, { status: 503 }) };
  const user = await currentUser(request);
  if (!user) return { error: unauthorized() };
  await ensureSchema(db);
  return { db, user };
}

async function state(db: D1Database, userId: string) {
  const [link, pending, service] = await Promise.all([
    accountLinkFor(db, userId),
    pendingAccountCode(db, userId),
    loadServiceStatus(db),
  ]);
  return {
    link: link ? { discordUserId: link.discordUserId, discordName: link.discordName, linkedAt: link.linkedAt } : null,
    code: link ? null : pending,
    // Linking runs through the bridge's bot, so it only works while it runs.
    available: service.online && Boolean(service.status.discord?.connected),
    botName: service.status.app?.name ?? null,
  };
}

export async function GET(request: Request) {
  const auth = await signedIn(request);
  if ("error" in auth) return auth.error;
  return Response.json(await state(auth.db, auth.user.id));
}

/** A new code to run with /hoffle-account link on Discord. */
export async function POST(request: Request) {
  const auth = await signedIn(request);
  if ("error" in auth) return auth.error;
  const limited = await limitUser(auth.db, CODE_LIMIT, auth.user.id);
  if (limited) return limited;
  await newAccountCode(auth.db, auth.user.id);
  return Response.json(await state(auth.db, auth.user.id));
}

export async function DELETE(request: Request) {
  const auth = await signedIn(request);
  if ("error" in auth) return auth.error;
  await unlinkAccount(auth.db, { userId: auth.user.id });
  return Response.json(await state(auth.db, auth.user.id));
}
