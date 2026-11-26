import { channelAccess } from "@/lib/access";
import { currentUser, unauthorized } from "@/lib/auth";
import {
  clearBirthday,
  listBirthdays,
  parseBirthdayInput,
  setBirthday,
} from "@/lib/community-bot/birthdays";
import {
  buyShopItem,
  claimDaily,
  doWork,
  getBalance,
  getRichest,
  listShopItems,
  payMember,
} from "@/lib/community-bot/economy";
import {
  buildRankEmbed,
  getServerLeaderboard,
  getUserRank,
} from "@/lib/community-bot/levels";
import {
  clearChannelMessages,
  clearUserWarnings,
  issueWarning,
  listWarnings,
} from "@/lib/community-bot/moderation";
import {
  getCommunityBotConfig,
  postCommunityBotMessage,
} from "@/lib/community-bot/store";
import { canAny, Permission } from "@/lib/permissions";
import { DM_SERVER_ID, ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function resolveMemberByHandle(
  db: D1Database,
  serverId: string,
  token: string,
): Promise<{ id: string; username: string; display_name: string } | null> {
  const clean = token.replace(/^@+/, "").trim().toLowerCase();
  if (!clean) return null;
  return db
    .prepare(
      `SELECT u.id, u.username, u.display_name
         FROM server_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.server_id = ? AND (u.username_lower = ? OR LOWER(u.display_name) = ?)
        LIMIT 1`,
    )
    .bind(serverId, clean, clean)
    .first<{ id: string; username: string; display_name: string }>();
}

/**
 * POST /api/community-bot/command
 * Executes built-in Community Bot slash commands:
 * `/rank`, `/levels`, `/warn`, `/infractions`, `/clear-warns`, `/clear`.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    command?: string;
    args?: string;
  };
  const channelId = body.channelId?.trim() || "";
  const command = body.command?.trim().toLowerCase() || "";
  const args = (body.args || "").trim();

  if (!channelId || !command) {
    return Response.json({ error: "Missing channel or command." }, { status: 400 });
  }

  const access = await channelAccess(db, channelId, user);
  if (!access.ok) return access.response;
  const serverId = access.channel.serverId;
  if (!serverId || serverId === DM_SERVER_ID) {
    return Response.json({ error: "Community Bot commands only work inside servers." }, { status: 400 });
  }

  const config = await getCommunityBotConfig(db, serverId);
  if (!config.enabled) {
    return Response.json(
      { error: `${config.botName} is disabled on this server. Enable it in Server Settings → Integrations.` },
      { status: 400 },
    );
  }

  const commandText = args ? `/${command} ${args}` : `/${command}`;

  // ---- /rank [@user] ----
  if (command === "rank") {
    if (!config.plugins.levels.enabled) {
      return Response.json({ error: "Levels & XP plugin is disabled on this server." }, { status: 400 });
    }
    let targetId = user.id;
    if (args) {
      const firstToken = args.split(/\s+/)[0];
      const found = await resolveMemberByHandle(db, serverId, firstToken);
      if (!found) {
        return Response.json({ error: `Member "${firstToken}" was not found in this server.` }, { status: 404 });
      }
      targetId = found.id;
    }
    const entry = await getUserRank(db, serverId, targetId);
    if (!entry) return Response.json({ error: "Member not found." }, { status: 404 });

    await postCommunityBotMessage(
      db,
      serverId,
      channelId,
      {
        content: "",
        embeds: [buildRankEmbed(entry, config.plugins.levels.rankCardColor)],
        commandText,
        commandBy: user.display_name,
      },
      config,
    );
    return Response.json({ ok: true });
  }

  // ---- /levels ----
  if (command === "levels") {
    if (!config.plugins.levels.enabled) {
      return Response.json({ error: "Levels & XP plugin is disabled on this server." }, { status: 400 });
    }
    const top = await getServerLeaderboard(db, serverId, 10, 0);
    const medals = ["🥇", "🥈", "🥉"];
    const lines = top.length
      ? top.map(
          (e, i) =>
            `${medals[i] ?? `**#${e.rank}**`} **${e.displayName}** — Level **${e.level}** (${e.xp.toLocaleString()} XP)`,
        )
      : ["No XP recorded yet — start chatting to climb the leaderboard!"];

    const origin = new URL(request.url).origin;
    const leaderboardUrl = `${origin}/hangout/leaderboard/${encodeURIComponent(serverId)}`;

    await postCommunityBotMessage(
      db,
      serverId,
      channelId,
      {
        content: "",
        embeds: [
          {
            title: "🏆 Server Leaderboard",
            description: lines.join("\n"),
            url: leaderboardUrl,
            color: config.plugins.levels.rankCardColor,
            footer: { text: `Full leaderboard: ${leaderboardUrl}` },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "Open Web Leaderboard",
                emoji: { name: "🏆" },
                url: leaderboardUrl,
              },
            ],
          },
        ],
        commandText,
        commandBy: user.display_name,
      },
      config,
    );
    return Response.json({ ok: true });
  }

  // ---- /warn <@user> <reason> ----
  if (command === "warn") {
    if (!config.plugins.moderation.enabled) {
      return Response.json({ error: "Moderation plugin is disabled on this server." }, { status: 400 });
    }
    if (!(await canAny(db, user.id, serverId, Permission.MODERATE, Permission.MANAGE_SERVER))) {
      return Response.json({ error: "Moderate Members permission is required." }, { status: 403 });
    }
    const parts = args.split(/\s+/);
    const targetToken = parts[0] || "";
    const reason = parts.slice(1).join(" ").trim() || "No reason provided";
    if (!targetToken) {
      return Response.json({ error: "Usage: /warn @username reason" }, { status: 400 });
    }
    const target = await resolveMemberByHandle(db, serverId, targetToken);
    if (!target) {
      return Response.json({ error: `Member "${targetToken}" was not found.` }, { status: 404 });
    }
    if (target.id === user.id) {
      return Response.json({ error: "You cannot warn yourself." }, { status: 400 });
    }

    const res = await issueWarning(db, {
      serverId,
      userId: target.id,
      moderatorId: user.id,
      reason,
    });

    const escText = res.escalated
      ? `\n🚨 **Auto-escalation triggered:** ${
          res.escalated.action === "timeout"
            ? `Timed out for ${res.escalated.durationMin} minutes`
            : res.escalated.action === "kick"
              ? "Kicked from the server"
              : "Banned from the server"
        }`
      : "";

    await postCommunityBotMessage(
      db,
      serverId,
      channelId,
      {
        content: "",
        embeds: [
          {
            title: `⚠️ ${target.display_name} has been warned`,
            description: `**Reason:** ${reason}\n**Total warnings:** ${res.totalWarnings}${escText}`,
            color: res.escalated ? "#ef4444" : "#f59e0b",
            footer: { text: `Issued by ${user.display_name}` },
          },
        ],
        commandText,
        commandBy: user.display_name,
      },
      config,
    );
    return Response.json({ ok: true });
  }

  // ---- /infractions [@user] ----
  if (command === "infractions") {
    if (!config.plugins.moderation.enabled) {
      return Response.json({ error: "Moderation plugin is disabled on this server." }, { status: 400 });
    }
    let targetId = user.id;
    let targetLabel = user.display_name;
    if (args) {
      const firstToken = args.split(/\s+/)[0];
      const found = await resolveMemberByHandle(db, serverId, firstToken);
      if (!found) {
        return Response.json({ error: `Member "${firstToken}" was not found.` }, { status: 404 });
      }
      if (
        found.id !== user.id &&
        !(await canAny(db, user.id, serverId, Permission.MODERATE, Permission.MANAGE_SERVER))
      ) {
        return Response.json({ error: "Only moderators can view other members' infractions." }, { status: 403 });
      }
      targetId = found.id;
      targetLabel = found.display_name;
    }

    const warns = await listWarnings(db, serverId, targetId, 15);
    const lines = warns.length
      ? warns.map(
          (w, i) =>
            `**${i + 1}.** ${w.reason} — *by ${w.moderatorName}* (${w.createdAt.slice(0, 10)})`,
        )
      : ["No warnings on record. Clean slate! ✨"];

    await postCommunityBotMessage(
      db,
      serverId,
      channelId,
      {
        content: "",
        embeds: [
          {
            title: `📋 Infractions for ${targetLabel} (${warns.length})`,
            description: lines.join("\n"),
            color: warns.length ? "#f59e0b" : "#22c55e",
          },
        ],
        commandText,
        commandBy: user.display_name,
      },
      config,
    );
    return Response.json({ ok: true });
  }

  // ---- /clear-warns <@user> ----
  if (command === "clear-warns") {
    if (!config.plugins.moderation.enabled) {
      return Response.json({ error: "Moderation plugin is disabled on this server." }, { status: 400 });
    }
    if (!(await canAny(db, user.id, serverId, Permission.MODERATE, Permission.MANAGE_SERVER))) {
      return Response.json({ error: "Moderate Members permission is required." }, { status: 403 });
    }
    const targetToken = args.split(/\s+/)[0] || "";
    if (!targetToken) {
      return Response.json({ error: "Usage: /clear-warns @username" }, { status: 400 });
    }
    const target = await resolveMemberByHandle(db, serverId, targetToken);
    if (!target) {
      return Response.json({ error: `Member "${targetToken}" was not found.` }, { status: 404 });
    }
    const cleared = await clearUserWarnings(db, serverId, target.id);
    return Response.json({
      ok: true,
      notice: `Cleared ${cleared} warning${cleared === 1 ? "" : "s"} for ${target.display_name}.`,
    });
  }

  // ---- /clear <1-100> ----
  if (command === "clear") {
    if (!config.plugins.moderation.enabled) {
      return Response.json({ error: "Moderation plugin is disabled on this server." }, { status: 400 });
    }
    if (
      !(await canAny(
        db,
        user.id,
        serverId,
        Permission.MANAGE_MESSAGES,
        Permission.MODERATE,
        Permission.MANAGE_SERVER,
      ))
    ) {
      return Response.json({ error: "Manage Messages permission is required." }, { status: 403 });
    }
    const count = Number.parseInt(args, 10);
    if (!Number.isFinite(count) || count < 1 || count > 100) {
      return Response.json({ error: "Usage: /clear <1-100>" }, { status: 400 });
    }
    const deleted = await clearChannelMessages(db, channelId, count);
    return Response.json({
      ok: true,
      notice: `🧹 Deleted ${deleted} message${deleted === 1 ? "" : "s"}.`,
    });
  }

  // ---- Economy commands ----
  if (
    command === "balance" ||
    command === "daily" ||
    command === "work" ||
    command === "pay" ||
    command === "shop" ||
    command === "buy" ||
    command === "richest"
  ) {
    if (!config.plugins.economy.enabled) {
      return Response.json({ error: "Economy plugin is disabled on this server." }, { status: 400 });
    }
    const ec = config.plugins.economy;

    if (command === "balance") {
      let targetId = user.id;
      let targetLabel = user.display_name;
      if (args) {
        const found = await resolveMemberByHandle(db, serverId, args.split(/\s+/)[0]);
        if (!found) return Response.json({ error: "Member not found." }, { status: 404 });
        targetId = found.id;
        targetLabel = found.display_name;
      }
      const bal = await getBalance(db, serverId, targetId);
      await postCommunityBotMessage(
        db,
        serverId,
        channelId,
        {
          content: "",
          embeds: [
            {
              title: `${bal.currencyEmoji} ${targetLabel}'s Balance`,
              description: `**${bal.balance.toLocaleString()} ${bal.currencyName}**`,
              color: "#f59e0b",
            },
          ],
          commandText,
          commandBy: user.display_name,
        },
        config,
      );
      return Response.json({ ok: true });
    }

    if (command === "daily") {
      const res = await claimDaily(db, serverId, user.id);
      if (!res.ok) {
        const hrs = Math.ceil(res.retryAfterMs / 3_600_000);
        return Response.json({ error: `You already claimed your daily! Try again in ~${hrs}h.` }, { status: 400 });
      }
      await postCommunityBotMessage(
        db,
        serverId,
        channelId,
        {
          content: "",
          embeds: [
            {
              title: `${res.currencyEmoji} Daily Reward Claimed!`,
              description: `${user.display_name} received **+${res.gained.toLocaleString()} ${res.currencyName}**.\nNew balance: **${res.balance.toLocaleString()} ${res.currencyName}**`,
              color: "#22c55e",
            },
          ],
          commandText,
          commandBy: user.display_name,
        },
        config,
      );
      return Response.json({ ok: true });
    }

    if (command === "work") {
      const res = await doWork(db, serverId, user.id);
      if (!res.ok) {
        const mins = Math.ceil(res.retryAfterMs / 60_000);
        return Response.json({ error: `You're resting from work! Try again in ${mins}m.` }, { status: 400 });
      }
      await postCommunityBotMessage(
        db,
        serverId,
        channelId,
        {
          content: "",
          embeds: [
            {
              title: `${res.currencyEmoji} Shift Complete!`,
              description: `${user.display_name} earned **+${res.gained.toLocaleString()} ${res.currencyName}**!\nNew balance: **${res.balance.toLocaleString()} ${res.currencyName}**`,
              color: "#6366f1",
            },
          ],
          commandText,
          commandBy: user.display_name,
        },
        config,
      );
      return Response.json({ ok: true });
    }

    if (command === "pay") {
      const parts = args.split(/\s+/);
      const targetToken = parts[0] || "";
      const amount = Number.parseInt(parts[1] || "", 10);
      if (!targetToken || !Number.isFinite(amount)) {
        return Response.json({ error: "Usage: /pay @username 100" }, { status: 400 });
      }
      const target = await resolveMemberByHandle(db, serverId, targetToken);
      if (!target) return Response.json({ error: `Member "${targetToken}" not found.` }, { status: 404 });
      const res = await payMember(db, serverId, user.id, target.id, amount);
      if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
      await postCommunityBotMessage(
        db,
        serverId,
        channelId,
        {
          content: `${res.currencyEmoji} **${user.display_name}** sent **${amount.toLocaleString()} ${res.currencyName}** to **${target.display_name}**!`,
          commandText,
          commandBy: user.display_name,
        },
        config,
      );
      return Response.json({ ok: true });
    }

    if (command === "shop") {
      const items = await listShopItems(db, serverId);
      const lines = items.length
        ? items.map(
            (i) =>
              `${i.emoji} **${i.name}** — ${ec.currencyEmoji} **${i.price.toLocaleString()} ${ec.currencyName}**${i.description ? `\n*${i.description}*` : ""}`,
          )
        : ["The shop is empty! Server admins can add items in the Community Bot Dashboard."];
      await postCommunityBotMessage(
        db,
        serverId,
        channelId,
        {
          content: "",
          embeds: [
            {
              title: `🛍️ Server Shop`,
              description: lines.join("\n\n"),
              color: "#f59e0b",
              footer: { text: "Use /buy <item name> to purchase" },
            },
          ],
          commandText,
          commandBy: user.display_name,
        },
        config,
      );
      return Response.json({ ok: true });
    }

    if (command === "buy") {
      if (!args) return Response.json({ error: "Usage: /buy <item name>" }, { status: 400 });
      const res = await buyShopItem(db, serverId, user.id, args);
      if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
      await postCommunityBotMessage(
        db,
        serverId,
        channelId,
        {
          content: "",
          embeds: [
            {
              title: `🛍️ Purchase Complete!`,
              description: `${user.display_name} bought ${res.item.emoji} **${res.item.name}** for ${res.currencyEmoji} ${res.item.price.toLocaleString()} ${res.currencyName}.\nRemaining balance: **${res.remainingBalance.toLocaleString()} ${res.currencyName}**`,
              color: "#22c55e",
            },
          ],
          commandText,
          commandBy: user.display_name,
        },
        config,
      );
      return Response.json({ ok: true });
    }

    if (command === "richest") {
      const top = await getRichest(db, serverId, 10);
      const medals = ["🥇", "🥈", "🥉"];
      const lines = top.length
        ? top.map(
            (r, i) =>
              `${medals[i] ?? `**#${i + 1}**`} **${r.displayName}** — ${ec.currencyEmoji} **${r.balance.toLocaleString()} ${ec.currencyName}**`,
          )
        : ["No balances yet — try `/daily` or `/work`!"];
      await postCommunityBotMessage(
        db,
        serverId,
        channelId,
        {
          content: "",
          embeds: [{ title: `${ec.currencyEmoji} Richest Members`, description: lines.join("\n"), color: "#f59e0b" }],
          commandText,
          commandBy: user.display_name,
        },
        config,
      );
      return Response.json({ ok: true });
    }
  }

  // ---- Birthday commands ----
  if (command === "birthday") {
    if (!config.plugins.birthdays.enabled) {
      return Response.json({ error: "Birthdays plugin is disabled on this server." }, { status: 400 });
    }
    if (args.toLowerCase() === "off" || args.toLowerCase() === "clear") {
      await clearBirthday(db, serverId, user.id);
      return Response.json({ ok: true, notice: "🎂 Removed your birthday from this server." });
    }
    const parsed = parseBirthdayInput(args);
    if (!parsed) {
      return Response.json({ error: "Usage: /birthday MM-DD (e.g. /birthday 07-14) or /birthday off" }, { status: 400 });
    }
    await setBirthday(db, serverId, user.id, parsed.month, parsed.day);
    return Response.json({
      ok: true,
      notice: `🎂 Saved your birthday as ${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}!`,
    });
  }

  if (command === "birthdays") {
    if (!config.plugins.birthdays.enabled) {
      return Response.json({ error: "Birthdays plugin is disabled on this server." }, { status: 400 });
    }
    const list = await listBirthdays(db, serverId);
    const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const lines = list.length
      ? list.map((b) => `🎂 **${b.displayName}** — ${months[b.month]} ${b.day}`)
      : ["No birthdays registered yet. Use `/birthday MM-DD` to add yours!"];
    await postCommunityBotMessage(
      db,
      serverId,
      channelId,
      {
        content: "",
        embeds: [{ title: "🎂 Server Birthdays", description: lines.join("\n"), color: "#ec4899" }],
        commandText,
        commandBy: user.display_name,
      },
      config,
    );
    return Response.json({ ok: true });
  }

  return Response.json({ error: `Unknown command: /${command}` }, { status: 400 });
}
