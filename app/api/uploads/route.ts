import { bindings } from "@/lib/storage";

export async function POST(request: Request) {
  const bucket = bindings().UPLOADS;
  if (!bucket) {
    return Response.json(
      { error: "Image storage is not connected." },
      { status: 503 },
    );
  }

  const upload = (await request.formData()).get("image");
  if (!(upload instanceof File) || !upload.type.startsWith("image/")) {
    return Response.json({ error: "Choose a valid image." }, { status: 400 });
  }
  if (upload.size > 8 * 1024 * 1024) {
    return Response.json(
      { error: "Images must be smaller than 8 MB." },
      { status: 413 },
    );
  }

  const safeExtension =
    upload.type === "image/png"
      ? "png"
      : upload.type === "image/webp"
        ? "webp"
        : upload.type === "image/gif"
          ? "gif"
          : "jpg";
  const key = `${crypto.randomUUID()}.${safeExtension}`;
  await bucket.put(key, await upload.arrayBuffer(), {
    httpMetadata: { contentType: upload.type },
  });

  return Response.json({ key }, { status: 201 });
}
