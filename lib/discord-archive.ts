/**
 * Safe parser and deterministic dedupe helpers for DiscordChatExporter JSON archives.
 * Extracts plain-text author, timestamp, content, attachment filenames, and embed summaries
 * without executing any HTML or inline scripts.
 */

export interface ParsedArchiveMessage {
  sourceId: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface ParsedDiscordArchive {
  channelName: string;
  messages: ParsedArchiveMessage[];
  skipped: number;
}

const MAX_MESSAGE_CHARS = 3500;
const encoder = new TextEncoder();

function safeIsoTimestamp(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function cleanPlainAuthor(rawAuthor: unknown): string {
  if (!rawAuthor || typeof rawAuthor !== "object") return "Discord User";
  const a = rawAuthor as Record<string, unknown>;
  const name =
    (typeof a.nickname === "string" && a.nickname.trim()) ||
    (typeof a.name === "string" && a.name.trim()) ||
    "Discord User";
  return name.replace(/[\r\n\t]+/g, " ").trim().slice(0, 48) || "Discord User";
}

function summarizeAttachments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const notes: string[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const fileName =
      (typeof obj.fileName === "string" && obj.fileName.trim()) ||
      (typeof obj.url === "string" && obj.url.split("/").pop()?.split("?")[0]) ||
      "";
    if (fileName) notes.push(`[Attachment: ${fileName.slice(0, 80)}]`);
  }
  return notes;
}

function summarizeEmbeds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const notes: string[] = [];
  for (const item of raw.slice(0, 4)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    const description = typeof obj.description === "string" ? obj.description.trim() : "";
    const combined = [title, description].filter(Boolean).join(" — ");
    if (combined) notes.push(`[Embed] ${combined.slice(0, 400)}`);
  }
  return notes;
}

/**
 * Validates and extracts plain-text messages from a DiscordChatExporter JSON object.
 */
export function parseDiscordArchive(
  rawJson: unknown,
  maxMessages = 500,
): ParsedDiscordArchive {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    throw new Error("Archive must be a DiscordChatExporter JSON object.");
  }

  const root = rawJson as Record<string, unknown>;
  if (!Array.isArray(root.messages)) {
    throw new Error("Archive JSON does not contain a messages array.");
  }

  const rawChannel =
    root.channel && typeof root.channel === "object"
      ? (root.channel as Record<string, unknown>)
      : null;
  const rawChannelName =
    rawChannel && typeof rawChannel.name === "string" ? rawChannel.name : "imported-archive";
  const channelName =
    rawChannelName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "imported-archive";

  const cap = Math.max(1, Math.min(500, maxMessages));
  const messages: ParsedArchiveMessage[] = [];
  let skipped = 0;

  for (let i = 0; i < root.messages.length; i++) {
    const entry = root.messages[i];
    if (!entry || typeof entry !== "object") {
      skipped += 1;
      continue;
    }
    const msg = entry as Record<string, unknown>;
    const sourceId =
      typeof msg.id === "string" && msg.id.trim()
        ? msg.id.trim().slice(0, 64)
        : `idx-${i}`;
    const rawContent = typeof msg.content === "string" ? msg.content.trim() : "";
    const attachments = summarizeAttachments(msg.attachments);
    const embeds = summarizeEmbeds(msg.embeds);

    const parts = [rawContent, ...attachments, ...embeds].filter(Boolean);
    if (parts.length === 0) {
      skipped += 1;
      continue;
    }

    if (messages.length >= cap) {
      skipped += root.messages.length - i;
      break;
    }

    const content = parts.join("\n").slice(0, MAX_MESSAGE_CHARS);
    messages.push({
      sourceId,
      author: cleanPlainAuthor(msg.author),
      content,
      createdAt: safeIsoTimestamp(msg.timestamp),
    });
  }

  return { channelName, messages, skipped };
}

/** Deterministic message primary key so re-importing the same JSON never creates duplicates. */
export async function deterministicArchiveMessageId(
  channelId: string,
  sourceId: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${channelId}|${sourceId}`),
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 20);
  return `arc-${channelId.slice(0, 12)}-${hex}`;
}
