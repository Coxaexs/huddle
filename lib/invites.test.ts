import { describe, expect, it } from "vitest";
import { extractInviteCodes } from "../app/chat-shell";
import { addServerMember } from "./servers";

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
