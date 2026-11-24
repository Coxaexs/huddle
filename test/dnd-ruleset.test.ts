import { describe, expect, it, vi } from "vitest";
import {
  cleanHomebrew,
  findHomebrew,
  hasConfiguredGmRole,
  isServerDm,
  MAX_HOMEBREW,
  mergeHomebrew,
  serverDmUserIds,
} from "@/lib/dnd-rules";

vi.mock("cloudflare:workers", () => ({ env: {} }));

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

describe("GM role authority", () => {
  function mockDb() {
    const memberRoles: Array<{ server_id: string; user_id: string; role_id: string }> = [
      { server_id: "s1", user_id: "gm-role-user", role_id: "role-dm" },
      { server_id: "s1", user_id: "mod-user", role_id: "role-mod" },
    ];
    const roles: Array<{ id: string; permissions: number }> = [
      { id: "role-dm", permissions: 0 },
      { id: "role-mod", permissions: 1 << 1 },
    ];
    const prep = (sql: string) => {
      let args: unknown[] = [];
      const q = {
        bind: (...vals: unknown[]) => {
          args = vals;
          return q;
        },
        async first<T>() {
          if (sql.includes("FROM server_dnd_settings s")) {
            const [serverId, userId] = args as [string, string];
            const hit = memberRoles.some(
              (m) => m.server_id === serverId && m.user_id === userId && m.role_id === "role-dm",
            );
            return (hit ? { ok: 1 } : null) as T;
          }
          if (sql.includes("SELECT created_by FROM servers")) {
            return ({ created_by: "owner-user" } as unknown) as T;
          }
          if (sql.includes("SELECT gm_role_id FROM server_dnd_settings")) {
            return ({ gm_role_id: "role-dm" } as unknown) as T;
          }
          if (sql.includes("SELECT is_admin FROM users")) {
            return ({ is_admin: 0 } as unknown) as T;
          }
          return null as T;
        },
        async all<T>() {
          if (sql.includes("SELECT id FROM users WHERE is_admin = 1")) {
            return { results: [{ id: "site-admin" }] } as unknown as T;
          }
          if (sql.includes("FROM member_roles mr") && sql.includes("JOIN roles r")) {
            const [serverId, mask] = args as [string, number];
            const matching = memberRoles
              .filter((m) => {
                const role = roles.find((r) => r.id === m.role_id);
                return m.server_id === serverId && role && (role.permissions & mask) !== 0;
              })
              .map((m) => ({ user_id: m.user_id }));
            return { results: matching } as unknown as T;
          }
          if (sql.includes("SELECT user_id FROM member_roles")) {
            const [serverId, roleId] = args as [string, string];
            const matching = memberRoles
              .filter((m) => m.server_id === serverId && m.role_id === roleId)
              .map((m) => ({ user_id: m.user_id }));
            return { results: matching } as unknown as T;
          }
          return { results: [] } as unknown as T;
        },
      };
      return q;
    };
    return { prepare: prep } as unknown as D1Database;
  }

  it("grants GM status to configured GM role holders via hasConfiguredGmRole and isServerDm", async () => {
    const db = mockDb();
    expect(await hasConfiguredGmRole(db, "gm-role-user", "s1")).toBe(true);
    expect(await hasConfiguredGmRole(db, "player-user", "s1")).toBe(false);
    expect(await isServerDm(db, "gm-role-user", "s1")).toBe(true);
    expect(await isServerDm(db, "player-user", "s1")).toBe(false);
  });

  it("collects admins, owner, permission holders, and configured GM role holders in serverDmUserIds", async () => {
    const db = mockDb();
    const ids = await serverDmUserIds(db, "s1");
    expect(ids.sort()).toEqual(["gm-role-user", "mod-user", "owner-user", "site-admin"]);
  });
});
