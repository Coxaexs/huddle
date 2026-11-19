import { describe, expect, it } from "vitest";
import { reorderRefusal } from "./role-order";

const roles = [
  { id: "admin", position: 3 },
  { id: "mod", position: 2 },
  { id: "dj", position: 1 },
  { id: "guest", position: 0 },
];

describe("reorderRefusal", () => {
  it("lets the owner put roles in any order", () => {
    expect(reorderRefusal(roles, ["guest", "dj", "mod", "admin"], { unlimited: true, canManage: true, top: -1 })).toBeNull();
  });
  it("refuses a list that is missing or repeats a role", () => {
    const owner = { unlimited: true, canManage: true, top: -1 };
    expect(reorderRefusal(roles, ["admin", "mod", "dj"], owner)).toMatch(/changed/);
    expect(reorderRefusal(roles, ["admin", "mod", "dj", "dj"], owner)).toMatch(/changed/);
    expect(reorderRefusal(roles, ["admin", "mod", "dj", "other"], owner)).toMatch(/changed/);
  });
  it("lets a moderator rearrange only the roles under their own", () => {
    const mod = { unlimited: false, canManage: true, top: 2 };
    expect(reorderRefusal(roles, ["admin", "mod", "guest", "dj"], mod)).toBeNull();
    expect(reorderRefusal(roles, ["admin", "guest", "mod", "dj"], mod)).toMatch(/below your highest/);
    expect(reorderRefusal(roles, ["mod", "admin", "dj", "guest"], mod)).toMatch(/below your highest/);
  });
  it("refuses someone who cannot manage roles", () => {
    expect(reorderRefusal(roles, ["admin", "mod", "dj", "guest"], { unlimited: false, canManage: false, top: 0 })).toMatch(/permission/);
  });
});
