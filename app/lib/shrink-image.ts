"use client";

/**
 * Phone photos are 5 to 12 MB and far bigger than any screen shows them.
 * Before upload they are scaled down to fit MAX_EDGE and re-encoded, which
 * makes sending on mobile data quick, saves the server disk, and drops the
 * EXIF block (GPS position included) along the way. "Send original" in the
 * composer skips this.
 */
const MAX_EDGE = 2560;
/** Below this a photo is sent as it is; re-encoding would gain little. */
const MIN_BYTES = 400_000;
/** GIFs stay untouched (a canvas keeps only the first frame), and so do SVG and AVIF. */
const SHRINKABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export function canShrink(file: File): boolean {
  return SHRINKABLE.has(file.type) && file.size >= MIN_BYTES;
}

export async function shrinkImage(file: File): Promise<File> {
  if (!canShrink(file) || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // A format this browser cannot decode (HEIC outside Safari): send it as it is.
    return file;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // PNGs are usually screenshots and may be transparent: WebP keeps both.
  const wanted = file.type === "image/png" ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, wanted, wanted === "image/webp" ? 0.9 : 0.85));
  if (!blob || blob.size >= file.size) return file;
  // Safari has no WebP encoder and hands back a PNG instead: name it for what it is.
  const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  const name = `${file.name.replace(/\.[^./]+$/, "")}.${extension}`;
  return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
}
