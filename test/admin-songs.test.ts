import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/app/api/admin/guard", () => ({ requireInstanceAdmin: vi.fn() }));
vi.mock("@/lib/musicbot", () => ({ botFetch: vi.fn(), botSession: vi.fn(async () => "cookie") }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn(async () => {}) }));

import { GET, POST } from "@/app/api/admin/songs/route";
import { requireInstanceAdmin } from "@/app/api/admin/guard";
import { recordAudit } from "@/lib/audit";
import { botFetch } from "@/lib/musicbot";

const admin = { user: { id: "kiwi", display_name: "Kiwi" }, db: {} as D1Database };
const post = (body: unknown) =>
  new Request("http://x/api/admin/songs", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.mocked(requireInstanceAdmin).mockReset().mockResolvedValue(admin as never);
  vi.mocked(botFetch).mockReset();
  vi.mocked(recordAudit).mockClear();
});

describe("/api/admin/songs", () => {
  it("keeps non-admins out of both methods", async () => {
    vi.mocked(requireInstanceAdmin).mockResolvedValue({ response: Response.json({ error: "no" }, { status: 403 }) });
    expect((await GET(new Request("http://x/api/admin/songs?q=a"))).status).toBe(403);
    expect((await POST(post({ id: "aBcDeFgHiJk" }))).status).toBe(403);
    expect(botFetch).not.toHaveBeenCalled();
  });

  it("searches the bot's library with an encoded query", async () => {
    vi.mocked(botFetch).mockResolvedValue({ songs: [{ id: "aBcDeFgHiJk", title: "Sarhoş" }] });
    const response = await GET(new Request("http://x/api/admin/songs?q=sarho%C5%9F%20duman"));
    expect(await response.json()).toEqual({ songs: [{ id: "aBcDeFgHiJk", title: "Sarhoş" }] });
    expect(vi.mocked(botFetch).mock.calls[0][0]).toBe("/api/library/songs?q=sarho%C5%9F%20duman");
  });

  it("says so when the bot is unreachable", async () => {
    vi.mocked(botFetch).mockRejectedValue(new Error("Music dashboard login failed."));
    const response = await GET(new Request("http://x/api/admin/songs"));
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toMatch(/login failed/);
  });

  it("deletes a song through the bot and writes it to the audit log", async () => {
    vi.mocked(botFetch).mockResolvedValue({ id: "aBcDeFgHiJk", files: ["a.mp3"], stems: true, analysis: true });
    const response = await POST(post({ id: "aBcDeFgHiJk", title: "Sarhoş" }));
    expect(response.status).toBe(200);
    const [path, , init] = vi.mocked(botFetch).mock.calls[0];
    expect(path).toBe("/api/library/delete");
    expect(JSON.parse(String(init?.body))).toEqual({ id: "aBcDeFgHiJk" });
    expect(recordAudit).toHaveBeenCalledWith(
      admin.db,
      expect.objectContaining({ action: "song.delete", targetId: "aBcDeFgHiJk", targetName: "Sarhoş", detail: "files 1, stems, analysis" }),
    );
  });

  it("refuses anything that is not a YouTube id before the bot is asked", async () => {
    for (const id of [undefined, "", "../../etc/passwd", "short", "a".repeat(12)]) {
      expect((await POST(post({ id }))).status).toBe(400);
    }
    expect(botFetch).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("maps the bot's refusals to useful statuses and does not audit a failed delete", async () => {
    vi.mocked(botFetch).mockRejectedValueOnce(new Error("That song is not in the library."));
    expect((await POST(post({ id: "aBcDeFgHiJk" }))).status).toBe(404);
    vi.mocked(botFetch).mockRejectedValueOnce(new Error("That song is playing in the DJ booth right now."));
    expect((await POST(post({ id: "aBcDeFgHiJk" }))).status).toBe(409);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
