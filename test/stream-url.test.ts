import { describe, it, expect } from "vitest";
import { parseStreamUrl } from "@/app/lib/stream-url";

describe("parseStreamUrl", () => {
  it("normalizes Jellyfin /Download URLs with api_key", () => {
    const raw = "https://deeppixel.online/jellyfin/Items/9617412d4b00d752c2ac3d6dfceb5d4c/Download?api_key=187c41b933244fca8b8acf2b5609e8ff";
    const result = parseStreamUrl(raw);
    expect(result.isJellyfin).toBe(true);
    expect(result.itemId).toBe("9617412d4b00d752c2ac3d6dfceb5d4c");
    expect(result.url).toContain("/jellyfin/Items/9617412d4b00d752c2ac3d6dfceb5d4c/Download");
    expect(result.url).toContain("api_key=187c41b933244fca8b8acf2b5609e8ff");
    expect(result.title).toBe("Jellyfin (9617412d)");
  });

  it("normalizes Jellyfin /Videos stream URLs", () => {
    const raw = "https://deeppixel.online/jellyfin/Videos/abc12345/stream.mp4?api_key=secret";
    const result = parseStreamUrl(raw);
    expect(result.isJellyfin).toBe(true);
    expect(result.itemId).toBe("abc12345");
    expect(result.title).toBe("Jellyfin (abc12345)");
  });

  it("normalizes direct .mp4 video links and extracts title", () => {
    const raw = "https://example.com/videos/awesome_trailer_2026.mp4";
    const result = parseStreamUrl(raw);
    expect(result.isJellyfin).toBe(false);
    expect(result.url).toBe(raw);
    expect(result.title).toBe("awesome trailer 2026");
  });

  it("respects custom default titles", () => {
    const raw = "https://deeppixel.online/jellyfin/Items/123/Download?api_key=key";
    const result = parseStreamUrl(raw, "Valheim Movie");
    expect(result.title).toBe("Valheim Movie");
  });
});
