import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/channels/prefs/route";
import * as auth from "@/lib/auth";
import * as storage from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", () => ({
  currentUser: vi.fn(),
  unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/schema", () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/storage", () => ({
  bindings: vi.fn(),
}));

describe("Channel Prefs & Temporary Mutes", () => {
  let storedRows: Array<{ user_id: string; channel_id: string; level: string; muted_until?: string | null }> = [];

  const mockDb = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes("SELECT channel_id, level, muted_until FROM channel_prefs")) {
            const userId = params[0];
            return {
              results: storedRows.filter((r) => r.user_id === userId),
            };
          }
          return { results: [] };
        }),
        run: vi.fn(async () => {
          if (sql.includes("DELETE FROM channel_prefs WHERE user_id = ? AND channel_id = ?")) {
            const [userId, channelId] = params as [string, string];
            storedRows = storedRows.filter(
              (r) => !(r.user_id === userId && r.channel_id === channelId),
            );
          } else if (sql.includes("INSERT OR REPLACE INTO channel_prefs")) {
            const [userId, channelId, level, mutedUntil] = params as [string, string, string, string | null];
            storedRows = storedRows.filter(
              (r) => !(r.user_id === userId && r.channel_id === channelId),
            );
            storedRows.push({
              user_id: userId,
              channel_id: channelId,
              level,
              muted_until: mutedUntil,
            });
          }
          return { success: true };
        }),
      })),
    })),
  };

  beforeEach(() => {
    storedRows = [];
    vi.clearAllMocks();
    vi.mocked(storage.bindings).mockReturnValue({ DB: mockDb as unknown as D1Database });
    vi.mocked(auth.currentUser).mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof auth.currentUser>>);
  });

  it("returns empty prefs and mutedUntil initially", async () => {
    const res = await GET(new Request("http://localhost/api/channels/prefs"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { prefs: Record<string, string>; mutedUntil: Record<string, string> };
    expect(data).toEqual({ prefs: {}, mutedUntil: {} });
  });

  it("sets a permanent notification level", async () => {
    const postRes = await POST(
      new Request("http://localhost/api/channels/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: "c_announcements", level: "mentions" }),
      }),
    );
    expect(postRes.status).toBe(200);

    const getRes = await GET(new Request("http://localhost/api/channels/prefs"));
    const data = (await getRes.json()) as { prefs: Record<string, string>; mutedUntil: Record<string, string> };
    expect(data.prefs["c_announcements"]).toBe("mentions");
    expect(data.mutedUntil["c_announcements"]).toBeUndefined();
  });

  it("supports setting temporary mute with durationMs", async () => {
    const postRes = await POST(
      new Request("http://localhost/api/channels/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: "c_spammy",
          level: "nothing",
          durationMs: 3600 * 1000, // 1 hour
        }),
      }),
    );
    expect(postRes.status).toBe(200);
    const postData = (await postRes.json()) as { ok: boolean; mutedUntil?: string };
    expect(postData.ok).toBe(true);
    expect(postData.mutedUntil).toBeDefined();

    const getRes = await GET(new Request("http://localhost/api/channels/prefs"));
    const getData = (await getRes.json()) as { prefs: Record<string, string>; mutedUntil: Record<string, string> };
    expect(getData.prefs["c_spammy"]).toBe("nothing");
    expect(getData.mutedUntil["c_spammy"]).toBeDefined();
  });

  it("clears preference when reset to all without mute", async () => {
    storedRows.push({
      user_id: "user_123",
      channel_id: "c_temp",
      level: "mentions",
      muted_until: null,
    });

    const postRes = await POST(
      new Request("http://localhost/api/channels/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: "c_temp", level: "all" }),
      }),
    );
    expect(postRes.status).toBe(200);

    const getRes = await GET(new Request("http://localhost/api/channels/prefs"));
    const data = (await getRes.json()) as { prefs: Record<string, string>; mutedUntil: Record<string, string> };
    expect(data.prefs["c_temp"]).toBeUndefined();
  });
});
