import { currentUser, unauthorized } from "@/lib/auth";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/big-upload-key";
import { limitUser, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { isSafeSvg, looksLikeSvg, sniffUpload, SVG_TYPE } from "@/lib/upload-sniff";
import { consumeUploadQuota } from "@/lib/upload-quota";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const bucket = bindings().UPLOADS;
  if (!bucket) {
    return Response.json(
      { error: "File storage is not connected." },
      { status: 503 },
    );
  }
  // Uploads write to shared storage, so they need a signed-in member.
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const db = bindings().DB;
  if (db) await ensureSchema(db);
  const limited = await limitUser(db, WRITE_RATE_LIMITS.upload, user.id);
  if (limited) return limited;

  const form = await request.formData();
  // `image` remains accepted for profile pictures and older clients.
  const upload = form.get("file") || form.get("image");
  if (!(upload instanceof File)) {
    return Response.json({ error: "Choose a valid file." }, { status: 400 });
  }
  const isImage = upload.type.startsWith("image/");
  const isPdf =
    upload.type === "application/pdf" || upload.name.toLowerCase().endsWith(".pdf");
  const isAudio =
    upload.type.startsWith("audio/") ||
    /\.(mp3|ogg|wav|m4a)$/i.test(upload.name);
  // Voice clips and video files are webm, mp4, mov, m4v, ogv.
  const isClip =
    upload.type.startsWith("video/") || /\.(webm|mp4|mov|m4v|ogv)$/i.test(upload.name);
  const isFile = !isImage && !isPdf && !isAudio && !isClip;

  // These must stay at or below nginx's `client_max_body_size` for
  // /hangout/ (see /etc/nginx/snippets/huddle.conf) — nginx rejects a body
  // over its limit with its own 413 before the request reaches us, which
  // looks like an unexplained failure in the UI.
  // Voice messages run up to five minutes, so they get more room than a
  // soundboard clip.
  const isVoiceMessage = isAudio && form.get("purpose") === "voice";
  const maximum = isPdf
    ? 20 * 1024 * 1024
    : isClip
      ? 40 * 1024 * 1024
      : isVoiceMessage
        ? 8 * 1024 * 1024
        : isAudio
          ? 3 * 1024 * 1024
          : isFile
            ? 40 * 1024 * 1024
            : IMAGE_UPLOAD_MAX_BYTES;
  if (upload.size > maximum) {
    const megabytes = Math.round(maximum / 1024 / 1024);
    return Response.json(
      {
        error: `${
          isPdf
            ? "PDFs"
            : isClip
              ? "Clips"
              : isVoiceMessage
                ? "Voice messages"
                : isAudio
                  ? "Sound clips"
                  : isFile
                    ? "Files"
                    : "Images"
        } must be smaller than ${megabytes} MB.`,
      },
      { status: 413 },
    );
  }

  // The declared type only picked the size limit above. What gets stored and
  // served is what the bytes actually are, and it must match the family the
  // client claimed so a "PDF" cannot turn out to be something else.
  // Note: archives (ZIP, RAR, etc.) are never unzipped or decompressed on the server.
  // Only the first 512 bytes are copied out; the file itself goes to R2 as
  // the parsed form holds it, not as a second copy of up to 40 MB. SVG is the
  // exception: sniffUpload refuses it, so it is read whole and let in only
  // when the entire document passes isSafeSvg.
  const head = await upload.slice(0, 512).arrayBuffer();
  const svgText =
    upload.size <= IMAGE_UPLOAD_MAX_BYTES &&
    (looksLikeSvg(head) || upload.type === "image/svg+xml" || /\.svg$/i.test(upload.name))
      ? await utf8Text(upload)
      : null;
  const isSvg = svgText !== null && looksLikeSvg(svgText);
  if (isSvg && !isSafeSvg(svgText)) {
    return Response.json(
      { error: "That SVG has scripts or other active content, so it can't be uploaded." },
      { status: 400 },
    );
  }
  const sniffed = isSvg ? SVG_TYPE : sniffUpload(head, upload.name);
  const claimed = isPdf
    ? "pdf"
    : isClip
      ? "clip"
      : isAudio
        ? "audio"
        : isFile
          ? "file"
          : "image";
  const compatible =
    sniffed &&
    (sniffed.family === claimed ||
      // MediaRecorder audio is webm/mp4, and m4a sniffs as audio either way.
      (claimed === "audio" && sniffed.family === "clip") ||
      (claimed === "clip" && sniffed.family === "audio") ||
      // Some systems give an SVG no type at all.
      (claimed === "file" && isSvg));
  if (!sniffed || !compatible) {
    return Response.json(
      { error: "That file's contents don't match a supported format." },
      { status: 400 },
    );
  }
  const overQuota = await consumeUploadQuota(db, user, upload.size);
  if (overQuota) return overQuota;
  const fallbackName = `${
    sniffed.family === "pdf" ? "document" : sniffed.family === "file" ? "file" : sniffed.family
  }.${sniffed.extension}`;
  const safeName = (upload.name || fallbackName)
    .replace(/[^a-zA-Z0-9._ -]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(-100);
  // Chat shows an attachment as a picture by its extension, so the name has to
  // agree with the bytes: only a checked SVG may end in .svg.
  let name = safeName || fallbackName;
  if (isSvg !== /\.svg$/i.test(name)) name += `.${sniffed.extension}`;
  const key = `${crypto.randomUUID()}--${name}`;
  const contentType = sniffed.contentType;
  await bucket.put(key, upload, {
    httpMetadata: { contentType },
    // Read back by the media admin panel to show who posted a file.
    customMetadata: { uploader: user.id },
  });

  const url = `/hangout/api/uploads/${encodeURIComponent(key)}`;
  return Response.json(
    { key, url, name, type: contentType },
    { status: 201 },
  );
}

/** The upload as UTF-8 text, or null when it is not valid UTF-8 (an SVG must be). */
async function utf8Text(file: File): Promise<string | null> {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return null;
  }
}
