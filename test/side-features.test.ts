import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { disabledFeatureFor, disabledFeatures, featureFlags, SIDE_FEATURES } from "@/lib/features";

const API = path.resolve(__dirname, "../app/api");
const folders = (dir: string) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

describe("side features", () => {
  it("lists exactly the folders in app/api/(features)", () => {
    expect(Object.keys(SIDE_FEATURES).sort()).toEqual(folders(path.join(API, "(features)")));
  });

  it("never lists a core route", () => {
    const core = folders(API).filter((name) => name !== "(features)");
    expect(core).toContain("messages");
    for (const name of core) expect(Object.hasOwn(SIDE_FEATURES, name)).toBe(false);
  });

  it("parses FEATURES_DISABLED and ignores unknown or core ids", () => {
    expect(disabledFeatures({})).toEqual([]);
    expect(disabledFeatures({ FEATURES_DISABLED: " Games, battlemap ,,nope,messages,auth" })).toEqual([
      "games",
      "battlemap",
    ]);
    expect(featureFlags({ FEATURES_DISABLED: "polls" }).disabled).toEqual(["polls"]);
  });

  it("maps an API path to the switched-off feature that owns it", () => {
    const env = disabledFeatures({ FEATURES_DISABLED: "integrations,games" });
    expect(disabledFeatureFor("/api/integrations/dnd/roll", env)).toBe("integrations");
    expect(disabledFeatureFor("/api/games", env)).toBe("games");
    expect(disabledFeatureFor("/api/games?x=1", env)).toBe("games");
    // Prefix lookalikes and core routes stay on.
    expect(disabledFeatureFor("/api/gamesx", env)).toBeNull();
    expect(disabledFeatureFor("/api/messages", env)).toBeNull();
    expect(disabledFeatureFor("/api/polls", env)).toBeNull();
    expect(disabledFeatureFor("/hangout/", env)).toBeNull();
  });
});
