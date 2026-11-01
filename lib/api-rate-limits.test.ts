import { beforeEach, describe, expect, it } from "vitest";
import { API_BUDGETS, apiRateLimit } from "./api-rate-limits";
import { resetMemoryRateLimits } from "./rate-limit";

const NOW = Date.UTC(2026, 10, 1, 12, 0, 30);

function req(
  path: string,
  init: { method?: string; ip?: string | null; cookie?: string; auth?: string } = {},
): Request {
  const headers = new Headers();
  if (init.ip !== null) headers.set("cf-connecting-ip", init.ip ?? "203.0.113.7");
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.auth) headers.set("authorization", init.auth);
  return new Request(`https://chat.example${path}`, { method: init.method ?? "GET", headers });
}

async function hit(times: number, make: () => Request, apiPath: string): Promise<Response | null> {
  let last: Response | null = null;
  for (let i = 0; i < times; i += 1) last = await apiRateLimit(make(), apiPath, NOW);
  return last;
}

describe("apiRateLimit", () => {
  beforeEach(() => resetMemoryRateLimits());

  it("lets ordinary use through", async () => {
    const make = () => req("/hangout/api/messages", { cookie: "hoffle_session=abc" });
    expect(await hit(300, make, "/api/messages")).toBeNull();
  });

  it("stops one session past its budget and says when to retry", async () => {
    const make = () => req("/hangout/api/channels", { cookie: "hoffle_session=abc" });
    expect(await hit(API_BUDGETS.session.limit, make, "/api/channels")).toBeNull();
    const blocked = await apiRateLimit(make(), "/api/channels", NOW);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("keeps sessions apart", async () => {
    const a = () => req("/hangout/api/channels", { cookie: "hoffle_session=a", ip: "198.51.100.1" });
    const b = () => req("/hangout/api/channels", { cookie: "hoffle_session=b", ip: "198.51.100.2" });
    await hit(API_BUDGETS.session.limit + 1, a, "/api/channels");
    expect(await apiRateLimit(b(), "/api/channels", NOW)).toBeNull();
  });

  it("caps YouTube downloads per hour", async () => {
    const make = () => req("/hangout/api/youtube/download", { method: "POST", cookie: "hoffle_session=abc" });
    expect(await hit(10, make, "/api/youtube/download")).toBeNull();
    expect((await apiRateLimit(make(), "/api/youtube/download", NOW))?.status).toBe(429);
    // Other routes still work for the same person.
    expect(await apiRateLimit(req("/hangout/api/messages", { cookie: "hoffle_session=abc" }), "/api/messages", NOW)).toBeNull();
  });

  it("only counts the methods a route limit names", async () => {
    const get = () => req("/hangout/api/reports", { cookie: "hoffle_session=abc" });
    expect(await hit(100, get, "/api/reports")).toBeNull();
    const post = () => req("/hangout/api/reports", { method: "POST", cookie: "hoffle_session=abc" });
    expect(await hit(30, post, "/api/reports")).toBeNull();
    expect((await apiRateLimit(post(), "/api/reports", NOW))?.status).toBe(429);
  });

  it("counts images in their own larger budget", async () => {
    const image = () => req("/hangout/api/uploads/abc.png", { cookie: "hoffle_session=abc" });
    expect(await hit(API_BUDGETS.session.limit + 200, image, "/api/uploads/abc.png")).toBeNull();
    expect(await apiRateLimit(req("/hangout/api/channels", { cookie: "hoffle_session=abc" }), "/api/channels", NOW)).toBeNull();
  });

  it("holds one address back however many cookies it makes up", async () => {
    let n = 0;
    const make = () => req("/hangout/api/channels", { cookie: `hoffle_session=fake${(n += 1)}` });
    expect(await hit(API_BUDGETS.ip.limit, make, "/api/channels")).toBeNull();
    expect((await apiRateLimit(make(), "/api/channels", NOW))?.status).toBe(429);
  });

  it("answers bots on the Discord API in Discord's shape", async () => {
    const make = () => req("/api/v10/channels/1/messages", { method: "POST", auth: "Bot token" });
    expect(await hit(API_BUDGETS.bot.limit, make, "/api/v10/channels/1/messages")).toBeNull();
    const blocked = await apiRateLimit(make(), "/api/v10/channels/1/messages", NOW);
    expect(blocked?.status).toBe(429);
    const body = (await blocked!.json()) as { retry_after: number; global: boolean };
    expect(body.retry_after).toBeGreaterThan(0);
    expect(body.global).toBe(false);
  });

  it("leaves calls from this machine and live sockets alone", async () => {
    const local = () => req("/hangout/api/youtube/download", { method: "POST", ip: null, auth: "Bearer x" });
    expect(await hit(50, local, "/api/youtube/download")).toBeNull();
    const socket = () => req("/hangout/api/realtime", { cookie: "hoffle_session=abc" });
    expect(await hit(API_BUDGETS.session.limit + 10, socket, "/api/realtime")).toBeNull();
  });

  it("gives visitors without a session a smaller budget by address", async () => {
    const make = () => req("/hangout/api/auth/session", { ip: "192.0.2.9" });
    expect(await hit(API_BUDGETS.anonymous.limit, make, "/api/auth/session")).toBeNull();
    expect((await apiRateLimit(make(), "/api/auth/session", NOW))?.status).toBe(429);
  });
});
