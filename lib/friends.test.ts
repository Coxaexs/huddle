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
          run: async () => ({}),
        }),
      }),
      batch: async () => {
        batched = true;
        return [{}];
      },
    } as unknown as D1Database;

    await blockUser(mockDb, "user-1", "user-2");
    expect(batched).toBe(true);
  });
});
