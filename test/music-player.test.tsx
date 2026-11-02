// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/app/lib/client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { MusicPlayerLayer, closeMusicPlayer, openMusicPlayer } from "@/app/components/music-player";
import type { PlayerState, Track } from "@/lib/protocol";

function track(id: string, title: string, extra: Partial<Track> = {}): Track {
  return {
    id,
    title,
    artist: "Şebnem Ferah",
    thumbnail: null,
    duration: 300,
    audioUrl: "",
    pageUrl: null,
    requestedBy: "mewis",
    ...extra,
  };
}

const room = "room-1";
let state: PlayerState;
const onSeek = vi.fn();
const joinVoice = vi.fn();

function show(props: { voiceChannelId?: string | null } = {}) {
  return render(
    <MusicPlayerLayer
      players={{ [room]: state }}
      voiceChannelId={props.voiceChannelId === undefined ? room : props.voiceChannelId}
      voiceRooms={[{ id: room, name: "Lounge" }]}
      position={33_000}
      onSeek={onSeek}
      joinVoice={joinVoice}
      volume={80}
      onVolume={() => {}}
    />,
  );
}

const seed = {
  trackId: "t1",
  lines: [5, 12, 20, 31, 40, 52].map((at, n) => ({ at, line: `Line ${n + 1}` })),
};

beforeEach(() => {
  state = {
    channelId: room,
    track: track("t1", "Mayın Tarlası"),
    queue: [track("t2", "Paramparça"), track("t3", "Sigara")],
    history: [],
    paused: false,
    positionMs: 33_000,
    updatedAt: Date.now(),
    volume: 100,
    loop: "off",
  };
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string) => (path.startsWith("/api/music/playlists") ? PLAYLISTS : {}));
  onSeek.mockReset();
  joinVoice.mockReset();
});

afterEach(() => {
  act(() => closeMusicPlayer());
  cleanup();
  localStorage.clear();
});

const PLAYLISTS = {
  playlists: [{
    name: "Road trip", count: 2, cover: null, description: null, auto: false,
    tracks: [{ title: "Song A", duration: "3:10", thumbnail: null }, { title: "Song B", duration: null, thumbnail: null }],
  }],
};

function calls(prefix: string): string[] {
  return apiFetch.mock.calls.map(([path]) => path as string).filter((path) => path.startsWith(prefix));
}

function commands(): string[] {
  return apiFetch.mock.calls
    .filter(([path]) => path === "/api/music/command")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string).command);
}

it("opens from a lyrics card with its lines, and a click jumps the room there", () => {
  show();
  act(() => openMusicPlayer({ channelId: room, seed }));
  expect(screen.getByRole("dialog", { name: "Music player" })).toBeTruthy();
  expect(screen.getByText("Playing in")).toBeTruthy();
  // The card's lines are reused: no lookup.
  expect(calls("/api/music/lyrics")).toEqual([]);
  expect(screen.getByText("Line 4").getAttribute("aria-current")).toBe("true");

  fireEvent.click(screen.getByText("Line 6"));
  expect(onSeek).toHaveBeenCalledWith(room, 52_000);
  // The card's lyrics came from lrclib (it names no source).
  expect(screen.getByRole("link", { name: "LRCLIB" }).getAttribute("href")).toBe("https://lrclib.net/");
});

it("shows saved lyrics only, and searches when someone asks", async () => {
  apiFetch.mockImplementation(async (path: string) =>
    path.startsWith("/api/music/playlists")
      ? PLAYLISTS
      : path.endsWith("&find=1")
        ? { trackId: "t1", lines: [[10, "Found it"]], source: "musixmatch", sourceUrl: "https://www.musixmatch.com/lyrics/x/y", musixmatchChecked: true }
        : { trackId: "t1", lines: [], lyrics: null, musixmatchChecked: false },
  );
  show();
  act(() => openMusicPlayer());
  expect(await screen.findByText("Want the lyrics?")).toBeTruthy();
  expect(calls("/api/music/lyrics")).toEqual(["/api/music/lyrics?voiceChannelId=room-1"]);

  fireEvent.click(screen.getByText("Search for lyrics"));
  expect(await screen.findByText("Found it")).toBeTruthy();
  expect(calls("/api/music/lyrics")[1]).toBe("/api/music/lyrics?voiceChannelId=room-1&find=1");
  expect(screen.getByRole("link", { name: "Musixmatch" }).getAttribute("href")).toBe("https://www.musixmatch.com/lyrics/x/y");
});

