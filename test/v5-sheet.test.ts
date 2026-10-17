import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiceRollEvent } from "@/lib/protocol";
import { sanitizeShared, type TableCharacter } from "@/lib/lounge-shared";
import { parseV5 } from "@/lib/v5-dice";
import {
  V5_ATTRIBUTES,
  V5_SKILLS,
  cycleBox,
  emptyV5Sheet,
  healthBoxes,
  impaired,
  impairedPenalty,
  rouseCommand,
  rouseRaisesHunger,
  sanitizeV5Sheet,
  trackBoxes,
  v5PoolCommand,
  v5ScreenLines,
  v5Traits,
  willpowerBoxes,
} from "@/lib/v5-sheet";
import { buildScreenPage, pageForSystem, pagesFor, resizeChoice } from "@/app/lib/gm-screen";

// The Vampire: The Masquerade V5 sheet at the tabletop, the screen pages a
// Vampire table gets, and the server switch that makes rolls answer as the
// Storyteller.

const state = vi.hoisted(() => ({
  runs: [] as Array<{ sql: string; values: unknown[] }>,
  row: null as Record<string, unknown> | null,
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", () => ({
  currentUser: async () => ({ id: "kiwi", display_name: "Kiwi", username: "kiwi", is_admin: 0 }),
  unauthorized: () => Response.json({ error: "Sign in" }, { status: 401 }),
}));
vi.mock("@/lib/schema", () => ({ ensureSchema: async () => {} }));
vi.mock("@/lib/access", () => ({
  canSeeServer: async () => true,
  channelAccess: async () => ({
    ok: true,
    channel: { id: "text1", serverId: "s1", kind: "text", name: "table", isDm: false },
  }),
}));
vi.mock("@/lib/permissions", () => ({ can: async () => true, Permission: { MANAGE_MESSAGES: 1, MANAGE_SERVER: 2 } }));
vi.mock("@/lib/timeouts", () => ({ blockIfTimedOut: async () => null }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  limitUser: async () => null,
}));
vi.mock("@/lib/recording", () => ({ activeRecording: async () => null, elapsedMs: () => 0 }));
vi.mock("@/lib/servers", () => ({
  findChannel: async (_db: unknown, id: string) => ({ id, kind: id.startsWith("voice") ? "voice" : "text", server_id: "s1" }),
  isServerMember: async () => true,
}));
vi.mock("@/lib/dms", () => ({ channelAudience: async () => null }));
vi.mock("@/lib/hub-client", () => ({ publishMessageEvent: async () => {}, publishMessage: async () => {} }));
vi.mock("@/app/api/messages/route", () => ({ publicMessage: (row: unknown) => row }));
vi.mock("@/lib/storage", () => ({
  bindings: () => ({
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          async run() {
            state.runs.push({ sql, values });
            return { meta: { changes: 1 } };
          },
          async first() {
            return state.row;
          },
        }),
      }),
    },
  }),
}));

const { POST: ROLL } = await import("@/app/api/(features)/integrations/dnd/roll/route");
const SETTINGS = await import("@/app/api/(features)/integrations/dnd/settings/route");

function roll(command: string, textChannelId: string | undefined = "text1") {
  return ROLL(
    new Request("http://x/api/integrations/dnd/roll", {
      method: "POST",
      body: JSON.stringify({ command, channelId: "voice1", textChannelId }),
    }),
  );
}

const authorOf = () => state.runs.find((run) => run.sql.includes("INSERT INTO messages"))?.values[3];

beforeEach(() => {
  state.runs = [];
  state.row = null;
});

