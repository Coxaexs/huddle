import { describe, expect, it } from "vitest";
import { findCountry, guessRota, newRota, type RotaState } from "./rota";
import { ROTA_COUNTRIES } from "./rota-data";

describe("rota", () => {
  it("keeps borders symmetric", () => {
    for (const [name, c] of Object.entries(ROTA_COUNTRIES)) {
      for (const b of c.borders) expect(ROTA_COUNTRIES[b].borders, `${b}→${name}`).toContain(name);
    }
  });

  it("matches names loosely", () => {
    expect(findCountry("  usa ")).toBe("United States");
    expect(findCountry("türkiye")).toBe("Turkey");
    expect(findCountry("Atlantis")).toBeNull();
  });

  it("picks pairs 3–6 apart", () => {
    for (let i = 0; i < 50; i += 1) {
      const r = newRota();
      expect(r.shortest).toBeGreaterThanOrEqual(3);
      expect(r.shortest).toBeLessThanOrEqual(6);
    }
  });

  it("wins when the guesses link start to end", () => {
    let rota: RotaState = { start: "Spain", end: "Germany", shortest: 1, guesses: [] };
    const miss = guessRota(rota, 0, "Italy");
    if ("error" in miss) throw new Error(miss.error);
    expect(miss.connected).toBe(false);
    expect(miss.rota.guesses[0].off).toBe(2);
    rota = miss.rota;
    const hit = guessRota(rota, 1, "france");
    if ("error" in hit) throw new Error(hit.error);
    expect(hit.connected).toBe(true);
    expect(hit.rota.route).toEqual(["Spain", "France", "Germany"]);
    expect("error" in guessRota(hit.rota, 0, "France")).toBe(true);
  });
});

describe("rota in Turkish", () => {
  it("accepts Turkish names", () => {
    expect(findCountry("Birleşik Krallık")).toBe("United Kingdom");
    expect(findCountry("ısveç")).toBe("Sweden");
    expect(findCountry("İSPANYA")).toBe("Spain");
    expect(findCountry("abd")).toBe("United States");
  });
});

describe("solo rota", () => {
  it("starts playing and keeps the turn", async () => {
    const { newGame, playMove, joinGame } = await import("./games");
    const host = { id: "a", name: "A" };
    const { state, secret } = newGame("rota", host, null, Math.random, true);
    expect(state.status).toBe("playing");
    expect("error" in joinGame(state, secret, { id: "b", name: "B" })).toBe(true);
    state.rota = { start: "Spain", end: "Germany", shortest: 1, guesses: [] };
    const r = playMove(state, secret, "a", "Italy");
    if ("error" in r) throw new Error(r.error);
    expect(r.state.turn).toBe(0);
    const w = playMove(r.state, r.secret, "a", "Fransa");
    if ("error" in w) throw new Error(w.error);
    expect(w.state.status).toBe("won");
  });
});
