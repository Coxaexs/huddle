import { bindings } from "@/lib/storage";

export async function POST(request: Request) {
  const bucket = bindings().UPLOADS;
  if (!bucket) {
    return Response.json(
      { error: "File storage is not connected." },
      { status: 503 },
    );
  }

  const form = await request.formData();
  // `image` remains accepted for profile pictures and older clients.
  const upload = form.get("file") || form.get("image");
  if (!(upload instanceof File)) {
    return Response.json({ error: "Choose a valid file." }, { status: 400 });
  }
  const isImage = upload.type.startsWith("image/");
  const isPdf =
    upload.type === "application/pdf" || upload.name.toLowerCase().endsWith(".pdf");
  if (!isImage && !isPdf) {
    return Response.json(
      { error: "Huddle currently accepts images and PDF documents." },
      { status: 400 },
    );
  }
  const maximum = isPdf ? 20 * 1024 * 1024 : 8 * 1024 * 1024;
  if (upload.size > maximum) {
    return Response.json(
      {
        error: isPdf
          ? "PDFs must be smaller than 20 MB."
          : "Images must be smaller than 8 MB.",
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
