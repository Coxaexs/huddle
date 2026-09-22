import { currentUser, unauthorized } from "@/lib/auth";
import { listCommandsForServer, runBotCommand } from "@/lib/discord/interactions";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Discord option types this maps text arguments onto. */
const OPTION_STRING = 3;
const OPTION_INTEGER = 4;
const OPTION_BOOLEAN = 5;
const OPTION_NUMBER = 10;

interface CommandOption {
  name: string;
  type?: number;
  required?: boolean;
}

/**
 * Turns the rest of a typed slash command into Discord option values.
 *
 * Hoffle's composer is a text box, not Discord's structured command UI, so the
 * arguments arrive as one string. Options are filled positionally, and the last
 * string option takes everything left over — otherwise `/play some long title`
 * would lose every word after the first.
 */
function parseOptions(
  options: CommandOption[],
  input: string,
): Array<{ name: string; type: number; value: string | number | boolean }> {
  const words = input.trim().length ? input.trim().split(/\s+/) : [];
  const parsed: Array<{ name: string; type: number; value: string | number | boolean }> = [];

  options.forEach((option, index) => {
    const isLast = index === options.length - 1;
    const type = option.type ?? OPTION_STRING;
    const raw = isLast ? words.slice(index).join(" ") : words[index];
    if (raw === undefined || raw === "") return;

    let value: string | number | boolean = raw;
    if (type === OPTION_INTEGER) value = parseInt(raw, 10);
    else if (type === OPTION_NUMBER) value = Number(raw);
    else if (type === OPTION_BOOLEAN) value = raw.toLowerCase() === "true";
    if (typeof value === "number" && !Number.isFinite(value)) return;

    parsed.push({ name: option.name, type, value });
  });

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

  const result = await runBotCommand({
    channelId: channel.id,
    userId: user.id,
    commandName: command.name,
    options: parseOptions(command.options as CommandOption[], body.args || ""),
  });

  return Response.json({
    ok: result.status === "dispatched",
    reason: result.status === "dispatched" ? null : result.status,
  });
}