describe("sanitizeV5Sheet", () => {
  it("fills in a fresh sheet from nothing", () => {
    const sheet = sanitizeV5Sheet({});
    expect(sheet).toEqual(emptyV5Sheet());
    expect(sheet.attributes).toHaveLength(9);
    expect(sheet.skills).toHaveLength(27);
    expect(V5_ATTRIBUTES).toHaveLength(9);
    expect(V5_SKILLS).toHaveLength(27);
  });

  it("clamps every number to what V5 allows", () => {
    const sheet = sanitizeV5Sheet({
      attributes: [9, -2, 3.6, "4", 2],
      skills: Array(40).fill(7),
      hunger: 9,
      humanity: 14,
      stains: 3,
      bloodPotency: -1,
      extraHealth: 12,
    });
    // Short lists are padded (attributes start at 1), long ones cut.
    expect(sheet.attributes).toEqual([5, 0, 4, 1, 2, 1, 1, 1, 1]);
    expect(sheet.skills).toEqual(Array(27).fill(5));
    expect(sheet.hunger).toBe(5);
    expect(sheet.humanity).toBe(10);
    // No room for stains at Humanity 10.
    expect(sheet.stains).toBe(0);
    expect(sheet.bloodPotency).toBe(0);
    expect(sheet.extraHealth).toBe(5);
    expect(sanitizeV5Sheet({ humanity: 7, stains: 9 }).stains).toBe(3);
  });

  it("keeps damage inside the boxes, aggravated first", () => {
    // Stamina 2: 5 Health boxes. Composure 2 + Resolve 3: 5 Willpower.
    const attributes = [1, 1, 2, 1, 1, 2, 1, 1, 3];
    const sheet = sanitizeV5Sheet({ attributes, health: { superficial: 4, aggravated: 3 }, willpower: { superficial: 9, aggravated: -1 } });
    expect(healthBoxes(sheet)).toBe(5);
    expect(willpowerBoxes(sheet)).toBe(5);
    expect(sheet.health).toEqual({ aggravated: 3, superficial: 2 });
    expect(sheet.willpower).toEqual({ aggravated: 0, superficial: 5 });
    expect(impaired(sheet.health, 5)).toBe(true);
    // Extra Health boxes (a power, a merit) count too.
    expect(healthBoxes(sanitizeV5Sheet({ attributes, extraHealth: 2 }))).toBe(7);
  });

  it("keeps disciplines as free text: trimmed, once each, and dots 0-5", () => {
    const sheet = sanitizeV5Sheet({
      disciplines: [{ name: "  Night Sight ", dots: 7 }, { name: "night sight", dots: 1 }, { name: "", dots: 2 }, "Fog", { name: "Fog", dots: -3 }],
    });
    expect(sheet.disciplines).toEqual([{ name: "Night Sight", dots: 5 }, { name: "Fog", dots: 0 }]);
    expect(sanitizeV5Sheet({ disciplines: Array.from({ length: 20 }, (_, i) => ({ name: `D${i}`, dots: 1 })) }).disciplines).toHaveLength(12);
  });

  it("cuts free text to size", () => {
    const sheet = sanitizeV5Sheet({ clan: "x".repeat(99), predator: 5, convictions: "y".repeat(900), touchstones: "Ana, my sister" });
    expect(sheet.clan).toHaveLength(40);
    expect(sheet.predator).toBe("");
    expect(sheet.convictions).toHaveLength(600);
    expect(sheet.touchstones).toBe("Ana, my sister");
  });

  it("rides on the table's character, cleaned by the hub's sanitizer", () => {
    const clean = sanitizeShared("character", { name: "Mara", portraitUrl: null, v5: { hunger: 8, clan: "Night", attributes: [6] } }, "Mara", 1) as TableCharacter;
    expect(clean.v5).toMatchObject({ hunger: 5, clan: "Night" });
    expect(clean.v5?.attributes[0]).toBe(5);
    expect(sanitizeShared("character", { name: "Bo", portraitUrl: null }, "Bo", 1)).toEqual({ name: "Bo", portraitUrl: null });
    expect((sanitizeShared("character", { name: "Bo", v5: "lots" }, "Bo", 1) as TableCharacter).v5).toBeUndefined();
  });
});

describe("Health and Willpower boxes", () => {
  it("turns a box empty → superficial → aggravated → empty", () => {
    let track = { superficial: 0, aggravated: 0 };
    // Any empty box marks one more; the track is drawn packed, aggravated first.
    track = cycleBox(track, 4, 2);
    expect(track).toEqual({ superficial: 1, aggravated: 0 });
    expect(trackBoxes(track, 4)).toEqual(["sup", "", "", ""]);
    track = cycleBox(track, 4, 1);
    expect(trackBoxes(track, 4)).toEqual(["sup", "sup", "", ""]);
    track = cycleBox(track, 4, 0);
    expect(track).toEqual({ superficial: 1, aggravated: 1 });
    expect(trackBoxes(track, 4)).toEqual(["agg", "sup", "", ""]);
    track = cycleBox(track, 4, 0);
    expect(track).toEqual({ superficial: 1, aggravated: 0 });
  });
});

