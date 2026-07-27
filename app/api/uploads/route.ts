import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

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
  // Voice clips are webm (audio, or audio+video when someone was sharing).
  const isClip =
    upload.type.startsWith("video/") || /\.(webm|mp4)$/i.test(upload.name);
  if (!isImage && !isPdf && !isAudio && !isClip) {
    return Response.json(
      { error: "Huddle accepts images, PDFs, audio and short clips." },
      { status: 400 },
    );
  }
  // These must stay at or below nginx's `client_max_body_size` for
  // /hangout/ (see /etc/nginx/snippets/huddle.conf) — nginx rejects a body
  // over its limit with its own 413 before the request reaches us, which
  // looks like an unexplained failure in the UI.
  const maximum = isPdf
    ? 20 * 1024 * 1024
    : isClip
      ? 40 * 1024 * 1024
      : isAudio
        ? 3 * 1024 * 1024
        : 8 * 1024 * 1024;
  if (upload.size > maximum) {
    const megabytes = Math.round(maximum / 1024 / 1024);
    return Response.json(
      {
        error: `${
          isPdf ? "PDFs" : isClip ? "Clips" : isAudio ? "Sound clips" : "Images"
        } must be smaller than ${megabytes} MB.`,
      },
      { status: 413 },
    );
  }

  const bytes = await upload.arrayBuffer();
  if (isPdf) {
    const signature = new TextDecoder().decode(bytes.slice(0, 5));
    if (signature !== "%PDF-") {
      return Response.json({ error: "That file is not a valid PDF." }, { status: 400 });
    }
  }
  const fallbackName = isPdf
    ? "document.pdf"
    : `image.${
        upload.type === "image/png"
          ? "png"
          : upload.type === "image/webp"
            ? "webp"
            : upload.type === "image/gif"
              ? "gif"
              : "jpg"
      }`;
  const safeName = (upload.name || fallbackName)
    .replace(/[^a-zA-Z0-9._ -]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(-100);
  const key = `${crypto.randomUUID()}--${safeName || fallbackName}`;
  const contentType = isPdf ? "application/pdf" : upload.type;
  await bucket.put(key, bytes, {
    httpMetadata: { contentType },
  });

  return Response.json(
    { key, name: safeName || fallbackName, type: contentType },
    { status: 201 },
  );
}
