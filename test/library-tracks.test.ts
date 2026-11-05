import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/musicbot", () => ({ botSession: vi.fn(async () => "cookie"), botFetch: vi.fn() }));

import { resolveTracks } from "@/lib/music";
import { botFetch } from "@/lib/musicbot";
import { isLibraryAudio } from "@/lib/protocol";
import { setBindings } from "@/lib/storage";

const LINK = "https://www.youtube.com/watch?v=lyn2QKgM7tI";
const library = {
  title: "Kaniyorduk", artist: "Redd", duration: 200, thumbnail: "https://i.ytimg.com/vi/lyn2QKgM7tI/hqdefault.jpg",
  page_url: LINK, resolve_query: LINK, library: "lyn2QKgM7tI", key: "8A",
};
const youtube = { title: "Other", artist: "Band", duration: 180, thumbnail: null, page_url: "https://y/2", resolve_query: "https://y/2", library: null };

const helper = vi.fn(async () => Response.json({ audio_url: "https://stream.example/a", title: "From YouTube" }));

beforeEach(() => {
  setBindings({} as never);
  helper.mockClear();
  vi.mocked(botFetch).mockReset();
  vi.stubGlobal("fetch", helper);
});

describe("a song the bot already has", () => {
  it("never asks YouTube for a stream", async () => {
    vi.mocked(botFetch).mockResolvedValue({ tracks: [library] });
    const [track] = await resolveTracks(LINK, "kiwi");
    expect(helper).not.toHaveBeenCalled();
    expect(track.audioUrl).toBe("library:lyn2QKgM7tI");
    expect(isLibraryAudio(track.audioUrl)).toBe(true);
  });

  it("keeps everything the player shows", async () => {
    vi.mocked(botFetch).mockResolvedValue({ tracks: [library] });
    const [track] = await resolveTracks(LINK, "kiwi");
    expect(track).toMatchObject({
      title: "Kaniyorduk", artist: "Redd", duration: 200, thumbnail: library.thumbnail, pageUrl: LINK, requestedBy: "kiwi", key: "8A",
    });
    expect(track.id).toBeTruthy();
  });

  it("keeps a way to find it on YouTube if the file has gone", async () => {
    vi.mocked(botFetch).mockResolvedValue({ tracks: [library] });
    const [track] = await resolveTracks(LINK, "kiwi");
    expect(track.query).toBe(LINK);
  });
});

describe("everything else", () => {
  it("still gets a stream", async () => {
    vi.mocked(botFetch).mockResolvedValue({ tracks: [youtube] });
    const [track] = await resolveTracks("other", "kiwi");
    expect(helper).toHaveBeenCalledTimes(1);
    expect(track.audioUrl).toBe("https://stream.example/a");
    expect(isLibraryAudio(track.audioUrl)).toBe(false);
  });

  it("looks up only the songs it must, in order, in a playlist", async () => {
    vi.mocked(botFetch).mockResolvedValue({ tracks: [library, youtube, library] });
    const tracks = await resolveTracks("playlist", "kiwi");
    expect(helper).toHaveBeenCalledTimes(1);
    expect(tracks.map((track) => track.title)).toEqual(["Kaniyorduk", "Other", "Kaniyorduk"]);
  });

  it("plays from YouTube when the bot is down", async () => {
    vi.mocked(botFetch).mockRejectedValue(new Error("bot offline"));
    const [track] = await resolveTracks("anything", "kiwi");
    expect(track.audioUrl).toBe("https://stream.example/a");
  });
});

it("treats nothing else as a library song", () => {
  for (const url of ["", null, undefined, "https://stream.example/library:x"]) expect(isLibraryAudio(url)).toBe(false);
});
