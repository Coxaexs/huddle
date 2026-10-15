import { describe, expect, it } from "vitest";
import { AREAS_MAX, PAWNS_EACH, PAWN_REACH, addInitiative, applyArea, applyPawn, sanitizeAreaOp, cinemaSeatLabel, currentEntry, removeInitiative, safeMediaUrl, sanitizePawnOp, sanitizeShared, stepTurn, watchPosition, type Initiative, type AreaOp, type PawnOp, type TableArea, type TableCharacter, type TablePawn, type WatchState } from "./lounge-shared";

describe("safeMediaUrl", () => {
  it("allows https links and this server's own uploads, and nothing else", () => {
    expect(safeMediaUrl("https://cdn.example.com/film.mp4")).toBe("https://cdn.example.com/film.mp4");
    expect(safeMediaUrl("/hangout/api/uploads/abc123.mp4")).toBe("/hangout/api/uploads/abc123.mp4");
    expect(safeMediaUrl("/hangout/api/youtube/stream/dQw4w9WgXcQ.mp4")).toBe("/hangout/api/youtube/stream/dQw4w9WgXcQ.mp4");
    expect(safeMediaUrl("/hangout/api/youtube/stream/../x.mp4")).toBeNull();
    expect(safeMediaUrl("http://example.com/film.mp4")).toBeNull();
    expect(safeMediaUrl("javascript:alert(1)")).toBeNull();
    expect(safeMediaUrl("https://localhost/x")).toBeNull();
    expect(safeMediaUrl("/hangout/api/uploads/../secret")).toBeNull();
    expect(safeMediaUrl("https://example.com/" + "a".repeat(700))).toBeNull();
  });
});

describe("sanitizeShared", () => {
  it("stamps a watch state with the hub's own clock and name", () => {
    const watch = sanitizeShared("watch", { url: "https://cdn.example.com/a.mp4", position: 12, paused: false, at: 5, by: "Evil" }, "Aria", 1000) as WatchState;
    expect(watch).toMatchObject({ position: 12, at: 1000, by: "Aria", paused: false });
    expect(sanitizeShared("watch", { url: "ftp://nope" }, "Aria", 1)).toBeNull();
  });

  it("keeps an initiative order small and sane", () => {
    const init = sanitizeShared("initiative", {
      entries: [{ id: "a", name: "Goblin", value: 12 }, { id: "b", name: "  ", value: 3 }, { name: "Aria", value: 9999, connectionId: "c1" }],
      turn: 99, round: 0,
    }, "GM", 1) as { entries: Array<{ name: string; value: number }>; turn: number; round: number };
    expect(init.entries.map((e) => e.name)).toEqual(["Goblin", "Aria"]);
    expect(init.entries[1].value).toBe(999);
    expect(init.turn).toBe(1);
    expect(init.round).toBe(1);
    expect(sanitizeShared("initiative", { entries: [] }, "GM", 1)).toBeNull();
  });

  it("clips a table card and drops empty facts", () => {
    const card = sanitizeShared("card", { title: "Fireball", subtitle: "3rd-level evocation", facts: [{ label: "Range", value: "150 ft" }, { label: "", value: "x" }], body: "b".repeat(2000) }, "Aria", 7) as { facts: unknown[]; body: string; at: number };
    expect(card.facts).toHaveLength(1);
    expect(card.body).toHaveLength(900);
    expect(card.at).toBe(7);
  });

  it("never lets a hidden roll carry faces", () => {
    const roll = sanitizeShared("hiddenroll", { dice: [{ sides: 20, count: 1, values: [20] }], values: [20] }, "GM", 1) as Record<string, unknown>;
    expect(JSON.stringify(roll)).not.toContain("values");
    expect(roll.dice).toEqual([{ sides: 20, count: 1 }]);
  });

  it("keeps the game master's screen between three and five panels", () => {
    expect(sanitizeShared("gm", { connectionId: "c1", name: "Ann", panels: 9, folded: "yes" }, "x", 1)).toEqual({ connectionId: "c1", name: "Ann", panels: 5, folded: false });
    expect(sanitizeShared("gm", { connectionId: "c1", name: "Ann", folded: true }, "x", 1)).toEqual({ connectionId: "c1", name: "Ann", panels: 3, folded: true });
  });

  it("refuses non-objects", () => {
    expect(sanitizeShared("gm", "me", "x", 1)).toBeNull();
    expect(sanitizeShared("card", null, "x", 1)).toBeNull();
  });
});

