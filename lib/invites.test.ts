import { describe, expect, it, vi } from "vitest";
import { extractInviteCodes } from "../app/chat-shell";
import { addServerMember } from "./servers";

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

import { canUserCreateInvites, isFirstUserOrOwner } from "./auth";

describe("extractInviteCodes", () => {
  it("extracts code from full deeppixel.online link format", () => {
    const text = 'and also, this is "good" https://deeppixel.online/hangout?UGRKGMAURC';
    const codes = extractInviteCodes(text);
    expect(codes).toEqual(["UGRKGMAURC"]);
  });

  it("extracts code from link without scheme", () => {
    const text = "join my room: deeppixel.online/hangout?HX3F-9K2Q";
    const codes = extractInviteCodes(text);
    expect(codes).toEqual(["HX3F-9K2Q"]);
  });

  it("extracts code with servercode= or code= parameter", () => {
    const text = "check https://deeppixel.online/hangout?servercode=abc12345 or /hangout?code=xyz98765";
    const codes = extractInviteCodes(text);
    expect(codes).toEqual(["ABC12345", "XYZ98765"]);
  });

  it("deduplicates identical invite codes", () => {
    const text = "link 1: https://deeppixel.online/hangout?UGRKGMAURC and link 2: deeppixel.online/hangout?ugrkgmaurc";
    const codes = extractInviteCodes(text);
    expect(codes).toEqual(["UGRKGMAURC"]);
  });

  it("returns empty array when no invite links are present", () => {
    const text = "hello world! checkout https://deeppixel.online/something-else";
    expect(extractInviteCodes(text)).toEqual([]);
  });
});

describe("addServerMember", () => {
  it("binds uppercase invite_code to server_members INSERT statement", async () => {
    const captured: Array<{ query: string; args: any[] }> = [];
    const mockDb = {
      prepare: (query: string) => ({
        bind: (...args: any[]) => ({
          run: async () => {
            captured.push({ query, args });
            return {};
          },
        }),
      }),
    } as unknown as D1Database;

    await addServerMember(mockDb, "srv-1", "user-1", "ugrkgmaurc");

    expect(captured).toHaveLength(1);
    expect(captured[0].query).toContain("INSERT INTO server_members");
    expect(captured[0].query).toContain("invite_code = COALESCE(server_members.invite_code, excluded.invite_code)");
    expect(captured[0].args[0]).toBe("srv-1");
    expect(captured[0].args[1]).toBe("user-1");
    expect(captured[0].args[3]).toBe("UGRKGMAURC");
  });

  it("binds null when inviteCode is not provided or empty", async () => {
    const captured: Array<{ query: string; args: any[] }> = [];
    const mockDb = {
      prepare: (query: string) => ({
        bind: (...args: any[]) => ({
          run: async () => {
            captured.push({ query, args });
            return {};
          },
        }),
      }),
    } as unknown as D1Database;

    await addServerMember(mockDb, "srv-1", "user-1", "   ");

    expect(captured[0].args[3]).toBeNull();
  });
});

describe("canUserCreateInvites and isFirstUserOrOwner", () => {
  const mockDbWithFirstUser = (firstUserId: string) =>
    ({
      prepare: (query: string) => ({
        first: async () => ({ id: firstUserId }),
      }),
    }) as unknown as D1Database;

  it("permits owner (is_admin = 1)", async () => {
    const ownerUser = {
      id: "u-owner",
      username: "owner",
      display_name: "Owner",
      avatar: "O",
      color: "#000",
      is_admin: 1,
      can_invite: 0,
      created_at: "2026-01-01T00:00:00Z",
      last_seen_at: "2026-01-01T00:00:00Z",
    };
    const db = mockDbWithFirstUser("u-owner");
    expect(await canUserCreateInvites(db, ownerUser)).toBe(true);
    expect(await isFirstUserOrOwner(db, ownerUser)).toBe(true);
  });

  it("permits selected users (can_invite = 1) to create invites, but not manage permissions", async () => {
    const selectedUser = {
      id: "u-selected",
      username: "trusted",
      display_name: "Trusted",
      avatar: "T",
      color: "#000",
      is_admin: 0,
      can_invite: 1,
      created_at: "2026-01-02T00:00:00Z",
      last_seen_at: "2026-01-02T00:00:00Z",
    };
    const db = mockDbWithFirstUser("u-owner");
    expect(await canUserCreateInvites(db, selectedUser)).toBe(true);
    expect(await isFirstUserOrOwner(db, selectedUser)).toBe(false);
  });

  it("blocks regular unselected users", async () => {
    const regularUser = {
      id: "u-regular",
      username: "regular",
      display_name: "Regular",
      avatar: "R",
      color: "#000",
      is_admin: 0,
      can_invite: 0,
      created_at: "2026-01-03T00:00:00Z",
      last_seen_at: "2026-01-03T00:00:00Z",
    };
    const db = mockDbWithFirstUser("u-owner");
    expect(await canUserCreateInvites(db, regularUser)).toBe(false);
    expect(await isFirstUserOrOwner(db, regularUser)).toBe(false);
  });

  it("permits first user created in the database even if is_admin is 0", async () => {
    const firstCreatedUser = {
      id: "u-earliest",
      username: "first",
      display_name: "First",
      avatar: "F",
      color: "#000",
      is_admin: 0,
      can_invite: 0,
      created_at: "2025-12-01T00:00:00Z",
      last_seen_at: "2025-12-01T00:00:00Z",
    };
    const db = mockDbWithFirstUser("u-earliest");
    expect(await canUserCreateInvites(db, firstCreatedUser)).toBe(true);
    expect(await isFirstUserOrOwner(db, firstCreatedUser)).toBe(true);
  });
});

