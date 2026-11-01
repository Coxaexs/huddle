import { afterEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { readCookie } from "@/lib/auth";
import { storeBotFiles } from "@/lib/bot-uploads";

vi.mock("cloudflare:workers", () => ({ env: {} }));

describe("reading the session cookie", () => {
  it("treats a cookie it cannot decode as no cookie, instead of crashing the request", () => {
    const request = (cookie: string) => new Request("https://hoffle.test/", { headers: { cookie } });
    expect(readCookie(request("hoffle_session=%E0%A4%A"), "hoffle_session")).toBeNull();
    expect(readCookie(request("other=%%; hoffle_session=abc%20def"), "hoffle_session")).toBe("abc def");
    expect(readCookie(request("hoffle_session=plain"), "hoffle_session")).toBe("plain");
  });
});

describe("storing a bot's files", () => {
  const png = () =>
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])], "pic.png", { type: "image/png" });

  function bucket(failOnPut = Infinity) {
    const stored = new Map<string, unknown>();
    let puts = 0;
    return {
      stored,
      put: vi.fn(async (key: string, value: unknown) => {
        puts += 1;
        if (puts >= failOnPut) throw new Error("storage hiccup");
        stored.set(key, value);
      }),
      delete: vi.fn(async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) stored.delete(key);
      }),
    };
  }

  afterEach(() => setBindings({}));

  it("checks every file before storing any, so a refused one leaves nothing behind", async () => {
    const uploads = bucket();
    setBindings({ UPLOADS: uploads as never });
    await expect(storeBotFiles([png(), new File([], "empty.png")], "bot:test")).rejects.toThrow(/empty/);
    expect(uploads.put).not.toHaveBeenCalled();
  });

  it("takes back the files already written when a later write fails", async () => {
    const uploads = bucket(2);
    setBindings({ UPLOADS: uploads as never });
    await expect(storeBotFiles([png(), png()], "bot:test")).rejects.toThrow(/hiccup/);
    expect(uploads.put).toHaveBeenCalledTimes(2);
    expect(uploads.delete).toHaveBeenCalledTimes(1);
    expect(uploads.stored.size).toBe(0);
  });

  it("stores them all when nothing goes wrong", async () => {
    const uploads = bucket();
    setBindings({ UPLOADS: uploads as never });
    const files = await storeBotFiles([png(), png()], "bot:test");
    expect(files).toHaveLength(2);
    expect(uploads.stored.size).toBe(2);
    expect(uploads.delete).not.toHaveBeenCalled();
  });
});
