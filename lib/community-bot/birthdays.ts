/**
 * Birthdays plugin: `/birthday MM-DD`, `/birthdays`, and daily automated
 * birthday wishes + optional birthday role assignment.
 */

import {
  assignRoleToMember,
  getCommunityBotConfig,
  postCommunityBotMessage,
} from "./store";
import { type BirthdayEntry, renderTemplate } from "./types";

const DAYS_IN_MONTH = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function parseBirthdayInput(raw: string): { month: number; day: number } | null {
  const clean = raw.trim();
  // Accept MM-DD, MM/DD, or YYYY-MM-DD
  const match = /^(?:(?:\d{4})[-/])?(\d{1,2})[-/](\d{1,2})$/.exec(clean);
  if (!match) return null;
  const month = Number.parseInt(match[1], 10);
  const day = Number.parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > DAYS_IN_MONTH[month]) return null;
  return { month, day };
}

export async function setBirthday(
  db: D1Database,
  serverId: string,
  userId: string,
  month: number,
  day: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO community_birthdays (server_id, user_id, month, day, last_wished_year)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(server_id, user_id) DO UPDATE SET month = excluded.month, day = excluded.day`,
    )
    .bind(serverId, userId, month, day)
    .run();
}

export async function clearBirthday(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM community_birthdays WHERE server_id = ? AND user_id = ?")
    .bind(serverId, userId)
    .run();
}

export async function listBirthdays(
  db: D1Database,
  serverId: string,
): Promise<BirthdayEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT b.server_id, b.user_id, b.month, b.day, u.username, u.display_name
         FROM community_birthdays b
         JOIN users u ON u.id = b.user_id
        WHERE b.server_id = ?
        ORDER BY b.month ASC, b.day ASC`,
    )
    .bind(serverId)
    .all<{
      server_id: string;
      user_id: string;
      month: number;
      day: number;
      username: string;
      display_name: string;
    }>();

  return (results || []).map((r) => ({
    serverId: r.server_id,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name || r.username,
    month: r.month,
    day: r.day,
  }));
}

/** Called from HuddleHub's periodic alarm to wish today's birthdays once per year. */
export async function deliverDueBirthdays(
  db: D1Database,
  now = new Date(),
): Promise<number> {
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const year = now.getUTCFullYear();

  const { results } = await db
    .prepare(
      `SELECT b.server_id, b.user_id, u.username, u.display_name, s.name AS server_name
         FROM community_birthdays b
         JOIN users u ON u.id = b.user_id
         JOIN servers s ON s.id = b.server_id
        WHERE b.month = ? AND b.day = ? AND b.last_wished_year < ?
        LIMIT 50`,
    )
    .bind(month, day, year)
    .all<{
      server_id: string;
      user_id: string;
      username: string;
      display_name: string;
      server_name: string;
    }>();

  let wished = 0;
  for (const row of results || []) {
    const config = await getCommunityBotConfig(db, row.server_id);
    const bd = config.plugins.birthdays;
    if (!config.enabled || !bd.enabled || !bd.channelId) continue;

    const text = renderTemplate(bd.message, {
      user: `@${row.username}`,
      username: row.display_name || row.username,
      server: row.server_name,
    });

    await postCommunityBotMessage(
      db,
      row.server_id,
      bd.channelId,
      {
        content: text,
        embeds: [
          {
            title: `🎂 Happy Birthday, ${row.display_name || row.username}!`,
            description: text,
            color: "#ec4899",
          },
        ],
      },
      config,
    );

    if (bd.birthdayRoleId) {
      await assignRoleToMember(db, row.server_id, row.user_id, bd.birthdayRoleId);
    }

    await db
      .prepare(
        "UPDATE community_birthdays SET last_wished_year = ? WHERE server_id = ? AND user_id = ?",
      )
      .bind(year, row.server_id, row.user_id)
      .run();

    wished++;
  }
  return wished;
}
