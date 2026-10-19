import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  fromBase64Url,
  matchTotp,
  otpauthUri,
  toBase64Url,
  totpCode,
} from "./account-security";
import { describeUserAgent } from "./user-agent";

// RFC 6238 appendix B, SHA-1: the secret is ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors (last six digits)", async () => {
    // Time 59 s is step 1, 1111111109 s is step 37037036.
    expect(await totpCode(RFC_SECRET, 1)).toBe("287082");
    expect(await totpCode(RFC_SECRET, 37037036)).toBe("081804");
    expect(await totpCode(RFC_SECRET, 37037037)).toBe("050471");
  });

  it("accepts a code from one step either side, never one already used", async () => {
    const now = 1111111109_000;
    const step = Math.floor(now / 30_000);
    const code = await totpCode(RFC_SECRET, step);
    expect(await matchTotp(RFC_SECRET, code, 0, now)).toBe(step);
    expect(await matchTotp(RFC_SECRET, await totpCode(RFC_SECRET, step - 1), 0, now)).toBe(step - 1);
    expect(await matchTotp(RFC_SECRET, await totpCode(RFC_SECRET, step - 2), 0, now)).toBeNull();
    expect(await matchTotp(RFC_SECRET, code, step, now)).toBeNull();
    expect(await matchTotp(RFC_SECRET, "12345", 0, now)).toBeNull();
    expect(await matchTotp(RFC_SECRET, " " + code.slice(0, 3) + " " + code.slice(3), 0, now)).toBe(step);
  });

  it("round-trips base32 and base64url", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect([...base32Decode(base32Encode(bytes))]).toEqual([...bytes]);
    expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes]);
    expect(base32Decode("gezd gnbv")).toEqual(base32Decode("GEZDGNBV"));
  });

  it("builds an otpauth link authenticator apps understand", () => {
    const uri = otpauthUri("ABC", "kiwi");
    expect(uri.startsWith("otpauth://totp/Hoffle%3Akiwi?")).toBe(true);
    const params = new URL(uri.replace("otpauth:", "http:")).searchParams;
    expect(params.get("secret")).toBe("ABC");
    expect(params.get("issuer")).toBe("Hoffle");
    expect(params.get("period")).toBe("30");
  });
});

describe("describeUserAgent", () => {
  it("names common browsers and systems", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
      ),
    ).toBe("Firefox on Windows");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      ),
    ).toBe("Safari on macOS");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      ),
    ).toBe("Edge on Windows");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36",
      ),
    ).toBe("Hoffle app on Android");
    expect(describeUserAgent(null)).toBe("Unknown device");
  });
});