describe("pools from the sheet", () => {
  const sheet = sanitizeV5Sheet({ attributes: [3, 2, 2, 1, 1, 2, 1, 2, 3], skills: [0, 2], hunger: 2, disciplines: [{ name: "Swift", dots: 2 }] });
  const traits = v5Traits(sheet);
  const pick = (...names: string[]) => names.map((name) => traits.find((t) => t.name === name)!);

  it("builds `/v <sum> h<Hunger>` named after the traits, which the roller reads back", () => {
    const command = v5PoolCommand(pick("Strength", "Brawl"), sheet.hunger);
    expect(command).toBe("/v 5 h2 Strength + Brawl");
    expect(parseV5(command.replace(/^\/v /, ""))).toEqual({ pool: 5, hunger: 2, difficulty: undefined, label: "Strength + Brawl" });
    expect(v5PoolCommand(pick("Dexterity", "Animal Ken"), 0, { difficulty: 3 })).toBe("/v 2 h0 d3 Dexterity + Animal Ken");
    expect(v5PoolCommand(pick("Strength", "Swift"), 1)).toBe("/v 5 h1 Strength + Swift");
    // Never under one die.
    expect(v5PoolCommand(pick("Athletics"), 1, { modifier: -2 })).toBe("/v 1 h1 Athletics");
  });

  it("takes two dice off when Impaired, by the track that matches the traits", () => {
    const hurt = sanitizeV5Sheet({ ...sheet, health: { superficial: 0, aggravated: 9 } });
    const strength = v5Traits(hurt).filter((t) => t.name === "Strength" || t.name === "Insight");
    expect(impairedPenalty(hurt, strength)).toBe(2);
    expect(impairedPenalty(hurt, v5Traits(hurt).filter((t) => t.name === "Wits"))).toBe(0);
    const shaken = sanitizeV5Sheet({ ...sheet, willpower: { superficial: 9, aggravated: 0 } });
    expect(impairedPenalty(shaken, v5Traits(shaken).filter((t) => t.name === "Wits"))).toBe(2);
    expect(impairedPenalty(sheet, strength)).toBe(0);
  });

  it("rouses at the sheet's Hunger, and sees when a Rouse check raised it", () => {
    expect(rouseCommand(3)).toBe("/rouse h3");
    expect(rouseCommand(1, "Swift")).toBe("/rouse h1 Swift");
    expect(rouseRaisesHunger({ expression: "Rouse check", summary: "ROUSE 4 · HUNGER +1" })).toBe(true);
    expect(rouseRaisesHunger({ expression: "Rouse check (best of 2)", summary: "ROUSE 7 · NO HUNGER" })).toBe(false);
    expect(rouseRaisesHunger({ expression: "Rouse check", summary: "ROUSE 2 · THE BEAST STIRS" })).toBe(false);
    expect(rouseRaisesHunger({ expression: "5 dice", summary: "1 SUCCESS · HUNGER +1" })).toBe(false);
  });

  it("matches what the roll route says about a real Rouse check", async () => {
    for (let i = 0; i < 6; i++) {
      const data = (await (await roll("/rouse h2")).json()) as { roll: DiceRollEvent; payload: { success: boolean } };
      expect(rouseRaisesHunger(data.roll)).toBe(!data.payload.success);
    }
  });
});

