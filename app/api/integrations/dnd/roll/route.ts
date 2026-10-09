import { currentUser, unauthorized } from "@/lib/auth";
import { channelAccess } from "@/lib/access";
import { channelKindInfo } from "@/lib/channel-kinds";
import { channelAudience } from "@/lib/dms";
import { publishMessage, publishMessageEvent } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { limitUser, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { blockIfTimedOut } from "@/lib/timeouts";
import { publicMessage } from "@/app/api/messages/route";
import { activeRecording, elapsedMs } from "@/lib/recording";
import { ensureSchema } from "@/lib/schema";
import { findChannel, isServerMember } from "@/lib/servers";
import { bindings, type StoredMessage } from "@/lib/storage";
import type { DiceRollEvent } from "@/lib/protocol";

export const dynamic = "force-dynamic";

/** Rejection sampling so every face of the die stays equally likely. */
function randomDie(sides: number): number {
  const limit = Math.floor(4294967296 / sides) * sides;
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return (values[0] % sides) + 1;
}

function randomSeed(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

interface ParsedTerm {
  sides: number;
  count: number;
  sign: 1 | -1;
  keep?: "kh1" | "kl1";
}

export interface ResolvedRoll {
  roll: DiceRollEvent;
  details: string[];
  expression: string;
  label: string;
  mode: string;
  total: number;
  modifier: number;
}

/** One dice term the roller asked for. */
function parseToken(token: string): ParsedTerm | null {
  const sign = token.startsWith("-") ? -1 : 1;
  const term = token.replace(/^[+-]/, "");
  const dice = term.match(/^(\d*)d(\d+)(kh1|kl1)?$/i);
  if (!dice) return null;
  const count = Number(dice[1] || 1);
  const sides = Number(dice[2]);
  const keep = dice[3]?.toLowerCase() as "kh1" | "kl1" | undefined;
  if (
    !Number.isInteger(count) ||
    !Number.isInteger(sides) ||
    count < 1 ||
    count > 100 ||
    sides < 2 ||
    sides > 1000
  ) {
    return null;
  }
  return { sides, count, sign: sign as 1 | -1, keep };
}

/**
 * Resolve a roll. The server always rolls its own fair values; the 3D dice on
 * every screen animate to these exact faces, so there is nothing for a client
 * to supply (and no way to choose a natural 20).
 */
export function resolveRoll(
  input: string,
  user: { id: string; display_name: string },
  theme?: string,
  themeColor?: string,
  material?: "plastic" | "metal" | "wood" | "glass",
  texture?: string,
): ResolvedRoll | { error: string } {
  const advantage = /\b(adv|advantage)\b/i.test(input);
  const disadvantage = /\b(dis|disadvantage)\b/i.test(input);
  const criticalDamage = /\b(crit|critical)\b/i.test(input);
  if (advantage && disadvantage) {
    return { error: "Choose advantage or disadvantage, not both." };
  }
  // Everything that is not dice, a number or an operator is a label:
  // `/roll d20+5 stealth` or `/roll 2d6+3 Scimitar damage`.
  const words = input
    .replace(/\b(adv|advantage|dis|disadvantage|crit|critical)\b/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  const diceWord = /^[+-]?(?:\d*d\d+(?:kh1|kl1)?|\d+)?(?:[+-](?:\d*d\d+(?:kh1|kl1)?|\d+))*[+-]?$/i;
  const expressionWords: string[] = [];
  const labelWords: string[] = [];
  for (const word of words) {
    if (diceWord.test(word)) expressionWords.push(word);
    else labelWords.push(word);
  }
  const expression = expressionWords.join("");
  const label = labelWords.join(" ").slice(0, 80);
  const tokens = expression.match(/[+-]?[^+-]+/g) || [];
  if (!tokens.length) {
    return { error: "Add some dice, like `/roll d20+3 stealth` or `/roll 2d6+2 damage`." };
  }
  if (tokens.length > 20) {
    return { error: "That dice expression is too complex." };
  }

  let total = 0;
  let modifier = 0;
  const details: string[] = [];
  const diceEvents: DiceRollEvent["dice"] = [];

  for (const token of tokens) {
    const sign = token.startsWith("-") ? -1 : 1;
    const term = token.replace(/^[+-]/, "");
    const parsed = parseToken(token);

    if (parsed) {
      let count = parsed.count;
      const sides = parsed.sides;
      const keep = parsed.keep;
      if ((advantage || disadvantage) && count === 1 && sides === 20) count = 2;
      // A critical hit rolls every damage die twice; modifiers are not doubled.
      else if (criticalDamage && !keep) count = Math.min(count * 2, 100);

      const rolls = Array.from({ length: count }, () => randomDie(sides));

      const keepMode =
        keep || ((advantage || disadvantage) && sides === 20 && count === 2
          ? advantage
            ? "kh1"
            : "kl1"
          : null);
      let keptIndex = -1;
      if (keepMode) {
        const target =
          keepMode === "kh1" ? Math.max(...rolls) : Math.min(...rolls);
        keptIndex = rolls.indexOf(target);
      }
      const keptRolls =
        keptIndex >= 0 ? [rolls[keptIndex]] : rolls;
      const subtotal = keptRolls.reduce((sum, value) => sum + value, 0);
      total += sign * subtotal;
      diceEvents.push({
        sides,
        sign: sign as 1 | -1,
        rolls: rolls.map((value, index) => ({
          value,
          kept: keptIndex < 0 || keptIndex === index,
        })),
      });
      details.push(
        `${sign < 0 ? "−" : ""}${count}d${sides} [${rolls.join(", ")}]${
          keptIndex < 0 ? ` = ${subtotal}` : ` → kept ${rolls[keptIndex]}`
        }`,
      );
      continue;
    }

    if (!/^\d+$/.test(term)) {
      return {
        error: `I couldn't understand \`${term}\`. Try something like \`2d20kh1+5\`.`,
      };
    }
    const value = Number(term) * sign;
    modifier += value;
    total += value;
    details.push(`${value >= 0 ? "+" : "−"}${Math.abs(value)}`);
  }

  const roll: DiceRollEvent = {
    expression,
    dice: diceEvents,
    modifier,
    total,
    roller: { id: user.id, displayName: user.display_name },
    rollType: advantage
      ? "advantage"
      : disadvantage
        ? "disadvantage"
        : criticalDamage
          ? "critical-damage"
          : "normal",
    animationSeed: randomSeed(),
    theme: theme || undefined,
    themeColor: themeColor || undefined,
    material: material || undefined,
    texture: texture || undefined,
  };

  const mode = advantage
    ? " with advantage"
    : disadvantage
      ? " with disadvantage"
      : criticalDamage
        ? " as a critical hit"
        : "";
  return { roll, details, expression, label, mode, total, modifier };
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as {
    command?: string;
    channelId?: string;
    textChannelId?: string;
    /** When true, return the parsed roll for the roller to animate, no broadcast. */
    preview?: boolean;
    theme?: string;
    themeColor?: string;
    material?: "plastic" | "metal" | "wood" | "glass";
    texture?: string;
  };
  const rawInput = (body.command || "").replace(/^\/roll\s*/i, "").trim();
  if (!rawInput) {
    return Response.json(
      { error: "Use `/roll 2d20`, `/roll 4d6+2`, or `/roll d20 advantage`." },
      { status: 400 },
    );
  }

  const allowedThemes = [
    "default",
    "pride",
    "trans",
    "nonbinary",
    "vampire",
    "dark-academia",
    "darkacademia",
    "matrix",
    "cyberpunk",
  ];
  const allowedMaterials = ["plastic", "metal", "wood", "glass"] as const;
  const allowedTextures = [
    "none",
    "cloudy",
    "fire",
    "marble",
    "water",
    "ice",
    "paper",
    "speckles",
    "glitter",
    "stars",
    "stainedglass",
    "wood",
    "metal",
    "skulls",
    "dragon",
    "lizard",
    "bird",
    "astral",
    "tiger",
    "leopard",
    "cheetah",
  ] as const;
  const COLOR_NAMES: Record<string, string> = {
    blue: "#2563eb",
    skyblue: "#0284c7",
    indigo: "#6366f1",
    violet: "#7c3aed",
    purple: "#7c3aed",
    pink: "#db2777",
    crimson: "#e11d48",
    red: "#e11d48",
    emerald: "#059669",
    green: "#059669",
    amber: "#d97706",
    gold: "#d97706",
    yellow: "#eab308",
    dark: "#1e293b",
    black: "#1e293b",
    slate: "#1e293b",
  };

  let parsedTheme: string | undefined;
  let parsedThemeColor: string | undefined;
  let parsedMaterial: "plastic" | "metal" | "wood" | "glass" | undefined;
  let parsedTexture: string | undefined;
  let input = rawInput;

  // Extract explicit hex color: #2563eb
  const hexMatch = input.match(/(?:^|\s)#([0-9a-fA-F]{6})\b/);
  if (hexMatch) {
    parsedThemeColor = `#${hexMatch[1]}`;
    input = input.replace(hexMatch[0], " ").trim();
  }

  // Extract a named theme, colour, material or texture (`/roll 2d20 red metal skulls`), but only when style
  // words are the only extras; otherwise they are part of a label, as in
  // `/roll d20+14 Adult Red Dragon Bite attack`.
  const tokens = input.split(/\s+/);
  const isStyleWord = (token: string) =>
    allowedThemes.includes(token.toLowerCase()) ||
    allowedMaterials.includes(token.toLowerCase() as (typeof allowedMaterials)[number]) ||
    allowedTextures.includes(token.toLowerCase() as (typeof allowedTextures)[number]) ||
    Boolean(COLOR_NAMES[token.toLowerCase()]);
  const extras = tokens.filter(
    (token) =>
      !/^[+-]?[\dd+\-khl]*$/i.test(token) &&
      !/^(adv|advantage|dis|disadvantage|crit|critical)$/i.test(token),
  );
  const styleOnly = extras.length > 0 && extras.every(isStyleWord);
  const remainingTokens: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (styleOnly && allowedThemes.includes(lower)) {
      parsedTheme = lower === "darkacademia" ? "dark-academia" : lower;
    } else if (styleOnly && allowedMaterials.includes(lower as (typeof allowedMaterials)[number])) {
      parsedMaterial = lower as (typeof allowedMaterials)[number];
    } else if (styleOnly && allowedTextures.includes(lower as (typeof allowedTextures)[number])) {
      parsedTexture = lower;
    } else if (styleOnly && COLOR_NAMES[lower]) {
      parsedThemeColor = COLOR_NAMES[lower];
    } else {
      remainingTokens.push(token);
    }
  }
  input = remainingTokens.join(" ").trim();
  if (!input) input = rawInput; // Fallback if user only typed theme name

  const rawTheme =
    parsedTheme ||
    (body.theme && allowedThemes.includes(body.theme.toLowerCase()) ? body.theme.toLowerCase() : "default");
  const theme = rawTheme === "darkacademia" ? "dark-academia" : rawTheme;
  const themeColor =
    parsedThemeColor ||
    (typeof body.themeColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.themeColor)
      ? body.themeColor
      : undefined);
  const material =
    parsedMaterial ||
    (body.material && allowedMaterials.includes(body.material as (typeof allowedMaterials)[number])
      ? (body.material as (typeof allowedMaterials)[number])
      : undefined);
  const texture =
    parsedTexture ||
    (typeof body.texture === "string" && allowedTextures.includes(body.texture.toLowerCase() as any)
      ? body.texture.toLowerCase()
      : undefined);

  const result = resolveRoll(
    input,
    { id: user.id, display_name: user.display_name },
    theme,
    themeColor,
    material,
    texture,
  );
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  const { roll, details, expression, label, mode, total, modifier } = result;



  // The result above is authoritative. Consumers animate these exact faces;
  // they never generate a second result.
  const db = bindings().DB;
  const voiceChannelId = body.channelId?.slice(0, 64) || "";
  const textChannelId = body.textChannelId?.slice(0, 64) || "";
  if (db) {
    await ensureSchema(db);

    // Publish to the voice room (if you're in one), so people on the stage
    // see the dice tumble.
    if (voiceChannelId) {
      const voiceChannel = await findChannel(db, voiceChannelId);
      if (
        voiceChannel?.kind === "voice" &&
        (await isServerMember(db, voiceChannel.server_id, user.id))
      ) {
        await publishMessageEvent(voiceChannelId, { t: "dice-roll", roll });
        const recording = await activeRecording(db, voiceChannelId);
        if (recording) {
          const consent = await db
            .prepare(
              `SELECT decision FROM recording_participants
                WHERE session_id = ? AND user_id = ?`,
            )
            .bind(recording.id, user.id)
            .first<{ decision: string }>();
          if (consent?.decision === "accepted") {
            await db
              .prepare(
                `INSERT INTO recording_dice_events
                   (id, session_id, roller_id, expression, rolls_json, modifier,
                    total, roll_type, animation_seed, at_ms, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                crypto.randomUUID(),
                recording.id,
                user.id,
                roll.expression,
                JSON.stringify(roll.dice),
                modifier,
                total,
                roll.rollType,
                roll.animationSeed,
                elapsedMs(recording),
                new Date().toISOString(),
              )
              .run();
          }
        }
      }
    }

    // Publish to the text channel the command was typed into, so anyone
    // reading chat sees the dice tumble too. This works even when the roller
    // isn't in a voice room.
    if (textChannelId && textChannelId !== voiceChannelId) {
      const textChannel = await findChannel(db, textChannelId);
      if (
        textChannel?.kind === "text" &&
        (voiceChannelId
          ? (await findChannel(db, voiceChannelId))?.server_id ===
            textChannel.server_id
          : true) &&
        (await isServerMember(db, textChannel.server_id, user.id))
      ) {
        await publishMessageEvent(textChannelId, { t: "dice-roll", roll });
      }
    }
  }

  const text = `${label ? `${label}: ` : ""}rolled ${expression}${mode}: ${details.join(" · ")}. Total: ${total}`;
  const payload = {
    type: "roll",
    name: "Dice result",
    expression,
    mode: mode.trim(),
    label: label || undefined,
    roller: user.display_name,
    total,
    modifier,
    details,
    dice: roll.dice,
  };

  // The card is written here, by the server that rolled, and marked verified.
  // A browser can still post a lookalike through /api/messages, but it can
  // never carry the mark: that route strips it.
  if (db && textChannelId && !body.preview) {
    const posted = await postVerifiedRoll(db, user, textChannelId, {
      text,
      payload: { ...payload, verified: true },
      command: `/roll ${rawInput}`.slice(0, 200),
    });
    if (posted instanceof Response) return posted;
    return Response.json({ text, kind: "dnd", payload: { ...payload, verified: true }, roll, posted: true, message: posted });
  }

  return Response.json({ text, kind: "dnd", payload, roll });
}

/** Writes a server-rolled card into a channel the roller can post in. */
async function postVerifiedRoll(
  db: D1Database,
  user: { id: string; display_name: string; is_admin?: number },
  channelId: string,
  card: { text: string; payload: Record<string, unknown>; command: string },
): Promise<Response | ReturnType<typeof publicMessage>> {
  const access = await channelAccess(db, channelId, user);
  if (!access.ok) return access.response;
  if (!access.channel.isDm && !channelKindInfo(access.channel.kind).text) {
    return Response.json({ error: "Roll in a text channel." }, { status: 400 });
  }
  if (!access.channel.isDm) {
    const timedOut = await blockIfTimedOut(db, channelId, user.id);
    if (timedOut) return timedOut;
    if (
      channelKindInfo(access.channel.kind).moderatorOnlyPosting &&
      !(await can(db, user.id, access.channel.serverId, Permission.MANAGE_MESSAGES))
    ) {
      return Response.json({ error: "Only moderators can post announcements here." }, { status: 403 });
    }
  }
  const limited = await limitUser(db, WRITE_RATE_LIMITS.message, user.id);
  if (limited) return limited;

  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: access.channel.name,
    channel_id: channelId,
    user_id: null,
    author: "D&D Bot",
    avatar: "⚔",
    color: "#b8a6ff",
    content: card.text,
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    kind: "dnd",
    payload: JSON.stringify(card.payload),
    command_text: card.command,
    command_by: user.display_name,
    sender_id: user.id,
  };
  await db
    .prepare(
      `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
        is_bot, created_at, kind, payload, command_text, command_by, sender_id)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stored.id,
      stored.channel,
      channelId,
      stored.author,
      stored.avatar,
      stored.color,
      stored.content,
      stored.created_at,
      stored.kind,
      stored.payload,
      stored.command_text,
      stored.command_by,
      stored.sender_id,
    )
    .run();
  const message = publicMessage(stored);
  await publishMessage(
    channelId,
    message,
    access.channel.isDm ? await channelAudience(db, channelId) : null,
  );
  return message;
}
