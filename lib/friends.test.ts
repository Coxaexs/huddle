import { describe, expect, it } from "vitest";
import {
  listFriends,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockUser,
} from "./friends";

describe("friends operations", () => {
  it("lists what accepted friends are doing, and nothing for pending requests", async () => {
    const game = JSON.stringify({ kind: "playing", name: "Valorant", startedAt: Date.now() - 60_000, updatedAt: Date.now() });
    const song = JSON.stringify({ song: "What Love Is", artist: "Zimmer90", isPlaying: true, updatedAt: Date.now() });
    const row = (other: string, status: string, userId: string) => ({
      relationship_id: `r-${other}`, user_id: userId, friend_id: userId === "me" ? other : "me", status,
      created_at: "2026-11-01T00:00:00Z", other_id: other, username: other, display_name: other,
      avatar: "", avatar_url: null, color: "#000", user_status: "online", custom_status: null,
      last_seen_at: null, activity: game, spotify_activity: song,
    });
    const mockDb = {
      prepare: (sql: string) => ({
        bind: () => ({
          all: async () => ({
            results: sql.includes("FROM friendships") ? [row("flo", "accepted", "me"), row("stranger", "pending", "stranger")] : [],
          }),
        }),
      }),
    } as unknown as D1Database;

    const summary = await listFriends(mockDb, "me");
    expect(summary.friends[0]).toMatchObject({
      id: "flo",
      activity: { kind: "playing", name: "Valorant" },
      spotifyActivity: { song: "What Love Is", artist: "Zimmer90" },
    });
    expect(summary.incoming[0].id).toBe("stranger");
    expect(summary.incoming[0].activity).toBeUndefined();
    expect(summary.incoming[0].spotifyActivity).toBeUndefined();
  });

  it("prevents adding self as a friend", async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ id: "user-1", username: "alice" }),
        }),
      }),
    } as unknown as D1Database;

    await expect(
      sendFriendRequest(mockDb, "user-1", "alice"),
    ).rejects.toThrow("You can't add yourself as a friend.");
  });

  it("throws error if target user does not exist", async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
        }),
      }),
    } as unknown as D1Database;

    await expect(
      sendFriendRequest(mockDb, "user-1", "nonexistent"),
    ).rejects.toThrow("We couldn't find anyone named 'nonexistent'. Check the spelling.");
  });

  it("auto-accepts if there was an existing incoming pending request", async () => {
    let updatedStatus: string | null = null;
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes("FROM users")) {
              return {
                id: "user-2",
                username: "bob",
                display_name: "Bob",
                avatar: "B",
                avatar_url: null,
                color: "#123456",
              };
            }
            if (sql.includes("FROM friendships")) {
              // Existing request from user-2 to user-1
              return {
                user_id: "user-2",
                friend_id: "user-1",
                status: "pending",
              };
            }
            return null;
          },
          run: async () => {
            if (sql.includes("UPDATE friendships SET status = 'accepted'")) {
              updatedStatus = "accepted";
            }
            return {};
          },
        }),
      }),
    } as unknown as D1Database;

    const result = await sendFriendRequest(mockDb, "user-1", "bob");
    expect(result.autoAccepted).toBe(true);
    expect(result.friend.id).toBe("user-2");
    expect(updatedStatus).toBe("accepted");
  });

  it("declines a pending friend request by deleting the row", async () => {
    let deleted = false;
    const mockDb = {
      prepare: (sql: string) => ({
        bind: () => ({
          run: async () => {
            if (sql.includes("DELETE FROM friendships")) {
              deleted = true;
            }
            return {};
          },
        }),
      }),
    } as unknown as D1Database;

    await declineFriendRequest(mockDb, "user-1", "user-2");
    expect(deleted).toBe(true);
  });

  it("removes a friend", async () => {
    let deleted = false;
    const mockDb = {
      prepare: (sql: string) => ({
        bind: () => ({
          run: async () => {
            if (sql.includes("DELETE FROM friendships")) {
              deleted = true;
            }
            return {};
          },
        }),
      }),
    } as unknown as D1Database;

    await removeFriend(mockDb, "user-1", "user-2");
    expect(deleted).toBe(true);
  });

  it("blocks a user by creating or updating to status 'blocked'", async () => {
    let batched = false;
    const mockDb = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => ({
            id: "user-2",
            username: "bob",
            display_name: "Bob",
            avatar: "B",
            avatar_url: null,
            color: "#123456",
            status: null,
            custom_status: null,
            last_seen_at: null,
          }),
          run: async () => ({}),
        }),
      }),
      batch: async () => {
        batched = true;
        return [{}];
      },
    } as unknown as D1Database;

    const result = await blockUser(mockDb, "user-1", "user-2");
    expect(batched).toBe(true);
    expect(result.id).toBe("user-2");
  });

  it("prevents blocking self", async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ id: "user-1", username: "alice" }),
        }),
      }),
    } as unknown as D1Database;

    await expect(blockUser(mockDb, "user-1", "user-1")).rejects.toThrow(
      "You cannot block yourself.",
    );
  });

  it("throws error when blocking nonexistent user", async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
        }),
      }),
    } as unknown as D1Database;

    await expect(blockUser(mockDb, "user-1", "unknown")).rejects.toThrow(
      "We couldn't find anyone named 'unknown'. Check the spelling.",
    );
  });

  it("checks if users are blocked with isBlockedBetween", async () => {
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (a: string, b: string) => ({
          first: async () => {
            if ((a === "u1" && b === "u2") || (a === "u2" && b === "u1")) {
              return { id: "rel-1" };
            }
            return null;
          },
        }),
      }),
    } as unknown as D1Database;

    const { isBlockedBetween } = await import("./friends");
    expect(await isBlockedBetween(mockDb, "u1", "u2")).toBe(true);
    expect(await isBlockedBetween(mockDb, "u2", "u1")).toBe(true);
    expect(await isBlockedBetween(mockDb, "u1", "u3")).toBe(false);
  });
});
