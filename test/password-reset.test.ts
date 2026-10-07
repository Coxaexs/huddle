import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const sent = vi.hoisted(() => [] as Array<{ to: string; text: string }>);
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async (mail: { to: string; text: string }) => {
    sent.push(mail);
    return true;
  }),
}));

import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as forgot } from "@/app/api/auth/forgot/route";
import { POST as reset } from "@/app/api/auth/reset/route";
import { POST as setEmail } from "@/app/api/settings/email/route";
import { POST as verifyEmail } from "@/app/api/settings/email/verify/route";
import { POST as skipPrompt } from "@/app/api/settings/email-prompt/route";

/** D1 over a real in-memory SQLite, so the schema and SQL run for real. */
function realDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (query: string, params: unknown[] = []) => {
    const values = params as Array<string | number | null>;
    const self = {
      bind: (...args: unknown[]) => statement(query, args),
      async first<T>() {
        return (sqlite.prepare(query).get(...values) ?? null) as T;
      },
      async all<T>() {
        return { results: sqlite.prepare(query).all(...values) as T[] };
      },
      async run() {
        const result = sqlite.prepare(query).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
      async raw() {
        return sqlite.prepare(query).all(...values).map((row) => Object.values(row as object));
      },
    };
    return self;
  };
  return {
    prepare: (query: string) => statement(query),
    batch: async (list: Array<ReturnType<typeof statement>>) =>
      Promise.all(list.map((item) => item.run())),
    exec: async (query: string) => sqlite.exec(query),
  } as unknown as D1Database;
}

