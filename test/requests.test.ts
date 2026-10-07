import { describe, expect, it, vi } from "vitest";
import {
  isRequestHandler,
  KIWI_USER_ID,
  FLO_USER_ID,
  resolveRequestRecipients,
  submitRequest,
  listRequests,
  updateRequest,
  deleteRequest,
} from "@/lib/requests";

describe("Make a Request Feature & Direct Delivery to Kiwi & Flo", () => {
  describe("isRequestHandler permissions", () => {
    it("recognizes Kiwi by ID and username", () => {
      expect(isRequestHandler({ id: KIWI_USER_ID, username: "kiwi" })).toBe(true);
      expect(isRequestHandler({ id: KIWI_USER_ID })).toBe(true);
      expect(isRequestHandler({ id: "random-id", username: "kiwi" })).toBe(true);
    });

    it("recognizes Flo by ID and usernames (.., zar, flo)", () => {
      expect(isRequestHandler({ id: FLO_USER_ID, username: ".." })).toBe(true);
      expect(isRequestHandler({ id: FLO_USER_ID })).toBe(true);
      expect(isRequestHandler({ id: "random-id", username: ".." })).toBe(true);
      expect(isRequestHandler({ id: "random-id", username: "zar" })).toBe(true);
      expect(isRequestHandler({ id: "random-id", username: "flo" })).toBe(true);
    });

    it("recognizes admins", () => {
      expect(isRequestHandler({ id: "admin-user", is_admin: 1 })).toBe(true);
    });

    it("denies standard non-admin users", () => {
      expect(isRequestHandler({ id: "regular-user", username: "someone_else", is_admin: 0 })).toBe(
        false,
      );
    });
  });

  describe("resolveRequestRecipients", () => {
    it("resolves Kiwi and Flo from database", async () => {
      const mockDb = {
        prepare: (sql: string) => ({
          bind: (...args: any[]) => ({
            all: async () => ({
              results: [
                { id: KIWI_USER_ID, username: "kiwi", display_name: "mewis" },
                { id: FLO_USER_ID, username: "..", display_name: "Flo" },
              ],
            }),
          }),
        }),
      } as unknown as D1Database;

      const recipients = await resolveRequestRecipients(mockDb);
      expect(recipients).toHaveLength(2);
      expect(recipients.map((r) => r.id)).toContain(KIWI_USER_ID);
      expect(recipients.map((r) => r.id)).toContain(FLO_USER_ID);
    });
  });

  describe("submitRequest", () => {
    it("validates empty title or details", async () => {
      const mockDb = {} as unknown as D1Database;
      const requester = {
        id: "alice-123",
        username: "alice",
        displayName: "Alice",
        avatar: "🐰",
        color: "#fff",
      };

      await expect(
        submitRequest(mockDb, requester, { title: "", details: "Some details" }),
      ).rejects.toThrow("title");

      await expect(
        submitRequest(mockDb, requester, { title: "Title", details: "" }),
      ).rejects.toThrow("details");
    });

    it("creates request row and delivers DMs to Kiwi and Flo", async () => {
      const executedSql: string[] = [];
      const batchInserts: any[] = [];

      const mockDb = {
        prepare: (sql: string) => ({
          bind: (...args: any[]) => ({
            sql,
            args,
            run: async () => {
              executedSql.push(sql);
              return { success: true };
            },
            first: async () => {
              // Simulating DM lookup
              if (sql.includes("dm_members")) {
                return { id: `dm-channel-${args[1]}` };
              }
              return null;
            },
            all: async () => {
              if (sql.includes("FROM users")) {
                return {
                  results: [
                    { id: KIWI_USER_ID, username: "kiwi", display_name: "mewis" },
                    { id: FLO_USER_ID, username: "..", display_name: "Flo" },
                  ],
                };
              }
              if (sql.includes("FROM dm_members")) {
                return { results: [{ user_id: args[0] }] };
              }
              return { results: [] };
            },
          }),
        }),
        batch: async (stmts: any[]) => {
          batchInserts.push(...stmts);
        },
      } as unknown as D1Database;

      const requester = {
        id: "alice-123",
        username: "alice",
        displayName: "Alice",
        avatar: "🐰",
        color: "#10b981",
      };

      const result = await submitRequest(mockDb, requester, {
        title: "Add soundboard",
        category: "feature",
        details: "We need custom sounds when rolling dice!",
      });

      expect(result.request).toBeDefined();
      expect(result.request.title).toBe("Add soundboard");
      expect(result.request.category).toBe("feature");
      expect(result.request.status).toBe("pending");

      // Verifies user_requests insert was called
      expect(executedSql.some((s) => s.includes("INSERT INTO user_requests"))).toBe(true);

      // Verifies messages insert was called for DM delivery
      expect(executedSql.some((s) => s.includes("INSERT INTO messages"))).toBe(true);

      // Delivered to both kiwi and flo
      expect(result.deliveredTo).toContain("mewis");
      expect(result.deliveredTo).toContain("Flo");
    });
  });

  describe("listRequests and updateRequest", () => {
    it("lists requests for standard user", async () => {
      const mockDb = {
        prepare: (sql: string) => ({
          bind: (...args: any[]) => ({
            all: async () => ({
              results: [
                {
                  id: "req-1",
                  user_id: "alice",
                  title: "Dark mode tweak",
                  category: "improvement",
                  details: "Make sidebar darker",
                  status: "pending",
                  response_note: null,
                  updated_by: null,
                  created_at: "2026-10-07T00:00:00Z",
                  updated_at: "2026-10-07T00:00:00Z",
                },
              ],
            }),
          }),
        }),
      } as unknown as D1Database;

      const reqs = await listRequests(mockDb, { id: "alice", is_admin: 0 });
      expect(reqs).toHaveLength(1);
      expect(reqs[0].title).toBe("Dark mode tweak");
      expect(reqs[0].status).toBe("pending");
    });

    it("allows Kiwi/Flo to update request status and note", async () => {
      let updateArgs: any[] = [];
      const mockDb = {
        prepare: (sql: string) => ({
          bind: (...args: any[]) => ({
            first: async () => ({
              id: "req-1",
              user_id: "alice",
              title: "Dark mode tweak",
              category: "improvement",
              details: "Make sidebar darker",
              status: "pending",
              response_note: null,
              created_at: "2026-10-07T00:00:00Z",
            }),
            run: async () => {
              if (sql.includes("UPDATE user_requests")) {
                updateArgs = args;
              }
              return { success: true };
            },
            all: async () => ({ results: [] }),
          }),
        }),
      } as unknown as D1Database;

      const updated = await updateRequest(
        mockDb,
        { id: KIWI_USER_ID, username: "kiwi", displayName: "Kiwi" },
        "req-1",
        {
          status: "in_progress",
          responseNote: "Working on this now!",
        },
      );

      expect(updated).toBeDefined();
      expect(updated?.status).toBe("in_progress");
      expect(updated?.responseNote).toBe("Working on this now!");
      expect(updateArgs[0]).toBe("in_progress");
      expect(updateArgs[1]).toBe("Working on this now!");
    });

    it("rejects status update from non-handlers", async () => {
      const mockDb = {} as unknown as D1Database;
      await expect(
        updateRequest(
          mockDb,
          { id: "random-user", username: "bob", is_admin: 0 },
          "req-1",
          { status: "completed" },
        ),
      ).rejects.toThrow("Only Kiwi, Flo, and admins");
    });
  });
});
