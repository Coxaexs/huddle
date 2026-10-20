/**
 * Works out what an upload really is from its first bytes.
 *
 * The browser's `File.type` is whatever the client says it is, and uploads are
 * served back from Huddle's own origin. Trusting it would let someone upload an
 * SVG (or HTML labelled `image/png`) that runs script as whoever opens it. So
 * the stored content type always comes from here, and anything not on this list
 * is refused. SVG is deliberately absent: it is a script-capable document, and
 * only the regular upload route lets it in, through isSafeSvg below.
 */

export type UploadFamily = "image" | "pdf" | "audio" | "clip" | "file";

export interface SniffedType {
  family: UploadFamily;
  contentType: string;
  extension: string;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

/**
 * Returns the detected type, or null when the bytes match nothing allowed or
 * contain dangerous executable script documents (like SVG/HTML).
 * Archives (ZIP, RAR, etc.) are detected strictly by their header signature
 * without any decompression or unzipping.
 */
export function sniffUpload(
  buffer: ArrayBuffer | Uint8Array,
  fileName?: string,
): SniffedType | null {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // 1. Image formats
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { family: "image", contentType: "image/png", extension: "png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { family: "image", contentType: "image/jpeg", extension: "jpg" };
  }
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return { family: "image", contentType: "image/gif", extension: "gif" };
  }
  if (ascii(bytes, 0, 4) === "RIFF") {
    const form = ascii(bytes, 8, 12);
    if (form === "WEBP") return { family: "image", contentType: "image/webp", extension: "webp" };
    if (form === "WAVE") return { family: "audio", contentType: "audio/wav", extension: "wav" };
    return null;
  }
  if (ascii(bytes, 0, 5) === "%PDF-") {
    return { family: "pdf", contentType: "application/pdf", extension: "pdf" };
  }
  if (ascii(bytes, 0, 4) === "OggS") {
    return { family: "audio", contentType: "audio/ogg", extension: "ogg" };
  }
  if (ascii(bytes, 0, 3) === "ID3" || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { family: "audio", contentType: "audio/mpeg", extension: "mp3" };
  }
  // Matroska / WebM: voice messages and clips recorded by MediaRecorder.
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { family: "clip", contentType: "video/webm", extension: "webm" };
  }
  // ISO base media: `....ftyp<brand>` covers mp4, m4a and avif.
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") {
      return { family: "image", contentType: "image/avif", extension: "avif" };
    }
    if (brand === "M4A " || brand === "M4B ") {
      return { family: "audio", contentType: "audio/mp4", extension: "m4a" };
    }
    return { family: "clip", contentType: "video/mp4", extension: "mp4" };
  }

  // Refuse SVG and HTML scripts, which can run script on an origin.
  const sample = ascii(bytes, 0, Math.min(bytes.length, 512)).trim().toLowerCase();
  if (
    sample.startsWith("<svg") ||
    (sample.startsWith("<?xml") && sample.includes("<svg")) ||
    sample.startsWith("<!doctype html") ||
    sample.startsWith("<html") ||
    sample.startsWith("<script")
  ) {
    return null;
  }

  const rawExt = fileName ? fileName.split(".").pop()?.toLowerCase() || "" : "";

  // 2. ZIP containers (standard PK.. header, NEVER unzipped or decompressed)
  // Covers PPTX, DOCX, XLSX, JAR, APK, ODT, and generic ZIP archives.
  if (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
  ) {
    if (rawExt === "pptx") {
      return {
        family: "file",
        contentType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        extension: "pptx",
      };
    }
    if (rawExt === "docx") {
      return {
        family: "file",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: "docx",
      };
    }
    if (rawExt === "xlsx") {
      return {
        family: "file",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx",
      };
    }
    if (rawExt === "jar") {
      return {
        family: "file",
        contentType: "application/java-archive",
        extension: "jar",
      };
    }
    if (rawExt === "apk") {
      return {
        family: "file",
        contentType: "application/vnd.android.package-archive",
        extension: "apk",
      };
    }
    return {
      family: "file",
      contentType: "application/zip",
      extension: rawExt === "zip" ? "zip" : rawExt || "zip",
    };
  }

  // 3. RAR archives (v1.5 through v5+ start with Rar!\x1a\x07, NEVER decompressed)
  if (startsWith(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) {
    return {
      family: "file",
      contentType: "application/vnd.rar",
      extension: "rar",
    };
  }

  // 4. 7-Zip archives (NEVER decompressed)
  if (startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return {
      family: "file",
      contentType: "application/x-7z-compressed",
      extension: "7z",
    };
  }

  // 5. Gzip, Bzip2, XZ, TAR archives (NEVER decompressed)
  if (startsWith(bytes, [0x1f, 0x8b])) {
    return { family: "file", contentType: "application/gzip", extension: "gz" };
  }
  if (startsWith(bytes, [0x42, 0x5a, 0x68])) {
    return { family: "file", contentType: "application/x-bzip2", extension: "bz2" };
  }
  if (startsWith(bytes, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) {
    return { family: "file", contentType: "application/x-xz", extension: "xz" };
  }
  if (rawExt === "tar") {
    return { family: "file", contentType: "application/x-tar", extension: "tar" };
  }

  // 6. Microsoft Compound File Binary (legacy PPT, DOC, XLS)
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    if (rawExt === "ppt") {
      return { family: "file", contentType: "application/vnd.ms-powerpoint", extension: "ppt" };
    }
    if (rawExt === "xls") {
      return { family: "file", contentType: "application/vnd.ms-excel", extension: "xls" };
    }
    return { family: "file", contentType: "application/msword", extension: rawExt || "doc" };
  }

  // 7. Plain text, markdown, documentation, and code files
  const isPrintableText = (b: Uint8Array): boolean => {
    if (b.length === 0) return true;
    for (let i = 0; i < b.length; i++) {
      if (b[i] === 0) return false;
    }
    return true;
  };

  const textExtensions = new Set([
    "txt", "text", "md", "markdown", "csv", "json", "xml", "yaml", "yml",
    "toml", "ini", "log", "sql", "env", "sh", "bash", "zsh", "fish",
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rs", "go", "c", "cpp",
    "h", "hpp", "cs", "java", "kt", "swift", "rb", "php", "css", "scss",
    "less", "sass", "vue", "svelte", "graphql", "proto",
  ]);

  if (textExtensions.has(rawExt) && isPrintableText(bytes)) {
    if (rawExt === "md" || rawExt === "markdown") {
      return { family: "file", contentType: "text/markdown; charset=utf-8", extension: "md" };
    }
    if (rawExt === "json") {
      return { family: "file", contentType: "application/json", extension: "json" };
    }
    if (rawExt === "csv") {
      return { family: "file", contentType: "text/csv; charset=utf-8", extension: "csv" };
    }
    return { family: "file", contentType: "text/plain; charset=utf-8", extension: rawExt || "txt" };
  }

  // 8. Any other file with a recognized filename extension (excluding executable web scripts)
  if (fileName && fileName.includes(".")) {
    const safeExt = rawExt.replace(/[^a-zA-Z0-9_-]/g, "");
    if (safeExt && safeExt !== "svg" && safeExt !== "html" && safeExt !== "htm") {
      return {
        family: "file",
        contentType: "application/octet-stream",
        extension: safeExt,
      };
    }
  }

  // 9. Unnamed plain text buffer
  if (bytes.length > 0 && isPrintableText(bytes)) {
    return { family: "file", contentType: "text/plain; charset=utf-8", extension: "txt" };
  }

  return null;
}

