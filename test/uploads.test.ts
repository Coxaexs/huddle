import { beforeEach, describe, expect, it, vi } from "vitest";
import { isInlineSafe, sniffUpload } from "@/lib/upload-sniff";

// Route-level tests: the upload route is where untrusted bytes become content
// served from our own origin, so it is exercised through its real handler.

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  objects: new Map<string, { bytes: ArrayBuffer; contentType: string }>(),
  counts: new Map<string, number>(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", () => ({
  currentUser: async () => state.user,
  unauthorized: () => Response.json({ error: "Sign in" }, { status: 401 }),
}));
vi.mock("@/lib/schema", () => ({ ensureSchema: async () => {} }));
vi.mock("@/lib/storage", () => ({
  bindings: () => ({
    UPLOADS: {
      async put(key: string, bytes: ArrayBuffer, options: { httpMetadata: { contentType: string } }) {
        state.objects.set(key, { bytes, contentType: options.httpMetadata.contentType });
      },
      async get(key: string) {
        const object = state.objects.get(key);
        return object
          ? { body: object.bytes, httpMetadata: { contentType: object.contentType } }
          : null;
      },
    },
    // Only the rate-limit upsert is issued against this.
    DB: {
      prepare: (query: string) => ({
        bind: (key: string) => ({
          async first() {
            const count = (state.counts.get(key) ?? 0) + 1;
            state.counts.set(key, count);
            return { count };
          },
          async run() {
            if (!query.startsWith("DELETE")) throw new Error(query);
            return {};
          },
        }),
      }),
    },
  }),
}));

const { POST } = await import("@/app/api/uploads/route");
const { GET } = await import("@/app/api/uploads/[key]/route");

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function upload(bytes: ArrayLike<number>, name: string, type: string, purpose?: string) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  if (purpose) form.append("purpose", purpose);
  return POST(new Request("http://x/api/uploads", { method: "POST", body: form }));
}

beforeEach(() => {
  state.user = { id: "u1" };
  state.objects.clear();
  state.counts.clear();
});

describe("sniffUpload", () => {
  it.each([
    [PNG, "image/png"],
    [[0xff, 0xd8, 0xff, 0xe0], "image/jpeg"],
    [[...new TextEncoder().encode("GIF89a")], "image/gif"],
    [[...new TextEncoder().encode("RIFF\0\0\0\0WEBP")], "image/webp"],
    [[...new TextEncoder().encode("RIFF\0\0\0\0WAVE")], "audio/wav"],
    [[...new TextEncoder().encode("%PDF-1.7")], "application/pdf"],
    [[...new TextEncoder().encode("OggS")], "audio/ogg"],
    [[...new TextEncoder().encode("ID3")], "audio/mpeg"],
    [[0x1a, 0x45, 0xdf, 0xa3], "video/webm"],
    [[0, 0, 0, 0x20, ...new TextEncoder().encode("ftypisom")], "video/mp4"],
    [[0, 0, 0, 0x20, ...new TextEncoder().encode("ftypM4A ")], "audio/mp4"],
    [[0, 0, 0, 0x20, ...new TextEncoder().encode("ftypavif")], "image/avif"],
  ])("recognises %#", (bytes, contentType) => {
    expect(sniffUpload(new Uint8Array(bytes))?.contentType).toBe(contentType);
  });

  it("refuses SVG and HTML, which can run script", () => {
    expect(sniffUpload(SVG)).toBeNull();
    expect(sniffUpload(new TextEncoder().encode("<!doctype html><script>"))).toBeNull();
  });

  it("only renders known media inline", () => {
    expect(isInlineSafe("image/png")).toBe(true);
    expect(isInlineSafe("audio/webm")).toBe(true);
    expect(isInlineSafe("image/svg+xml")).toBe(false);
    expect(isInlineSafe("text/html")).toBe(false);
  });
});

describe("POST /api/uploads", () => {
  it("stores the sniffed type, not the one the client claimed", async () => {
    const response = await upload(PNG, "cat.jpg", "image/jpeg");
    expect(response.status).toBe(201);
    const body = (await response.json()) as { type: string };
    expect(body.type).toBe("image/png");
  });

  it("rejects an SVG even though it claims to be an image", async () => {
    const response = await upload(SVG, "x.svg", "image/svg+xml");
    expect(response.status).toBe(400);
    expect(state.objects.size).toBe(0);
  });

  it("rejects bytes that do not match the claimed family", async () => {
    // Labelled a PDF, actually a PNG.
    expect((await upload(PNG, "doc.pdf", "application/pdf")).status).toBe(400);
  });

  it("accepts a webm voice message sent as audio", async () => {
    const response = await upload([0x1a, 0x45, 0xdf, 0xa3, 0], "voice.webm", "audio/webm", "voice");
    expect(response.status).toBe(201);
  });

  it("requires a signed-in user", async () => {
    state.user = null;
    expect((await upload(PNG, "a.png", "image/png")).status).toBe(401);
  });

  it("rate-limits one user without touching others", async () => {
    for (let i = 0; i < 30; i += 1) {
      expect((await upload(PNG, "a.png", "image/png")).status).toBe(201);
    }
    const limited = await upload(PNG, "a.png", "image/png");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();

    state.user = { id: "u2" };
    expect((await upload(PNG, "a.png", "image/png")).status).toBe(201);
  });
});

describe("GET /api/uploads/:key", () => {
  const get = (key: string) =>
    GET(new Request(`http://x/api/uploads/${key}`), { params: Promise.resolve({ key }) });

  it("serves images inline under a sandbox CSP", async () => {
    state.objects.set("k--a.png", { bytes: new Uint8Array(PNG).buffer, contentType: "image/png" });
    const response = await get("k--a.png");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toMatch(/^inline/);
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("forces an old SVG upload to download instead of rendering", async () => {
    state.objects.set("k--x.svg", { bytes: SVG.buffer as ArrayBuffer, contentType: "image/svg+xml" });
    const response = await get("k--x.svg");
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment/);
  });
});
