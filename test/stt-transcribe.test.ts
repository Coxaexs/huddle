import { beforeEach, describe, expect, it, vi } from "vitest";

// The CC button: only people who can read the message may transcribe it, the
// audio comes from our own upload store, and the text is stored once.

const state = vi.hoisted(() => ({
  allowed: true,
  row: null as { audio_url: string | null; payload: string | null } | null,
  updates: [] as unknown[][],
  fetched: [] as string[],
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", () => ({
  currentUser: async () => ({ id: "u1" }),
  unauthorized: () => Response.json({ error: "Sign in" }, { status: 401 }),
}));
vi.mock("@/lib/access", () => ({
  messageAccess: async () =>
    state.allowed
      ? { ok: true, channel: { id: "c1" } }
      : { ok: false, response: Response.json({ error: "No" }, { status: 403 }) },
}));
vi.mock("@/lib/rate-limit", () => ({ limitUser: async () => null }));
vi.mock("@/lib/storage", () => ({
  bindings: () => ({
    SPEECH_API_KEY: "key",
    UPLOADS: {
      async get(key: string) {
        state.fetched.push(key);
        return {
          size: 4,
          httpMetadata: { contentType: "audio/webm" },
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        };
      },
    },
    DB: {
      prepare: (query: string) => ({
        bind: (...values: unknown[]) => ({
          async first() {
            return state.row;
          },
          async run() {
            if (query.startsWith("UPDATE")) state.updates.push(values);
            return {};
          },
        }),
      }),
    },
  }),
}));

const { POST } = await import("@/app/api/(features)/stt/transcribe/route");

function transcribe(messageId: string) {
  return POST(new Request("http://x/api/stt/transcribe", { method: "POST", body: JSON.stringify({ messageId }) }));
}

beforeEach(() => {
  state.allowed = true;
  state.row = { audio_url: "/hangout/api/uploads/voice%2Fa.webm", payload: JSON.stringify({ voice: { durationMs: 900 } }) };
  state.updates = [];
  state.fetched = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ text: " merhaba ", language: "tr" })),
  );
});

describe("POST /api/stt/transcribe", () => {
  it("refuses a message the viewer cannot read", async () => {
    state.allowed = false;
    expect((await transcribe("m1")).status).toBe(403);
    expect(state.fetched).toEqual([]);
  });

  it("transcribes the stored clip once and keeps the text on the message", async () => {
    const response = await transcribe("m1");
    expect(await response.json()).toEqual({ text: "merhaba" });
    expect(state.fetched).toEqual(["voice/a.webm"]);
    const [payload, id] = state.updates[0] as [string, string];
    expect(id).toBe("m1");
    expect(JSON.parse(payload)).toEqual({ voice: { durationMs: 900, transcript: "merhaba" } });
  });

  it("answers from the stored transcript without asking Duyu again", async () => {
    state.row = { audio_url: "/hangout/api/uploads/a.webm", payload: JSON.stringify({ voice: { transcript: "" } }) };
    expect(await (await transcribe("m1")).json()).toEqual({ text: "", cached: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("only reads our own uploads", async () => {
    state.row = { audio_url: "https://evil.example/x.webm", payload: null };
    expect((await transcribe("m1")).status).toBe(400);
    expect(state.fetched).toEqual([]);
  });
});
