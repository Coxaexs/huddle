import { describe, expect, it } from "vitest";
import { HOFFY_STICKERS, hoffyStickerItems, hoffyStickerUrl } from "@/app/lib/hoffy-stickers";
import { isImageUrl } from "@/app/components/message-body";
import { existsSync } from "node:fs";

describe("the Hoffy sticker pack", () => {
  it("has a file for every sticker", () => {
    for (const s of HOFFY_STICKERS) expect(existsSync(`public/stickers/hoffy/${s.id}.svg`)).toBe(true);
  });

  it("searches by name and tag, in English and Turkish", () => {
    expect(hoffyStickerItems("").length).toBe(HOFFY_STICKERS.length);
    expect(hoffyStickerItems("selam").map((s) => s.id)).toEqual(["hoffy-hi"]);
    expect(hoffyStickerItems("sleepy").map((s) => s.id)).toEqual(["hoffy-zzz"]);
    expect(hoffyStickerItems("nothing like this")).toEqual([]);
  });

  it("renders as a picture in messages", () => {
    expect(isImageUrl(hoffyStickerUrl("hi"))).toBe(true);
    expect(isImageUrl("/hangout/stickers/hoffy/../../secret.svg")).toBe(false);
    expect(isImageUrl("/hangout/stickers/other/x.svg")).toBe(false);
  });
});
