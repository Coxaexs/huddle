/**
 * Silent messages, like Discord's: start a message with `@silent` and it is
 * sent without pinging anyone. It still counts as unread and mentions still
 * land in the inbox; only pushes, desktop notifications and sounds are skipped.
 * Discord bots ask for the same with the SUPPRESS_NOTIFICATIONS flag.
 */
export const DISCORD_SUPPRESS_NOTIFICATIONS = 1 << 12;

const SILENT_PREFIX = /^@silent(?=\s|$)\s*/i;

/** Splits a leading `@silent` off a message. */
export function takeSilent(content: string): { content: string; silent: boolean } {
  const match = SILENT_PREFIX.exec(content);
  return match ? { content: content.slice(match[0].length), silent: true } : { content, silent: false };
}

/** Whether a client or bot asked for this message to go out quietly. */
export function isSilentPayload(payload: unknown): boolean {
  return Boolean(
    payload && typeof payload === "object" && !Array.isArray(payload) && (payload as { silent?: unknown }).silent === true,
  );
}

/** Whether a Discord message's flags ask for no notifications. */
export function hasSuppressNotifications(flags: unknown): boolean {
  const value = Number(flags);
  return Number.isInteger(value) && (value & DISCORD_SUPPRESS_NOTIFICATIONS) !== 0;
}
