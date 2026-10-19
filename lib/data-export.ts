/**
 * "Download my data": everything an account wrote or set, as one JSON file.
 *
 * It holds what is *yours*: your profile and settings, the messages you sent
 * (with links to their files), your reactions, friends, servers and roles,
 * reminders, polls and achievements. Other people's messages are theirs and
 * stay out. So do secrets: the password hash, session tokens, the two-factor
 * secret and recovery codes, push keys, bot and webhook tokens.
 *
 * Side features create their tables on first use, so a table may not exist;
 * those sections come out empty instead of failing the export.
 */
import { listSessions, passkeysFor, totpRow } from "./account-security";
import type { User } from "./auth";

const UPLOAD_PREFIX = "/hangout/api/uploads/";

/** Columns of `users` that are never exported. */
const PRIVATE_USER_COLUMNS = new Set(["password_hash", "signup_ip_hash", "username_lower"]);

export async function buildDataExport(db: D1Database, user: User, currentSessionId: string | null) {
  const rows = async <T = Record<string, unknown>>(sql: string, ...binds: unknown[]): Promise<T[]> => {
    try {
      return (await db.prepare(sql).bind(...binds).all<T>()).results ?? [];
    } catch {
      return [];
    }
  };
  const id = user.id;

  const account = (await rows("SELECT * FROM users WHERE id = ?", id))[0] ?? {};
  for (const column of PRIVATE_USER_COLUMNS) delete (account as Record<string, unknown>)[column];

  const messages = (
    await rows<Record<string, unknown> & { attachment_key: string | null; attachments: string | null }>(
      `SELECT m.id, m.channel_id, c.name AS channel_name, s.name AS server_name, c.kind AS channel_kind,
              m.content, m.created_at, m.edited_at, m.reply_to, m.thread_id, m.kind, m.pinned_at,
              m.attachment_key, m.attachments, m.audio_url, m.link
         FROM messages m
         LEFT JOIN channels c ON c.id = m.channel_id
         LEFT JOIN servers s ON s.id = c.server_id
        WHERE (m.user_id = ? OR m.sender_id = ?) AND m.deleted_at IS NULL
        ORDER BY m.created_at`,
      id,
      id,
    )
  ).map(({ attachment_key, attachments, ...message }) => {
    const keys = new Set<string>();
    if (attachment_key) keys.add(attachment_key);
    try {
      const extra = JSON.parse(attachments || "[]");
      if (Array.isArray(extra)) for (const key of extra) if (typeof key === "string") keys.add(key);
    } catch {
      // Not a list: nothing extra.
    }
    return { ...message, files: [...keys].map((key) => `${UPLOAD_PREFIX}${encodeURIComponent(key)}`) };
  });

  const totp = await totpRow(db, id).catch(() => null);

  return {
    format: "hoffle-data-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    note:
      "Everything your account wrote or set on this Hoffle. File links work while you are signed in; " +
      "open them in your browser to download the files themselves.",
    account,
    security: {
      twoStepSignIn: Boolean(totp?.enabled_at),
      passkeys: (await passkeysFor(db, id).catch(() => [])).map((key) => ({
        name: key.name,
        site: key.rp_id,
        createdAt: key.created_at,
        lastUsedAt: key.last_used_at,
      })),
      signedInDevices: await listSessions(db, id, currentSessionId).catch(() => []),
    },
    messages,
    reactions: await rows(
      "SELECT message_id, emoji, created_at FROM reactions WHERE user_id = ? ORDER BY created_at",
      id,
    ),
    savedMessages: await rows("SELECT message_id, created_at FROM saved_messages WHERE user_id = ?", id),
    scheduledMessages: await rows(
      "SELECT channel_id, thread_id, text, due_at, created_at, sent_at FROM scheduled_messages WHERE user_id = ?",
      id,
    ),
    reminders: await rows("SELECT channel_id, text, due_at, created_at, sent_at FROM reminders WHERE user_id = ?", id),
    friends: await rows(
      `SELECT CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END AS user_id,
              u.username, u.display_name, f.status, f.created_at, f.updated_at,
              CASE WHEN f.user_id = ? THEN 'you asked' ELSE 'they asked' END AS direction
         FROM friendships f
         LEFT JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
        WHERE f.user_id = ? OR f.friend_id = ?`,
      id,
      id,
      id,
      id,
      id,
    ),
    servers: await rows(
      `SELECT s.id, s.name, m.nickname, m.joined_at, (s.created_by = ?) AS owner
         FROM server_members m JOIN servers s ON s.id = m.server_id
        WHERE m.user_id = ?`,
      id,
      id,
    ),
    roles: await rows(
      `SELECT s.name AS server_name, r.name AS role_name
         FROM member_roles mr
         JOIN roles r ON r.id = mr.role_id
         JOIN servers s ON s.id = mr.server_id
        WHERE mr.user_id = ?`,
      id,
    ),
    directMessages: await rows(
      `SELECT d.channel_id, d.pinned_at, d.hidden_at,
              (SELECT group_concat(u.username, ', ') FROM dm_members o JOIN users u ON u.id = o.user_id
                WHERE o.channel_id = d.channel_id AND o.user_id != ?) AS with_people
         FROM dm_members d WHERE d.user_id = ?`,
      id,
      id,
    ),
    polls: await rows(
      "SELECT id, channel_id, question, options, multi, created_at FROM polls WHERE created_by = ?",
      id,
    ),
    pollVotes: await rows("SELECT poll_id, choice FROM poll_votes WHERE user_id = ?", id),
    questions: await rows("SELECT channel_id, text, created_at, answered_at FROM qa_questions WHERE user_id = ?", id),
    eventReplies: await rows("SELECT event_id, status, updated_at FROM event_rsvps WHERE user_id = ?", id),
    notesAboutOthers: await rows("SELECT target_id, note, updated_at FROM user_notes WHERE owner_id = ?", id),
    requests: await rows(
      "SELECT title, category, details, status, response_note, created_at, updated_at FROM user_requests WHERE user_id = ?",
      id,
    ),
    achievements: await rows("SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = ?", id),
    stats: await rows("SELECT stat, value FROM user_stats WHERE user_id = ?", id),
    voiceSeconds: (await rows<{ seconds: number }>("SELECT seconds FROM user_voice_seconds WHERE user_id = ?", id))[0]
      ?.seconds ?? 0,
    themes: await rows(
      "SELECT name, description, base_theme, colors, corners, backdrop, custom_css, is_public, created_at FROM custom_themes WHERE created_by = ?",
      id,
    ),
    characters: await rows(
      "SELECT character_name, class_name, level, public_card_json, created_at, updated_at FROM campaign_characters WHERE user_id = ?",
      id,
    ),
    preferences: {
      channels: await rows("SELECT channel_id, level, muted_until FROM channel_prefs WHERE user_id = ?", id),
      voice: await rows("SELECT target_id, volume, muted FROM voice_prefs WHERE user_id = ?", id),
      digest: await rows("SELECT mode, updated_at FROM digest_prefs WHERE user_id = ?", id),
      serverFolders: await rows("SELECT folders, updated_at FROM server_folders WHERE user_id = ?", id),
      emoticons: await rows("SELECT shortcut, upload_key, created_at FROM user_emoticons WHERE user_id = ?", id),
      pushDevices: await rows("SELECT kind, created_at FROM push_subscriptions WHERE user_id = ?", id),
    },
  };
}
