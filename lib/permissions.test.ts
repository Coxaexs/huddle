import { describe, expect, it } from "vitest";
import {
  hasPermission,
  Permission,
  ALL_PERMISSIONS,
  canAccessServerSettings,
  getMemberTagInfo,
} from "./permissions";

describe("hasPermission", () => {
  it("returns false when no flags are set", () => {
    expect(hasPermission(0, Permission.MANAGE_CHANNELS)).toBe(false);
    expect(hasPermission(0, Permission.MODERATE)).toBe(false);
  });

  it("returns true when the exact flag is set", () => {
    expect(hasPermission(Permission.MANAGE_CHANNELS, Permission.MANAGE_CHANNELS)).toBe(
      true,
    );
    expect(hasPermission(Permission.RECORD_SESSIONS, Permission.RECORD_SESSIONS)).toBe(
      true,
    );
  });

  it("returns true when multiple flags include the requested one", () => {
    const mask =
      Permission.MANAGE_CHANNELS | Permission.MODERATE | Permission.MANAGE_SERVER;
    expect(hasPermission(mask, Permission.MODERATE)).toBe(true);
    expect(hasPermission(mask, Permission.MANAGE_SERVER)).toBe(true);
    expect(hasPermission(mask, Permission.RECORD_SESSIONS)).toBe(false);
  });

  it("returns true for anything when ADMINISTRATOR is set", () => {
    const mask = Permission.ADMINISTRATOR;
    expect(hasPermission(mask, Permission.MANAGE_CHANNELS)).toBe(true);
    expect(hasPermission(mask, Permission.RECORD_SESSIONS)).toBe(true);
    expect(hasPermission(mask, Permission.MANAGE_SERVER)).toBe(true);
  });

  it("treats ALL_PERMISSIONS as granting everything", () => {
    expect(hasPermission(ALL_PERMISSIONS, Permission.RECORD_SESSIONS)).toBe(true);
    expect(hasPermission(ALL_PERMISSIONS, Permission.MANAGE_CHANNELS)).toBe(true);
  });
});

describe("canAccessServerSettings", () => {
  it("allows owner and admin regardless of permission mask", () => {
    expect(canAccessServerSettings(0, { isOwner: true })).toBe(true);
    expect(canAccessServerSettings(0, { isAdmin: true })).toBe(true);
  });

  it("allows members with ADMINISTRATOR", () => {
    expect(canAccessServerSettings(Permission.ADMINISTRATOR)).toBe(true);
  });

  it("allows members with MANAGE_EMOJIS (even if only that flag is present)", () => {
    expect(canAccessServerSettings(Permission.MANAGE_EMOJIS)).toBe(true);
  });

  it("allows members with other management flags", () => {
    expect(canAccessServerSettings(Permission.MANAGE_SERVER)).toBe(true);
    expect(canAccessServerSettings(Permission.MANAGE_ROLES)).toBe(true);
    expect(canAccessServerSettings(Permission.MODERATE)).toBe(true);
    expect(canAccessServerSettings(Permission.BAN_MEMBERS)).toBe(true);
    expect(canAccessServerSettings(Permission.CREATE_INVITES)).toBe(true);
    expect(canAccessServerSettings(Permission.VIEW_AUDIT_LOG)).toBe(true);
  });

  it("denies regular chatters with only chat permissions", () => {
    const regularChatter =
      Permission.SEND_MESSAGES |
      Permission.SEND_MESSAGES_IN_THREADS |
      Permission.READ_MESSAGE_HISTORY |
      Permission.CONNECT |
      Permission.SPEAK;
    expect(canAccessServerSettings(regularChatter)).toBe(false);
    expect(canAccessServerSettings(0)).toBe(false);
  });
});

describe("getMemberTagInfo & computeMemberPermissions", () => {
  const mockServer = {
    id: "srv-1",
    name: "Test Guild",
    ownerId: "user-owner",
    roles: [
      { id: "role-admin", name: "Administrator", color: "#e11d48", permissions: Permission.ADMINISTRATOR, position: 10 },
      { id: "role-mod", name: "Moderator", color: "#3b82f6", permissions: Permission.MODERATE | Permission.BAN_MEMBERS, position: 5 },
      { id: "role-emoji", name: "Emoji Artist", color: "#10b981", permissions: Permission.MANAGE_EMOJIS, position: 2 },
    ],
  };

  it("tags the server owner as Owner", () => {
    const ownerMember = { id: "user-owner", roleIds: {} };
    const tag = getMemberTagInfo(ownerMember, mockServer);
    expect(tag).toEqual({ label: "Owner", type: "owner", icon: "crown" });
  });

  it("tags an admin member as Admin", () => {
    const adminMember = { id: "user-admin", roleIds: { "srv-1": ["role-admin"] } };
    const tag = getMemberTagInfo(adminMember, mockServer);
    expect(tag).toEqual({ label: "Admin", type: "admin", icon: "shield" });
  });

  it("tags a mod member as Mod", () => {
    const modMember = { id: "user-mod", roleIds: { "srv-1": ["role-mod"] } };
    const tag = getMemberTagInfo(modMember, mockServer);
    expect(tag).toEqual({ label: "Mod", type: "mod", icon: "mod" });
  });

  it("tags a custom role with permissions (like Emoji Artist) with custom role info", () => {
    const emojiMember = { id: "user-emoji", roleIds: { "srv-1": ["role-emoji"] } };
    const tag = getMemberTagInfo(emojiMember, mockServer);
    expect(tag).toEqual({
      label: "Emoji Artist",
      type: "role",
      color: "#10b981",
      icon: null,
    });
  });

  it("dynamically changes tag when member role changes", () => {
    const member: { id: string; roleIds: Record<string, string[]> } = {
      id: "user-dynamic",
      roleIds: { "srv-1": [] },
    };

    // Initially regular member with no roles -> null
    expect(getMemberTagInfo(member, mockServer)).toBeNull();

    // Promoted to Mod
    member.roleIds["srv-1"] = ["role-mod"];
    expect(getMemberTagInfo(member, mockServer)?.type).toBe("mod");

    // Promoted to Admin
    member.roleIds["srv-1"] = ["role-mod", "role-admin"];
    expect(getMemberTagInfo(member, mockServer)?.type).toBe("admin");

    // Demoted back
    member.roleIds["srv-1"] = [];
    expect(getMemberTagInfo(member, mockServer)).toBeNull();
  });
});