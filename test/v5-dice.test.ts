import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiceRollEvent } from "@/lib/protocol";
import {
  cleanWillpowerPicks,
  defaultWillpowerPicks,
  parseRouse,
  parseV5,
  scoreRouse,
  scoreV5,
  splitPool,
  v5Summary,
} from "@/lib/v5-dice";
import type { V5Card } from "@/lib/v5-roll";

// Vampire: The Masquerade 5th edition: d10 pools, Hunger dice, Rouse checks
// and Willpower rerolls, rolled by the same verified route as /roll.

const state = vi.hoisted(() => ({
  events: [] as Array<{ channelId: string; event: { t: string; roll?: DiceRollEvent; payload?: unknown } }>,
  runs: [] as Array<{ sql: string; values: unknown[] }>,
  row: null as Record<string, unknown> | null,
  changes: 1,
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", () => ({
  currentUser: async () => ({ id: "kiwi", display_name: "Kiwi", username: "kiwi" }),
  unauthorized: () => Response.json({ error: "Sign in" }, { status: 401 }),
}));
vi.mock("@/lib/schema", () => ({ ensureSchema: async () => {} }));
vi.mock("@/lib/access", () => ({
  channelAccess: async () => ({
    ok: true,
    channel: { id: "text1", serverId: "s1", kind: "text", name: "table", isDm: false },
  }),
}));
vi.mock("@/lib/permissions", () => ({ can: async () => true, Permission: { MANAGE_MESSAGES: 1 } }));
vi.mock("@/lib/timeouts", () => ({ blockIfTimedOut: async () => null }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  limitUser: async () => null,
}));
vi.mock("@/lib/recording", () => ({ activeRecording: async () => null, elapsedMs: () => 0 }));
vi.mock("@/lib/servers", () => ({
  findChannel: async (_db: unknown, id: string) => ({ id, kind: id.startsWith("voice") ? "voice" : "text", server_id: "s1" }),
  isServerMember: async () => true,
}));
vi.mock("@/lib/dms", () => ({ channelAudience: async () => null }));
vi.mock("@/lib/hub-client", () => ({
  publishMessageEvent: async (channelId: string, event: { t: string; roll?: DiceRollEvent }) => {
    state.events.push({ channelId, event });
  },
  publishMessage: async () => {},
}));
vi.mock("@/app/api/messages/route", () => ({ publicMessage: (row: unknown) => row }));
vi.mock("@/lib/storage", () => ({
  bindings: () => ({
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          async run() {
            state.runs.push({ sql, values });
            return { meta: { changes: state.changes } };
          },
          async first() {
            return state.row;
          },
        }),
      }),
    },
  }),
}));

const { POST: ROLL } = await import("@/app/api/(features)/integrations/dnd/roll/route");
const { POST: WILLPOWER } = await import("@/app/api/(features)/integrations/dnd/willpower/route");

function roll(command: string) {
  return ROLL(
    new Request("http://x/api/integrations/dnd/roll", {
      method: "POST",
      body: JSON.stringify({ command, channelId: "voice1", textChannelId: "text1" }),
    }),
  );
}

