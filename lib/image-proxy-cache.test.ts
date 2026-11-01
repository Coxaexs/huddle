import { beforeEach, describe, expect, it } from "vitest";
import {
  IMAGE_CACHE_BYTES,
  IMAGE_CACHE_MAX_ENTRY,
  IMAGE_CACHE_TTL_MS,
  UPSTREAM_BYTES_PER_MINUTE,
  UPSTREAM_FETCHES_PER_MINUTE,
  cachedImage,
  chargeUpstreamBytes,
  resetImageProxyCache,
  storeImage,
  takeUpstreamFetch,
} from "./image-proxy-cache";

beforeEach(() => resetImageProxyCache());

describe("image proxy cache", () => {
  it("serves a stored image until it goes stale", () => {
    storeImage("https://a.example/x.png", new Uint8Array([1, 2, 3]), "image/png", 0);
    expect(cachedImage("https://a.example/x.png", 1000)?.type).toBe("image/png");
    expect(cachedImage("https://a.example/x.png", IMAGE_CACHE_TTL_MS + 1)).toBeNull();
  });

  it("drops the least recently used images to stay under its size", () => {
    const size = IMAGE_CACHE_MAX_ENTRY;
    const count = Math.floor(IMAGE_CACHE_BYTES / size);
    for (let i = 0; i < count; i += 1) storeImage(`u${i}`, new Uint8Array(size), "image/png", 0);
    expect(cachedImage("u0", 1)).not.toBeNull(); // now the most recent
    storeImage("new", new Uint8Array(size), "image/png", 2);
    expect(cachedImage("u1", 3)).toBeNull();
    expect(cachedImage("u0", 3)).not.toBeNull();
  });

  it("does not keep very large images", () => {
    storeImage("big", new Uint8Array(IMAGE_CACHE_MAX_ENTRY + 1), "image/png", 0);
    expect(cachedImage("big", 1)).toBeNull();
  });
});

describe("outside fetch budget", () => {
  it("stops after so many fetches in a minute, and starts again in the next", () => {
    for (let i = 0; i < UPSTREAM_FETCHES_PER_MINUTE; i += 1) expect(takeUpstreamFetch(1000)).toBe(true);
    expect(takeUpstreamFetch(2000)).toBe(false);
    expect(takeUpstreamFetch(61_000)).toBe(true);
  });

  it("stops once a minute's bytes are spent", () => {
    expect(takeUpstreamFetch(0)).toBe(true);
    chargeUpstreamBytes(UPSTREAM_BYTES_PER_MINUTE, 0);
    expect(takeUpstreamFetch(1)).toBe(false);
  });
});
