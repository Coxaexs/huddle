/**
 * Instance-wide media moderation: lists everything in the UPLOADS bucket and
 * deletes files on request, cleaning up the rows that point at them so nothing
 * is left rendering a broken image.
 *
 * Uploads have no table of their own — a file is just an R2 object keyed
 * `<uuid>--<name>` — so who posted a file and where it is used are worked out
 * by scanning the columns that hold upload keys or `/api/uploads/` URLs.
 */

import { recordAudit } from "./audit";
import type { User } from "./auth";

export { canManageMedia } from "./auth";
import { publishMemberUpdate, publishStructureChange } from "./hub-client";

export type MediaRefKind =
  | "message"
  | "avatar"
  | "banner"
  | "server-icon"
  | "server-banner"
  | "emoji"
  | "sticker"
  | "sound"
  | "emoticon"
  | "battlemap";

export interface MediaRef {
  kind: MediaRefKind;
  /** Row id (message id, user id, server id, emoji id…). */
  id: string;
  userId: string | null;
  serverId: string | null;
  channelId: string | null;
  /** Human label: "#general", "DM", "Kiwi's avatar", ":blob:". */
  label: string;
  at: string | null;
  deleted?: boolean;
  /** Composite-key rows (user_emoticons) need the second half to delete. */
  extra?: string;
}

export interface MediaItem {
  key: string;
  name: string;
  size: number;
  uploaded: string;
  contentType: string;
  family: "image" | "video" | "audio" | "pdf" | "file";
  uploaderId: string | null;
  uploaderName: string | null;
  refs: Array<Omit<MediaRef, "extra">>;
  /** Set for files the app manages itself rather than a person uploading them. */
  note?: string;
}

