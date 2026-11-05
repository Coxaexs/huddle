import { beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { resetMemoryRateLimits } from "@/lib/rate-limit";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/schema", async (original) => ({ ...(await original<object>()), ensureSchema: vi.fn() }));

import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as guest } from "@/app/api/auth/guest/route";

const db = { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }) }) };
const send = (body: unknown) => new Request("http://x/", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  resetMemoryRateLimits();
  setBindings({ DB: db } as never);
});

describe("Hoffle is 16+", () => {
  it("refuses a signup that did not tick the age box", async () => {
    for (const oldEnough of [undefined, false]) {
      const response = await signup(send({ username: "young", password: "long-enough-pw", oldEnough }));
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toMatch(/16 or older/);
    }
  });

  it("refuses a guest who did not tick the age box", async () => {
    const response = await guest(send({ displayName: "Young", invite: "ABC", agreed: true }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/16 or older/);
  });
});
