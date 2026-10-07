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
    for (const table of ["users", "sessions", "password_resets", "rate_limits"]) {
      await db.prepare(`DELETE FROM ${table}`).run().catch(() => undefined);
    }
  });

  async function owner(email = "Owner@Example.com") {
    const response = await signup(
      post("/auth/signup", { username: "owner", password: "first-password", email }),
    );
    expect(response.status).toBe(201);
    return response;
  }

  it("requires a valid email to sign up and stores it lower-cased", async () => {
    const missing = await signup(post("/auth/signup", { username: "owner", password: "first-password" }));
    expect(missing.status).toBe(400);
    const data = (await (await owner()).json()) as { user: { email: string } };
    expect(data.user.email).toBe("owner@example.com");
    const row = await db.prepare("SELECT password_hash FROM users").first<{ password_hash: string }>();
    expect(row!.password_hash).toMatch(/^pbkdf2\$/);
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
    const saved = await setEmail(
      post("/settings/email", { email: "new@example.com", password: "first-password" }, session),
    );
    expect(((await saved.json()) as { user: { email: string } }).user.email).toBe("new@example.com");
  });
});
