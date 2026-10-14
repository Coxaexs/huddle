import { describe, expect, it } from "vitest";
import {
  bigUploadExpiry,
  bigUploadExpiryFromUrl,
  bigUploadKey,
  describeBigUploadExpiry,
  isBigUploadKey,
} from "./big-upload-key";

const uuid = "0f8b2c4e-1a2b-4c3d-8e9f-0123456789ab";

describe("big upload keys", () => {
  it("carry their expiry to the second", () => {
    const key = bigUploadKey(1_760_000_000_500, uuid, "movie.mkv");
    expect(key).toBe(`tmp1760000000-${uuid}--movie.mkv`);
    expect(isBigUploadKey(key)).toBe(true);
    expect(bigUploadExpiry(key)).toBe(1_760_000_000_000);
    expect(bigUploadExpiryFromUrl(`/hangout/api/uploads/${encodeURIComponent(key)}`)).toBe(1_760_000_000_000);
  });

  it("leave normal upload keys alone", () => {
    const key = `${uuid}--tmp1760000000-x.zip`;
    expect(isBigUploadKey(key)).toBe(false);
    expect(bigUploadExpiry(key)).toBeNull();
    expect(bigUploadExpiryFromUrl(`/hangout/api/uploads/${encodeURIComponent(key)}`)).toBeNull();
    expect(bigUploadExpiryFromUrl("https://example.com/a.png")).toBeNull();
  });

  it("describe the time left", () => {
    const now = 1_000_000_000;
    expect(describeBigUploadExpiry(now + 12 * 3600_000, now)).toBe("deleted in 12 h");
    expect(describeBigUploadExpiry(now + 25 * 60_000, now)).toBe("deleted in 25 min");
    expect(describeBigUploadExpiry(now - 1, now)).toBe("expired");
  });
});
