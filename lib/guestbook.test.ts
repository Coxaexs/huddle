import { describe, expect, it } from "vitest";
import { checkGuestName, checkGuestText, containsImage, containsLink, containsSwearing } from "./guestbook";

describe("guestbook text", () => {
  it("lets ordinary messages through, trimmed", () => {
    expect(checkGuestText("  hi! love the MSN theme :)  ")).toEqual({ ok: true, value: "hi! love the MSN theme :)" });
    expect(checkGuestText("can I get an invite? I play D&D on fridays").ok).toBe(true);
    expect(checkGuestText("e.g. version 3.5 works, i.e. fine. Me/you, 10.5 stars").ok).toBe(true);
  });

  it("refuses empty and overlong messages", () => {
    expect(checkGuestText("   ").ok).toBe(false);
    expect(checkGuestText("​​").ok).toBe(false);
    expect(checkGuestText("a".repeat(501)).ok).toBe(false);
    expect(checkGuestText(42).ok).toBe(false);
  });

  it("refuses links in their usual disguises", () => {
    for (const text of [
      "https://example.com",
      "go to www.example.org",
      "join discord.gg/abcd",
      "visit example . com",
      "example(dot)com",
      "example [dot] ru",
      "mailto:me",
      "t.me/someone",
      "server at 192.168.1.10",
      "javascript:alert(1)",
    ]) {
      expect(containsLink(text), text).toBe(true);
    }
    expect(containsLink("see you at 9. Come early")).toBe(false);
  });

  it("refuses images", () => {
    for (const text of ["![x](y)", "<img src=x>", "[img]x[/img]", "look at cat.png", "data:image/png;base64,AAAA"]) {
      expect(containsImage(text) || containsLink(text), text).toBe(true);
    }
  });

  it("refuses swearing, including spelled-out and leetspeak forms", () => {
    for (const text of ["fuck this", "FUUUUCK", "f u c k", "f.u.c.k", "sh1t", "you a$$hole", "what an ass", "siktir git", "amk", "kanker"]) {
      expect(containsSwearing(text), text).toBe(true);
    }
  });

  it("does not trip on harmless words that contain a swear", () => {
    for (const text of ["class assignment", "passing the bass", "Scunthorpe", "I live in Niger", "Fukuoka trip", "a swanky shiitake dish", "Amina says hi", "cocktail hour"]) {
      expect(containsSwearing(text), text).toBe(false);
    }
  });
});

describe("guestbook names", () => {
  it("accepts ordinary names", () => {
    expect(checkGuestName("  Ana  ")).toEqual({ ok: true, value: "Ana" });
    expect(checkGuestName("jonas_92").ok).toBe(true);
    expect(checkGuestName("Florian").ok).toBe(true);
    expect(checkGuestName("Zoë O'Neil").ok).toBe(true);
  });

  it("refuses names that pass for the team", () => {
    for (const name of ["Flo", "kiwi", "KIWI123", "k1wi", "Hoffle Support", "admin", "xAdminx", "Moderator", "mewis"]) {
      expect(checkGuestName(name).ok, name).toBe(false);
    }
  });

  it("refuses bad, too short, too long and odd names", () => {
    expect(checkGuestName("a").ok).toBe(false);
    expect(checkGuestName("x".repeat(25)).ok).toBe(false);
    expect(checkGuestName("bitch").ok).toBe(false);
    expect(checkGuestName("site.com").ok).toBe(false);
    expect(checkGuestName("<b>hi</b>").ok).toBe(false);
    expect(checkGuestName("@everyone").ok).toBe(false);
  });
});
