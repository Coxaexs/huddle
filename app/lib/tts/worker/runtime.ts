/**
 * onnxruntime-web for the TTS worker. The runtime's wasm is self-hosted under
 * /assets/tts/ort/ (the CSP only allows our own scripts); the models come
 * from Hugging Face at pinned revisions and stay in Cache Storage after the
 * first download.
 */
import * as ort from "onnxruntime-web/wasm";

export { ort };

/** Bump when a model URL changes; older caches are deleted on the next load. */
const CACHE = "huddle-tts-v1";

export function configureRuntime(basePath: string) {
  // The runtime glue ships as .js, not .mjs: plenty of servers send .mjs as
  // application/octet-stream, and browsers refuse to import a module typed so.
  const dir = new URL(`${basePath}/assets/tts/ort/`, self.location.origin);
  ort.env.wasm.wasmPaths = {
    wasm: new URL("ort-wasm-simd-threaded.wasm", dir).href,
    mjs: new URL("ort-wasm-simd-threaded.js", dir).href,
  };
  const isolated = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  ort.env.wasm.numThreads = isolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
}

export async function cachedBytes(url: string): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    for (const key of await caches.keys()) {
      if (key.startsWith("huddle-tts-") && key !== CACHE) await caches.delete(key);
    }
    cache = await caches.open(CACHE);
  } catch {
    // No Cache Storage (not a secure context): plain fetch every time.
  }
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) return hit.arrayBuffer();
  // One retry: a dropped connection on a 20 MB download should not fail a message.
  const response = await fetch(url).catch(() => new Promise((r) => setTimeout(r, 800)).then(() => fetch(url)));
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  try {
    await cache?.put(url, response.clone());
  } catch {
    // Storage full: still works, just not cached.
  }
  return response.arrayBuffer();
}

/** Drops cached downloads whose URL contains `match` (a model no longer used). */
export async function forgetCached(match: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE);
    for (const request of await cache.keys()) {
      if (request.url.includes(match)) await cache.delete(request);
    }
  } catch {
    // No Cache Storage: nothing was kept.
  }
}

export function session(bytes: ArrayBuffer) {
  return ort.InferenceSession.create(new Uint8Array(bytes), {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
}

export const i64 = (values: ArrayLike<number>) =>
  new ort.Tensor("int64", BigInt64Array.from(Array.from(values), (x) => BigInt(x)), [1, values.length]);

export const f32 = (values: Float32Array, dims: number[]) => new ort.Tensor("float32", values, dims);

export function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