describe("shared video position", () => {
  const playing: WatchState = { url: "https://a.b/c.mp4", title: "", position: 10, at: 1000, paused: false, by: "x" };
  it("moves on with the hub clock while playing, and holds when paused", () => {
    expect(watchPosition(playing, 4000)).toBeCloseTo(13);
    expect(watchPosition({ ...playing, paused: true }, 9000)).toBe(10);
    expect(watchPosition(playing, 500)).toBe(10);
  });
});

describe("cinemaSeatLabel", () => {
  it("counts rows and seats from one", () => {
    expect(cinemaSeatLabel("cin-3-6")).toBe("Row 4, seat 7");
    expect(cinemaSeatLabel("couch-l")).toBeNull();
    expect(cinemaSeatLabel(null)).toBeNull();
  });
});

describe("initiative order", () => {
  const e = (id: string, value: number, connectionId?: string) => ({ id, name: id, value, ...(connectionId ? { connectionId } : {}) });
  const build = (...entries: Array<ReturnType<typeof e>>) => entries.reduce<Initiative | null>((init, entry) => addInitiative(init, entry), null)!;

  it("sorts highest first and lets a tie keep its place", () => {
    const init = build(e("goblin", 12), e("aria", 18), e("bob", 12), e("zed", 3));
    expect(init.entries.map((x) => x.id)).toEqual(["aria", "goblin", "bob", "zed"]);
  });

  it("keeps the turn on the same creature when someone joins ahead of them", () => {
    let init = build(e("aria", 18), e("goblin", 12));
    init = stepTurn(init); // goblin's turn
    init = addInitiative(init, e("rogue", 20));
    expect(currentEntry(init)?.id).toBe("goblin");
  });

  it("replaces a seat's own entry instead of listing them twice", () => {
    const init = addInitiative(build(e("a1", 10, "c1"), e("g", 5)), { id: "a2", name: "Aria", value: 17, connectionId: "c1" });
    expect(init.entries.filter((x) => x.connectionId === "c1")).toHaveLength(1);
    expect(init.entries[0].value).toBe(17);
  });

  it("starts a new round going past the last, and back down again", () => {
    let init = build(e("a", 9), e("b", 5));
    init = stepTurn(init); expect(init).toMatchObject({ turn: 1, round: 1 });
    init = stepTurn(init); expect(init).toMatchObject({ turn: 0, round: 2 });
    init = stepTurn(init, -1); expect(init).toMatchObject({ turn: 1, round: 1 });
    init = stepTurn(stepTurn(init, -1), -1); expect(init.round).toBe(1);
  });

  it("removes an entry without moving anyone else's turn", () => {
    let init = build(e("a", 9), e("b", 7), e("c", 5));
    init = stepTurn(stepTurn(init)); // c's turn
    init = removeInitiative(init, "a")!;
    expect(currentEntry(init)?.id).toBe("c");
    expect(removeInitiative(build(e("solo", 1)), "solo")).toBeNull();
  });
});

describe("house lights", () => {
  it("keeps a level between 0 and 1 and defaults to automatic", () => {
    expect(sanitizeShared("house", { level: 7, auto: false }, "Mod", 5)).toEqual({ level: 1, auto: false, at: 5, by: "Mod" });
    expect(sanitizeShared("house", { level: -2 }, "Mod", 5)).toEqual({ level: 0, auto: true, at: 5, by: "Mod" });
    expect(sanitizeShared("house", null, "Mod", 5)).toBeNull();
  });
});

