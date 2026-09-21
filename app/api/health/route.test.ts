import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { setBindings } from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

vi.mock("@/lib/schema", () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  setBindings({
    DB: {
      prepare: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ 1: 1 }),
      }),
    } as never,
  });
});

afterEach(() => {
  setBindings(null);
  vi.clearAllMocks();
});

it("returns status ok and uptime when database is reachable", async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  const data = (await res.json()) as { status: string; timestamp: string; uptime: number };
  expect(data.status).toBe("ok");
  expect(typeof data.timestamp).toBe("string");
  expect(typeof data.uptime).toBe("number");
});
