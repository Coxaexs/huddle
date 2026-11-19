import { describe, expect, it } from "vitest";
import { guestUsername } from "./guest-username";
import { validateUsername } from "./auth";

describe("guestUsername", () => {
  it("is made from the name people typed", () => {
    expect(guestUsername("Deniz", "51ee")).toBe("deniz-51ee");
  });
  it("spells Turkish letters out", () => {
    expect(guestUsername("Çağrı Işık", "a1b2")).toBe("cagriisik-a1b2");
  });
  it("falls back to guest when nothing usable is left", () => {
    expect(guestUsername("🙂", "a1b2")).toBe("guest-a1b2");
    expect(guestUsername("x", "a1b2")).toBe("guest-a1b2");
  });
  it("always passes the username rules", () => {
    for (const name of ["Deniz", "Çağrı Işık", "🙂", "a very very long display name indeed", "Ölüm Şövalyesi 3000"]) {
      expect(validateUsername(guestUsername(name, "51ee2e58"))).toBeNull();
    }
  });
});
