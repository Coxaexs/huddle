/**
 * Reads the first `bytes` of a stream (or fewer, if it ends first) without
 * consuming them: the returned stream yields everything, those bytes included.
 * Uploads use it to sniff a file's type and still pass the body straight to
 * storage instead of holding the whole thing in memory.
 */
export async function peekStream(
  stream: ReadableStream<Uint8Array>,
  bytes: number,
): Promise<{ head: Uint8Array; stream: ReadableStream<Uint8Array> }> {
  const reader = stream.getReader();
  const buffered: Uint8Array[] = [];
  let have = 0;
  let done = false;
  while (have < bytes) {
    const next = await reader.read();
    if (next.done) {
      done = true;
      break;
    }
    buffered.push(next.value);
    have += next.value.byteLength;
  }

  const head = new Uint8Array(Math.min(have, bytes));
  let offset = 0;
  for (const chunk of buffered) {
    if (offset >= head.byteLength) break;
    const take = chunk.subarray(0, head.byteLength - offset);
    head.set(take, offset);
    offset += take.byteLength;
  }

  const rest = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = buffered.shift();
      if (chunk) {
        controller.enqueue(chunk);
        return;
      }
      if (done) {
        controller.close();
        return;
      }
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { head, stream: rest };
}
