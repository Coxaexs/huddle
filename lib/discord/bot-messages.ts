/**
 * Payload bookkeeping for messages bots send through the Discord surface.
 *
 * Embeds and components live in the message's `payload` column. A message
 * with buttons also records which bot sent it, because a button press has to
 * be routed back to exactly that bot: Hoffle has no per-message author id for
 * bots, and broadcasting a press to every bot would hand one bot's interaction
 * token to all of them.
 */
import { publishMessageEvent } from "../hub-client";

export interface BotPayload {
  embeds: unknown[];
  components: unknown[];
  botId?: string;
}

const MAX_PAYLOAD = 8000;

function parse(json: string | null | undefined): Partial<BotPayload> {
  if (!json) return {};
  try {
    const value = JSON.parse(json) as Partial<BotPayload> | null;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

/** The stored payload for a new bot message, or null when it has neither. */
export function botPayload(
  botId: string,
  embeds: unknown[],
  components: unknown[],
): string | null {
  if (!embeds.length && !components.length) return null;
  return JSON.stringify({ embeds, components, botId }).slice(0, MAX_PAYLOAD);
}

/**
 * An edit's payload: fields the edit names replace the old ones, the rest are
 * kept. Discord's semantics, which libraries rely on: `edit(view=None)` sends
 * `components: []` to strip buttons while leaving the embeds alone.
 */
export function mergeBotPayload(
  existing: string | null | undefined,
  body: { embeds?: unknown; components?: unknown },
  botId: string,
): string | null {
  const touchesEmbeds = body.embeds !== undefined;
  const touchesComponents = body.components !== undefined;
  if (!touchesEmbeds && !touchesComponents) return existing ?? null;
  const previous = parse(existing);
  const embeds = touchesEmbeds
    ? Array.isArray(body.embeds) ? body.embeds : []
    : previous.embeds || [];
  const components = touchesComponents
    ? Array.isArray(body.components) ? body.components : []
    : previous.components || [];
  return JSON.stringify({ embeds, components, botId }).slice(0, MAX_PAYLOAD);
}

export function payloadOwner(json: string | null | undefined): string | null {
  const owner = parse(json).botId;
  return typeof owner === "string" && owner ? owner : null;
}

/** Whether a stored payload has a component with this custom_id. */
export function payloadHasComponent(
  json: string | null | undefined,
  customId: string,
): boolean {
  const rows = parse(json).components;
  if (!Array.isArray(rows)) return false;
  return rows.some((row) =>
    Array.isArray((row as { components?: unknown[] })?.components) &&
    (row as { components: Array<{ custom_id?: string }> }).components.some(
      (component) => component?.custom_id === customId,
    ),
  );
}

/**
 * Tells open tabs a bot message changed. Carries the payload so embeds and
 * buttons update in place, not just the text. `audience` limits it to one
 * person, for ephemeral messages that only exist in their tabs.
 */
export async function publishBotEdit(
  channelId: string,
  edit: {
    id: string;
    content?: string | null;
    editedAt?: string | null;
    payload?: string | null;
  },
  audience?: string[],
): Promise<void> {
  let payload: unknown;
  if (edit.payload !== undefined) {
    try {
      payload = edit.payload ? JSON.parse(edit.payload) : null;
    } catch {
      payload = null;
    }
  }
  await publishMessageEvent(
    channelId,
    {
      t: "message-edited",
      id: edit.id,
      ...(typeof edit.content === "string" ? { content: edit.content } : {}),
      editedAt: edit.editedAt ?? undefined,
      ...(edit.payload !== undefined ? { payload } : {}),
    },
    audience,
  );
}