const UPLOAD_URL = /\/api\/uploads\/([^?#"'\s)<>]+)/g;

/** Every upload key mentioned in a URL-ish string. */
function keysInText(text: string | null | undefined): string[] {
  if (!text) return [];
  const keys: string[] = [];
  for (const match of text.matchAll(UPLOAD_URL)) {
    try {
      keys.push(decodeURIComponent(match[1]));
    } catch {
      keys.push(match[1]);
    }
  }
  return keys;
}

function jsonKeys(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function familyOf(contentType: string, name: string): MediaItem["family"] {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType === "application/pdf") return "pdf";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v", "ogv"].includes(ext)) return "video";
  if (["mp3", "ogg", "wav", "m4a"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  return "file";
}

interface Directory {
  users: Map<string, string>;
  channels: Map<string, { name: string; serverId: string | null; kind: string }>;
}

async function loadDirectory(db: D1Database): Promise<Directory> {
  const [users, channels] = await Promise.all([
    db.prepare("SELECT id, display_name FROM users").all<{ id: string; display_name: string }>(),
    db
      .prepare("SELECT id, name, server_id, kind FROM channels")
      .all<{ id: string; name: string; server_id: string | null; kind: string }>(),
  ]);
  return {
    users: new Map(users.results.map((row) => [row.id, row.display_name])),
    channels: new Map(
      channels.results.map((row) => [
        row.id,
        { name: row.name, serverId: row.server_id, kind: row.kind },
      ]),
    ),
  };
}

/** Builds key → every row that references it. */
async function scanReferences(
  db: D1Database,
  directory: Directory,
): Promise<Map<string, MediaRef[]>> {
  const refs = new Map<string, MediaRef[]>();
  const add = (key: string, ref: MediaRef) => {
    const list = refs.get(key);
    if (list) {
      if (!list.some((r) => r.kind === ref.kind && r.id === ref.id)) list.push(ref);
    } else refs.set(key, [ref]);
  };
  const userName = (id: string | null) => (id && directory.users.get(id)) || "someone";

  const [messages, users, servers, emojis, stickers, sounds, emoticons, maps] =
    await Promise.all([
      db
        .prepare(
          `SELECT id, channel_id, user_id, author, content, attachment_key, attachments,
                  audio_url, created_at, deleted_at
             FROM messages
            WHERE attachment_key IS NOT NULL
               OR (attachments IS NOT NULL AND attachments != '[]')
               OR audio_url LIKE '%/api/uploads/%'
               OR content LIKE '%/api/uploads/%'`,
        )
        .all<{
          id: string;
          channel_id: string | null;
          user_id: string | null;
          author: string;
          content: string;
          attachment_key: string | null;
          attachments: string | null;
          audio_url: string | null;
          created_at: string;
          deleted_at: string | null;
        }>(),
      db
        .prepare(
          "SELECT id, display_name, avatar_url, banner_url FROM users WHERE avatar_url LIKE '%/api/uploads/%' OR banner_url LIKE '%/api/uploads/%'",
        )
        .all<{ id: string; display_name: string; avatar_url: string | null; banner_url: string | null }>(),
      db
        .prepare(
          "SELECT id, name, created_by, icon_url, banner_url FROM servers WHERE icon_url LIKE '%/api/uploads/%' OR banner_url LIKE '%/api/uploads/%'",
        )
        .all<{ id: string; name: string; created_by: string | null; icon_url: string | null; banner_url: string | null }>(),
      db
        .prepare("SELECT id, server_id, name, key, created_by, created_at FROM emojis")
        .all<{ id: string; server_id: string; name: string; key: string; created_by: string | null; created_at: string }>(),
      db
        .prepare("SELECT id, server_id, name, key, created_by, created_at FROM stickers")
        .all<{ id: string; server_id: string; name: string; key: string; created_by: string | null; created_at: string }>(),
      db
        .prepare("SELECT id, server_id, name, key, created_by, owner_id, created_at FROM sounds")
        .all<{ id: string; server_id: string | null; name: string; key: string; created_by: string | null; owner_id: string | null; created_at: string }>(),
      db
        .prepare("SELECT user_id, shortcut, upload_key, created_at FROM user_emoticons")
        .all<{ user_id: string; shortcut: string; upload_key: string; created_at: string }>(),
      db
        .prepare("SELECT id, channel_id, name, image_key, created_by, created_at FROM battlemaps")
        .all<{ id: string; channel_id: string; name: string; image_key: string | null; created_by: string | null; created_at: string }>(),
    ]);

  for (const row of messages.results) {
    const channel = row.channel_id ? directory.channels.get(row.channel_id) : undefined;
    const label = channel
      ? channel.kind === "dm"
        ? "DM"
        : `#${channel.name}`
      : "a message";
    const ref: MediaRef = {
      kind: "message",
      id: row.id,
      userId: row.user_id,
      serverId: channel && channel.kind !== "dm" ? channel.serverId : null,
      channelId: row.channel_id,
      label,
      at: row.created_at,
      deleted: Boolean(row.deleted_at),
    };
    const keys = new Set([
      ...(row.attachment_key ? [row.attachment_key] : []),
      ...jsonKeys(row.attachments),
      ...keysInText(row.audio_url),
      ...keysInText(row.content),
    ]);
    for (const key of keys) add(key, ref);
  }
  for (const row of users.results) {
    for (const key of keysInText(row.avatar_url)) {
      add(key, { kind: "avatar", id: row.id, userId: row.id, serverId: null, channelId: null, label: `${row.display_name}'s avatar`, at: null });
    }
    for (const key of keysInText(row.banner_url)) {
      add(key, { kind: "banner", id: row.id, userId: row.id, serverId: null, channelId: null, label: `${row.display_name}'s banner`, at: null });
    }
  }
  for (const row of servers.results) {
    for (const key of keysInText(row.icon_url)) {
      add(key, { kind: "server-icon", id: row.id, userId: row.created_by, serverId: row.id, channelId: null, label: `${row.name} icon`, at: null });
    }
    for (const key of keysInText(row.banner_url)) {
      add(key, { kind: "server-banner", id: row.id, userId: row.created_by, serverId: row.id, channelId: null, label: `${row.name} banner`, at: null });
    }
  }
  for (const row of emojis.results) {
    add(row.key, { kind: "emoji", id: row.id, userId: row.created_by, serverId: row.server_id, channelId: null, label: `:${row.name}:`, at: row.created_at });
  }
  for (const row of stickers.results) {
    add(row.key, { kind: "sticker", id: row.id, userId: row.created_by, serverId: row.server_id, channelId: null, label: `${row.name} sticker`, at: row.created_at });
  }
  for (const row of sounds.results) {
    add(row.key, { kind: "sound", id: row.id, userId: row.owner_id || row.created_by, serverId: row.server_id, channelId: null, label: `${row.name} sound`, at: row.created_at });
  }
  for (const row of emoticons.results) {
    add(row.upload_key, { kind: "emoticon", id: row.user_id, extra: row.shortcut, userId: row.user_id, serverId: null, channelId: null, label: `${userName(row.user_id)}'s ${row.shortcut} emoticon`, at: row.created_at });
  }
  for (const row of maps.results) {
    if (!row.image_key) continue;
    const channel = directory.channels.get(row.channel_id);
    add(row.image_key, { kind: "battlemap", id: row.id, userId: row.created_by, serverId: channel?.serverId ?? null, channelId: row.channel_id, label: `${row.name} battlemap`, at: row.created_at });
  }
  return refs;
}

/** Earliest-dated reference with a person attached is the likeliest uploader. */
function guessUploader(refs: MediaRef[]): string | null {
  const dated = refs
    .filter((ref) => ref.userId)
    .sort((a, b) => (a.at || "￿").localeCompare(b.at || "￿"));
  return dated[0]?.userId ?? null;
}

export async function listMedia(db: D1Database, bucket: R2Bucket): Promise<MediaItem[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      limit: 1000,
      cursor,
      include: ["httpMetadata", "customMetadata"],
    });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const directory = await loadDirectory(db);
  const refs = await scanReferences(db, directory);

  return objects.map((object) => {
    // Living Room covers are a fetch-once cache (app/api/(features)/media/cover), so
    // deleting one only means it is downloaded again next time.
    const cover = object.key.startsWith("covers/");
    const name = cover
      ? `Music cover ${object.key.slice(7, 15)}`
      : object.key.includes("--")
        ? object.key.split("--").slice(1).join("--")
        : object.key;
    const contentType = object.httpMetadata?.contentType || "application/octet-stream";
    const itemRefs = refs.get(object.key) ?? [];
    const uploaderId = object.customMetadata?.uploader || guessUploader(itemRefs);
    return {
      key: object.key,
      name,
      size: object.size,
      uploaded: object.uploaded.toISOString(),
      contentType,
      family: familyOf(contentType, name),
      uploaderId,
      uploaderName: uploaderId ? directory.users.get(uploaderId) ?? null : null,
      refs: itemRefs.map(({ extra: _extra, ...ref }) => ref),
      ...(cover ? { note: "Living Room cover cache, re-downloaded if needed" } : {}),
    };
  });
}

const REMOVED_NOTE = "(attachment removed by an admin)";

/** The stand-in text app/api/messages/route.ts writes for an attachment-only message. */
const AUTO_CAPTION = /^Shared (an image|a PDF document|a video|an audio file|a file|an attachment)$/;

/**
 * Deletes the files and detaches them everywhere they appear: messages lose
 * the attachment, avatars, banners and icons fall back to their defaults, and
 * emoji, sticker, sound and emoticon rows go away with their image.
 * Battlemaps keep their row; the map just shows no background.
 */
export async function deleteMedia(
  db: D1Database,
  bucket: R2Bucket,
  keys: string[],
  actor: User,
): Promise<{ deleted: number }> {
  const wanted = new Set(keys);
  const directory = await loadDirectory(db);
  const refs = await scanReferences(db, directory);
  const statements: D1PreparedStatement[] = [];
  const membersChanged = new Set<string>();
  const serversChanged = new Set<string>();

  const messageIds = new Set<string>();
  for (const key of wanted) {
    for (const ref of refs.get(key) ?? []) {
      switch (ref.kind) {
        case "message":
          messageIds.add(ref.id);
          break;
        case "avatar":
          statements.push(db.prepare("UPDATE users SET avatar_url = NULL WHERE id = ?").bind(ref.id));
          membersChanged.add(ref.id);
          break;
        case "banner":
          statements.push(db.prepare("UPDATE users SET banner_url = NULL WHERE id = ?").bind(ref.id));
          membersChanged.add(ref.id);
          break;
        case "server-icon":
          statements.push(db.prepare("UPDATE servers SET icon_url = NULL WHERE id = ?").bind(ref.id));
          serversChanged.add(ref.id);
          break;
        case "server-banner":
          statements.push(db.prepare("UPDATE servers SET banner_url = NULL WHERE id = ?").bind(ref.id));
          serversChanged.add(ref.id);
          break;
        case "emoji":
          statements.push(db.prepare("DELETE FROM emojis WHERE id = ?").bind(ref.id));
          if (ref.serverId) serversChanged.add(ref.serverId);
          break;
        case "sticker":
          statements.push(db.prepare("DELETE FROM stickers WHERE id = ?").bind(ref.id));
          if (ref.serverId) serversChanged.add(ref.serverId);
          break;
        case "sound":
          statements.push(db.prepare("DELETE FROM sounds WHERE id = ?").bind(ref.id));
          if (ref.serverId) serversChanged.add(ref.serverId);
          break;
        case "emoticon":
          statements.push(
            db
              .prepare("DELETE FROM user_emoticons WHERE user_id = ? AND shortcut = ?")
              .bind(ref.id, ref.extra ?? ""),
          );
          break;
        case "battlemap":
          break;
      }
    }
  }

  if (messageIds.size) {
    const ids = [...messageIds];
    const rows = await db
      .prepare(
        `SELECT id, content, attachment_key, attachments, audio_url FROM messages
          WHERE id IN (${ids.map(() => "?").join(",")})`,
      )
      .bind(...ids)
      .all<{ id: string; content: string; attachment_key: string | null; attachments: string | null; audio_url: string | null }>();
    for (const row of rows.results) {
      const attachmentKey = row.attachment_key && wanted.has(row.attachment_key) ? null : row.attachment_key;
      const remaining = jsonKeys(row.attachments).filter((key) => !wanted.has(key));
      const attachments = remaining.length ? JSON.stringify(remaining) : null;
      const audioUrl = keysInText(row.audio_url).some((key) => wanted.has(key)) ? null : row.audio_url;
      const empty =
        (!row.content.trim() || AUTO_CAPTION.test(row.content.trim())) &&
        !attachmentKey &&
        !attachments &&
        !audioUrl;
      statements.push(
        db
          .prepare(
            "UPDATE messages SET attachment_key = ?, attachments = ?, audio_url = ?, content = ? WHERE id = ?",
          )
          .bind(attachmentKey, attachments, audioUrl, empty ? REMOVED_NOTE : row.content, row.id),
      );
    }
  }

  if (statements.length) await db.batch(statements);
  await bucket.delete([...wanted]);

  // One audit line per server the files were posted in.
  const perServer = new Map<string, string[]>();
  for (const key of wanted) {
    const name = key.split("--").slice(1).join("--") || key;
    for (const serverId of new Set((refs.get(key) ?? []).map((ref) => ref.serverId))) {
      if (!serverId) continue;
      perServer.set(serverId, [...(perServer.get(serverId) ?? []), name]);
    }
  }
  await Promise.all([
    ...[...perServer].map(([serverId, names]) =>
      recordAudit(db, {
        serverId,
        actor,
        action: "media.delete",
        targetName: names.length === 1 ? names[0] : `${names.length} files`,
        detail: names.length > 1 ? names.join(", ") : null,
      }),
    ),
    ...[...membersChanged].map((id) => publishMemberUpdate(id)),
    ...[...serversChanged].map((id) => publishStructureChange(id)),
  ]);

  return { deleted: wanted.size };
}
