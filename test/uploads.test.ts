import { beforeEach, describe, expect, it, vi } from "vitest";
import { isInlineSafe, isSafeSvg, looksLikeSvg, sniffUpload } from "@/lib/upload-sniff";

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
// The daily budget has its own tests (test/open-signup.test.ts).
vi.mock("@/lib/upload-quota", () => ({ consumeUploadQuota: async () => null }));
vi.mock("@/lib/storage", () => ({
  bindings: () => ({
    UPLOADS: {
      async put(key: string, value: ArrayBuffer | Blob, options: { httpMetadata: { contentType: string } }) {
        // Like R2, takes the uploaded File as it is as well as raw bytes.
        const bytes = value instanceof Blob ? await value.arrayBuffer() : value;
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
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" style="fill:#7b63e6"/></svg>';
const encode = (text: string) => Array.from(new TextEncoder().encode(text));

function upload(bytes: ArrayLike<number>, name: string, type: string, purpose?: string) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  if (purpose) form.append("purpose", purpose);
  return POST(new Request("http://x/api/uploads", { method: "POST", body: form }));
}

import { resetMemoryRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  state.user = { id: "u1" };
  state.objects.clear();
  state.counts.clear();
  resetMemoryRateLimits();
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
    // Served under its own script-less sandbox (see the GET tests below).
    expect(isInlineSafe("image/svg+xml")).toBe(true);
    expect(isInlineSafe("text/html")).toBe(false);
  });
  it("recognises files like pptx, txt, md, zip, rar, jar", () => {
    const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
    const RAR_MAGIC = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
    const TXT_BYTES = new TextEncoder().encode("Hello Huddle world");
    const MD_BYTES = new TextEncoder().encode("# Release Notes\nMarkdown text");

    expect(sniffUpload(new Uint8Array(ZIP_MAGIC), "slides.pptx")?.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(sniffUpload(new Uint8Array(ZIP_MAGIC), "archive.zip")?.contentType).toBe(
      "application/zip",
    );
    expect(sniffUpload(new Uint8Array(ZIP_MAGIC), "plugin.jar")?.contentType).toBe(
      "application/java-archive",
    );
    expect(sniffUpload(new Uint8Array(RAR_MAGIC), "backup.rar")?.contentType).toBe(
      "application/vnd.rar",
    );
    expect(sniffUpload(TXT_BYTES, "notes.txt")?.contentType).toBe(
      "text/plain; charset=utf-8",
    );
    expect(sniffUpload(MD_BYTES, "readme.md")?.contentType).toBe(
      "text/markdown; charset=utf-8",
    );
  });
});

describe("SVG", () => {
  it("recognises an SVG after an XML declaration, comments and a DOCTYPE", () => {
    const exported =
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: Adobe Illustrator 27.0.0 -->\n' +
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
      '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>';
    expect(looksLikeSvg(exported)).toBe(true);
    expect(isSafeSvg(exported)).toBe(true);
    expect(looksLikeSvg("\uFEFF" + LOGO)).toBe(true);
    expect(looksLikeSvg("<html><svg></svg></html>")).toBe(false);
    expect(looksLikeSvg("<svgfoo/>")).toBe(false);
  });

  it("accepts drawings: styles, gradients, metadata, links, embedded bitmaps", () => {
    const drawing =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">' +
      "<metadata><rdf:RDF/></metadata><style>.a{fill:url(#g)}</style>" +
      '<linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient>' +
      '<a href="https://hoffle.online"><text font-family="Fredoka">Online</text></a>' +
      '<image href="data:image/png;base64,iVBORw0KGgo="/><use xlink:href="#g"/>' +
      '<animate attributeName="opacity" values="0;1" dur="1s"/></svg>';
    expect(isSafeSvg(drawing)).toBe(true);
  });

  it.each([
    ["a script element", '<svg><script>alert(1)</script></svg>'],
    ["a namespaced script", '<svg><svg:script>alert(1)</svg:script></svg>'],
    ["an event handler", '<svg onload="alert(1)"></svg>'],
    ["a handler on a child", '<svg><rect\n  onclick = "alert(1)"/></svg>'],
    ["a javascript: link", '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>'],
    ["a javascript: link in character references", '<svg><a href="&#106;&#x61;vascript:alert(1)">x</a></svg>'],
    ["a javascript: link split by a tab", '<svg><a href="java&#9;script:alert(1)">x</a></svg>'],
    ["an HTML data URL", '<svg><a href="data:text/html,<b>hi</b>">x</a></svg>'],
    ["an entity declaration", '<!DOCTYPE svg [<!ENTITY x "&#60;script&#62;alert(1)&#60;/script&#62;">]><svg>&x;</svg>'],
    ["an XSLT stylesheet", '<?xml-stylesheet type="text/xsl" href="x.xsl"?><svg></svg>'],
    ["a frame in a foreignObject", '<svg><foreignObject><iframe src="https://x"/></foreignObject></svg>'],
    ["a form", '<svg><foreignObject><form action="https://x"><input name="p"/></form></foreignObject></svg>'],
    ["an animated link", '<svg><a><set attributeName="href" to="https://x"/></a></svg>'],
    ["an animated handler", '<svg><set attributeName="onclick" to="alert(1)"/></svg>'],
  ])("refuses %s", (_, svg) => {
    expect(isSafeSvg(svg)).toBe(false);
  });
});

describe("POST /api/uploads", () => {
  it("stores the sniffed type, not the one the client claimed", async () => {
    const response = await upload(PNG, "cat.jpg", "image/jpeg");
    expect(response.status).toBe(201);
    const body = (await response.json()) as { type: string };
    expect(body.type).toBe("image/png");
  });

  it("accepts and stores pptx, txt, md, zip, rar, jar files as raw bytes without unzipping", async () => {
    const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 3];
    const RAR_MAGIC = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0, 1];
    const TXT_BYTES = Array.from(new TextEncoder().encode("Simple plain text notes"));
    const MD_BYTES = Array.from(new TextEncoder().encode("# Huddle Guide\nDetailed markdown"));

    // PPTX
    const pptxRes = await upload(ZIP_MAGIC, "presentation.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(pptxRes.status).toBe(201);
    const pptxBody = (await pptxRes.json()) as { key: string; name: string };
    expect(pptxBody.name).toContain("presentation.pptx");
    expect(state.objects.get(pptxBody.key)?.bytes.byteLength).toBe(ZIP_MAGIC.length);

    // TXT
    const txtRes = await upload(TXT_BYTES, "info.txt", "text/plain");
    expect(txtRes.status).toBe(201);
    const txtBody = (await txtRes.json()) as { key: string; name: string };
    expect(txtBody.name).toContain("info.txt");

    // MD
    const mdRes = await upload(MD_BYTES, "notes.md", "text/markdown");
    expect(mdRes.status).toBe(201);
    const mdBody = (await mdRes.json()) as { key: string; name: string };
    expect(mdBody.name).toContain("notes.md");

    // ZIP (NEVER unzipped)
    const zipRes = await upload(ZIP_MAGIC, "files.zip", "application/zip");
    expect(zipRes.status).toBe(201);
    const zipBody = (await zipRes.json()) as { key: string; name: string };
    expect(zipBody.name).toContain("files.zip");
    expect(state.objects.get(zipBody.key)?.bytes.byteLength).toBe(ZIP_MAGIC.length);

    // RAR (NEVER unzipped)
    const rarRes = await upload(RAR_MAGIC, "bundle.rar", "application/vnd.rar");
    expect(rarRes.status).toBe(201);
    const rarBody = (await rarRes.json()) as { key: string; name: string };
    expect(rarBody.name).toContain("bundle.rar");
    expect(state.objects.get(rarBody.key)?.bytes.byteLength).toBe(RAR_MAGIC.length);

    // JAR
    const jarRes = await upload(ZIP_MAGIC, "app.jar", "application/java-archive");
    expect(jarRes.status).toBe(201);
    const jarBody = (await jarRes.json()) as { key: string; name: string };
    expect(jarBody.name).toContain("app.jar");
  });

  it("rejects an SVG with a script even though it claims to be an image", async () => {
    const response = await upload(SVG, "x.svg", "image/svg+xml");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/active content/);
    expect(state.objects.size).toBe(0);
  });

  it("stores a safe SVG as an image, untouched", async () => {
    const response = await upload(encode(LOGO), "logo.svg", "image/svg+xml");
    expect(response.status).toBe(201);
    const body = (await response.json()) as { key: string; name: string; type: string };
    expect(body.type).toBe("image/svg+xml");
    expect(body.name).toBe("logo.svg");
    expect(new TextDecoder().decode(state.objects.get(body.key)?.bytes)).toBe(LOGO);
  });

  it("takes an SVG sent with no type, and names it .svg", async () => {
    const response = await upload(encode(LOGO), "logo", "");
    expect(response.status).toBe(201);
    const body = (await response.json()) as { name: string; type: string };
    expect(body.type).toBe("image/svg+xml");
    expect(body.name).toBe("logo.svg");
  });

  it("keeps .svg for real SVGs, so chat never shows other bytes as a picture", async () => {
    const png = (await (await upload(PNG, "cat.svg", "image/svg+xml")).json()) as { name: string; type: string };
    expect(png).toMatchObject({ name: "cat.svg.png", type: "image/png" });
    const text = (await (await upload(encode("just some notes"), "notes.svg", "")).json()) as { name: string; type: string };
    expect(text.name).toBe("notes.svg.txt");
  });

  it("refuses an SVG that is not UTF-8", async () => {
    const utf16 = [0xff, 0xfe, ...Array.from(LOGO).flatMap((c) => [c.charCodeAt(0), 0])];
    expect((await upload(utf16, "logo.svg", "image/svg+xml")).status).toBe(400);
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

  it("serves an SVG inline under a sandbox with no script and no fetches", async () => {
    // Even an old, unchecked upload: opened on its own it gets an opaque origin and cannot run script.
    state.objects.set("k--x.svg", { bytes: SVG.buffer as ArrayBuffer, contentType: "image/svg+xml" });
    const response = await get("k--x.svg");
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("content-disposition")).toMatch(/^inline/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = response.headers.get("content-security-policy") || "";
    expect(csp).toMatch(/^sandbox;/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/script-src|allow-scripts|allow-same-origin/);
  });

  it("serves archives and documents as attachments with download headers", async () => {
    state.objects.set("k--archive.zip", { bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, contentType: "application/zip" });
    const response = await get("k--archive.zip");
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment.*archive\.zip/);
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("serves videos inline with media CSP permissions", async () => {
    state.objects.set("k--ekran.mp4", { bytes: new Uint8Array([0, 0, 0, 0x20]).buffer, contentType: "video/mp4" });
    const response = await get("k--ekran.mp4");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toMatch(/^inline/);
    expect(response.headers.get("content-security-policy")).toContain("media-src 'self'");
  });

  it("infers video content type for legacy octet-stream video uploads", async () => {
    state.objects.set("k--clip.mp4", { bytes: new Uint8Array([0, 0, 0, 0x20]).buffer, contentType: "application/octet-stream" });
    const response = await get("k--clip.mp4");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toMatch(/^inline/);
  });
});
