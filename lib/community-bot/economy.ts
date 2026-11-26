/**
 * Economy & Role Shop plugin:
 * - Server currency (`/balance`, `/daily`, `/work`, `/pay`, `/richest`)
 * - Custom Role Shop (`/shop`, `/buy`)
 */

import { assignRoleToMember, getCommunityBotConfig } from "./store";
import type { ShopItem } from "./types";

interface EconRow {
  balance: number;
  last_daily_at: number;
  last_work_at: number;
}

interface ShopRow {
  id: string;
  server_id: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  role_id: string | null;
  created_at: string;
}

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function ensureAccount(
  db: D1Database,
  serverId: string,
  userId: string,
  startingBalance: number,
): Promise<EconRow> {
  const row = await db
    .prepare(
      "SELECT balance, last_daily_at, last_work_at FROM community_economy WHERE server_id = ? AND user_id = ?",
    )
    .bind(serverId, userId)
    .first<EconRow>();
  if (row) return row;

  await db
    .prepare(
      "INSERT OR IGNORE INTO community_economy (server_id, user_id, balance, last_daily_at, last_work_at) VALUES (?, ?, ?, 0, 0)",
    )
    .bind(serverId, userId, startingBalance)
    .run();
  return { balance: startingBalance, last_daily_at: 0, last_work_at: 0 };
}

export async function getBalance(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<{ balance: number; currencyName: string; currencyEmoji: string }> {
  const config = await getCommunityBotConfig(db, serverId);
  const ec = config.plugins.economy;
  const acct = await ensureAccount(db, serverId, userId, ec.startingBalance);
  return {
    balance: acct.balance,
    currencyName: ec.currencyName,
    currencyEmoji: ec.currencyEmoji,
  };
}

export async function claimDaily(
  db: D1Database,
  serverId: string,
  userId: string,
  now = Date.now(),
): Promise<
  | { ok: true; gained: number; balance: number; currencyName: string; currencyEmoji: string }
  | { ok: false; retryAfterMs: number }
> {
  const config = await getCommunityBotConfig(db, serverId);
  const ec = config.plugins.economy;
  const acct = await ensureAccount(db, serverId, userId, ec.startingBalance);

  const elapsed = now - acct.last_daily_at;
  if (acct.last_daily_at > 0 && elapsed < DAILY_COOLDOWN_MS) {
    return { ok: false, retryAfterMs: DAILY_COOLDOWN_MS - elapsed };
  }

  const nextBal = acct.balance + ec.dailyAmount;
  await db
    .prepare(
      "UPDATE community_economy SET balance = ?, last_daily_at = ? WHERE server_id = ? AND user_id = ?",
    )
    .bind(nextBal, now, serverId, userId)
    .run();

  return {
    ok: true,
    gained: ec.dailyAmount,
    balance: nextBal,
    currencyName: ec.currencyName,
    currencyEmoji: ec.currencyEmoji,
  };
}

export async function doWork(
  db: D1Database,
  serverId: string,
  userId: string,
  now = Date.now(),
  random = Math.random,
): Promise<
  | { ok: true; gained: number; balance: number; currencyName: string; currencyEmoji: string }
  | { ok: false; retryAfterMs: number }
> {
  const config = await getCommunityBotConfig(db, serverId);
  const ec = config.plugins.economy;
  const acct = await ensureAccount(db, serverId, userId, ec.startingBalance);

  const cooldownMs = ec.workCooldownMin * 60_000;
  const elapsed = now - acct.last_work_at;
  if (acct.last_work_at > 0 && elapsed < cooldownMs) {
    return { ok: false, retryAfterMs: cooldownMs - elapsed };
  }

  const gained = ec.workMin + Math.floor(random() * (ec.workMax - ec.workMin + 1));
  const nextBal = acct.balance + gained;
  await db
    .prepare(
      "UPDATE community_economy SET balance = ?, last_work_at = ? WHERE server_id = ? AND user_id = ?",
    )
    .bind(nextBal, now, serverId, userId)
    .run();

  return {
    ok: true,
    gained,
    balance: nextBal,
    currencyName: ec.currencyName,
    currencyEmoji: ec.currencyEmoji,
  };
}

export async function payMember(
  db: D1Database,
  serverId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
): Promise<
  | { ok: true; fromBalance: number; toBalance: number; currencyName: string; currencyEmoji: string }
  | { ok: false; error: string }
> {
  const amt = Math.floor(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, error: "Enter a positive amount to pay." };
  }
  if (fromUserId === toUserId) {
    return { ok: false, error: "You cannot pay yourself." };
  }

  const config = await getCommunityBotConfig(db, serverId);
  const ec = config.plugins.economy;
  const sender = await ensureAccount(db, serverId, fromUserId, ec.startingBalance);
  if (sender.balance < amt) {
    return { ok: false, error: `Insufficient balance (you have ${sender.balance.toLocaleString()} ${ec.currencyName}).` };
  }
  const receiver = await ensureAccount(db, serverId, toUserId, ec.startingBalance);

  const fromBalance = sender.balance - amt;
  const toBalance = receiver.balance + amt;
  await db.batch([
    db
      .prepare("UPDATE community_economy SET balance = ? WHERE server_id = ? AND user_id = ?")
      .bind(fromBalance, serverId, fromUserId),
    db
      .prepare("UPDATE community_economy SET balance = ? WHERE server_id = ? AND user_id = ?")
      .bind(toBalance, serverId, toUserId),
  ]);

  return {
    ok: true,
    fromBalance,
    toBalance,
    currencyName: ec.currencyName,
    currencyEmoji: ec.currencyEmoji,
  };
}

