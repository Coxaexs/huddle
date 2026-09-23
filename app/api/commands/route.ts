import { currentUser, unauthorized } from "@/lib/auth";
import { listCommandsForServer, runBotCommand } from "@/lib/discord/interactions";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Discord option types this maps text arguments onto. */
const OPTION_SUB_COMMAND = 1;
const OPTION_SUB_COMMAND_GROUP = 2;
const OPTION_STRING = 3;
const OPTION_INTEGER = 4;
const OPTION_BOOLEAN = 5;
const OPTION_NUMBER = 10;
/** Users, channels, roles, mentionables, attachments: no text form here. */
const UNSUPPORTED_TYPES = new Set([6, 7, 8, 9, 11]);

interface CommandOption {
  name: string;
  type?: number;
  required?: boolean;
  options?: CommandOption[];
  choices?: Array<{ name: string; value: string | number }>;
}

interface ParsedOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: ParsedOption[];
}

class UsageError extends Error {}

function coerce(option: CommandOption, raw: string): string | number | boolean | undefined {
  const type = option.type ?? OPTION_STRING;
  if (option.choices?.length) {
    // Accept the label people see or the value the bot gets, any case, and a
    // unique prefix: `/lookup monster goblin` for a "Monster" choice.
    const lower = raw.toLowerCase();
    const exact = option.choices.find(
      (choice) =>
        choice.name.toLowerCase() === lower || String(choice.value).toLowerCase() === lower,
    );
    const prefixed = option.choices.filter((choice) =>
      choice.name.toLowerCase().startsWith(lower),
    );
    const choice = exact ?? (prefixed.length === 1 ? prefixed[0] : undefined);
    if (!choice) {
      throw new UsageError(
        `${option.name} must be one of: ${option.choices.map((c) => c.name).join(", ")}`,
      );
    }
    return choice.value;
  }
  if (type === OPTION_INTEGER) {
    const value = parseInt(raw, 10);
    if (!Number.isFinite(value)) throw new UsageError(`${option.name} must be a whole number`);
    return value;
  }
  if (type === OPTION_NUMBER) {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new UsageError(`${option.name} must be a number`);
    return value;
  }
  if (type === OPTION_BOOLEAN) return /^(true|yes|y|on|1)$/i.test(raw);
  return raw;
}

/**
 * Turns the rest of a typed slash command into Discord option values.
 *
 * Hoffle's composer is a text box, not Discord's structured command UI, so the
 * arguments arrive as one string. Subcommands are the first word
 * (`/initiative join 3`). Options can be named (`name:Goblin hp:7`) or
 * positional, and the last positional string takes everything left over, so
 * `/play some long title` keeps every word.
 */
function parseOptions(options: CommandOption[], input: string): ParsedOption[] {
  const trimmed = input.trim();
  const subs = options.filter(
    (option) =>
      option.type === OPTION_SUB_COMMAND || option.type === OPTION_SUB_COMMAND_GROUP,
  );
  if (subs.length) {
    const [first = "", ...rest] = trimmed.split(/\s+/);
    const sub = subs.find((option) => option.name === first.toLowerCase());
    if (!sub) {
      throw new UsageError(`Choose one: ${subs.map((option) => option.name).join(", ")}`);
    }
    return [
      {
        name: sub.name,
        type: sub.type!,
        options: parseOptions(sub.options || [], rest.join(" ")),
      },
    ];
  }

  const usable = options.filter((option) => !UNSUPPORTED_TYPES.has(option.type ?? OPTION_STRING));
  const parsed: ParsedOption[] = [];
  const push = (option: CommandOption, raw: string) => {
    const value = coerce(option, raw.trim());
    if (value === undefined || value === "") return;
    parsed.push({ name: option.name, type: option.type ?? OPTION_STRING, value });
  };

  // Named form: `key:value key2:some longer value`.
  const names = usable.map((option) => option.name.toLowerCase());
  const namedRe = new RegExp(`(?:^|\\s)(${names.map((n) => n.replace(/[-]/g, "\\-")).join("|")}):`, "gi");
  const marks = names.length ? [...trimmed.matchAll(namedRe)] : [];
  if (marks.length) {
    marks.forEach((mark, index) => {
      const start = (mark.index ?? 0) + mark[0].length;
      const end = index + 1 < marks.length ? marks[index + 1].index ?? trimmed.length : trimmed.length;
      const option = usable.find((candidate) => candidate.name.toLowerCase() === mark[1].toLowerCase());
      if (option) push(option, trimmed.slice(start, end));
    });
  } else {
    const words = trimmed.length ? trimmed.split(/\s+/) : [];
    usable.forEach((option, index) => {
      const isLast = index === usable.length - 1;
      const raw = isLast ? words.slice(index).join(" ") : words[index];
      if (raw !== undefined && raw !== "") push(option, raw);
    });
  }

  const missing = usable.filter(
    (option) => option.required && !parsed.some((entry) => entry.name === option.name),
  );
  if (missing.length) {
    throw new UsageError(`Missing ${missing.map((option) => `<${option.name}>`).join(" ")}`);
  }
  return parsed;
}

/** The bot commands the composer's slash menu should offer in this channel. */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const db = bindings().DB;
  if (!db) return Response.json({ commands: [] });
  await ensureSchema(db);

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  const channel = channelId ? await findChannel(db, channelId) : null;

  const commands = await listCommandsForServer(db, channel?.server_id ?? null);
  return Response.json({ commands });
}

/** Runs a bot command, which becomes an INTERACTION_CREATE on its gateway. */
export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const db = bindings().DB;
  if (!db) return Response.json({ ok: false, reason: "unavailable" });
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    name?: string;
    args?: string;
  };
  if (!body.channelId || !body.name) {
    return Response.json({ error: "Missing channel or command" }, { status: 400 });
  }

  const channel = await findChannel(db, body.channelId);
  if (!channel) {
    return Response.json({ error: "Channel not found" }, { status: 404 });
  }

  const available = await listCommandsForServer(db, channel.server_id);
  const command = available.find(
    (entry) => entry.name === body.name!.toLowerCase(),
  );
  // No such bot command is not an error: the caller falls back to Hoffle's own
  // slash commands and its "I don't know that one" message.
  if (!command) return Response.json({ ok: false, reason: "unknown" });

  let options: ParsedOption[];
  try {
    options = parseOptions(command.options as CommandOption[], body.args || "");
  } catch (error) {
    if (error instanceof UsageError) {
      return Response.json({
        ok: false,
        reason: "usage",
        message: `/${command.name}: ${error.message}`,
      });
    }
    throw error;
  }

  const result = await runBotCommand({
    channelId: channel.id,
    userId: user.id,
    commandName: command.name,
    options,
  });

  return Response.json({
    ok: result.status === "dispatched",
    reason: result.status === "dispatched" ? null : result.status,
  });
}
