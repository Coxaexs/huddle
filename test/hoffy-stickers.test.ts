import { describe, expect, it } from "vitest";
import { GANG_STICKERS, HOFFY_STICKERS, gangStickerUrl, hoffyStickerItems, hoffyStickerUrl } from "@/app/lib/hoffy-stickers";
import { isImageUrl } from "@/app/components/message-body";
import { existsSync } from "node:fs";

describe("the Hoffy sticker pack", () => {
  it("has a file for every sticker", () => {
    for (const s of HOFFY_STICKERS) expect(existsSync(`public/stickers/hoffy/${s.id}.svg`)).toBe(true);
  });

  it("has every gang sticker and its picker preview, in English and Turkish", () => {
    for (const { id } of GANG_STICKERS) {
      for (const lang of ["en", "tr"]) {
        expect(existsSync(`public/stickers/gang/${id}-${lang}.webp`), `${id}-${lang}`).toBe(true);
        expect(existsSync(`public/stickers/gang/preview/${id}-${lang}.webp`), `preview ${id}-${lang}`).toBe(true);
      }
    }
  });

  it("searches by name and tag, in English and Turkish", () => {
    expect(hoffyStickerItems("").length).toBe(HOFFY_STICKERS.length + GANG_STICKERS.length);
    expect(hoffyStickerItems("selam").map((s) => s.id)).toEqual(["hoffy-hi", "gang-hoffy-hi"]);
    expect(hoffyStickerItems("sleepy").map((s) => s.id)).toEqual(["hoffy-zzz", "gang-hoffy-gn"]);
    expect(hoffyStickerItems("görüldü").map((s) => s.id)).toEqual(["gang-toast-seen"]);
    expect(hoffyStickerItems("on my way").map((s) => s.id)).toEqual(["gang-egg-omw"]);
    expect(hoffyStickerItems("nothing like this")).toEqual([]);
  });

  it("shows the gang's words in the app's language, English when it has none", () => {
    expect(hoffyStickerItems("seen", "tr")[0].url).toBe("/hangout/stickers/gang/toast-seen-tr.webp");
    expect(hoffyStickerItems("seen", "de")[0].url).toBe("/hangout/stickers/gang/toast-seen-en.webp");
    expect(hoffyStickerItems("seen")[0].preview).toBe("/hangout/stickers/gang/preview/toast-seen-en.webp");
  });

  it("renders as a picture in messages", () => {
    expect(isImageUrl(hoffyStickerUrl("hi"))).toBe(true);
    expect(isImageUrl(gangStickerUrl("toast-seen", "tr"))).toBe(true);
    expect(isImageUrl("/hangout/stickers/hoffy/../../secret.svg")).toBe(false);
    expect(isImageUrl("/hangout/stickers/gang/../../secret.webp")).toBe(false);
    expect(isImageUrl("/hangout/stickers/other/x.svg")).toBe(false);
  });
});
