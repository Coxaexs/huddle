import { beforeEach, describe, expect, it } from "vitest";
import { memberPicks, pickableRoles, sanitizePicks, savePicks, setMemberPicks } from "@/lib/role-picker";
import type { PublicRole } from "@/lib/servers";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";

describe("role picker: cleaning the admin's list", () => {
  it("drops duplicates and blanks, trims the emoji and the note", () => {
    const picks = sanitizePicks([
      { roleId: "a", emoji: " 🔔 ", note: "  Get   pinged  " },
      { roleId: "a", emoji: "x" },
      { roleId: "", emoji: "x" },
      { roleId: "b", emoji: "🎮🎮🎮🎮🎮🎮🎮🎮🎮🎮", note: "x".repeat(500) },
      "nope",
    ]);
    expect(picks.map((p) => p.roleId)).toEqual(["a", "b"]);
    expect(picks[0]).toEqual({ roleId: "a", emoji: "🔔", note: "Get pinged" });
    expect(Array.from(picks[1].emoji)).toHaveLength(8);
    expect(picks[1].note).toHaveLength(200);
  });

  it("offers only roles with a pick and no permissions, in the admin's order", () => {
    const role = (id: string, permissions: number, order: number | null): PublicRole => ({
      id,
      name: id,
      color: "#fff",
      permissions,
      position: 0,
      pick: order === null ? null : { order, emoji: "", note: "" },
    });
    const offered = pickableRoles([role("late", 0, 2), role("none", 0, null), role("power", 8, 0), role("first", 0, 1)]);
    expect(offered.map((r) => r.id)).toEqual(["first", "late"]);
  });
});

describe.skipIf(!sqliteAvailable)("role picker: database", () => {
  let db: D1Database;
  beforeEach(async () => {
    db = sqliteD1();
    await db.batch([
      db.prepare(`CREATE TABLE roles (
        id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT, permissions INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0, created_at TEXT, icon TEXT, pick_order INTEGER, pick_emoji TEXT, pick_note TEXT)`),
      db.prepare("CREATE TABLE member_roles (server_id TEXT, user_id TEXT, role_id TEXT, PRIMARY KEY (server_id, user_id, role_id))"),
      db.prepare(`INSERT INTO roles (id, server_id, name, permissions, position) VALUES
        ('notify', 's1', 'Notifications', 0, 0),
        ('mc', 's1', 'Minecraft', 0, 1),
        ('mod', 's1', 'Mod', 8, 5),
        ('top', 's1', 'Top', 0, 9),
        ('other', 's2', 'Elsewhere', 0, 0)`),
    ]);
  });

  const all = () => true;

  it("saves the offer, and refuses a role that gives permissions or belongs elsewhere", async () => {
    expect(await savePicks(db, "s1", [{ roleId: "mod", emoji: "", note: "" }], all)).toMatch(/gives permissions/);
    expect(await savePicks(db, "s1", [{ roleId: "other", emoji: "", note: "" }], all)).toMatch(/gone/);
    expect(
      await savePicks(db, "s1", [
        { roleId: "mc", emoji: "⛏️", note: "Block game" },
        { roleId: "notify", emoji: "🔔", note: "" },
      ], all),
    ).toBeNull();
    const rows = await db.prepare("SELECT id, pick_order, pick_emoji, pick_note FROM roles WHERE pick_order IS NOT NULL ORDER BY pick_order").all();
    expect(rows.results).toEqual([
      { id: "mc", pick_order: 0, pick_emoji: "⛏️", pick_note: "Block game" },
      { id: "notify", pick_order: 1, pick_emoji: "🔔", pick_note: "" },
    ]);
    // Taking one off the list clears it.
    await savePicks(db, "s1", [{ roleId: "notify", emoji: "🔔", note: "" }], all);
    const left = await db.prepare("SELECT id FROM roles WHERE pick_order IS NOT NULL").all();
    expect(left.results).toEqual([{ id: "notify" }]);
  });

  it("leaves roles above the admin alone", async () => {
    await db.prepare("UPDATE roles SET pick_order = 0 WHERE id = 'top'").run();
    const below = (role: { position: number }) => role.position < 5;
    expect(await savePicks(db, "s1", [{ roleId: "top", emoji: "", note: "" }], below)).toMatch(/above your highest/);
    expect(await savePicks(db, "s1", [], below)).toBeNull();
    const top = await db.prepare("SELECT pick_order FROM roles WHERE id = 'top'").first();
    expect(top).toEqual({ pick_order: 0 });
  });

  it("a member gets exactly the offered roles they picked, and nothing else changes", async () => {
    await savePicks(db, "s1", [{ roleId: "notify", emoji: "", note: "" }, { roleId: "mc", emoji: "", note: "" }], all);
    await db.prepare("INSERT INTO member_roles VALUES ('s1', 'u1', 'mod'), ('s1', 'u1', 'top')").run();

    const first = await setMemberPicks(db, "s1", "u1", ["notify", "mc", "mod", "other", "nope"]);
    expect(first).toEqual({ roleIds: expect.arrayContaining(["notify", "mc"]), changed: true });
    expect(first.roleIds).toHaveLength(2);

    const second = await setMemberPicks(db, "s1", "u1", ["mc"]);
    expect(second).toEqual({ roleIds: ["mc"], changed: true });
    expect(await setMemberPicks(db, "s1", "u1", ["mc"])).toEqual({ roleIds: ["mc"], changed: false });

    // The given roles (Mod, Top) were never touched.
    const held = await db.prepare("SELECT role_id FROM member_roles WHERE user_id = 'u1' ORDER BY role_id").all();
    expect(held.results).toEqual([{ role_id: "mc" }, { role_id: "mod" }, { role_id: "top" }]);
    expect(await memberPicks(db, "s1", "u1")).toEqual(["mc"]);

    // A role that gains permissions stops being pickable and is not dropped by the picker either.
    await db.prepare("UPDATE roles SET permissions = 8 WHERE id = 'mc'").run();
    expect(await setMemberPicks(db, "s1", "u1", ["mc"])).toEqual({ roleIds: [], changed: false });
    expect(await memberPicks(db, "s1", "u1")).toEqual([]);
  });
});
