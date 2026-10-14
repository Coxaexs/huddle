import { describe, expect, it, vi } from "vitest";
import { postSessionRecap, promptTranscript, transcriptText, type NoteLine } from "@/lib/session-notes";

const START = Date.UTC(2026, 9, 14, 19, 0, 0);
const lines: NoteLine[] = [
  { at: START + 5_000, name: "Aria", text: "I roll for initiative" },
  { at: START + 65_000, name: "Juno", text: "natural twenty on the goblin" },
  { at: START + 3_725_000, name: "Aria", text: "we rest at the inn" },
];
const state = { startedAt: START, startedBy: "u1", startedByName: "Aria", postChannelId: "c1" };

function fakeDb() {
  const inserts: unknown[][] = [];
  const db = {
    prepare: (query: string) => ({
      bind: (...values: unknown[]) => ({
        first: async () => (query.includes("FROM channels") ? { name: "table" } : null),
        run: async () => {
          inserts.push(values);
          return {};
        },
      }),
    }),
  } as unknown as D1Database;
  return { db, inserts };
}

describe("session notes", () => {
  it("times each line from the start", () => {
    expect(transcriptText(lines, START).split("\n")).toEqual([
      "[00:05] Aria: I roll for initiative",
      "[01:05] Juno: natural twenty on the goblin",
      "[1:02:05] Aria: we rest at the inn",
    ]);
  });

  it("keeps the most recent part of a long transcript for the prompt", () => {
    const long = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const cut = promptTranscript(long, 40);
    expect(cut.startsWith("(earlier lines left out)\n")).toBe(true);
    expect(cut.endsWith("line 49")).toBe(true);
  });

  it("posts the AI recap with the transcript attached", async () => {
    const { db, inserts } = fakeDb();
    const put = vi.fn(async () => undefined);
    const publish = vi.fn();
    const ask = vi.fn(async () => ({ text: "- The party fought a goblin.", model: "test" }));
    const posted = await postSessionRecap(
      { db, uploads: { put } as unknown as R2Bucket, keys: { geminiKey: "k" }, publish, toPublic: (row) => row, ask },
      state,
      lines,
      "Kitchen Table",
    );
    expect(posted).toBe(true);
    expect((ask.mock.calls[0] as unknown[])[2]).toContain("[01:05] Juno: natural twenty on the goblin");
    const [key, bytes] = put.mock.calls[0] as unknown as [string, Uint8Array];
    expect(key).toMatch(/--session-notes-2026-10-14\.txt$/);
    expect(new TextDecoder().decode(bytes)).toContain("we rest at the inn");
    const content = inserts[0][6] as string;
    expect(content).toContain("Session recap · Kitchen Table · 1:02:05 · Aria, Juno");
    expect(content).toContain("The party fought a goblin.");
    expect(inserts[0][7]).toBe(key);
    expect(publish).toHaveBeenCalledWith("c1", expect.objectContaining({ attachment_key: key }));
  });

  it("still posts the transcript when no AI is set up", async () => {
    const { db, inserts } = fakeDb();
    await postSessionRecap({ db, keys: {}, publish: () => {}, toPublic: (row) => row }, state, lines, "Kitchen Table");
    expect(inserts[0][6]).toContain("[00:05] Aria: I roll for initiative");
  });

  it("skips a session with almost nothing said", async () => {
    const { db, inserts } = fakeDb();
    expect(await postSessionRecap({ db, keys: {}, publish: () => {}, toPublic: (r) => r }, state, lines.slice(0, 1), "x")).toBe(false);
    expect(inserts).toEqual([]);
  });
});
