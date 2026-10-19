import { describe, expect, it } from "vitest";
import { peekStream } from "./stream-peek";

function streamOf(...chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<number[]> {
  const out: number[] = [];
  const reader = stream.getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) return out;
    out.push(...next.value);
  }
}

describe("peekStream", () => {
  it("returns the head across chunk boundaries and keeps every byte", async () => {
    const { head, stream } = await peekStream(streamOf([1, 2], [3, 4, 5], [6]), 4);
    expect([...head]).toEqual([1, 2, 3, 4]);
    expect(await readAll(stream)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("copes with a stream shorter than the peek", async () => {
    const { head, stream } = await peekStream(streamOf([7, 8]), 512);
    expect([...head]).toEqual([7, 8]);
    expect(await readAll(stream)).toEqual([7, 8]);
  });

  it("copes with an empty stream", async () => {
    const { head, stream } = await peekStream(streamOf(), 512);
    expect(head.byteLength).toBe(0);
    expect(await readAll(stream)).toEqual([]);
  });
});
