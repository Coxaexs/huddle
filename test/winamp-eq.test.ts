import { describe, expect, it } from "vitest";
import { BUILTIN_THEMES } from "@/lib/themes";
import { CLUB_SKINS, clubSkinFor, noteBlockColour, residentDj } from "@/lib/club-skins";
import { EQ_FREQS, EQ_MAX_DB, EQ_PRESETS, FLAT_EQ, cleanEq, eqDbAt, eqGains, eqGraphPoints } from "@/lib/winamp-eq";

describe("Winamp equalizer", () => {
  it("reads Winamp's slider steps as dB, the middle step flat", () => {
    const club = EQ_PRESETS.find((p) => p.name === "Club")!;
    expect(club.bands[0]).toBe(0);
    expect(club.bands[4]).toBe(3.5); // step 42
    for (const preset of EQ_PRESETS) {
      expect(preset.bands).toHaveLength(EQ_FREQS.length);
      for (const db of preset.bands) expect(Math.abs(db)).toBeLessThanOrEqual(EQ_MAX_DB);
    }
  });

  it("cleans a stored setting: junk is flat, out of range is clamped, unknown presets are dropped", () => {
    expect(cleanEq(null)).toEqual(FLAT_EQ);
    expect(cleanEq("nope")).toEqual(FLAT_EQ);
    const eq = cleanEq({ on: false, preamp: 40, bands: [3, "x", -99, NaN], preset: "Gabber" });
    expect(eq.on).toBe(false);
    expect(eq.preamp).toBe(EQ_MAX_DB);
    expect(eq.bands).toEqual([3, 0, -EQ_MAX_DB, 0, 0, 0, 0, 0, 0, 0]);
    expect(eq.preset).toBeNull();
    expect(cleanEq({ preset: "Techno" }).preset).toBe("Techno");
  });

  it("leaves the sound alone when off or flat, and keeps headroom for boosts", () => {
    expect(eqGains(FLAT_EQ)).toBeNull();
    const bass = { ...FLAT_EQ, bands: [8, 4, 0, 0, 0, 0, 0, 0, 0, 0] };
    expect(eqGains({ ...bass, on: false })).toBeNull();
    expect(eqGains(bass)).toEqual({ preamp: -6, bands: bass.bands });
    const cut = { ...FLAT_EQ, preamp: 2, bands: [-6, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    expect(eqGains(cut)!.preamp).toBe(2);
  });

  it("finds the curve between bands on a log scale", () => {
    const bands = [0, 0, 0, 0, 6, 12, 0, 0, 0, 0];
    expect(eqDbAt(1000, bands)).toBe(6);
    expect(eqDbAt(Math.sqrt(1000 * 3000), bands)).toBeCloseTo(9, 5);
    expect(eqDbAt(20, [5, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(5);
    expect(eqDbAt(20000, [0, 0, 0, 0, 0, 0, 0, 0, 0, -4])).toBe(-4);
  });

  it("draws the graph across the box, flat in the middle and +12 dB at the top", () => {
    const flat = eqGraphPoints(FLAT_EQ.bands).split(" ");
    expect(flat[0]).toBe("0.0,10.0");
    expect(flat[flat.length - 1]).toBe("100.0,10.0");
    const top = eqGraphPoints(EQ_FREQS.map(() => EQ_MAX_DB)).split(" ");
    expect(top.every((point) => point.endsWith(",1.0"))).toBe(true);
  });
});

describe("club skins", () => {
  it("dresses the club for the themes that have one, and only those", () => {
    expect(clubSkinFor("winamp")).toBe("winamp");
    expect(clubSkinFor("star-wars")).toBe("cantina");
    expect(clubSkinFor("matrix")).toBe("construct");
    expect(clubSkinFor("minecraft")).toBe("redstone");
    expect(clubSkinFor("y2k")).toBe("plain");
    expect(clubSkinFor(undefined)).toBe("plain");
    for (const id of ["winamp", "star-wars", "matrix", "minecraft"]) {
      expect(BUILTIN_THEMES.some((theme) => theme.id === id)).toBe(true);
    }
    expect(new Set(CLUB_SKINS).size).toBe(CLUB_SKINS.length);
  });

  it("has a droid on the decks in the cantina", () => {
    expect(residentDj("cantina")).toBe("H0-FY");
    expect(residentDj("winamp")).toBe("HOFFY");
  });

  it("colours note particles as Minecraft does: F♯ green, round the wheel from there", () => {
    const [r, g, b] = noteBlockColour(6);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    for (let pc = 0; pc < 12; pc++) {
      for (const channel of noteBlockColour(pc)) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
    expect(noteBlockColour(-6)).toEqual(noteBlockColour(6));
  });
});
