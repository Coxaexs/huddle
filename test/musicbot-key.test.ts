import { afterEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { botFetch, botSession } from "@/lib/musicbot";

function reply(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers });
}

afterEach(() => vi.unstubAllGlobals());

describe("calling the music bot", () => {
  it("uses the bot key and never logs in when the key is set", async () => {
    setBindings({ MUSICWATCH_BASE_URL: "http://bot", MUSICWATCH_BOT_KEY: "the-key", MUSICWATCH_PASSWORD: "pw" } as never);
    const fetchMock = vi.fn(async () => reply({ guilds: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await botFetch("/api/guilds", await botSession());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://bot/api/guilds");
    expect(init.headers).toMatchObject({ Authorization: "Bearer the-key" });
    expect(init.headers).not.toHaveProperty("Cookie");
  });

  it("still logs in with the password until a key is set", async () => {
    setBindings({ MUSICWATCH_BASE_URL: "http://bot", MUSICWATCH_PASSWORD: "pw" } as never);
    const fetchMock = vi.fn(async (url: URL) =>
      String(url).endsWith("/api/session") ? reply({}, { "set-cookie": "mb_session=abc; Path=/" }) : reply({ guilds: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await botFetch("/api/guilds", await botSession());

    const [, init] = fetchMock.mock.calls[1] as unknown as [URL, RequestInit];
    expect(init.headers).toMatchObject({ Cookie: "mb_session=abc" });
    expect(init.headers).not.toHaveProperty("Authorization");
  });
});
