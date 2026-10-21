import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Last.fm now-playing: one upstream call per user per 20 s, shared by tabs.

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/storage", () => ({ bindings: () => ({ LASTFM_API_KEY: "k" }) }));
vi.mock("@/lib/auth", () => ({
  currentUser: vi.fn(async () => ({ id: "u1" })),
  unauthorized: () => new Response("no", { status: 401 }),
}));

import { GET, resetNowPlayingCache } from "@/app/api/(features)/integrations/spotify/route";
import { claimLastFmPoll } from "@/app/hooks/use-activity-detector";

const track = {
  recenttracks: {
    track: [{ name: "Borderline", artist: { "#text": "Tame Impala" }, image: [], "@attr": { nowplaying: "true" } }],
  },
};

function ask(username: string) {
  return GET(new Request(`http://x/api/integrations/spotify?username=${username}`));
}

describe("Last.fm now-playing cache", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    resetNowPlayingCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(track)));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("answers repeat and simultaneous polls from one call for 20 s", async () => {
    const [a, b] = await Promise.all([ask("Coxaexs"), ask("coxaexs")]);
    expect(await a.json()).toMatchObject({ song: "Borderline", artist: "Tame Impala", isPlaying: true });
    expect(((await b.json()) as { song: string }).song).toBe("Borderline");
    await ask("Coxaexs");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(20_000);
    await ask("Coxaexs");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps users apart", async () => {
    await ask("one");
    await ask("two");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes Last.fm errors through", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ message: "User not found" }), { status: 404 }));
    expect(await (await ask("ghost")).json()).toMatchObject({ error: "User not found", song: null });
  });
});

describe("one Last.fm check per browser", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lets one tab check per 12 s", () => {
    expect(claimLastFmPoll(1_000_000)).toBe(true);
    expect(claimLastFmPoll(1_005_000)).toBe(false);
    expect(claimLastFmPoll(1_012_000)).toBe(true);
  });

  it("does not trust a timestamp from the future", () => {
    expect(claimLastFmPoll(2_000_000)).toBe(true);
    expect(claimLastFmPoll(1_000_000)).toBe(true);
  });

  it("checks anyway when storage is unavailable", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
      },
    });
    expect(claimLastFmPoll(1_000_000)).toBe(true);
  });
});