it("plays, skips and jumps the queue through the room's music commands", async () => {
  apiFetch.mockResolvedValue({});
  show();
  act(() => openMusicPlayer({ seed, tab: "queue" }));
  fireEvent.click(screen.getByLabelText("Pause"));
  await waitFor(() => expect(commands()).toEqual(["/pause"]));
  // Transport buttons rest while a command is on its way.
  await waitFor(() => expect((screen.getByLabelText("Skip") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByLabelText("Skip"));
  await waitFor(() => expect(commands()).toContain("/skip"));
  fireEvent.click(screen.getByText("Sigara"));
  await waitFor(() => expect(commands()).toContain("/skipto 2"));
  fireEvent.click(screen.getByLabelText("Remove Paramparça from the queue"));
  await waitFor(() => expect(commands()).toContain("/remove 1"));
  const body = JSON.parse(apiFetch.mock.calls.find(([path]) => path === "/api/music/command")![1].body);
  expect(body).toMatchObject({ voiceChannelId: room, textChannelId: null, silent: true });
});

it("searches and queues a pick to play next", async () => {
  apiFetch.mockImplementation(async (path: string) =>
    path.startsWith("/api/music/search")
      ? { results: [{ title: "Zehir", artist: "manifest", duration: 201, thumbnail: null, url: "https://www.youtube.com/watch?v=abcdefghijk" }] }
      : path.startsWith("/api/music/playlists")
        ? PLAYLISTS
        : { text: "Queued Zehir (#1 in line)." },
  );
  show();
  act(() => openMusicPlayer({ seed, tab: "search" }));
  fireEvent.change(screen.getByLabelText("Search for music"), { target: { value: "manifest zehir" } });
  fireEvent.submit(screen.getByRole("search"));
  expect(await screen.findByText("Zehir")).toBeTruthy();
  expect(calls("/api/music/search")).toEqual(["/api/music/search?q=manifest+zehir"]);
  fireEvent.click(screen.getByText("Next"));
  await waitFor(() => expect(commands()).toEqual(["/playnext https://www.youtube.com/watch?v=abcdefghijk"]));
  expect(await screen.findByText("Plays next")).toBeTruthy();
});

it("browses the room's playlists and plays one from a chosen song", async () => {
  apiFetch.mockImplementation(async (_path: string, init?: RequestInit) =>
    init?.method === "POST" ? { message: "Playing Road trip from Song B." } : PLAYLISTS,
  );
  show();
  act(() => openMusicPlayer({ seed, tab: "playlists" }));
  fireEvent.click(await screen.findByText("Road trip"));
  fireEvent.click(screen.getByText("Song B"));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith("/api/music/playlists", expect.objectContaining({ method: "POST" })),
  );
  const post = apiFetch.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(post[1].body)).toEqual({
    voiceChannelId: room, name: "Road trip", mode: "play", start: 1, startTitle: "Song B",
  });
  expect(await screen.findByText("Playing Road trip from Song B.")).toBeTruthy();
});