const BASE = "https://hoffle.example/hangout/api";
let ip = 0;

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // A fresh address per request keeps the per-IP limits out of the way.
      "cf-connecting-ip": `10.0.0.${++ip}`,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function cookieOf(response: Response): string {
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

describe("email and password reset", () => {
  // ensureSchema runs once per process, so the tests share one database.
  const db = realDb();
  beforeAll(() => setBindings({ DB: db }));
  beforeEach(async () => {
    sent.length = 0;
    for (const table of ["users", "sessions", "password_resets", "email_verifications", "rate_limits", "invites"]) {
      await db.prepare(`DELETE FROM ${table}`).run().catch(() => undefined);
    }
  });

  function mailedCode(): string {
    return sent.at(-1)!.text.match(/\b(\d{6})\b/)![1];
  }

  /** Signs the owner up with an email and verifies it via the mailed code. */
  async function owner(email = "Owner@Example.com") {
    const response = await signup(
      post("/auth/signup", { username: "owner", password: "first-password", email }),
    );
    expect(response.status).toBe(201);
    const verified = await verifyEmail(post("/settings/email/verify", { code: mailedCode() }, cookieOf(response)));
    expect(verified.status).toBe(200);
    sent.length = 0;
    return response;
  }

  it("lets one address verify on several accounts and resets each separately", async () => {
    await owner("shared@example.com");
    const second = await signup(
      post("/auth/signup", { username: "alt", password: "alt-password", email: "shared@example.com", invite: "X" }),
    );
    // Only the first signup is invite-free; fake one for the second account.
    if (second.status === 403) {
      await db.prepare("INSERT INTO invites (code, max_uses, uses, revoked, created_at) VALUES ('ALT', 0, 0, 0, '')").run();
    }
    const alt = second.status === 201 ? second : await signup(
      post("/auth/signup", { username: "alt", password: "alt-password", email: "shared@example.com", invite: "ALT" }),
    );
    expect(alt.status).toBe(201);
    const ok = await verifyEmail(post("/settings/email/verify", { code: mailedCode() }, cookieOf(alt)));
    expect(ok.status).toBe(200);
    sent.length = 0;
    await forgot(post("/auth/forgot", { identifier: "shared@example.com" }));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("@alt\n");
    expect(sent[0].text).toContain("@owner\n");
    const [altToken] = sent[0].text.match(/\?reset=([0-9a-f]+)/)!.slice(1);
    expect((await reset(post("/auth/reset", { token: altToken, password: "new-alt-password" }))).status).toBe(200);
    expect((await login(post("/auth/login", { username: "alt", password: "new-alt-password" }))).status).toBe(200);
    expect((await login(post("/auth/login", { username: "owner", password: "first-password" }))).status).toBe(200);
  });

  it("mails at most 5 codes per IP an hour", async () => {
    const response = await signup(post("/auth/signup", { username: "owner", password: "first-password" }));
    const session = cookieOf(response);
    const fixedIp = (body: unknown) => {
      const request = post("/settings/email", body, session);
      request.headers.set("cf-connecting-ip", "10.9.9.9");
      return request;
    };
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await setEmail(fixedIp({ email: `x${i}@example.com`, password: "first-password" }))).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(sent).toHaveLength(5);
  });

  it("mails at most 5 codes to one address an hour, whatever the IP", async () => {
    const session = cookieOf(await signup(post("/auth/signup", { username: "owner", password: "first-password" })));
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await setEmail(post("/settings/email", { email: "victim@example.com", password: "first-password" }, session))).status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(sent).toHaveLength(5);
  });

  it("signs up without an email", async () => {
    const response = await signup(post("/auth/signup", { username: "owner", password: "first-password" }));
    expect(response.status).toBe(201);
    expect(((await response.json()) as { user: { email: string | null } }).user.email).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("only saves a signup email once the mailed code comes back", async () => {
    const response = await signup(
      post("/auth/signup", { username: "owner", password: "first-password", email: "Owner@Example.com" }),
    );
    const data = (await response.json()) as { user: { email: string | null }; pendingEmail: string };
    expect(data.user.email).toBeNull();
    expect(data.pendingEmail).toBe("owner@example.com");
    expect(sent[0].to).toBe("owner@example.com");

    const session = cookieOf(response);
    expect((await verifyEmail(post("/settings/email/verify", { code: "000000" === mailedCode() ? "111111" : "000000" }, session))).status).toBe(400);
    const ok = await verifyEmail(post("/settings/email/verify", { code: mailedCode() }, session));
    expect(((await ok.json()) as { user: { email: string } }).user.email).toBe("owner@example.com");
    // Codes are single use.
    expect((await verifyEmail(post("/settings/email/verify", { code: mailedCode() }, session))).status).toBe(410);
  });

  it("locks a code after too many wrong guesses", async () => {
    const response = await signup(
      post("/auth/signup", { username: "owner", password: "first-password", email: "a@example.com" }),
    );
    const session = cookieOf(response);
    const code = mailedCode();
    const wrong = code === "999999" ? "888888" : "999999";
    for (let i = 0; i < 5; i++) await verifyEmail(post("/settings/email/verify", { code: wrong }, session));
    expect((await verifyEmail(post("/settings/email/verify", { code }, session))).status).toBe(410);
  });

  it("mails a one-time reset link that sets a new password", async () => {
    await owner();
    expect((await forgot(post("/auth/forgot", { identifier: "OWNER@example.com" }))).status).toBe(200);
    expect(sent).toHaveLength(1);
    const token = sent[0].text.match(/\?reset=([0-9a-f]+)/)![1];
    expect(sent[0].text).toContain("https://hoffle.example/hangout/?reset=");

    const done = await reset(post("/auth/reset", { token, password: "second-password" }));
    expect(done.status).toBe(200);
    expect(cookieOf(done)).toMatch(/^hoffle_session=/);

    expect((await reset(post("/auth/reset", { token, password: "third-password" }))).status).toBe(400);
    expect((await login(post("/auth/login", { username: "owner", password: "first-password" }))).status).toBe(401);
    expect((await login(post("/auth/login", { username: "owner", password: "second-password" }))).status).toBe(200);
  });

  it("answers the same for unknown accounts and sends nothing", async () => {
    await owner();
    const response = await forgot(post("/auth/forgot", { identifier: "nobody" }));
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it("lets older accounts skip the prompt, then add or change an email with their password", async () => {
    const session = cookieOf(await owner());
    await db.prepare("UPDATE users SET email = NULL").run();

    const skipped = (await (await skipPrompt(post("/settings/email-prompt", {}, session))).json()) as {
      user: { emailPromptSkipped: boolean };
    };
    expect(skipped.user.emailPromptSkipped).toBe(true);

    expect((await setEmail(post("/settings/email", { email: "new@example.com", password: "wrong" }, session))).status).toBe(403);
    const started = await setEmail(
      post("/settings/email", { email: "new@example.com", password: "first-password" }, session),
    );
    expect(((await started.json()) as { pending: string }).pending).toBe("new@example.com");
    expect(sent[0].to).toBe("new@example.com");
    const row = await db.prepare("SELECT email FROM users").first<{ email: string | null }>();
    expect(row!.email).toBeNull();

    const saved = await verifyEmail(post("/settings/email/verify", { code: mailedCode() }, session));
    expect(((await saved.json()) as { user: { email: string } }).user.email).toBe("new@example.com");
  });
});
