import { describe, it, expect } from "vitest";
import { canonicalJellyfinUrl, jellyfinLink, parseStreamUrl } from "@/app/lib/stream-url";
import { canPlayDirectly, jellyfinDirectUrl, jellyfinHlsUrl, videoCodecString } from "@/app/lib/watch-source";

const ITEM = "9617412d4b00d752c2ac3d6dfceb5d4c";
const KEY = "0123456789abcdef0123456789abcdef";

describe("parseStreamUrl", () => {
  it("keeps Jellyfin /Download links in their canonical form", () => {
    const raw = `https://media.example.com/jellyfin/Items/${ITEM}/Download?api_key=${KEY}`;
    const result = parseStreamUrl(raw);
    expect(result.isJellyfin).toBe(true);
    expect(result.itemId).toBe(ITEM);
    expect(result.url).toBe(raw);
    expect(result.title).toBe("Jellyfin (9617412d)");
  });

  it("turns /Videos stream links into the canonical Download link", () => {
    const result = parseStreamUrl(`https://media.example.com/jellyfin/Videos/${ITEM}/stream.mp4?static=true&api_key=${KEY}`);
    expect(result.isJellyfin).toBe(true);
    expect(result.url).toBe(`https://media.example.com/jellyfin/Items/${ITEM}/Download?api_key=${KEY}`);
  });

  it("reads the web player's page for a film", () => {
    const result = parseStreamUrl(`https://media.example.com/jellyfin/web/index.html#!/details?id=${ITEM}&serverId=abc&api_key=${KEY}`);
    expect(result.isJellyfin).toBe(true);
    expect(result.itemId).toBe(ITEM);
    expect(result.needsKey).toBe(false);
    expect(result.url).toBe(`https://media.example.com/jellyfin/Items/${ITEM}/Download?api_key=${KEY}`);
  });

  it("reads the newer #/details web link, with a server at the domain root", () => {
    const link = jellyfinLink(`https://jf.example.com/web/#/details?id=${ITEM}`);
    expect(link).toEqual({ base: "https://jf.example.com", itemId: ITEM, apiKey: "", needsKey: true });
  });

  it("accepts dashed item ids from the web player", () => {
    const link = jellyfinLink("https://jf.example.com/web/#/details?id=9617412d-4b00-d752-c2ac-3d6dfceb5d4c");
    expect(link?.itemId).toBe(ITEM);
  });

  it("flags a stream link without a key", () => {
    const result = parseStreamUrl(`https://media.example.com/jellyfin/Items/${ITEM}/Download`);
    expect(result.isJellyfin).toBe(true);
    expect(result.needsKey).toBe(true);
  });

  it("does not take any /Items/ path on any site for Jellyfin", () => {
    const result = parseStreamUrl("https://shop.example.com/Items/12345/photo.jpg");
    expect(result.isJellyfin).toBe(false);
  });

  it("does not take a #id= fragment on a video file for Jellyfin", () => {
    const result = parseStreamUrl("https://example.com/clip.mp4#id=3");
    expect(result.isJellyfin).toBe(false);
  });

  it("titles direct video links after the file", () => {
    const raw = "https://example.com/videos/awesome_trailer_2026.mp4";
    const result = parseStreamUrl(raw);
    expect(result.isJellyfin).toBe(false);
    expect(result.url).toBe(raw);
    expect(result.title).toBe("awesome trailer 2026");
  });

  it("respects custom default titles", () => {
    const result = parseStreamUrl(`https://media.example.com/jellyfin/Items/${ITEM}/Download?api_key=${KEY}`, "Valheim Movie");
    expect(result.title).toBe("Valheim Movie");
  });
});