it("someone outside the room can watch along and is offered to join", () => {
  show({ voiceChannelId: null });
  act(() => openMusicPlayer({ channelId: room, seed }));
  expect(screen.getByText("Line 1").tagName).toBe("P");
  expect((screen.getByLabelText("Pause") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText("Join Lounge to listen and control"));
  expect(joinVoice).toHaveBeenCalledWith(room);
});

it("Escape closes it", () => {
  show();
  act(() => openMusicPlayer({ seed }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Music player" })).toBeNull();
});

it("runs a simple DJ set: start, mix into the next song, settings", async () => {
  const off = { active: false, paused: false, decks: {}, master: null, mix: null, auto: { on: false, mode: "real", vibe: "club", autoplay: true }, crate: [], notice: null };
  const on = {
    ...off,
    active: true,
    master: "A",
    auto: { on: true, mode: "auto", vibe: "hype", autoplay: true },
    decks: {
      A: { name: "A", loaded: true, loading: null, title: "Zehir", artist: "manifest", thumbnail: null, playing: true, bpm: 98, key: "8A" },
      B: { name: "B", loaded: false, loading: null, title: null, artist: null, thumbnail: null, playing: false, bpm: null, key: null },
    },
    crate: [{ title: "Geceler", artist: "Ezhel" }],
    notice: "Queued 6 stemmed songs for tonight",
  };
  let booth: Record<string, unknown> = off;
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/music/club")) {
      if (init?.method === "POST") booth = on;
      return booth;
    }
    if (path === "/api/music/command") {
      const command = JSON.parse(init!.body as string).command as string;
      return { state: { automix: command !== "/automix off", autoplay: false, radio: null, radio_stations: [{ id: "chill", label: "Chill", emoji: "😌", songs: 40 }] } };
    }
    return path.startsWith("/api/music/playlists") ? PLAYLISTS : {};
  });
  show();
  act(() => openMusicPlayer({ seed, tab: "dj" }));
  fireEvent.click(await screen.findByText("Auto DJ"));
  fireEvent.click(screen.getByText("Hype"));
  fireEvent.click(screen.getByText("Start the set"));
  expect(await screen.findByText("On air")).toBeTruthy();
  const start = apiFetch.mock.calls.find(([path, init]) => path === "/api/music/club" && init?.method === "POST")!;
  expect(JSON.parse(start[1].body)).toEqual({ voiceChannelId: room, op: "club", mode: "auto", vibe: "hype" });
  expect(screen.getByText("98 BPM", { exact: false })).toBeTruthy();
  expect(screen.getByText("Queued 6 stemmed songs for tonight")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Next transition"), { target: { value: "spinback" } });
  fireEvent.click(screen.getByText("Mix into the next song"));
  await waitFor(() =>
    expect(apiFetch.mock.calls.some(([path, init]) => path === "/api/music/club" && init?.body?.includes('"op":"skip"') && init.body.includes('"style":"spinback"'))).toBe(true),
  );

  // Between songs: the room's AutoMix setting, read without spending a chat message.
  await waitFor(() => expect(screen.getByText("AutoMix").closest("button")?.getAttribute("aria-pressed")).toBe("true"));
  fireEvent.click(screen.getByText("AutoMix"));
  await waitFor(() => expect(commands()).toEqual(["/settings", "/automix off"]));
});

function pickerRoutes(path: string, init?: RequestInit) {
  if (path.startsWith("/api/music/lyrics/pick")) {
    if (init?.method === "POST") {
      return { trackId: "t1", lines: [[3, "The right words"]], source: "lrclib", sourceUrl: "https://lrclib.net/tracks/12", picked: true };
    }
    return {
      trackId: "t1",
      query: "Şebnem Ferah Mayın Tarlası",
      candidates: [
        { id: 11, track: "Mayın Tarlası (Live)", artist: "Şebnem Ferah", album: "10 Mart", duration: 448, synced: true, snippet: ["Wrong one"], url: "https://lrclib.net/tracks/11" },
        { id: 12, track: "Mayın Tarlası", artist: "Şebnem Ferah", album: "Kelimeler", duration: 300, synced: true, snippet: ["Mayın tarlasında dolaşıp durmuşum", "Herkes arkamdan bağırmış"], url: "https://lrclib.net/tracks/12" },
      ],
    };
  }
  return path.startsWith("/api/music/playlists") ? PLAYLISTS : { trackId: "t1", lines: [] };
}

it("Wrong lyrics? lists songs with that name and saves the pick", async () => {
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => pickerRoutes(path, init));
  show();
  act(() => openMusicPlayer({ channelId: room, seed }));
  fireEvent.click(screen.getByText("Wrong lyrics?"));
  expect(await screen.findByText("Herkes arkamdan bağırmış")).toBeTruthy();
  expect((screen.getByLabelText("Search lyrics by song and artist") as HTMLInputElement).value).toBe("Şebnem Ferah Mayın Tarlası");
  expect(screen.getAllByText("Same length")).toHaveLength(1);

  fireEvent.click(screen.getAllByText("Use these")[1]);
  expect(await screen.findByText("The right words")).toBeTruthy();
  const pick = apiFetch.mock.calls.find(([path, init]) => path === "/api/music/lyrics/pick" && init?.method === "POST")!;
  expect(JSON.parse(pick[1].body)).toEqual({ voiceChannelId: room, trackId: "t1", lrclibId: 12 });
  expect(screen.getByText(/these lyrics show for this song in this server/)).toBeTruthy();
});

it("the card's Wrong lyrics? opens the player straight on the picker", async () => {
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => pickerRoutes(path, init));
  show();
  act(() => openMusicPlayer({ channelId: room, tab: "lyrics", fix: true }));
  expect(await screen.findByText("Pick the right lyrics")).toBeTruthy();
  expect(await screen.findByText("Wrong one")).toBeTruthy();
});

it("says so when the lyrics site is down, and Try again searches again", async () => {
  let down = true;
  apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/music/playlists")) return PLAYLISTS;
    if (path.endsWith("&find=1")) {
      return down ? { trackId: "t1", lines: [], unavailable: true } : { trackId: "t1", lines: [[2, "Back up"]], source: "lrclib" };
    }
    return { trackId: "t1", lines: [] };
  });
  show();
  act(() => openMusicPlayer());
  fireEvent.click(await screen.findByText("Search for lyrics"));
  expect(await screen.findByText(/didn't answer just now/)).toBeTruthy();
  down = false;
  fireEvent.click(screen.getByText("Try again"));
  expect(await screen.findByText("Back up")).toBeTruthy();
  expect(calls("/api/music/lyrics").filter((path) => path.endsWith("&find=1"))).toHaveLength(2);
});
