import { describe, expect, it } from "vitest";
import { cleanHomebrew, findHomebrew, MAX_HOMEBREW, mergeHomebrew } from "@/lib/dnd-rules";

describe("D&D homebrew", () => {
  it("keeps the known fields of an entry and drops the rest", () => {
    expect(
      cleanHomebrew({
        name: "  Sunfire Blade ",
        kind: "Spells",
        level: 2,
        school: "evocation",
        description: "A blade of light.",
        onclick: "alert(1)",
      }),
    ).toEqual({ name: "Sunfire Blade", kind: "spell", level: 2, school: "evocation", description: "A blade of light." });
    expect(cleanHomebrew({ name: "Nameless", kind: "vehicle" })).toBeNull();
    expect(cleanHomebrew({ kind: "spell" })).toBeNull();
    expect(cleanHomebrew("spell")).toBeNull();
  });

  it("replaces an entry of the same kind and name, and counts what it skipped", () => {
    const first = mergeHomebrew([], [{ name: "Fang", kind: "item", description: "old" }]);
    if ("error" in first) throw new Error(first.error);
    const second = mergeHomebrew(first.homebrew, [
      { name: "fang", kind: "item", description: "new" },
      { name: "Fang", kind: "monster", description: "a wolf" },
      { kind: "spell" },
    ]);
    if ("error" in second) throw new Error(second.error);
    expect(second.added).toBe(2);
    expect(second.skipped).toBe(1);
    expect(second.homebrew.map((item) => `${item.kind}:${item.name}:${item.description}`)).toEqual([
      "item:fang:new",
      "monster:Fang:a wolf",
    ]);
  });

  it("refuses to grow past the cap", () => {
    const many = Array.from({ length: MAX_HOMEBREW + 1 }, (_, i) => ({ name: `Spell ${i}`, kind: "spell" }));
    expect(mergeHomebrew([], many)).toHaveProperty("error");
  });

  it("finds an exact name for the looked-up kind", () => {
    const homebrew = [{ name: "Sunfire Blade", kind: "spell" as const, description: "" }];
    expect(findHomebrew(homebrew, "spell", "sunfire blade")?.name).toBe("Sunfire Blade");
    expect(findHomebrew(homebrew, "spells", "Sunfire Blade")?.name).toBe("Sunfire Blade");
    expect(findHomebrew(homebrew, "monster", "Sunfire Blade")).toBeNull();
    expect(findHomebrew(homebrew, "spell", "sunfire")).toBeNull();
  });
});
