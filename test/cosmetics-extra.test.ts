import { describe, expect, it } from "vitest";
import { AVATAR_FRAMES, NAMEPLATES, PROFILE_EFFECTS, PROFILE_FRAMES } from "@/app/components/settings/constants";
import { EXTRA_DECORATIONS, EXTRA_EFFECTS, EXTRA_FRAME_ART, EXTRA_NAMEPLATE_ART, EXTRA_SCENES, NAMEPLATE_FIT_WHOLE } from "@/app/components/cosmetics-extra";

// The profile route stores any id of this shape (app/api/settings/profile/route.ts).
const SAVABLE = /^[a-z0-9-]{1,30}$/;

const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe("second wave of cosmetics", () => {
  it("lists every new piece of art in its picker", () => {
    for (const id of Object.keys(EXTRA_NAMEPLATE_ART)) expect(ids(NAMEPLATES)).toContain(id);
    for (const id of Object.keys(EXTRA_DECORATIONS)) expect(ids(AVATAR_FRAMES)).toContain(id);
    for (const id of Object.keys(EXTRA_FRAME_ART)) expect(ids(PROFILE_FRAMES)).toContain(id);
    for (const id of [...Object.keys(EXTRA_EFFECTS), ...Object.keys(EXTRA_SCENES)]) expect(ids(PROFILE_EFFECTS)).toContain(id);
  });

  it("does not register an effect as both a scene and particles", () => {
    // Scenes win in ProfileEffect, so the particles would never show.
    for (const id of Object.keys(EXTRA_EFFECTS)) expect(EXTRA_SCENES).not.toHaveProperty(id);
  });

  it("only fits plates whole that exist", () => {
    for (const id of NAMEPLATE_FIT_WHOLE) expect(EXTRA_NAMEPLATE_ART).toHaveProperty(id);
  });

  it("keeps catalog ids unique and savable", () => {
    for (const list of [NAMEPLATES, AVATAR_FRAMES, PROFILE_FRAMES, PROFILE_EFFECTS]) {
      const all = ids(list);
      expect(new Set(all).size).toBe(all.length);
      for (const id of all) expect(id).toMatch(SAVABLE);
    }
  });
});