/** What an SVG that passed isSafeSvg is stored as. */
export const SVG_TYPE: SniffedType = { family: "image", contentType: "image/svg+xml", extension: "svg" };

/**
 * An SVG document's opening: an optional XML declaration, comments and a
 * DOCTYPE (with or without an internal subset), then the <svg> root.
 */
const SVG_START =
  /^\s*(?:(?:<\?xml\s[^>]*\?>|<!--[\s\S]*?-->|<!doctype\s+svg\b[^[>]*(?:\[[\s\S]*?\])?\s*>)\s*)*<svg[\s>/]/i;

/** True when this text, or these first bytes, open an SVG document. */
export function looksLikeSvg(content: string | ArrayBuffer | Uint8Array): boolean {
  const text = typeof content === "string" ? content : new TextDecoder().decode(content);
  return SVG_START.test(text.replace(/^﻿/, ""));
}

/**
 * Whether a whole uploaded SVG may be stored. It must only draw: no script
 * elements, on* handlers or script URLs (also when spelled with character
 * references or split by whitespace), no entity declarations (they can smuggle
 * markup past this check), no XSLT, no embedded frames or forms, and no
 * animation that rewrites a handler or a link. This is the second line of
 * defence: an SVG is only ever shown through <img>, which never runs script,
 * and served under a sandbox that allows none (app/api/uploads/[key]).
 */
export function isSafeSvg(raw: string): boolean {
  if (!looksLikeSvg(raw) || raw.includes("\u0000")) return false;
  const text = raw
    .replace(/&#x([0-9a-f]{1,6});?/gi, (_, hex: string) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});?/g, (_, decimal: string) => fromCodePoint(parseInt(decimal, 10)))
    .toLowerCase();
  const squeezed = text.replace(/[\s\u0000-\u001f]+/g, "");
  return !(
    text.includes("<!entity") ||
    text.includes("<?xml-stylesheet") ||
    /<(?:[\w.-]+:)?(?:script|iframe|frame|frameset|object|embed|applet|portal|meta|base|link|form|input|button|textarea|select)[\s/>]/.test(text) ||
    /[\s"'/:]on[a-z]+\s*=/.test(text) ||
    /attributename\s*=\s*["']\s*(?:[\w.-]+:)?(?:on[a-z]+|href)\s*["']/.test(text) ||
    /(?:javascript|vbscript|livescript):|data:(?:text\/html|text\/xml|application\/xhtml|application\/xml)/.test(squeezed)
  );
}

function fromCodePoint(value: number): string {
  return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : "";
}

/** Types the browser may render in place; everything else is sent as a download. */
export function isInlineSafe(contentType: string): boolean {
  return /^(image\/(png|jpeg|gif|webp|avif|svg\+xml)|audio\/[\w.+-]+|video\/(webm|mp4|quicktime|ogg|x-matroska)|application\/pdf)$/.test(
    contentType,
  );
}

/** Formats an extension string for badges (e.g. "PPTX", "ZIP", "TXT"). */
export function getFileExtensionBadge(fileName: string): string {
  const ext = fileName.split(".").pop()?.toUpperCase() || "FILE";
  return ext.slice(0, 4);
}

/** Color category for the file badge. */
export function getFileBadgeColor(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (["mp4", "webm", "mov", "m4v", "ogv", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"].includes(ext)) return "audio";
  if (["pptx", "ppt", "key", "odp"].includes(ext)) return "presentation";
  if (["docx", "doc", "rtf", "odt", "pages"].includes(ext)) return "document";
  if (["xlsx", "xls", "csv", "numbers", "ods"].includes(ext)) return "sheet";
  if (["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"].includes(ext)) return "archive";
  if (["jar", "apk", "js", "ts", "jsx", "tsx", "py", "rs", "go", "java", "c", "cpp", "h", "cs", "rb", "php", "sh", "sql"].includes(ext)) return "code";
  if (["txt", "md", "markdown", "log", "yaml", "yml", "json", "toml", "ini", "env"].includes(ext)) return "text";
  return "generic";
}

/** Human-readable short file description. */
export function getFileDescription(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "webm", "mov", "m4v", "ogv", "mkv"].includes(ext)) return "Video · click to download";
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"].includes(ext)) return "Audio · click to download";
  if (ext === "pptx" || ext === "ppt") return "Presentation · click to download";
  if (ext === "docx" || ext === "doc") return "Word document · click to download";
  if (ext === "xlsx" || ext === "xls") return "Spreadsheet · click to download";
  if (ext === "zip") return "ZIP archive · click to download";
  if (ext === "rar") return "RAR archive · click to download";
  if (ext === "7z") return "7-Zip archive · click to download";
  if (ext === "jar") return "Java archive · click to download";
  if (ext === "txt") return "Text document · click to download";
  if (ext === "md" || ext === "markdown") return "Markdown note · click to download";
  if (ext === "csv") return "CSV data · click to download";
  if (ext === "json") return "JSON file · click to download";
  return "File attachment · click to download";
}

/** Formats raw byte size into KB/MB string. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
