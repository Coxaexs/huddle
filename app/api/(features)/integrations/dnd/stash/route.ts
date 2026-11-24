import { currentUser, unauthorized } from "@/lib/auth";
import { publishMessageEvent } from "@/lib/hub-client";
import {
  emptyPartyStash,
  sanitizeCurrency,
  sanitizeLootItems,
  sanitizePartyStash,
  sanitizeQuests,
  splitCurrency,
  type PartyCurrency,
  type PartyLootItem,
  type PartyQuest,
  type PartyStashState,
} from "@/lib/party-stash";
import { ensureSchema } from "@/lib/schema";
import { findChannel, isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface StashRow {
  server_id: string;
  currency_json: string;
  items_json: string;
  quests_json: string;
  updated_at: number;
}

function rowToStash(row: StashRow | null): PartyStashState {
  if (!row) return emptyPartyStash();
  try {
    return sanitizePartyStash({
      currency: JSON.parse(row.currency_json || "{}"),
      items: JSON.parse(row.items_json || "[]"),
      quests: JSON.parse(row.quests_json || "[]"),
      updatedAt: row.updated_at,
    });
  } catch {
    return emptyPartyStash();
  }
}

async function loadStash(db: D1Database, serverId: string): Promise<PartyStashState> {
  const row = await db
    .prepare("SELECT server_id, currency_json, items_json, quests_json, updated_at FROM dnd_party_state WHERE server_id = ?")
    .bind(serverId)
    .first<StashRow>();
  return rowToStash(row ?? null);
}

/** Shared party treasury, loot inventory, and quest board per server. */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const db = bindings().DB;
  if (!db) {
    return Response.json({ state: emptyPartyStash() });
  }
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId")?.slice(0, 64) || "";
  if (!serverId) {
    return Response.json({ error: "Missing serverId." }, { status: 400 });
  }
  if (!(await isServerMember(db, serverId, user.id))) {
    return Response.json({ error: "Not a member of this server." }, { status: 403 });
  }
  const state = await loadStash(db, serverId);
  return Response.json({ state });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    serverId?: string;
    channelId?: string | null;
    action?: string;
    currency?: Partial<PartyCurrency>;
    count?: number;
    item?: Partial<PartyLootItem>;
    itemId?: string;
    quest?: Partial<PartyQuest>;
    questId?: string;
  };
  const serverId = body.serverId?.slice(0, 64) || "";
  if (!serverId) {
    return Response.json({ error: "Missing serverId." }, { status: 400 });
  }
  if (!(await isServerMember(db, serverId, user.id))) {
    return Response.json({ error: "Not a member of this server." }, { status: 403 });
  }

  const state = await loadStash(db, serverId);
  let split: { perPlayer: PartyCurrency; remainder: PartyCurrency } | undefined;

  switch (body.action) {
    case "update-currency": {
      state.currency = sanitizeCurrency(body.currency);
      break;
    }
    case "split-currency": {
      split = splitCurrency(state.currency, Number(body.count) || 4);
      state.currency = split.remainder;
      break;
    }
    case "add-item": {
      const [added] = sanitizeLootItems([
        { ...(body.item || {}), id: crypto.randomUUID(), updatedBy: user.display_name },
      ]);
      if (!added) {
        return Response.json({ error: "Item name cannot be empty." }, { status: 400 });
      }
      state.items = [added, ...state.items].slice(0, 120);
      break;
    }
    case "update-item": {
      const id = body.itemId?.slice(0, 64) || "";
      const next = state.items.map((it) => {
        if (it.id !== id) return it;
        const [sanitized] = sanitizeLootItems([
          { ...it, ...(body.item || {}), id: it.id, updatedBy: user.display_name },
        ]);
        return sanitized || it;
      });
      state.items = next;
      break;
    }
    case "remove-item": {
      const id = body.itemId?.slice(0, 64) || "";
      state.items = state.items.filter((it) => it.id !== id);
      break;
    }
    case "add-quest": {
      const [added] = sanitizeQuests([
        { ...(body.quest || {}), id: crypto.randomUUID(), updatedAt: Date.now() },
      ]);
      if (!added) {
        return Response.json({ error: "Quest title cannot be empty." }, { status: 400 });
      }
      state.quests = [added, ...state.quests].slice(0, 80);
      break;
    }
    case "update-quest": {
      const id = body.questId?.slice(0, 64) || "";
      state.quests = state.quests.map((q) => {
        if (q.id !== id) return q;
        const [sanitized] = sanitizeQuests([
          { ...q, ...(body.quest || {}), id: q.id, updatedAt: Date.now() },
        ]);
        return sanitized || q;
      });
      break;
    }
    case "remove-quest": {
      const id = body.questId?.slice(0, 64) || "";
      state.quests = state.quests.filter((q) => q.id !== id);
      break;
    }
    default:
      return Response.json({ error: "Unknown stash action." }, { status: 400 });
  }

  state.updatedAt = Date.now();
  await db
    .prepare(
      `INSERT INTO dnd_party_state (server_id, currency_json, items_json, quests_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(server_id) DO UPDATE SET
         currency_json = excluded.currency_json,
         items_json = excluded.items_json,
         quests_json = excluded.quests_json,
         updated_at = excluded.updated_at`,
    )
    .bind(
      serverId,
      JSON.stringify(state.currency),
      JSON.stringify(state.items),
      JSON.stringify(state.quests),
      state.updatedAt,
    )
    .run();

  const channelId = body.channelId?.slice(0, 64) || "";
  if (channelId) {
    const ch = await findChannel(db, channelId);
    if (ch && ch.server_id === serverId) {
      await publishMessageEvent(channelId, {
        t: "dnd-stash",
        serverId,
        channelId,
        state,
      });
    }
  }

  return Response.json({ state, ...(split ? { split } : {}) });
}
