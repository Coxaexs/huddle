import { describe, expect, it } from "vitest";
import {
  QUEUE_PER_PERSON,
  applyQueue,
  sanitizeShared,
  skipVotesNeeded,
  type QueueOp,
  type WatchQueue,
  type WatchState,
} from "@/lib/lounge-shared";

const A = "https://cdn.example.com/a.mp4";
const B = "https://cdn.example.com/b.mp4";
const C = "/hangout/api/youtube/stream/dQw4w9WgXcQ.mp4";
const now = 1_000_000;
const film = (url: string): WatchState => ({ url, title: "On now", position: 0, at: now - 5000, paused: false, by: "flo" });
const alice = { userId: "alice", name: "Alice", roomUserIds: ["alice", "bob", "cara"] };
const bob = { ...alice, userId: "bob", name: "Bob" };
const cara = { ...alice, userId: "cara", name: "Cara" };

/** Applies ops in turn, as the hub would, carrying queue and screen along. */
function run(start: { queue: WatchQueue | null; watch: WatchState | null }, steps: Array<[typeof alice, QueueOp]>) {
  let { queue, watch } = start;
  let t = now;
  for (const [actor, op] of steps) {
    const result = applyQueue(queue, op, actor, watch, (t += 10));
    if (!result) continue;
    queue = result.queue;
    if (result.watch !== undefined) watch = result.watch;
  }
  return { queue, watch };
}

describe("watch party queue", () => {
  it("starts the first film straight away when the screen is dark", () => {
    const { queue, watch } = run({ queue: null, watch: null }, [[alice, { op: "add", url: A, title: "A" }]]);
    expect(watch).toMatchObject({ url: A, title: "A", position: 0, paused: false, by: "Alice" });
    expect(queue).toBeNull();
  });

  it("orders by votes, ties in the order they came", () => {
    const { queue } = run({ queue: null, watch: film(A) }, [
      [alice, { op: "add", url: B, title: "B" }],
      [bob, { op: "add", url: C, title: "C" }],
    ]);
    expect(queue!.films.map((f) => f.title)).toEqual(["B", "C"]);
    const c = queue!.films[1].id;
    const voted = run({ queue, watch: film(A) }, [[cara, { op: "vote", id: c }]]);
    expect(voted.queue!.films.map((f) => f.title)).toEqual(["C", "B"]);
    // Voting again takes the vote back.
    const unvoted = run(voted, [[cara, { op: "vote", id: c }]]);
    expect(unvoted.queue!.films.map((f) => [f.title, f.votes.length])).toEqual([["B", 0], ["C", 0]]);
  });

  it("refuses duplicates and more than the per-person limit", () => {
    const steps: Array<[typeof alice, QueueOp]> = [
      [alice, { op: "add", url: A, title: "already on" }],
      [alice, { op: "add", url: B, title: "B" }],
      [bob, { op: "add", url: B, title: "B again" }],
    ];
    for (let i = 0; i < QUEUE_PER_PERSON + 2; i += 1) steps.push([alice, { op: "add", url: `https://x.example.com/${i}.mp4`, title: String(i) }]);
    const { queue } = run({ queue: null, watch: film(A) }, steps);
    expect(queue!.films.filter((f) => f.userId === "alice")).toHaveLength(QUEUE_PER_PERSON);
    expect(queue!.films.filter((f) => f.url === B)).toHaveLength(1);
  });

  it("starts the next film once however many tabs saw the last one end", () => {
    const start = run({ queue: null, watch: film(A) }, [
      [alice, { op: "add", url: B, title: "B" }],
      [alice, { op: "add", url: C, title: "C" }],
    ]);
    const after = run(start, [
      [alice, { op: "next", from: A }],
      [bob, { op: "next", from: A }],
      [cara, { op: "next", from: A }],
    ]);
    expect(after.watch?.url).toBe(B);
    expect(after.queue!.films.map((f) => f.url)).toEqual([C]);
  });

  it("only lets the one who added a film take it out", () => {
    const start = run({ queue: null, watch: film(A) }, [[alice, { op: "add", url: B, title: "B" }]]);
    const id = start.queue!.films[0].id;
    expect(applyQueue(start.queue, { op: "remove", id }, bob, start.watch, now)).toBeNull();
    expect(applyQueue(start.queue, { op: "remove", id }, alice, start.watch, now)?.queue).toBeNull();
  });

  it("skips on a majority of the people in the room", () => {
    expect([1, 2, 3, 4, 5].map(skipVotesNeeded)).toEqual([1, 2, 2, 3, 3]);
    const start = run({ queue: null, watch: film(A) }, [[alice, { op: "add", url: B, title: "B" }]]);
    const one = run(start, [[alice, { op: "skip" }]]);
    expect(one.watch?.url).toBe(A);
    expect(one.queue!.skip).toEqual({ url: A, votes: ["alice"] });
    const two = run(one, [[bob, { op: "skip" }]]);
    expect(two.watch?.url).toBe(B);
    expect(two.queue).toBeNull();
  });

  it("goes dark when a skip passes with nothing queued, and drops votes from people who left", () => {
    const solo = { ...alice, roomUserIds: ["alice"] };
    expect(applyQueue(null, { op: "skip" }, solo, film(A), now)).toEqual({ queue: null, watch: null });
    // Bob voted then left: his vote no longer counts towards the two needed.
    const left = { ...alice, roomUserIds: ["alice", "cara", "dan"] };
    const queue: WatchQueue = { films: [], skip: { url: A, votes: ["bob"] } };
    expect(applyQueue(queue, { op: "skip" }, left, film(A), now)?.watch).toBeUndefined();
  });

  it("forgets skip votes cast against an earlier film", () => {
    const stale: WatchQueue = { films: [], skip: { url: B, votes: ["bob"] } };
    const result = applyQueue(stale, { op: "skip" }, alice, film(A), now);
    expect(result?.queue?.skip).toEqual({ url: A, votes: ["alice"] });
  });

  it("sanitizes what a client sends", () => {
    expect(sanitizeShared("queue", { op: "add", url: "javascript:alert(1)", title: "x" }, "Alice", now)).toBeNull();
    expect(sanitizeShared("queue", { op: "add", url: C, title: "" }, "Alice", now)).toEqual({ op: "add", url: C, title: "Video" });
    expect(sanitizeShared("queue", { op: "nuke" }, "Alice", now)).toBeNull();
    expect(sanitizeShared("queue", { op: "next" }, "Alice", now)).toEqual({ op: "next", from: null });
  });
});
