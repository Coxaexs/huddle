/**
 * zlib-stream transport compression for the gateway.
 *
 * discord.py connects with `&compress=zlib-stream` and does not offer a way to
 * turn it off, so the gateway has to speak it. The client keeps one inflate
 * context for the whole connection and treats a trailing `00 00 FF FF` as the
 * end of a payload.
 *
 * Workers expose `CompressionStream('deflate')`, but not a per-message sync
 * flush, which is precisely what this framing needs. Rather than ship a deflate
 * implementation, this writes *stored* (BTYPE=00) deflate blocks: valid zlib
 * that any inflater accepts, costing 5 bytes of framing per 64KB and no CPU.
 * Gateway payloads are small JSON objects, so the bandwidth we give up is
 * irrelevant next to being able to flush on every dispatch.
 */

/** zlib header: CM=8 (deflate), CINFO=7 (32K window), FCHECK making it %31==0. */
const ZLIB_HEADER = new Uint8Array([0x78, 0x01]);

/** An empty stored block — what Z_SYNC_FLUSH emits, and what clients scan for. */
const SYNC_FLUSH = new Uint8Array([0x00, 0x00, 0x00, 0xff, 0xff]);

/** Stored blocks carry a 16-bit length, so payloads are split at 64KB - 1. */
const MAX_BLOCK = 0xffff;

export class ZlibStreamEncoder {
  private headerSent: boolean;

  /**
   * `headerSent` is a constructor argument because the gateway hibernates: the
   * encoder instance dies between messages while the client's inflate context
   * lives on, so the flag is carried in the socket attachment and handed back.
   */
  constructor(headerSent = false) {
    this.headerSent = headerSent;
  }

  /** Whether the zlib header has gone out, to persist across hibernation. */
  get started(): boolean {
    return this.headerSent;
  }

  /**
   * Frames one payload. The result always ends with the sync-flush marker, so
   * the client can hand it straight to its inflater and get a whole message.
   */
  encode(payload: string): Uint8Array {
    const data = new TextEncoder().encode(payload);
    const chunks: Uint8Array[] = [];

    // The two-byte zlib header belongs to the stream, not the message: sending
    // it twice would desync the client's inflate context for good.
    if (!this.headerSent) {
      chunks.push(ZLIB_HEADER);
      this.headerSent = true;
    }

    for (let offset = 0; offset < data.length; offset += MAX_BLOCK) {
      const slice = data.subarray(offset, offset + MAX_BLOCK);
      const length = slice.length;
      const block = new Uint8Array(5 + length);
      // BFINAL=0, BTYPE=00 (stored). The remaining bits of this byte are
      // padding to the byte boundary, which stored blocks require.
      block[0] = 0x00;
      block[1] = length & 0xff;
      block[2] = (length >> 8) & 0xff;
      block[3] = ~length & 0xff;
      block[4] = (~length >> 8) & 0xff;
      block.set(slice, 5);
      chunks.push(block);
    }

    chunks.push(SYNC_FLUSH);
    return concat(chunks);
  }

  /** A fresh connection means a fresh inflate context on the client. */
  reset(): void {
    this.headerSent = false;
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
