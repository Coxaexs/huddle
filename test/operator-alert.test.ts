import { beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { resetMemoryRateLimits } from "@/lib/rate-limit";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/schema", () => ({ ensureSchema: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPushNotifications: vi.fn().mockResolvedValue(undefined) }));

import { sendPushNotifications } from "@/lib/push";
import { POST } from "@/app/api/admin/alert/route";

const db = {
  prepare: () => ({ all: async () => ({ results: [{ id: "owner" }] }) }),
} as unknown as D1Database;

function send(token: string | null, body: unknown = { title: "Legal mail", body: "from atkm" }) {
  return POST(
    new Request("http://x/api/admin/alert", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMemoryRateLimits();
  setBindings({ DB: db, OPERATOR_ALERT_TOKEN: "secret" } as never);
});

describe("POST /api/admin/alert", () => {
  it("rings the admins urgently with the right token", async () => {
    expect((await send("secret")).status).toBe(200);
    const [, ids, payload] = (sendPushNotifications as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ids).toEqual(["owner"]);
    expect(payload).toMatchObject({ title: "Legal mail", urgent: true });
  });

  it("refuses a wrong or missing token", async () => {
    expect((await send("wrong")).status).toBe(401);
    expect((await send(null)).status).toBe(401);
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("stays off until a token is set", async () => {
    setBindings({ DB: db } as never);
    expect((await send("secret")).status).toBe(503);
  });
});