function willpower(body: Record<string, unknown>) {
  return WILLPOWER(new Request("http://x/api/integrations/dnd/willpower", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  state.events = [];
  state.runs = [];
  state.row = null;
  state.changes = 1;
});

describe("parseV5", () => {
  it("reads the pool, Hunger, Difficulty and a label", () => {
    expect(parseV5("7 h2 d3 Strength + Brawl")).toEqual({ pool: 7, hunger: 2, difficulty: 3, label: "Strength + Brawl" });
    expect(parseV5("3+2 hunger 1 diff 4 Dex+Firearms")).toEqual({ pool: 5, hunger: 1, difficulty: 4, label: "Dex+Firearms" });
    expect(parseV5("6h1d2")).toEqual({ pool: 6, hunger: 1, difficulty: 2, label: "" });
    expect(parseV5("5")).toEqual({ pool: 5, hunger: 0, difficulty: undefined, label: "" });
    expect(parseV5("4 vs 2 hunger: 3")).toEqual({ pool: 4, hunger: 3, difficulty: 2, label: "" });
  });

  it("refuses what V5 has no use for", () => {
    expect(parseV5("Strength")).toHaveProperty("error");
    expect(parseV5("0")).toHaveProperty("error");
    expect(parseV5("31")).toHaveProperty("error");
    expect(parseV5("5 h6")).toHaveProperty("error");
    expect(parseV5("5 d0")).toHaveProperty("error");
  });
});

describe("splitPool", () => {
  it("swaps normal dice for Hunger dice, never more than the pool", () => {
    expect(splitPool(7, 2)).toEqual({ normal: 5, hunger: 2 });
    expect(splitPool(2, 4)).toEqual({ normal: 0, hunger: 2 });
  });
});

describe("scoreV5", () => {
  it("counts 6+ as a success and a pair of 10s as four", () => {
    expect(scoreV5([6, 7, 2, 1], [], undefined).successes).toBe(2);
    const crit = scoreV5([10, 10, 3], []);
    expect(crit.successes).toBe(4);
    expect(crit.critical).toBe(true);
    // Three 10s: one pair (4) and one lone 10 (1).
    expect(scoreV5([10, 10, 10], []).successes).toBe(5);
    expect(scoreV5([10, 10, 10, 10], []).successes).toBe(8);
  });

  it("makes a critical with a Hunger 10 messy, but only if it wins", () => {
    const messy = scoreV5([10, 4], [10], 3);
    expect(messy).toMatchObject({ successes: 4, critical: true, messy: true, win: true, margin: 1, outcome: "Messy critical" });
    const short = scoreV5([4], [10, 10], 5);
    expect(short).toMatchObject({ successes: 4, critical: true, messy: false, win: false, outcome: "Fail by 1" });
    expect(scoreV5([10, 10], [3], 2)).toMatchObject({ messy: false, outcome: "Critical win" });
  });

  it("makes a failure with a Hunger 1 bestial", () => {
    expect(scoreV5([7, 2], [1], 3)).toMatchObject({ successes: 1, win: false, bestial: true, outcome: "Bestial failure" });
    // A win is a win, Hunger 1 or not.
    expect(scoreV5([7, 8], [1], 2)).toMatchObject({ win: true, bestial: false, outcome: "Win" });
    // No Difficulty: bestial only on a total failure; otherwise a warning.
    expect(scoreV5([2], [1])).toMatchObject({ bestial: true, totalFailure: true });
    expect(scoreV5([8], [1])).toMatchObject({ bestial: false, bestialRisk: true, outcome: "1 success" });
  });

  it("sums the roll up for the overlay", () => {
    expect(v5Summary(scoreV5([10, 4], [10], 3))).toBe("4 SUCCESSES · MESSY CRITICAL");
    expect(v5Summary(scoreV5([6, 7], []))).toBe("2 SUCCESSES");
    expect(v5Summary(scoreV5([2], [3], 1))).toBe("0 SUCCESSES · TOTAL FAILURE");
    expect(v5Summary(scoreV5([6, 7, 8], [], 2))).toBe("3 SUCCESSES · WIN BY 1");
  });
});

describe("Rouse checks", () => {
  it("parses dice and Hunger", () => {
    expect(parseRouse("")).toEqual({ dice: 1, hunger: undefined, label: "" });
    expect(parseRouse("2 h3 Celerity")).toEqual({ dice: 2, hunger: 3, label: "Celerity" });
    expect(parseRouse("4")).toHaveProperty("error");
  });

  it("raises Hunger below 6, and warns at 5", () => {
    expect(scoreRouse([7])).toMatchObject({ success: true, outcome: "No Hunger gained" });
    expect(scoreRouse([3], 2)).toMatchObject({ success: false, hungerAfter: 3, outcome: "Hunger 2 → 3" });
    expect(scoreRouse([3, 8], 2)).toMatchObject({ success: true, best: 8, hungerAfter: 2 });
    expect(scoreRouse([1], 5)).toMatchObject({ atMax: true, hungerAfter: 5 });
  });
});

describe("Willpower picks", () => {
  it("defaults to up to three failed normal dice", () => {
    expect(defaultWillpowerPicks([8, 1, 3, 9, 2, 5])).toEqual([1, 2, 4]);
    expect(defaultWillpowerPicks([8, 9])).toEqual([]);
  });

  it("only takes up to three distinct normal dice", () => {
    expect(cleanWillpowerPicks([2, 0], 4)).toEqual([0, 2]);
    expect(cleanWillpowerPicks([0, 1, 2, 3], 5)).toBeNull();
    expect(cleanWillpowerPicks([4], 4)).toBeNull();
    expect(cleanWillpowerPicks([1, 1], 4)).toBeNull();
    expect(cleanWillpowerPicks([], 4)).toBeNull();
    expect(cleanWillpowerPicks("1", 4)).toBeNull();
  });
});

describe("/v through the roll route", () => {
  it("rolls the pool as d10s, the Hunger ones marked, and posts a verified V5 card", async () => {
    const response = await roll("/v 7 h2 d3 Strength + Brawl");
    const data = (await response.json()) as { roll: DiceRollEvent; payload: V5Card; posted: boolean; text: string };
    expect(response.status).toBe(200);
    expect(data.posted).toBe(true);
    expect(data.roll.dice).toHaveLength(2);
    expect(data.roll.dice[0]).toMatchObject({ sides: 10 });
    expect(data.roll.dice[0].hunger).toBeUndefined();
    expect(data.roll.dice[0].rolls).toHaveLength(5);
    expect(data.roll.dice[1]).toMatchObject({ sides: 10, hunger: true });
    expect(data.roll.dice[1].rolls).toHaveLength(2);
    expect(data.roll.summary).toMatch(/SUCCESS/);

    const card = data.payload;
    expect(card).toMatchObject({ type: "v5", pool: 7, difficulty: 3, label: "Strength + Brawl", rollerId: "kiwi", verified: true });
    expect(card.normal).toEqual(data.roll.dice[0].rolls.map((r) => r.value));
    expect(card.hungerDice).toEqual(data.roll.dice[1].rolls.map((r) => r.value));
    expect(card.successes).toBe(scoreV5(card.normal, card.hungerDice, 3).successes);
    expect(data.roll.total).toBe(card.successes);
    expect(data.text).toMatch(/^Strength \+ Brawl: rolled 7 dice \(2 Hunger\) vs 3/);

    // The stored message answers as the Storyteller and remembers the command.
    const insert = state.runs.find((run) => run.sql.includes("INSERT INTO messages"))!;
    expect(insert.values).toContain("Storyteller");
    expect(insert.values).toContain("/v 7 h2 d3 Strength + Brawl");
    expect(state.events.filter((e) => e.event.t === "dice-roll").map((e) => e.channelId).sort()).toEqual(["text1", "voice1"]);
  });

  it("explains a pool it can't read", async () => {
    const response = await roll("/v Strength");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/dice pool/);
  });

  it("keeps /gmv faces and successes away from everyone but the roller", async () => {
    const response = await roll("/gmv 5 h1 Awareness");
    const data = (await response.json()) as { roll: DiceRollEvent; payload: Record<string, unknown>; secretCard: V5Card };
    expect(data.payload).toMatchObject({ type: "roll", secret: true });
    expect(data.secretCard).toMatchObject({ type: "v5", pool: 5 });
    for (const { event } of state.events) {
      expect(event.roll?.masked).toBe(true);
      expect(event.roll?.summary).toBeUndefined();
      expect(event.roll?.dice.flatMap((t) => t.rolls).every((r) => r.value === 0)).toBe(true);
    }
  });

  it("rolls a Rouse check as a red die", async () => {
    const response = await roll("/rouse h2 Blush of Life");
    const data = (await response.json()) as { roll: DiceRollEvent; payload: Record<string, unknown> };
    expect(data.roll.dice).toEqual([expect.objectContaining({ sides: 10, hunger: true })]);
    expect(data.payload).toMatchObject({ type: "rouse", hungerBefore: 2, label: "Blush of Life" });
    expect(data.payload.hungerAfter).toBe(data.payload.success ? 2 : 3);
  });

  it("still rolls D&D dice as before", async () => {
    const data = (await (await roll("/roll 1d20+5 stealth")).json()) as { roll: DiceRollEvent; payload: Record<string, unknown> };
    expect(data.payload).toMatchObject({ type: "roll", label: "stealth", modifier: 5 });
    expect(data.roll.summary).toBeUndefined();
  });
});

