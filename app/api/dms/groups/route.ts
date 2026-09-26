import { currentUser, unauthorized } from "@/lib/auth";
import {
  createGroupDm,
  GROUP_DM_LIMIT,
  groupInfo,
  listDms,
} from "@/lib/dms";
import { isBlockedBetween } from "@/lib/friends";
import { publishStructureChange } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { postSystemMessage } from "@/lib/system-messages";

export const dynamic = "force-dynamic";

const NAME_LIMIT = 100;

async function setup(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return {
      error: Response.json(
        { error: "Message storage is not connected." },
        { status: 503 },
      ),
    } as const;
  }
  const user = await currentUser(request);
  if (!user) return { error: unauthorized() } as const;
  await ensureSchema(db);
  return { db, user } as const;
}

/** Keeps the ids that are real people who have not blocked (or been blocked by) `me`. */
async function reachableUsers(db: D1Database, me: string, ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids)) return [];
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === "string" && !!id))]
    .filter((id) => id !== me)
    .slice(0, GROUP_DM_LIMIT);
  if (!wanted.length) return [];
  const rows = await db
    .prepare(`SELECT id FROM users WHERE id IN (${wanted.map(() => "?").join(",")})`)
    .bind(...wanted)
    .all<{ id: string }>();
  const existing = ((rows.results || []) as Array<{ id: string }>).map((row) => row.id);
  const allowed: string[] = [];
  for (const id of existing) {
    if (!(await isBlockedBetween(db, me, id))) allowed.push(id);
  }
  return allowed;
}

async function namesOf(db: D1Database, ids: string[]): Promise<string> {
  if (!ids.length) return "";
  const rows = await db
    .prepare(`SELECT display_name FROM users WHERE id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<{ display_name: string }>();
  return ((rows.results || []) as Array<{ display_name: string }>)
    .map((row) => row.display_name)
    .join(", ");
}

/** Start a group DM with two or more people. */
export async function POST(request: Request) {
  const ctx = await setup(request);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    userIds?: unknown;
    name?: unknown;
  };
  const members = await reachableUsers(db, user.id, body.userIds);
  if (members.length < 1) {
    return Response.json({ error: "Pick at least one person to add." }, { status: 400 });
  }
  if (members.length + 1 > GROUP_DM_LIMIT) {
    return Response.json(
      { error: `A group can hold at most ${GROUP_DM_LIMIT} people.` },
      { status: 400 },
    );
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, NAME_LIMIT) : "";
  const channelId = await createGroupDm(db, user.id, members, name);
  await postSystemMessage(
    db,
    channelId,
    user,
    "system-group-create",
    `${user.display_name} started the group${name ? ` ${name}` : ""}.`,
  );
  // Everyone added needs to see the new conversation in their list.
  await publishStructureChange();
  return Response.json({ channelId, conversations: await listDms(db, user.id) });
}

/** Rename a group, or add people to it. Any member may do either. */
export async function PATCH(request: Request) {
  const ctx = await setup(request);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    name?: unknown;
    addUserIds?: unknown;
  };
  const group = body.channelId ? await groupInfo(db, body.channelId) : null;
  if (!group || !body.channelId || !group.members.includes(user.id)) {
    return Response.json({ error: "That group is not yours." }, { status: 404 });
  }
  const channelId = body.channelId;

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, NAME_LIMIT);
    if (name !== group.name) {
      await db.prepare("UPDATE channels SET name = ? WHERE id = ?").bind(name, channelId).run();
      await postSystemMessage(
        db,
        channelId,
        user,
        "system-group-rename",
        name
          ? `${user.display_name} renamed the group to ${name}.`
          : `${user.display_name} removed the group name.`,
        { name },
      );
    }
  }

  if (body.addUserIds !== undefined) {
    const adding = (await reachableUsers(db, user.id, body.addUserIds)).filter(
      (id) => !group.members.includes(id),
    );
    if (group.members.length + adding.length > GROUP_DM_LIMIT) {
      return Response.json(
        { error: `A group can hold at most ${GROUP_DM_LIMIT} people.` },
        { status: 400 },
      );
    }
    if (adding.length) {
      await db.batch(
        adding.map((id) =>
          db
            .prepare("INSERT OR IGNORE INTO dm_members (channel_id, user_id) VALUES (?, ?)")
            .bind(channelId, id),
        ),
      );
      await postSystemMessage(
        db,
        channelId,
        user,
        "system-group-add",
        `${user.display_name} added ${await namesOf(db, adding)} to the group.`,
        { userIds: adding },
      );
    }
  }

  await publishStructureChange();
  return Response.json({ ok: true, conversations: await listDms(db, user.id) });
}

/**
 * Leave a group (no `userId`), or, as its owner, remove someone from it. When
 * the owner leaves, the longest-standing remaining member takes over.
 */
export async function DELETE(request: Request) {
  const ctx = await setup(request);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    userId?: string;
  };
  const group = body.channelId ? await groupInfo(db, body.channelId) : null;
  if (!group || !body.channelId || !group.members.includes(user.id)) {
    return Response.json({ error: "That group is not yours." }, { status: 404 });
  }
  const channelId = body.channelId;
  const targetId = body.userId || user.id;
  if (targetId !== user.id && group.ownerId !== user.id) {
    return Response.json(
      { error: "Only the group owner can remove people." },
      { status: 403 },
    );
  }
  if (!group.members.includes(targetId)) {
    return Response.json({ error: "They are not in this group." }, { status: 404 });
  }

  await db
    .prepare("DELETE FROM dm_members WHERE channel_id = ? AND user_id = ?")
    .bind(channelId, targetId)
    .run();
  const remaining = group.members.filter((id) => id !== targetId);
  if (targetId === group.ownerId && remaining.length) {
    await db
      .prepare("UPDATE channels SET topic = ? WHERE id = ?")
      .bind(remaining[0], channelId)
      .run();
  }

  if (remaining.length) {
    if (targetId === user.id) {
      await postSystemMessage(
        db,
        channelId,
        user,
        "system-group-leave",
        `${user.display_name} left the group.`,
      );
    } else {
      await postSystemMessage(
        db,
        channelId,
        user,
        "system-group-remove",
        `${user.display_name} removed ${await namesOf(db, [targetId])} from the group.`,
        { userIds: [targetId] },
      );
    }
  }

  await publishStructureChange();
  return Response.json({ ok: true, conversations: await listDms(db, user.id) });
}