describe("Jellyfin playback", () => {
  const link = { base: "https://media.example.com/jellyfin", itemId: ITEM, apiKey: KEY };
  const browser = (supported: string[]) => ({
    canPlayType: (type: string) => (supported.some((s) => type.includes(s)) ? "probably" as const : "" as const),
  });

  it("canonical links round-trip", () => {
    expect(jellyfinLink(canonicalJellyfinUrl(link))).toEqual({ ...link, needsKey: false });
  });

  it("plays an H.264 + AAC mp4 directly", () => {
    const source = { Container: "mov,mp4,m4a,3gp,3g2,mj2", MediaStreams: [{ Type: "Video", Codec: "h264" }, { Type: "Audio", Codec: "aac" }] };
    expect(canPlayDirectly(browser(["avc1"]), source)).toBe(true);
  });

  it("converts HEVC when the browser has no HEVC decoder", () => {
    const source = { Container: "mp4", MediaStreams: [{ Type: "Video", Codec: "hevc" }, { Type: "Audio", Codec: "aac" }] };
    expect(canPlayDirectly(browser(["avc1"]), source)).toBe(false);
    expect(canPlayDirectly(browser(["avc1", "hvc1"]), source)).toBe(true);
  });

  it("converts any .mkv, and AC-3 or DTS sound", () => {
    expect(canPlayDirectly(browser(["avc1", "mp4a"]), { Container: "mkv", MediaStreams: [{ Type: "Video", Codec: "h264" }, { Type: "Audio", Codec: "aac" }] })).toBe(false);
    expect(canPlayDirectly(browser(["avc1", "mp4a"]), { Container: "mp4", MediaStreams: [{ Type: "Video", Codec: "h264" }, { Type: "Audio", Codec: "ac3" }] })).toBe(false);
  });

  it("asks Jellyfin for H.264 + AAC HLS with a session it can stop", () => {
    const url = new URL(jellyfinHlsUrl(link, ITEM, { playSessionId: "s1", deviceId: "d1" }));
    expect(url.pathname).toBe(`/jellyfin/Videos/${ITEM}/master.m3u8`);
    expect(url.searchParams.get("VideoCodec")).toBe("h264");
    expect(url.searchParams.get("AudioCodec")).toBe("aac");
    expect(url.searchParams.get("PlaySessionId")).toBe("s1");
    expect(url.searchParams.get("api_key")).toBe(KEY);
  });

  it("streams the file itself when it can play directly", () => {
    const url = new URL(jellyfinDirectUrl(link, ITEM));
    expect(url.pathname).toBe(`/jellyfin/Videos/${ITEM}/stream`);
    expect(url.searchParams.get("static")).toBe("true");
  });
});

describe("exact codec checks", () => {
  it("asks about 10-bit HEVC as 10-bit, with the file's own tag", () => {
    expect(videoCodecString({ Codec: "hevc", CodecTag: "hev1", Profile: "Main 10", Level: 120, BitDepth: 10 })).toBe("hev1.2.4.L120.B0");
    expect(videoCodecString({ Codec: "hevc", CodecTag: "hvc1", Profile: "Main", Level: 93, BitDepth: 8 })).toBe("hvc1.1.6.L93.B0");
    expect(videoCodecString({ Codec: "h264", Profile: "High", Level: 41 })).toBe("avc1.640029");
    expect(videoCodecString({ Codec: "h264", Profile: "High 10", Level: 41, BitDepth: 10 })).toBeNull();
  });

  it("converts a Main 10 file for a browser that only decodes 8-bit HEVC", () => {
    const eightBitOnly = { canPlayType: (type: string) => (/(hvc1|hev1)\.1\./.test(type) ? "probably" as const : "" as const) };
    const mainTen = { Container: "mov,mp4,m4a,3gp,3g2,mj2", MediaStreams: [
      { Type: "Video", Codec: "hevc", CodecTag: "hev1", Profile: "Main 10", Level: 120, BitDepth: 10 },
      { Type: "Audio", Codec: "aac" },
    ] };
    expect(canPlayDirectly(eightBitOnly, mainTen)).toBe(false);
  });

  it("trusts only a confident answer", () => {
    const unsure = { canPlayType: () => "maybe" as const };
    const file = { Container: "mp4", MediaStreams: [{ Type: "Video", Codec: "h264", Profile: "High", Level: 40 }] };
    expect(canPlayDirectly(unsure, file)).toBe(false);
  });
});
