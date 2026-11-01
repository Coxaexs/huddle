/**
 * Files a bot attaches to a message.
 *
 * Discord libraries switch to multipart the moment a bot adds a file: the
 * message JSON goes in `payload_json` and each file in `files[n]` (discord.js,
 * discord.py) or `file` (older clients, curl). These are stored exactly like a
 * member's upload — same bucket, same `<uuid>--<name>` key, same sniffing — so
 * chat shows a bot's image like anyone else's.
 */
import { NORMAL_UPLOAD_MAX_BYTES } from "./big-upload-key";
import { bindings } from "./storage";
import { isSafeSvg, looksLikeSvg, sniffUpload, SVG_TYPE } from "./upload-sniff";

/** Discord allows ten files per message. */
export const BOT_MAX_FILES = 10;
/** Per file, the same ceiling as a member's normal upload. */
export const BOT_FILE_MAX_BYTES = NORMAL_UPLOAD_MAX_BYTES;

export interface StoredBotFile {
  key: string;
  name: string;
  contentType: string;
  size: number;
}

export class BotUploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** The files in a multipart form, in the order the bot numbered them. */
export function filesInForm(form: FormData): File[] {
  const numbered: Array<{ index: number; file: File }> = [];
  for (const [field, value] of form.entries()) {
    if (!(value instanceof File)) continue;
    const match = /^files\[(\d+)\]$/.exec(field) || /^file(\d*)$/.exec(field);
    if (!match) continue;
    numbered.push({ index: Number(match[1] || 0), file: value });
  }
  return numbered.sort((a, b) => a.index - b.index).map((entry) => entry.file);
}

/**
 * Stores each file and returns its key. Anything Hoffle would refuse from a
 * member (a disguised HTML page, an SVG with script, an empty file) is refused
 * here too, as a Discord-style 400 the library can surface.
 */
export async function storeBotFiles(
  files: File[],
  uploader: string,
): Promise<StoredBotFile[]> {
  if (!files.length) return [];
  if (files.length > BOT_MAX_FILES) {
    throw new BotUploadError(`A message can carry at most ${BOT_MAX_FILES} files`);
  }
  const bucket = bindings().UPLOADS;
  if (!bucket) throw new BotUploadError("File storage is not connected", 503);

  const stored: StoredBotFile[] = [];
  for (const file of files) {
    if (!file.size) throw new BotUploadError(`${file.name || "A file"} is empty`);
    if (file.size > BOT_FILE_MAX_BYTES) {
      throw new BotUploadError(
        `${file.name || "A file"} is larger than ${Math.round(BOT_FILE_MAX_BYTES / 1024 / 1024)} MB`,
        413,
      );
    }
    const head = await file.slice(0, 512).arrayBuffer();
    let sniffed = sniffUpload(head, file.name);
    if (looksLikeSvg(head) || /\.svg$/i.test(file.name)) {
      const text = await file.text().catch(() => "");
      if (!looksLikeSvg(text) || !isSafeSvg(text)) {
        throw new BotUploadError(`${file.name || "An SVG"} has scripts or other active content`);
      }
      sniffed = SVG_TYPE;
    }
    if (!sniffed) {
      throw new BotUploadError(`${file.name || "A file"} is not a supported format`);
    }
    const fallback = `${sniffed.family === "file" ? "file" : sniffed.family}.${sniffed.extension}`;
    let name = (file.name || fallback)
      .replace(/[^a-zA-Z0-9._ -]+/g, "_")
      .replace(/\s+/g, " ")
      .slice(-100);
    if (!name.replace(/[._ -]/g, "")) name = fallback;
    // Chat decides "picture or file" by extension, so it must agree with the bytes.
    const isSvg = sniffed === SVG_TYPE;
    if (isSvg !== /\.svg$/i.test(name)) name += `.${sniffed.extension}`;
    if (sniffed.family === "image" && !isSvg && !/\.(png|jpe?g|gif|webp|avif)$/i.test(name)) {
      name += `.${sniffed.extension}`;
    }
    const key = `${crypto.randomUUID()}--${name}`;
    await bucket.put(key, file, {
      httpMetadata: { contentType: sniffed.contentType },
      customMetadata: { uploader },
    });
    stored.push({ key, name, contentType: sniffed.contentType, size: file.size });
  }
  return stored;
}

/** `attachment_key` + `attachments` column values for a set of stored files. */
export function attachmentColumns(files: StoredBotFile[]): {
  attachment_key: string | null;
  attachments: string | null;
} {
  if (!files.length) return { attachment_key: null, attachments: null };
  const [first, ...rest] = files;
  return {
    attachment_key: first.key,
    attachments: rest.length ? JSON.stringify(rest.map((file) => file.key)) : null,
  };
}