describe("pawns", () => {
  const put = (id: string, x = 0, z = 0): Extract<PawnOp, { op: "put" }> => ({ op: "put", id, kind: "fighter", colour: "#3b4fa8", x, z, facing: 0, label: "" });
  const sam = { userId: "u-sam", name: "Sam", isGm: false };
  const kit = { userId: "u-kit", name: "Kit", isGm: false };
  const gm = { userId: "u-gm", name: "Dee", isGm: true };

  it("cleans a request, keeping the pawn on the map", () => {
    const op = sanitizePawnOp({ op: "put", id: "pawn1234", kind: "dragon", colour: "#ABCDEF", x: 9, z: 0, facing: 7, label: "  Big red " + "x".repeat(40) });
    expect(op).toMatchObject({ op: "put", kind: "dragon", colour: "#abcdef", x: PAWN_REACH, z: 0, facing: Math.round(Math.PI * 1000) / 1000 });
    expect((op as { label: string }).label).toHaveLength(24);
    expect(sanitizePawnOp({ op: "put", id: "pawn1234", kind: "unicorn", x: 0, z: 0 })).toBeNull();
    expect(sanitizePawnOp({ op: "put", id: "../../x", kind: "rogue", x: 0, z: 0 })).toBeNull();
    expect(sanitizePawnOp({ op: "put", id: "pawn1234", kind: "rogue", x: Number.NaN, z: 0 })).toBeNull();
    expect(sanitizePawnOp({ op: "put", id: "pawn1234", kind: "rogue", colour: "red", x: 0, z: 0 })).toMatchObject({ colour: "#c9a45c" });
    expect(sanitizePawnOp({ op: "clear", id: "whatever" })).toEqual({ op: "clear" });
    expect(sanitizeShared("pawn", { op: "remove", id: "pawn1234" }, "Sam", 1)).toEqual({ op: "remove", id: "pawn1234" });
  });

  it("lets the owner move their pawn and nobody else but the game master", () => {
    let table: Record<string, TablePawn> = applyPawn({}, put("samspawn"), sam, 1)!;
    expect(table.samspawn).toMatchObject({ owner: "u-sam", ownerName: "Sam", at: 1 });
    expect(applyPawn(table, put("samspawn", 0.5, 0.5), kit, 2)).toBeNull();
    expect(applyPawn(table, { op: "remove", id: "samspawn" }, kit, 2)).toBeNull();
    table = applyPawn(table, { ...put("samspawn", 0.5, 0.5), colour: "#000000", label: "Mine now" }, gm, 3)!;
    // The game master moves it; it stays Sam's, painted as Sam painted it.
    expect(table.samspawn).toMatchObject({ x: 0.5, z: 0.5, owner: "u-sam", colour: "#3b4fa8", label: "", at: 3 });
    table = applyPawn(table, { ...put("samspawn", -0.2, 0), label: "Aria" }, sam, 4)!;
    expect(table.samspawn).toMatchObject({ x: -0.2, label: "Aria" });
    expect(applyPawn(table, { op: "remove", id: "samspawn" }, sam, 5)).toEqual({});
  });

  it("holds each player to a few pawns, and the game master to more", () => {
    let table: Record<string, TablePawn> = {};
    for (let i = 0; i < PAWNS_EACH; i++) table = applyPawn(table, put(`sam-${i}`), sam, i)!;
    expect(applyPawn(table, put("sam-extra"), sam, 9)).toBeNull();
    for (let i = 0; i < 10; i++) table = applyPawn(table, put(`gob-${i}`), gm, i)!;
    expect(Object.keys(table)).toHaveLength(PAWNS_EACH + 10);
  });

  it("clears the table for the game master, and only your own for anyone else", () => {
    let table = applyPawn({}, put("sam-1"), sam, 1)!;
    table = applyPawn(table, put("kit-1"), kit, 1)!;
    expect(Object.keys(applyPawn(table, { op: "clear" }, kit, 2)!)).toEqual(["sam-1"]);
    expect(applyPawn(table, { op: "clear" }, gm, 2)).toEqual({});
    expect(applyPawn({}, { op: "clear" }, sam, 2)).toBeNull();
  });
});