export async function getRichest(
  db: D1Database,
  serverId: string,
  limit = 10,
): Promise<Array<{ userId: string; username: string; displayName: string; balance: number }>> {
  const { results } = await db
    .prepare(
      `SELECT e.user_id, e.balance, u.username, u.display_name
         FROM community_economy e
         JOIN users u ON u.id = e.user_id
        WHERE e.server_id = ?
        ORDER BY e.balance DESC
        LIMIT ?`,
    )
    .bind(serverId, Math.max(1, Math.min(50, limit)))
    .all<{ user_id: string; balance: number; username: string; display_name: string }>();

  return (results || []).map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name || r.username,
    balance: r.balance,
  }));
}

// ---------------------------------------------------------------------------
// Role Shop
// ---------------------------------------------------------------------------

function rowToShopItem(r: ShopRow): ShopItem {
  return {
    id: r.id,
    serverId: r.server_id,
    name: r.name,
    description: r.description,
    emoji: r.emoji,
    price: r.price,
    roleId: r.role_id,
    createdAt: r.created_at,
  };
}

export async function listShopItems(
  db: D1Database,
  serverId: string,
): Promise<ShopItem[]> {
  const { results } = await db
    .prepare("SELECT * FROM community_shop_items WHERE server_id = ? ORDER BY price ASC, name ASC")
    .bind(serverId)
    .all<ShopRow>();
  return (results || []).map(rowToShopItem);
}

export async function saveShopItem(
  db: D1Database,
  serverId: string,
  input: {
    id?: string;
    name: string;
    description?: string;
    emoji?: string;
    price: number;
    roleId?: string | null;
  },
): Promise<ShopItem | { error: string }> {
  const name = input.name.trim().slice(0, 60);
  if (!name) return { error: "Item name is required." };
  const price = Math.max(1, Math.min(100_000_000, Math.round(Number(input.price) || 100)));
  const description = (input.description || "").trim().slice(0, 240);
  const emoji = (input.emoji || "🎁").trim().slice(0, 12);
  const roleId = input.roleId?.trim() || null;
  const id = input.id?.trim() || crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO community_shop_items (id, server_id, name, description, emoji, price, role_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, description = excluded.description,
         emoji = excluded.emoji, price = excluded.price, role_id = excluded.role_id`,
    )
    .bind(id, serverId, name, description, emoji, price, roleId, createdAt)
    .run();

  return { id, serverId, name, description, emoji, price, roleId, createdAt };
}

export async function deleteShopItem(
  db: D1Database,
  serverId: string,
  itemId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM community_shop_items WHERE id = ? AND server_id = ?")
    .bind(itemId, serverId)
    .run();
}

export async function buyShopItem(
  db: D1Database,
  serverId: string,
  userId: string,
  query: string,
): Promise<
  | { ok: true; item: ShopItem; remainingBalance: number; currencyName: string; currencyEmoji: string }
  | { ok: false; error: string }
> {
  const items = await listShopItems(db, serverId);
  const q = query.trim().toLowerCase();
  const item = items.find((i) => i.name.toLowerCase() === q || i.id === q || i.name.toLowerCase().includes(q));
  if (!item) return { ok: false, error: `No shop item matching "${query}" was found.` };

  const config = await getCommunityBotConfig(db, serverId);
  const ec = config.plugins.economy;
  const acct = await ensureAccount(db, serverId, userId, ec.startingBalance);

  if (acct.balance < item.price) {
    return {
      ok: false,
      error: `You need ${item.price.toLocaleString()} ${ec.currencyName}, but you only have ${acct.balance.toLocaleString()}.`,
    };
  }

  const remainingBalance = acct.balance - item.price;
  await db
    .prepare("UPDATE community_economy SET balance = ? WHERE server_id = ? AND user_id = ?")
    .bind(remainingBalance, serverId, userId)
    .run();

  if (item.roleId) {
    await assignRoleToMember(db, serverId, userId, item.roleId);
  }

  return {
    ok: true,
    item,
    remainingBalance,
    currencyName: ec.currencyName,
    currencyEmoji: ec.currencyEmoji,
  };
}
