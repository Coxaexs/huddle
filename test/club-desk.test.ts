import { describe, expect, it } from "vitest";
import {
  CLUB_FADERS, DEFAULT_DESK, HELD_FX, SCENE_DESKS, cleanClubDesk, cleanClubFx, keyHue, sceneDesk,
} from "@/lib/club-desk";

describe("the club's light desk", () => {
  it("keeps a sent desk's known settings, in range, and fills the rest from the default", () => {
    expect(cleanClubDesk(null)).toBeNull();
    expect(cleanClubDesk("peak")).toBeNull();
    expect(cleanClubDesk([1, 2])).toBeNull();
    expect(cleanClubDesk({})).toEqual({ ...DEFAULT_DESK, scene: "custom" });
    const desk = cleanClubDesk({
      scene: "peak", master: 2, beams: -1, move: 0.333333, lasers: "1", strobe: Number.NaN, haze: Infinity,
      colour: "pick", hue: 0.75, floorFx: "checker", wallFx: "<b>", beamFx: "crowd", laserFx: "sheet", autoFx: "yes",
      extra: "dropped",
    })!;
    expect(desk).toEqual({
      ...DEFAULT_DESK, scene: "peak", master: 1, beams: 0, move: 0.33, lasers: DEFAULT_DESK.lasers, strobe: DEFAULT_DESK.strobe,
      haze: DEFAULT_DESK.haze, colour: "pick", hue: 0.75, floorFx: "checker", wallFx: "auto", beamFx: "crowd", laserFx: "sheet",
      autoFx: DEFAULT_DESK.autoFx,
    });
    expect("extra" in desk).toBe(false);
    expect(cleanClubDesk({ notes: false })!.notes).toBe(false);
    expect(cleanClubDesk({ notes: "off" })!.notes).toBe(DEFAULT_DESK.notes);
  });

  it("sets a scene's look on top of the desk as it was", () => {
    const from = { ...DEFAULT_DESK, colour: "pick" as const, hue: 0.2 };
    const chill = sceneDesk("chill", from);
    expect(chill.scene).toBe("chill");
    expect(chill.strobe).toBe(0);
    expect(chill.colour).toBe("pick");
    expect(chill.hue).toBe(0.2);
    // Every scene sets every fader, so switching scenes never leaves one from the last.
    for (const scene of Object.values(SCENE_DESKS)) for (const fader of CLUB_FADERS) expect(scene[fader]).toBeTypeOf("number");
    expect(cleanClubDesk(sceneDesk("lasers"))).toEqual(sceneDesk("lasers"));
  });

  it("knows its moments, and the held ones carry on or off", () => {
    expect(cleanClubFx({ thing: "confetti", on: true })).toEqual({ thing: "confetti" });
    expect(cleanClubFx({ thing: "blackout", on: true })).toEqual({ thing: "blackout", on: true });
    expect(cleanClubFx({ thing: "strobe" })).toEqual({ thing: "strobe", on: false });
    expect(cleanClubFx({ thing: "fireworks" })).toBeNull();
    expect(cleanClubFx("flash")).toBeNull();
    expect(HELD_FX).toEqual(["blackout", "strobe"]);
  });

  it("colours a song by its key: a harmonic step is a small change, a clash a big one", () => {
    expect(keyHue("1A")).toBe(0);
    expect(keyHue("4a")).toBeCloseTo(0.25);
    expect(keyHue("12B")).toBeCloseTo(11 / 12 + 0.03);
    expect(keyHue("13A")).toBeNull();
    expect(keyHue("C major")).toBeNull();
    expect(keyHue(null)).toBeNull();
    const step = Math.abs(keyHue("8A")! - keyHue("9A")!);
    const clash = Math.abs(keyHue("8A")! - keyHue("2A")!);
    expect(step).toBeLessThan(clash);
  });
});