describe("Willpower reroll", () => {
  const card = (over: Partial<V5Card> = {}): V5Card => ({
    type: "v5",
    name: "V5 roll",
    roller: "Kiwi",
    rollerId: "kiwi",
    pool: 5,
    difficulty: 3,
    normal: [2, 9, 3, 1],
    hungerDice: [4],
    ...scoreV5([2, 9, 3, 1], [4], 3),
    verified: true,
    ...over,
  });
  const stored = (payload: V5Card, over: Record<string, unknown> = {}) => ({
    id: "m1",
    channel_id: "text1",
    kind: "dnd",
    payload: JSON.stringify(payload),
    sender_id: "kiwi",
    deleted_at: null,
    ...over,
  });

  it("rerolls the picked normal dice once, keeps the Hunger dice, and rewrites the card", async () => {
    state.row = stored(card());
    const response = await willpower({ messageId: "m1", picks: [0, 2, 3], channelId: "voice1" });
    const data = (await response.json()) as { roll: DiceRollEvent; payload: V5Card };
    expect(response.status).toBe(200);
    expect(data.payload.willpower).toEqual({ picks: [0, 2, 3], before: [2, 3, 1] });
    expect(data.payload.normal[1]).toBe(9);
    expect(data.payload.hungerDice).toEqual([4]);
    expect(data.payload.successes).toBe(scoreV5(data.payload.normal, [4], 3).successes);
    // Only the three rerolled dice tumble.
    expect(data.roll.dice.flatMap((t) => t.rolls)).toHaveLength(3);

    const update = state.runs.find((run) => run.sql.startsWith("UPDATE messages"))!;
    expect(JSON.parse(update.values[0] as string)).toEqual(data.payload);
    // Guarded on the card as read, so two clicks can't both spend.
    expect(update.values[3]).toBe(state.row!.payload);
    const edited = state.events.find((e) => e.event.t === "message-edited")!;
    expect(edited.event.payload).toEqual(data.payload);
    expect(state.events.filter((e) => e.event.t === "dice-roll").map((e) => e.channelId).sort()).toEqual(["text1", "voice1"]);
  });

  it("refuses anyone but the roller, a second spend, Hunger dice and unverified cards", async () => {
    state.row = stored(card({ rollerId: "someone" }), { sender_id: "someone" });
    expect((await willpower({ messageId: "m1", picks: [0] })).status).toBe(403);

    state.row = stored(card({ willpower: { picks: [0], before: [2] } }));
    expect((await willpower({ messageId: "m1", picks: [0] })).status).toBe(409);

    state.row = stored(card());
    expect((await willpower({ messageId: "m1", picks: [4] })).status).toBe(400);

    state.row = stored(card({ verified: undefined }));
    expect((await willpower({ messageId: "m1", picks: [0] })).status).toBe(404);

    state.row = stored(card());
    state.changes = 0;
    expect((await willpower({ messageId: "m1", picks: [0] })).status).toBe(409);
    expect(state.events).toHaveLength(0);
  });
});