describe("screen pages at a Vampire table", () => {
  it("swaps the D&D reference pages for the Vampire ones, and back", () => {
    expect(pageForSystem("rules", "vtm5")).toBe("difficulty");
    expect(pageForSystem("conditions", "vtm5")).toBe("hunger");
    expect(pageForSystem("difficulty", "dnd5e")).toBe("rules");
    expect(pageForSystem("notes", "vtm5")).toBe("notes");
    const gm = pagesFor("gm", "vtm5").map((page) => page.id);
    expect(gm).toEqual(expect.arrayContaining(["hunger", "difficulty", "initiative"]));
    expect(gm).not.toContain("rules");
    expect(gm).not.toContain("character");
    expect(pagesFor("gm").map((page) => page.id)).not.toContain("hunger");
    expect(resizeChoice("gm", ["initiative", "hunger", "notes"], 5, "vtm5")).toEqual(["initiative", "hunger", "notes", "rolls", "party"]);
  });

  const data = { initiative: null, party: [], notes: "", rolls: { title: "", lines: [], empty: "" }, system: "vtm5" as const };

  it("shows every Vampire's Hunger, hungriest first", () => {
    const page = buildScreenPage("hunger", {
      ...data,
      hunger: [
        { character: "Mara", player: "Kiwi", hunger: 2 },
        { character: "Teo", player: "Bo", hunger: 4 },
      ],
    });
    expect(page?.lines).toEqual(["Teo: ●●●●○ 4 · close to the Beast", "Mara: ●●○○○ 2"]);
    expect(buildScreenPage("hunger", data)?.lines[0]).toMatch(/No Vampire sheets/);
  });

  it("has a difficulty ladder", () => {
    const page = buildScreenPage("difficulty", data);
    expect(page?.title).toBe("Difficulty");
    expect(page?.lines.slice(0, 5)).toEqual(["1: routine", "2: straightforward", "3: moderate", "4: challenging", "5: hard"]);
  });

  it("writes my Vampire out on My character", () => {
    const v5 = sanitizeV5Sheet({ clan: "Night", predator: "Alleycat", hunger: 3, skills: [0, 3], disciplines: [{ name: "Swift", dots: 2 }], health: { superficial: 1, aggravated: 1 } });
    const page = buildScreenPage("character", { ...data, character: { name: "Mara", portraitUrl: null, sheet: { level: "", hp: "", ac: "", speed: "", abilities: [] }, v5 } });
    expect(page?.title).toBe("Mara");
    expect(page?.lines).toEqual(v5ScreenLines(v5));
    expect(page?.lines).toEqual(expect.arrayContaining(["Night · Alleycat", "Hunger: ●●●○○", "Health: X/□□", "Physical skills: Brawl 3", "Disciplines: Swift 2"]));
    expect(buildScreenPage("character", { ...data, character: null })?.lines[0]).toMatch(/Vampire/);
    // A D&D table still shows the D&D sheet.
    expect(buildScreenPage("character", { ...data, system: "dnd5e", character: null })?.lines[0]).toMatch(/class and level/);
  });
});

describe("the game system switch", () => {
  it("makes every roll at a Vampire table answer as the Storyteller", async () => {
    state.row = { game_system: "vtm5" };
    await roll("/roll 1d20+2 Perception");
    expect(authorOf()).toBe("Storyteller");
    const secret = (await (await roll("/gmroll 1d6")).json()) as { text: string };
    expect(secret.text).toMatch(/Storyteller's screen/);
  });

  it("leaves D&D rolls to the D&D Bot, and V5 dice to the Storyteller", async () => {
    await roll("/roll 1d20");
    expect(authorOf()).toBe("D&D Bot");
    state.runs = [];
    await roll("/v 3 h1");
    expect(authorOf()).toBe("Storyteller");
  });

  it("tells a browser that posts the card itself who answers", async () => {
    state.row = { game_system: "vtm5" };
    const data = (await (await roll("/roll 1d20", "")).json()) as { bot: { author: string } };
    expect(data.bot.author).toBe("Storyteller");
  });

  it("is stored per server and read back", async () => {
    state.row = { game_system: "vtm5", edition: "2014", homebrew_json: "[]", combat_music: null, explore_music: null };
    const read = (await (await SETTINGS.GET(new Request("http://x/api/integrations/dnd/settings?serverId=s1"))).json()) as { system: string };
    expect(read.system).toBe("vtm5");
    const only = await (await SETTINGS.GET(new Request("http://x/api/integrations/dnd/settings?serverId=s1&only=system"))).json();
    expect(only).toEqual({ system: "vtm5" });

    state.row = null;
    const saved = (await (
      await SETTINGS.POST(new Request("http://x/api/integrations/dnd/settings", { method: "POST", body: JSON.stringify({ serverId: "s1", system: "vtm5" }) }))
    ).json()) as { system: string };
    expect(saved.system).toBe("vtm5");
    const upsert = state.runs.find((run) => run.sql.includes("INSERT INTO server_dnd_settings"))!;
    expect(upsert.values[0]).toBe("s1");
    expect(upsert.values).toContain("vtm5");

    state.runs = [];
    await SETTINGS.POST(new Request("http://x/api/integrations/dnd/settings", { method: "POST", body: JSON.stringify({ serverId: "s1", system: "pathfinder" }) }));
    expect(state.runs.find((run) => run.sql.includes("INSERT INTO server_dnd_settings"))?.values).toContain("dnd5e");
  });
});
