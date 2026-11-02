import { beforeEach, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/app/api/admin/guard", () => ({ requireInstanceAdmin: vi.fn() }));
vi.mock("@/lib/musicbot", () => ({ botFetch: vi.fn(), botSession: vi.fn(async () => "cookie") }));

import { GET } from "@/app/api/admin/musixmatch/route";
import { requireInstanceAdmin } from "@/app/api/admin/guard";
import { botFetch } from "@/lib/musicbot";

beforeEach(() => {
  vi.mocked(requireInstanceAdmin).mockReset().mockResolvedValue({ user: { id: "kiwi" }, db: {} } as never);
  vi.mocked(botFetch).mockReset();
});

it("shows instance admins what is left of the Musixmatch plan", async () => {
  vi.mocked(botFetch).mockResolvedValue({ configured: true, left_this_month: 298, plan_limit: 300 });
  const response = await GET(new Request("http://x/api/admin/musixmatch"));
  expect(await response.json()).toEqual({ configured: true, left_this_month: 298, plan_limit: 300 });
  expect(vi.mocked(botFetch).mock.calls[0][0]).toBe("/api/admin/musixmatch");
});

it("keeps everyone else out", async () => {
  vi.mocked(requireInstanceAdmin).mockResolvedValue({ response: Response.json({ error: "no" }, { status: 403 }) });
  expect((await GET(new Request("http://x/api/admin/musixmatch"))).status).toBe(403);
  expect(botFetch).not.toHaveBeenCalled();
});

it("says so when the bot is unreachable", async () => {
  vi.mocked(botFetch).mockRejectedValue(new Error("Music dashboard login failed."));
  const response = await GET(new Request("http://x/api/admin/musixmatch"));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "Music dashboard login failed." });
});
