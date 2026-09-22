import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  isSafePublicUrl,
  parsePreview,
  signImageUrl,
  verifyImageSignature,
  youtubeId,
} from "./unfurl";

describe("isSafePublicUrl", () => {
  it("accepts ordinary public pages", () => {
    expect(isSafePublicUrl("https://www.youtube.com/watch?v=abc")).not.toBeNull();
    expect(isSafePublicUrl("http://example.com:80/a")).not.toBeNull();
  });

  it("rejects local and private targets", () => {
    for (const url of [
      "http://localhost:8730/",
      "http://127.0.0.1/",
      "http://0x7f.1/",
      "http://2130706433/",
      "http://10.0.0.5/",
      "http://192.168.1.1/admin",
      "http://172.20.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://router.lan/",
      "http://printer.local/",
      "http://intranet/",
      "https://example.com:8443/",
      "https://user:pass@example.com/",
      "ftp://example.com/",
      "javascript:alert(1)",
    ]) {
      expect(isSafePublicUrl(url), url).toBeNull();
    }
  });
});

describe("parsePreview", () => {
  it("reads Open Graph tags in any attribute order", () => {
    const html = `<html><head>
      <title>Fallback</title>
      <meta content="Cool Video" property="og:title">
      <meta property='og:description' content='A &amp; B &#39;quoted&#39;'>
      <meta property="og:image" content="/thumb.jpg">
      <meta property="og:site_name" content="YouTube">
      <meta name="twitter:card" content="summary">
      <meta name="theme-color" content="#ff0000">
    </head></html>`;
    const preview = parsePreview(html, "https://www.youtube.com/watch?v=1");
    expect(preview).toMatchObject({
      title: "Cool Video",
      description: "A & B 'quoted'",
      image: "https://www.youtube.com/thumb.jpg",
      siteName: "YouTube",
      largeImage: false,
      themeColor: "#ff0000",
    });
  });

  it("falls back to <title> and the hostname", () => {
    const preview = parsePreview(
      "<title>Just a title</title>",
      "https://www.example.org/page",
    );
    expect(preview).toMatchObject({ title: "Just a title", siteName: "example.org" });
  });

  it("returns null for pages with nothing to show", () => {
    expect(parsePreview("<html><body>hi</body></html>", "https://a.com/")).toBeNull();
  });

  it("drops non-http images", () => {
    const preview = parsePreview(
      '<meta property="og:title" content="x"><meta property="og:image" content="javascript:alert(1)">',
      "https://a.com/",
    );
    expect(preview?.image).toBeUndefined();
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("&lt;b&gt; &#x1F600; &#65;")).toBe("<b> 😀 A");
  });
});

describe("youtubeId", () => {
  it("handles the common link shapes", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://m.youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk");
    expect(youtubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://www.youtube.com/@channel")).toBeNull();
  });
});

describe("image proxy signatures", () => {
  it("only verifies URLs signed with the same key", async () => {
    const image = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg";
    const signed = await signImageUrl("key-one", image);
    const params = new URL(signed, "https://huddle.test").searchParams;
    expect(params.get("url")).toBe(image);
    const sig = params.get("sig") || "";
    expect(await verifyImageSignature("key-one", image, sig)).toBe(true);
    expect(await verifyImageSignature("key-two", image, sig)).toBe(false);
    expect(await verifyImageSignature("key-one", "https://evil.test/x.png", sig)).toBe(false);
    expect(await verifyImageSignature("key-one", image, "")).toBe(false);
  });
});
