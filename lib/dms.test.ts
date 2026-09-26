import { describe, expect, it } from "vitest";
import { findOrCreateDm, channelAudience, listDms } from "./dms";

describe("Direct Messages & Notes to Self", () => {
  it("finds existing self-DM channel if already created", async () => {
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (userId: string) => ({
          first: async () => {
            if (sql.includes("NOT EXISTS")) {
              return { id: "self-channel-123" };
            }
            return null;
          },
        }),
      }),
    } as unknown as D1Database;

    const channelId = await findOrCreateDm(mockDb, "alice", "alice");
    expect(channelId).toBe("self-channel-123");
  });

  it("creates a new self-DM channel if none exists", async () => {
    let batchCalls: any[] = [];
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          sql,
          args,
          first: async () => null,
        }),
      }),
      batch: async (statements: any[]) => {
        batchCalls = statements;
      },
    } as unknown as D1Database;

    const channelId = await findOrCreateDm(mockDb, "alice", "alice");
    expect(channelId).toBeDefined();
    expect(batchCalls.length).toBe(2);
    // Channel insert
    expect(batchCalls[0].sql).toContain("INSERT INTO channels");
    // Single dm_members insert for self
    expect(batchCalls[1].sql).toContain("INSERT INTO dm_members");
    expect(batchCalls[1].args[1]).toBe("alice");
  });

  it("creates two dm_members rows for regular 1-on-1 DMs", async () => {
    let batchCalls: any[] = [];
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          sql,
          args,
          first: async () => null,
        }),
      }),
      batch: async (statements: any[]) => {
        batchCalls = statements;
      },
    } as unknown as D1Database;

    const channelId = await findOrCreateDm(mockDb, "alice", "bob");
    expect(channelId).toBeDefined();
    expect(batchCalls.length).toBe(3);
    expect(batchCalls[1].args[1]).toBe("alice");
    expect(batchCalls[2].args[1]).toBe("bob");
  });

  it("returns only self in channelAudience for self-DM", async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: [{ user_id: "alice" }],
          }),
        }),
      }),
    } as unknown as D1Database;

    const audience = await channelAudience(mockDb, "self-channel-123");
    expect(audience).toEqual(["alice"]);
  });

  it("lists self-DMs with user's own profile info", async () => {
    const mockDb = {
      prepare: (sql: string) => ({
        bind: () => ({
          all: async () => ({
            results: sql.includes("c.is_group = 1") ? [] : [
              {
                channel_id: "self-channel-123",
                id: "alice",
                username: "alice",
                display_name: "Alice",
                avatar: "A",
                avatar_url: null,
                color: "#ff0000",
                last_message: "My personal note",
                last_at: "2026-09-22T12:00:00Z",
              },
            ],
          }),
        }),
      }),
    } as unknown as D1Database;

    const dms = await listDms(mockDb, "alice");
    expect(dms.length).toBe(1);
    expect(dms[0].channelId).toBe("self-channel-123");
    expect(dms[0].user.id).toBe("alice");
    expect(dms[0].lastMessage).toBe("My personal note");
  });

  it("lists group DMs with their members and a fallback name", async () => {
    const mockDb = {
      prepare: (sql: string) => ({
        bind: () => ({
          all: async () => {
            if (sql.includes("c.is_group = 1")) {
              return {
                results: [
                  {
                    channel_id: "group-1",
                    name: "",
                    owner_id: "alice",
                    created_at: "2026-09-20T00:00:00Z",
                    hidden_at: null,
                    last_message: null,
                    last_at: null,
                  },
                ],
              };
            }
            if (sql.includes("dm.channel_id IN")) {
              return {
                results: ["alice", "bob", "cy"].map((id) => ({
                  channel_id: "group-1",
                  id,
                  username: id,
                  display_name: id[0].toUpperCase() + id.slice(1),
                  avatar: "",
                  avatar_url: null,
                  color: "#000000",
                })),
              };
            }
            return { results: [] };
          },
        }),
      }),
    } as unknown as D1Database;

    const [group] = await listDms(mockDb, "alice");
    expect(group.channelId).toBe("group-1");
    expect(group.user.id).toBe("group-1");
    expect(group.user.displayName).toBe("Bob, Cy");
    expect(group.group?.ownerId).toBe("alice");
    expect(group.group?.members).toHaveLength(3);
    expect(group.lastAt).toBe("2026-09-20T00:00:00Z");
  });
});
