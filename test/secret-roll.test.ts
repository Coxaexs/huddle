import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiceRollEvent } from "@/lib/protocol";
import { maskRoll } from "@/lib/secret-roll";

// /gmroll: whatever leaves the server for anyone but the roller (room events,
// the stored card) must not carry the faces or the total.

const state = vi.hoisted(() => ({
  events: [] as Array<{ channelId: string; event: { t: string; roll?: DiceRollEvent } }>,
  inserted: [] as unknown[][],
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", () => ({
  currentUser: async () => ({ id: "dm", display_name: "Dungeon Master", username: "dm" }),
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
      prepare: () => ({
        bind: (...values: unknown[]) => ({
          async run() {
            state.inserted.push(values);
            return {};
          },
          async first() {
            return null;
          },
        }),
      }),
    },
  }),
}));

const { POST } = await import("@/app/api/(features)/integrations/dnd/roll/route");

function roll(command: string) {
  return POST(
    new Request("http://x/api/integrations/dnd/roll", {
      method: "POST",
      body: JSON.stringify({ command, channelId: "voice1", textChannelId: "text1" }),
    }),
  );
}

beforeEach(() => {
  state.events = [];
  state.inserted = [];
});

describe("maskRoll", () => {
  it("keeps the dice to animate but drops every face and the total", () => {
    const real: DiceRollEvent = {
      expression: "1d20+4",
      dice: [{ sides: 20, rolls: [{ value: 17, kept: true }], sign: 1 }],
      modifier: 4,
      total: 21,
      roller: { id: "dm", displayName: "DM" },
      rollType: "normal",
      animationSeed: "seed",
    };
    const masked = maskRoll(real);
    expect(masked.masked).toBe(true);
    expect(masked.total).toBe(0);
    expect(masked.modifier).toBe(0);
    expect(masked.expression).toBe("");
    expect(masked.dice).toEqual([{ sides: 20, rolls: [{ value: 0, kept: true }], sign: 1 }]);
    expect(masked.animationSeed).toBe("seed");
  });
});

describe("/gmroll", () => {
  it("sends the room a masked roll and stores a card without the result", async () => {
    const response = await roll("/gmroll d20+4 perception");
    const data = (await response.json()) as {
      roll: DiceRollEvent;
      payload: Record<string, unknown>;
      secretCard?: { total: number };
    };

    // The roller's own reply has everything.
    expect(data.roll.masked).toBeUndefined();
    expect(data.secretCard?.total).toBe(data.roll.total);

    // The rooms only ever see the masked copy.
    expect(state.events.map((entry) => entry.channelId).sort()).toEqual(["text1", "voice1"]);
    for (const { event } of state.events) {
      expect(event.roll?.masked).toBe(true);
      expect(event.roll?.total).toBe(0);
      expect(event.roll?.dice.flatMap((term) => term.rolls.map((r) => r.value))).toEqual([0]);
    }

    // The card in the channel names the seed, never the result.
    expect(data.payload).toMatchObject({ type: "roll", secret: true, rollSeed: data.roll.animationSeed });
    expect(data.payload).not.toHaveProperty("total");
    expect(data.payload).not.toHaveProperty("dice");
    const stored = JSON.stringify(state.inserted);
    expect(stored).not.toContain(`"total":${data.roll.total}`);
    expect(stored).toContain('\\"secret\\":true');
  });

  it("leaves a normal roll as it was", async () => {
    const response = await roll("/roll d20");
    const data = (await response.json()) as { roll: DiceRollEvent; secretCard?: unknown };
    expect(data.secretCard).toBeUndefined();
    expect(state.events.every(({ event }) => event.roll?.total === data.roll.total)).toBe(true);
  });
});