describe("character sheet", () => {
  it("keeps the numbers in bounds and drops what is not a class", () => {
    const sheet = sanitizeShared("character", {
      name: "Aria", cls: "Wizard", level: 25, maxHp: 31, hp: 99, ac: 15, speed: 30,
      slots: [4, 3, 2], used: [5, 1], spells: ["Fireball", "Fireball", " Shield ", 7, ""], abilities: [8, 14, 12, 18, 10, 99],
    }, "Aria", 1) as TableCharacter;
    expect(sheet).toMatchObject({ cls: "Wizard", level: 20, maxHp: 31, hp: 31, ac: 15, speed: 30 });
    expect(sheet.slots).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(sheet.used).toEqual([4, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(sheet.spells).toEqual(["Fireball", "Shield"]);
    expect(sheet.abilities).toEqual([8, 14, 12, 18, 10, 30]);
    expect((sanitizeShared("character", { name: "Bo", cls: "Wizzard" }, "Bo", 1) as TableCharacter).cls).toBeUndefined();
    // An old tab sends only the name and portrait.
    expect(sanitizeShared("character", { name: "Bo", portraitUrl: null }, "Bo", 1)).toEqual({ name: "Bo", portraitUrl: null });
  });
});

describe("pawn hit points", () => {
  const put = (id: string): PawnOp => ({ op: "put", id, kind: "beast", colour: "#3b4fa8", x: 0, z: 0, facing: 0, label: "Ogre" });
  it("makes a player's first pawn their hero, never the game master's", () => {
    const sam = { userId: "u-sam", name: "Sam", isGm: false };
    const gm = { userId: "u-gm", name: "Dee", isGm: true };
    let table = applyPawn({}, put("sam-1"), sam, 1)!;
    table = applyPawn(table, put("sam-2"), sam, 2)!;
    table = applyPawn(table, put("ogre-1"), gm, 3)!;
    expect([table["sam-1"].hero, table["sam-2"].hero, table["ogre-1"].hero]).toEqual([true, undefined, undefined]);
    table = applyPawn(table, { op: "hp", id: "ogre-1", hp: 70, maxHp: 59 }, gm, 4)!;
    expect(table["ogre-1"]).toMatchObject({ hp: 70, maxHp: 59 });
    expect(applyPawn(table, { op: "hp", id: "ogre-1", hp: 1, maxHp: 59 }, sam, 5)).toBeNull();
    expect(sanitizePawnOp({ op: "hp", id: "ogre-1", hp: 70, maxHp: 59 })).toEqual({ op: "hp", id: "ogre-1", hp: 59, maxHp: 59 });
  });
});

describe("spell areas", () => {
  const cast = (id: string): AreaOp => sanitizeAreaOp({ op: "put", id, spell: "Fireball", shape: "sphere", size: 20, x: 0.3, z: -0.2, ox: 0, oz: 1, colour: "#FF7A1A", note: "DEX save · 8d6 fire" })!;
  const aria = { userId: "u-aria", name: "Aria", isGm: false };
  const kit = { userId: "u-kit", name: "Kit", isGm: false };
  const gm = { userId: "u-gm", name: "Dee", isGm: true };

  it("cleans what a client sends", () => {
    expect(cast("area1")).toMatchObject({ op: "put", shape: "sphere", size: 20, colour: "#ff7a1a", fromSelf: false });
    expect(sanitizeAreaOp({ op: "put", id: "area1", spell: "X", shape: "donut", size: 20, x: 0, z: 0, ox: 0, oz: 0 })).toBeNull();
    expect(sanitizeAreaOp({ op: "put", id: "area1", spell: "", shape: "cone", size: 20 })).toBeNull();
  });

  it("lets the caster and the game master take an area off, and nobody else", () => {
    const table = applyArea({}, cast("area1"), aria, 1)!;
    expect(table.area1).toMatchObject({ owner: "u-aria", ownerName: "Aria", at: 1 });
    expect(applyArea(table, { op: "remove", id: "area1" }, kit, 2)).toBeNull();
    expect(applyArea(table, cast("area1"), kit, 2)).toBeNull();
    expect(applyArea(table, { op: "remove", id: "area1" }, gm, 2)).toEqual({});
    expect(applyArea(table, { op: "clear" }, aria, 2)).toEqual({});
  });

  it("keeps a few at most, taking the oldest off", () => {
    let table: Record<string, TableArea> = {};
    for (let i = 0; i < AREAS_MAX + 2; i++) table = applyArea(table, cast(`area${i}`), aria, i)!;
    expect(Object.keys(table)).toHaveLength(AREAS_MAX);
    expect(table.area0).toBeUndefined();
    expect(table[`area${AREAS_MAX + 1}`]).toBeDefined();
  });

  it("keeps the map's scale sensible", () => {
    expect(sanitizeShared("grid", { squares: 200 }, "Dee", 1)).toEqual({ squares: 60 });
    expect(sanitizeShared("grid", { squares: "lots" }, "Dee", 1)).toBeNull();
  });
});
