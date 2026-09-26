/**
 * Works out what an upload really is from its first bytes.
 *
 * The browser's `File.type` is whatever the client says it is, and uploads are
 * served back from Huddle's own origin. Trusting it would let someone upload an
 * SVG (or HTML labelled `image/png`) that runs script as whoever opens it. So
 * the stored content type always comes from here, and anything not on this list
 * is refused. SVG is deliberately absent: it is a script-capable document.
 */

export type UploadFamily = "image" | "pdf" | "audio" | "clip";

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

/** Returns the detected type, or null when the bytes match nothing allowed. */
export function sniffUpload(buffer: ArrayBuffer | Uint8Array): SniffedType | null {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

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
  if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
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
  return null;
}

/** Types the browser may render in place; everything else is sent as a download. */
export function isInlineSafe(contentType: string): boolean {
  return /^(image\/(png|jpeg|gif|webp|avif)|audio\/[\w.+-]+|video\/(webm|mp4)|application\/pdf)$/.test(
    contentType,
  );
}
