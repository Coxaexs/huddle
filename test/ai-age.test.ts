import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  currentUser: vi.fn(),
}));

import { currentUser } from "@/lib/auth";
import { POST as ask } from "@/app/api/(features)/ai/ask/route";
import { POST as summarize } from "@/app/api/(features)/ai/summarize/route";
import { POST as translate } from "@/app/api/messages/[id]/translate/route";
import { POST as recap } from "@/app/api/(features)/recap/route";
import { POST as confirmAge } from "@/app/api/settings/ai-age/route";
import { AI_AGE_CODE, requireAiAge } from "@/lib/ai-age";

function realDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (query: string, params: unknown[] = []) => {
    const values = params as Array<string | number | null>;
    return {
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
    };
  };
  return {
    prepare: (query: string) => statement(query),
    batch: async (list: Array<ReturnType<typeof statement>>) => Promise.all(list.map((item) => item.run())),
    exec: async (query: string) => sqlite.exec(query),
  } as unknown as D1Database;
}

let db: D1Database;
const NOW = new Date().toISOString();
const json = (body: unknown) => new Request("http://x/", { method: "POST", body: JSON.stringify(body) });

beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
  setBindings({ DB: db, GEMINI_API_KEY: "test" } as never);
});

beforeEach(async () => {
  await db.exec("DELETE FROM channels");
  await db.exec("DELETE FROM server_members");
  await db.exec("DELETE FROM servers");
  await db.exec("DELETE FROM users");
  await db
    .prepare(
      `INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at)
       VALUES ('u1','u1','u1','U1','x','a','#000',0,?,?)`,
    )
    .bind(NOW, NOW)
    .run();
  await db.prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at) VALUES ('s1','S','S','#000','u1',?)").bind(NOW).run();
  await db.prepare("INSERT INTO server_members (server_id, user_id, joined_at) VALUES ('s1','u1',?)").bind(NOW).run();
  await db.prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES ('c1','s1','general','text',?),('v1','s1','voice','voice',?)").bind(NOW, NOW).run();
  (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1", username: "u1", display_name: "U1" } as never);
});

async function refused(response: Response) {
  expect(response.status).toBe(403);
  expect(((await response.json()) as { code: string }).code).toBe(AI_AGE_CODE);
}

describe("AI features are 18+", () => {
  it("refuses every AI route until the person says they are 18", async () => {
    await refused(await ask(json({ channelId: "c1", question: "hi" })));
    await refused(await summarize(json({ channelId: "c1" })));
    await refused(await translate(json({ to: "en" }), { params: Promise.resolve({ id: "m1" }) }));
    await refused(await recap(json({ channelId: "c1", voiceChannelId: "v1", action: "start" })));
  });

  it("lets a recap be stopped without asking", async () => {
    const response = await recap(json({ channelId: "c1", voiceChannelId: "v1", action: "stop" }));
    expect(((await response.json().catch(() => ({}))) as { code?: string }).code).not.toBe(AI_AGE_CODE);
  });

  it("remembers a yes", async () => {
    expect(await requireAiAge(db, "u1")).toBeInstanceOf(Response);
    expect((await confirmAge(json({ adult: true }))).status).toBe(200);
    expect(await requireAiAge(db, "u1")).toBeNull();
  });

  it("does not store anything but a yes", async () => {
    expect((await confirmAge(json({ adult: false }))).status).toBe(400);
    expect((await confirmAge(json({}))).status).toBe(400);
    expect(await requireAiAge(db, "u1")).toBeInstanceOf(Response);
  });
});
