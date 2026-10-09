import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, Permission, roleRefusal, type RoleAuthority } from "./permissions";

const moderator: RoleAuthority = {
  unlimited: false,
  canManage: true,
  mask: Permission.MANAGE_ROLES | Permission.KICK_MEMBERS | Permission.SEND_MESSAGES,
  top: 5,
};

describe("roleRefusal", () => {
  it("lets the owner do anything", () => {
    const owner = { unlimited: true, canManage: true, mask: ALL_PERMISSIONS, top: -1 };
    expect(roleRefusal(owner, { position: 99, permissions: Permission.ADMINISTRATOR })).toBeNull();
  });

  it("refuses roles at or above your own highest role", () => {
    expect(roleRefusal(moderator, { position: 5 })).toMatch(/below your highest/);
    expect(roleRefusal(moderator, { position: 9 })).toMatch(/below your highest/);
    expect(roleRefusal(moderator, { position: 4 })).toBeNull();
  });

  it("refuses granting permissions you do not hold, and Administrator", () => {
    expect(roleRefusal(moderator, { position: 1, permissions: Permission.BAN_MEMBERS })).toMatch(
      /you have yourself/,
    );
    expect(roleRefusal(moderator, { position: 1, permissions: Permission.KICK_MEMBERS })).toBeNull();
    const admin = { ...moderator, mask: ALL_PERMISSIONS };
    expect(roleRefusal(admin, { position: 1, permissions: Permission.ADMINISTRATOR })).toMatch(
      /owner can grant Administrator/,
    );
  });

  it("refuses people without Manage Roles", () => {
    expect(roleRefusal({ ...moderator, canManage: false }, { position: 0 })).toMatch(/permission/);
  });
});
