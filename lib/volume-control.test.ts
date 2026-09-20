import { describe, expect, it } from "vitest";
import { hasPermission, Permission } from "./permissions";

function volumeGain(percent: number): number {
  const normalized = Math.max(0, Math.min(1, percent / 100));
  return normalized * normalized;
}

function effectiveMusicVolume(
  generalVolume: number,
  personalVolume: number,
  personalMuted: boolean = false,
): number {
  if (personalMuted) return 0;
  const general = Math.max(0, Math.min(1, generalVolume / 100));
  const personal = volumeGain(personalVolume);
  return Math.max(0, Math.min(1, general * personal));
}

describe("Music volume permissions", () => {
  const isVolumeModerator = (mask: number): boolean => {
    return (
      hasPermission(mask, Permission.ADMINISTRATOR) ||
      hasPermission(mask, Permission.MODERATE) ||
      hasPermission(mask, Permission.MANAGE_SERVER) ||
      hasPermission(mask, Permission.MUTE_MEMBERS)
    );
  };

  it("allows administrators to change general volume", () => {
    expect(isVolumeModerator(Permission.ADMINISTRATOR)).toBe(true);
  });

  it("allows members with MODERATE permission to change general volume", () => {
    expect(isVolumeModerator(Permission.MODERATE)).toBe(true);
  });

  it("allows members with MANAGE_SERVER or MUTE_MEMBERS permission", () => {
    expect(isVolumeModerator(Permission.MANAGE_SERVER)).toBe(true);
    expect(isVolumeModerator(Permission.MUTE_MEMBERS)).toBe(true);
  });

  it("denies regular users with standard voice and chat permissions", () => {
    const regularUser =
      Permission.CONNECT |
      Permission.SPEAK |
      Permission.SEND_MESSAGES |
      Permission.ADD_REACTIONS;
    expect(isVolumeModerator(regularUser)).toBe(false);
  });
});

describe("Personal vs General volume calculation", () => {
  it("computes full volume when both general and personal are at 100%", () => {
    expect(effectiveMusicVolume(100, 100)).toBeCloseTo(1.0);
  });

  it("halving general volume scales the output proportionally", () => {
    expect(effectiveMusicVolume(50, 100)).toBeCloseTo(0.5);
  });

  it("personal mute silences playback regardless of general volume", () => {
    expect(effectiveMusicVolume(100, 100, true)).toBe(0);
    expect(effectiveMusicVolume(50, 80, true)).toBe(0);
  });

  it("clamps personal and general volumes to 0-100% range", () => {
    expect(effectiveMusicVolume(150, 100)).toBeCloseTo(1.0);
    expect(effectiveMusicVolume(-20, 100)).toBe(0);
    expect(effectiveMusicVolume(100, 50)).toBeCloseTo(0.25); // (0.5)^2 audio taper
  });
});
