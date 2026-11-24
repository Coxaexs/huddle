import { describe, expect, it } from "vitest";
import { sanitizePartyStash, splitCurrency, totalCopper, totalGpValue } from "./party-stash";

describe("party stash helpers", () => {
  it("splits exact denominations cleanly across players", () => {
    const split = splitCurrency({ pp: 0, gp: 100, ep: 0, sp: 0, cp: 0 }, 4);
    expect(split.perPlayer).toEqual({ pp: 0, gp: 25, ep: 0, sp: 0, cp: 0 });
    expect(split.remainder).toEqual({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
  });

  it("breaks odd gold down into silver and preserves total copper across remainder", () => {
    const split = splitCurrency({ pp: 0, gp: 11, ep: 0, sp: 0, cp: 0 }, 2);
    expect(split.perPlayer).toEqual({ pp: 0, gp: 5, ep: 0, sp: 5, cp: 0 });
    expect(split.remainder).toEqual({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });

    const mixed = { pp: 3, gp: 17, ep: 1, sp: 9, cp: 7 };
    const split3 = splitCurrency(mixed, 3);
    expect(totalCopper(split3.perPlayer) * 3 + totalCopper(split3.remainder)).toBe(totalCopper(mixed));
    expect(split3.remainder.cp).toBeLessThan(3);
  });

  it("computes total gold value and sanitizes currency, loot, and quests", () => {
    expect(totalGpValue({ pp: 1, gp: 2, ep: 1, sp: 5, cp: 0 })).toBe(13);
    const cleaned = sanitizePartyStash({
      currency: { pp: -5, gp: 12.9, sp: "4" },
      items: [
        { id: "i1", name: "  Bag of Holding ", qty: 0, attunement: false },
        { id: "i2", name: "", qty: 2 },
      ],
      quests: [
        { id: "q1", title: " Rescue Gundren ", status: "unknown" },
        { id: "q2", title: "", status: "active" },
      ],
    });
    expect(cleaned.currency).toEqual({ pp: 0, gp: 12, ep: 0, sp: 4, cp: 0 });
    expect(cleaned.items).toEqual([{ id: "i1", name: "Bag of Holding", qty: 1 }]);
    expect(cleaned.quests.map((q) => ({ id: q.id, title: q.title, status: q.status }))).toEqual([
      { id: "q1", title: "Rescue Gundren", status: "active" },
    ]);
  });
});
