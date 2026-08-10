import { describe, expect, it } from "vitest";
import {
  hasPermission,
  Permission,
  ALL_PERMISSIONS,
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