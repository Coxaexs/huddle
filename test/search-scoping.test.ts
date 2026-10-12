import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/messages/search/route";
import * as auth from "@/lib/auth";
import * as storage from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", () => ({
  currentUser: vi.fn(),
  unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/schema", () => ({
  DEFAULT_SERVER_ID: "default",
  DM_SERVER_ID: "dm",
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/storage", () => ({
  bindings: vi.fn(),
}));

describe("Message Search Authorization & Scoping", () => {
  let executedSql: string[] = [];
  let boundParams: unknown[][] = [];

  const mockDb = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => ({
        first: vi.fn(async () => {
          executedSql.push(sql);
          boundParams.push(params);
          // When looking up channel
          if (sql.includes("FROM channels WHERE id = ?")) {
            const channelId = params[0];
            if (channelId === "forbidden-dm") {
              return { id: "forbidden-dm", server_id: "dm", kind: "dm", name: "secret" };
            }
            if (channelId === "forbidden-server-chan") {
              return { id: "forbidden-server-chan", server_id: "other-server", kind: "text", name: "private" };
            }
            if (channelId === "allowed-chan") {
              return { id: "allowed-chan", server_id: "my-server", kind: "text", name: "general" };
            }
            return null;
          }
          // When checking dm membership
          if (sql.includes("FROM dm_members WHERE channel_id = ? AND user_id = ?")) {
            const [channelId, userId] = params;
            if (channelId === "forbidden-dm" && userId === "alice") return null;
            if (channelId === "my-dm" && userId === "alice") return { 1: 1 };
            return null;
          }
          // When checking server membership
          if (sql.includes("FROM server_members WHERE server_id = ? AND user_id = ?")) {
            const [serverId, userId] = params;
            if (serverId === "other-server" && userId === "alice") return null;
            if (serverId === "my-server" && userId === "alice") return { 1: 1 };
            return null;
          }
          if (sql.includes("FROM bans WHERE server_id = ? AND user_id = ?")) {
            return null;
          }
          return null;
        }),
        all: vi.fn(async () => {
          executedSql.push(sql);
          boundParams.push(params);
          return { results: [] };
        }),
      })),
    })),
  };

  beforeEach(() => {
    executedSql = [];
    boundParams = [];
    vi.clearAllMocks();
    vi.mocked(storage.bindings).mockReturnValue({ DB: mockDb as any });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.currentUser).mockResolvedValue(null);
    const req = new Request("http://localhost/api/messages/search?q=hello");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when searching a private DM the user does not participate in", async () => {
    vi.mocked(auth.currentUser).mockResolvedValue({ id: "alice", username: "alice", is_admin: 0 } as any);
    const req = new Request("http://localhost/api/messages/search?q=secret&channelId=forbidden-dm");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ results: [] });
  });

  it("returns 403 when searching a channel in a server the user is not a member of", async () => {
    vi.mocked(auth.currentUser).mockResolvedValue({ id: "alice", username: "alice", is_admin: 0 } as any);
    const req = new Request("http://localhost/api/messages/search?q=secret&channelId=forbidden-server-chan");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ results: [] });
  });

  it("restricts global search queries to joined servers and member DMs for regular users", async () => {
    vi.mocked(auth.currentUser).mockResolvedValue({ id: "alice", username: "alice", is_admin: 0 } as any);
    const req = new Request("http://localhost/api/messages/search?q=project");
    const res = await GET(req);
    expect(res.status).toBe(200);

    // Verify SQL query contains access scoping predicate
    const searchQuery = executedSql.find((q) => q.includes("FROM messages"));
    expect(searchQuery).toBeDefined();
    expect(searchQuery).toContain("server_members");
    expect(searchQuery).toContain("dm_members");
  });

  it("restricts global search queries for admins to server channels and their own DMs", async () => {
    vi.mocked(auth.currentUser).mockResolvedValue({ id: "admin-bob", username: "bob", is_admin: 1 } as any);
    const req = new Request("http://localhost/api/messages/search?q=project");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const searchQuery = executedSql.find((q) => q.includes("FROM messages"));
    expect(searchQuery).toBeDefined();
    // Admin query excludes other users' DMs (c.server_id != 'dm' OR dm.user_id = 'admin-bob')
    expect(searchQuery).toContain("server_id != ?");
    expect(searchQuery).toContain("dm_members dm WHERE dm.user_id = ?");
  });
});
