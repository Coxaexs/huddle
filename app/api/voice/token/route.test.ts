import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { setBindings } from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

vi.mock("@/lib/auth", () => ({
  currentUser: vi.fn(),
  unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
}));

vi.mock("@/lib/servers", () => ({
  findChannel: vi.fn().mockResolvedValue({ id: "v1", server_id: "s1" }),
  isServerMember: vi.fn().mockResolvedValue(true),
}));

import { currentUser } from "@/lib/auth";

beforeEach(() => {
  setBindings({
    LIVEKIT_URL: "wss://test.livekit.local",
    LIVEKIT_API_KEY: "testkey",
    LIVEKIT_API_SECRET: "testsecret1234567890123456789012",
  });
});

afterEach(() => {
  setBindings(null);
  vi.clearAllMocks();
});

it("returns enabled: false when LiveKit is not configured", async () => {
  setBindings({});
  const res = await GET(new Request("http://localhost/hangout/api/voice/token?channelId=v1"));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.enabled).toBe(false);
});

it("rejects unauthenticated requests", async () => {
  vi.mocked(currentUser).mockResolvedValue(null);
  const res = await GET(new Request("http://localhost/hangout/api/voice/token?channelId=v1"));
  expect(res.status).toBe(401);
});

it("validates channelId presence", async () => {
  vi.mocked(currentUser).mockResolvedValue({
    id: "u1",
    username: "alice",
    display_name: "Alice",
    avatar: "",
    color: "#ffffff",
    is_admin: 0,
    created_at: "",
    last_seen_at: "",
  });
  const res = await GET(new Request("http://localhost/hangout/api/voice/token"));
  expect(res.status).toBe(400);
});

it("mints an authenticated LiveKit token when valid", async () => {
  vi.mocked(currentUser).mockResolvedValue({
    id: "u1",
    username: "alice",
    display_name: "Alice",
    avatar: "",
    color: "#ffffff",
    is_admin: 0,
    created_at: "",
    last_seen_at: "",
  });
  const res = await GET(new Request("http://localhost/hangout/api/voice/token?channelId=v1"));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.enabled).toBe(true);
  expect(data.url).toBe("wss://test.livekit.local");
  expect(typeof data.token).toBe("string");
  expect(data.identity).toBe("u1");
  expect(data.room).toBe("v1");
});
