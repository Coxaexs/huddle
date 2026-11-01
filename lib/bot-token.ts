/**
 * A fresh bot token. Kept apart from lib/bot-auth.ts (which loads the schema)
 * so the schema's own migrations can mint tokens without an import cycle.
 */
export function generateBotToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const randomHex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `hfl_bot_${randomHex}`;
}
