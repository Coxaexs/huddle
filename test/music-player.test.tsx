// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
  // The card's lines show at once; only the saved lyrics are read again, for their timed words.
  expect(calls("/api/music/lyrics")).toEqual(["/api/music/lyrics?voiceChannelId=room-1"]);
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

it("None of lrclib's? Ask Musixmatch, then use its answer", async () => {
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/music/lyrics/pick") && !init) {
      return { trackId: "t1", query: "Redd Kanıyorduk", candidates: [{ id: 11, track: "Wrong", artist: "x", album: null, duration: 100, synced: true, snippet: ["nope"], url: "https://lrclib.net/tracks/11" }],
        musixmatch: { track: "Kanıyorduk", artist: "Redd", answered: false, candidate: null, left: 296 } };
    }
    if (path === "/api/music/lyrics/pick") {
      const body = JSON.parse(init!.body as string);
      if (body.action === "ask-musixmatch") {
        return { trackId: "t1", musixmatch: { track: "Kanıyorduk", artist: "Redd", answered: true, left: 295,
          candidate: { track: "Kanıyorduk", artist: "Redd", duration: 300, synced: true, snippet: ["Resmini buldum"], url: "https://www.musixmatch.com/lyrics/Redd/Kan%C4%B1yorduk" } } };
      }
      return { trackId: "t1", lines: [[19.9, "Resmini buldum yıllar sonra"]], source: "musixmatch", sourceUrl: "https://www.musixmatch.com/lyrics/Redd/Kan%C4%B1yorduk", picked: true };
    }
    return path.startsWith("/api/music/playlists") ? PLAYLISTS : {};
  });
  show();
  act(() => openMusicPlayer({ channelId: room, tab: "lyrics", fix: true }));
  fireEvent.click(await screen.findByText("Ask Musixmatch for “Kanıyorduk” by Redd"));
  expect(await screen.findByText("Resmini buldum")).toBeTruthy();
  expect(screen.getByText("See them on Musixmatch").getAttribute("href")).toBe("https://www.musixmatch.com/lyrics/Redd/Kan%C4%B1yorduk");
  fireEvent.click(screen.getAllByText("Use these")[1]);
  expect(await screen.findByText("Resmini buldum yıllar sonra")).toBeTruthy();
  const bodies = apiFetch.mock.calls.filter(([path, init]) => path === "/api/music/lyrics/pick" && init).map(([, init]) => JSON.parse(init.body));
  expect(bodies[0]).toEqual({ voiceChannelId: room, trackId: "t1", action: "ask-musixmatch", q: "Redd Kanıyorduk" });
  expect(bodies[1]).toEqual({ voiceChannelId: room, trackId: "t1", musixmatch: { track: "Kanıyorduk", artist: "Redd" } });
});

it("an answer Musixmatch already gave shows for free, and a used-up plan says so", async () => {
  let left = 296;
  apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/music/lyrics/pick")) {
      return { trackId: "t1", query: "q", candidates: [],
        musixmatch: left
          ? { track: "Kanıyorduk", artist: "Redd", answered: true, left, candidate: { track: "Kanıyorduk", artist: "Redd", duration: null, synced: true, snippet: ["Saved line"], url: "https://www.musixmatch.com/lyrics/Redd/K" } }
          : { track: "Kanıyorduk", artist: "Redd", answered: false, left: 0, candidate: null } };
    }
    return path.startsWith("/api/music/playlists") ? PLAYLISTS : {};
  });
  show();
  act(() => openMusicPlayer({ channelId: room, tab: "lyrics", fix: true }));
  expect(await screen.findByText("Saved line")).toBeTruthy();
  expect(screen.queryByText(/Ask Musixmatch/)).toBeNull();
  left = 0;
  fireEvent.submit(screen.getAllByRole("search").at(-1)!);
  expect(await screen.findByText(/lookups are used up/)).toBeTruthy();
});

const MINE = {
  playlists: [
    { ...PLAYLISTS.playlists[0], canEdit: true },
    { name: "Not mine", count: 1, cover: null, description: null, auto: false, canEdit: false, tracks: [] },
  ],
};
const NONE_MINE = { playlists: [MINE.playlists[1]] };

function playlistPosts(): Array<Record<string, unknown>> {
  return apiFetch.mock.calls
    .filter(([path, init]) => path === "/api/music/playlists" && (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

/** The bot's answers: `posts` by action, and `lists` for the plain read. */
function playlistBot(lists: unknown, posts: Record<string, (body: Record<string, unknown>) => unknown> = {}) {
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (!path.startsWith("/api/music/playlists")) return {};
    if (init?.method !== "POST") return lists;
    const body = JSON.parse(init.body as string);
    return posts[body.action]?.(body) ?? lists;
  });
}

it("adds the playing song to a playlist you may change, and offers only those", async () => {
  state.track = track("t1", "Mayın Tarlası", { pageUrl: "https://www.youtube.com/watch?v=abcdefghijk" });
  playlistBot(MINE, { add_song: () => ({ ...MINE, message: "Added 1 song to Road trip." }) });
  show();
  act(() => openMusicPlayer());
  fireEvent.click(await screen.findByText("Add to playlist"));
  const sheet = await screen.findByRole("dialog", { name: "Add Mayın Tarlası to a playlist" });
  expect(await within(sheet).findByText("Road trip")).toBeTruthy();
  expect(within(sheet).queryByText("Not mine")).toBeNull();

  fireEvent.click(within(sheet).getByText("Road trip"));
  expect(await screen.findByText("Added 1 song to Road trip.")).toBeTruthy();
  expect(playlistPosts()).toEqual([{
    voiceChannelId: room,
    action: "add_song",
    name: "Road trip",
    query: "https://www.youtube.com/watch?v=abcdefghijk",
  }]);
  expect(screen.queryByRole("dialog", { name: /to a playlist/ })).toBeNull();
});

it("a song from anywhere else is found by its name", async () => {
  state.track = track("t1", "Mayın Tarlası", { pageUrl: "https://soundcloud.com/x/y" });
  playlistBot(MINE);
  show();
  act(() => openMusicPlayer());
  fireEvent.click(await screen.findByText("Add to playlist"));
  fireEvent.click(await within(await screen.findByRole("dialog", { name: /to a playlist/ })).findByText("Road trip"));
  await waitFor(() => expect(playlistPosts()[0]?.query).toBe("Şebnem Ferah Mayın Tarlası"));
});

it("a search result goes into a playlist without being in the room", async () => {
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/music/search")) {
      return { results: [{ title: "Zehir", artist: "manifest", duration: 201, thumbnail: null, url: "https://www.youtube.com/watch?v=abcdefghijk" }] };
    }
    return path.startsWith("/api/music/playlists") ? { ...MINE, message: init?.method === "POST" ? "Added 1 song to Road trip." : undefined } : {};
  });
  show({ voiceChannelId: null });
  act(() => openMusicPlayer({ seed, tab: "search" }));
  fireEvent.change(screen.getByLabelText("Search for music"), { target: { value: "manifest zehir" } });
  fireEvent.submit(screen.getByRole("search"));
  fireEvent.click(await screen.findByLabelText("Add Zehir to a playlist"));
  fireEvent.click(await within(await screen.findByRole("dialog", { name: /to a playlist/ })).findByText("Road trip"));
  await waitFor(() =>
    expect(playlistPosts()).toEqual([{
      voiceChannelId: room,
      action: "add_song",
      name: "Road trip",
      query: "https://www.youtube.com/watch?v=abcdefghijk",
    }]),
  );
});

it("with no playlists of your own it says so, and a new one takes the song", async () => {
  const made = { playlists: [...NONE_MINE.playlists, { ...MINE.playlists[0], name: "Gece", count: 0 }] };
  playlistBot(NONE_MINE, {
    create: () => ({ ...made, message: "Created Gece.", name: "Gece" }),
    add_song: () => ({ ...made, message: "Added 1 song to Gece." }),
  });
  show();
  act(() => openMusicPlayer());
  fireEvent.click(await screen.findByText("Add to playlist"));
  expect(await screen.findByText("You can add songs to playlists you made. Make one here.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("New playlist name"), { target: { value: "Gece" } });
  fireEvent.click(screen.getByText("Create"));
  expect(await screen.findByText("Added 1 song to Gece.")).toBeTruthy();
  expect(playlistPosts().map((post) => [post.action, post.name])).toEqual([["create", "Gece"], ["add_song", "Gece"]]);
});

it("if the song fails after the list is made, the list is there to try again", async () => {
  const made = { playlists: [{ ...MINE.playlists[0], name: "Gece", count: 0 }] };
  let tries = 0;
  playlistBot({ playlists: [] }, {
    create: () => ({ ...made, message: "Created Gece.", name: "Gece" }),
    add_song: () => {
      tries += 1;
      if (tries === 1) throw new Error("No songs found.");
      return { ...made, message: "Added 1 song to Gece." };
    },
  });
  show();
  act(() => openMusicPlayer());
  fireEvent.click(await screen.findByText("Add to playlist"));
  await screen.findByText("You can add songs to playlists you made. Make one here.");
  fireEvent.change(screen.getByLabelText("New playlist name"), { target: { value: "Gece" } });
  fireEvent.click(screen.getByText("Create"));
  expect(await screen.findByText("No songs found.")).toBeTruthy();
  fireEvent.click(within(screen.getByRole("dialog", { name: /to a playlist/ })).getByText("Gece"));
  expect(await screen.findByText("Added 1 song to Gece.")).toBeTruthy();
  expect(playlistPosts().filter((post) => post.action === "create")).toHaveLength(1);
});

it("the bot's refusal stays on screen, with the sheet open", async () => {
  playlistBot(MINE, { add_song: () => { throw new Error("Only an admin or whoever made Road trip can change it."); } });
  show();
  act(() => openMusicPlayer());
  fireEvent.click(await screen.findByText("Add to playlist"));
  fireEvent.click(await within(await screen.findByRole("dialog", { name: /to a playlist/ })).findByText("Road trip"));
  expect(await screen.findByText("Only an admin or whoever made Road trip can change it.")).toBeTruthy();
  expect(screen.getByRole("dialog", { name: /to a playlist/ })).toBeTruthy();
});

it("makes an empty playlist from the Playlists tab and opens it", async () => {
  const made = { playlists: [...MINE.playlists, { ...MINE.playlists[0], name: "Gece", count: 0, tracks: [] }] };
  playlistBot(MINE, { create: () => ({ ...made, message: "Created Gece.", name: "Gece" }) });
  show();
  act(() => openMusicPlayer({ tab: "playlists" }));
  fireEvent.click(await screen.findByText("New playlist"));
  fireEvent.change(await screen.findByLabelText("New playlist name"), { target: { value: "Gece" } });
  fireEvent.click(screen.getByText("Create"));
  expect(await screen.findByText("Nothing in here yet")).toBeTruthy();
  expect(playlistPosts()).toEqual([{ voiceChannelId: room, action: "create", name: "Gece" }]);
  fireEvent.click(screen.getByText("Find songs"));
  await waitFor(() => expect(document.getElementById("mp-pane-search")?.hidden).toBe(false));
});

it("a room with no playlists offers to make the first one", async () => {
  playlistBot({ playlists: [] });
  show();
  act(() => openMusicPlayer({ tab: "playlists" }));
  expect(await screen.findByText("No playlists yet")).toBeTruthy();
  fireEvent.click(screen.getByText("New playlist"));
  expect(await screen.findByRole("dialog", { name: "New playlist" })).toBeTruthy();
});

it("a playlist you can't change has nothing to add with", async () => {
  playlistBot(MINE);
  show();
  act(() => openMusicPlayer({ tab: "playlists" }));
  fireEvent.click(await screen.findByText("Not mine"));
  expect(await screen.findByLabelText("All playlists")).toBeTruthy();
  expect(screen.queryByLabelText("Find songs to add")).toBeNull();
  fireEvent.click(screen.getByLabelText("All playlists"));
  fireEvent.click(await screen.findByText("Road trip"));
  expect(await screen.findByLabelText("Find songs to add")).toBeTruthy();
});

it("Escape closes the sheet and leaves the player open, and space stays out of it", async () => {
  playlistBot(MINE);
  show();
  act(() => openMusicPlayer());
  const opener = await screen.findByText("Add to playlist");
  opener.focus();
  fireEvent.click(opener);
  await screen.findByRole("dialog", { name: /to a playlist/ });
  fireEvent.keyDown(window, { key: " " });
  expect(commands()).toEqual([]);
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: /to a playlist/ })).toBeNull());
  expect(screen.getByText("Add to playlist")).toBeTruthy();
  expect(document.activeElement).toBe(opener);
});

it("sings the line word by word once its words are timed", async () => {
  // At 33 s: "Line 4" (from 31 s) is sung; its words are at 31.0, 32.0 and 33.5 s.
  apiFetch.mockImplementation(async (path: string) =>
    path.startsWith("/api/music/lyrics")
      ? {
          trackId: "t1",
          lines: seed.lines.map(({ at, line }) => [at, line]),
          words: seed.lines.map((_, n) =>
            n === 3
              ? [[31.2, 31.8, "Four", [100, 200, 400, 600]], [32.0, 34.0, "and", [100, 1800, 2000]], [33.5, 34.0, "more", []]]
              : [],
          ),
        }
      : path.startsWith("/api/music/playlists") ? PLAYLISTS : {},
  );
  show();
  act(() => openMusicPlayer({ channelId: room, tab: "lyrics" }));
  const line = await screen.findByRole("button", { name: "Line 4" });
  await waitFor(() => expect(line.querySelectorAll(".mp-word").length).toBe(3));
  const [four, and, more] = Array.from(line.querySelectorAll<HTMLElement>(".mp-word"));
  expect(four.textContent).toBe("Four");
  // The line starts where its first word is sung, not where the lyrics site put it.
  expect(line.getAttribute("title")).toBe("Play from 0:31");
  expect(Number(four.style.getPropertyValue("--fill"))).toBe(1);
  expect(four.classList.contains("sung")).toBe(true);
  // "and" holds its long vowel: one second in, the fill is still on its second letter.
  const fill = Number(and.style.getPropertyValue("--fill"));
  expect(fill).toBeGreaterThan(0.33);
  expect(fill).toBeLessThan(0.67);
  expect(Number(more.style.getPropertyValue("--fill"))).toBe(0);
});

it("marks search results whose lyrics light up word by word", async () => {
  apiFetch.mockImplementation(async (path: string) =>
    path.startsWith("/api/music/search")
      ? {
          results: [
            { title: "Zehir", artist: "manifest", duration: 201, thumbnail: null, url: "https://www.youtube.com/watch?v=abcdefghijk", words: true },
            { title: "Zehir (live)", artist: "someone", duration: 240, thumbnail: null, url: "https://www.youtube.com/watch?v=bcdefghijkl" },
          ],
        }
      : path.startsWith("/api/music/playlists") ? PLAYLISTS : {},
  );
  show();
  act(() => openMusicPlayer({ seed, tab: "search" }));
  fireEvent.change(screen.getByLabelText("Search for music"), { target: { value: "manifest zehir" } });
  fireEvent.submit(screen.getByRole("search"));
  expect(await screen.findByText("Zehir (live)")).toBeTruthy();
  expect(screen.getAllByRole("img", { name: "Lyrics light up word by word" })).toHaveLength(1);
  expect(screen.getByText("Zehir").closest("li")!.querySelector(".mp-words-mark")).toBeTruthy();
});

it("borrows word timing from another version of the song", async () => {
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/music/lyrics/words") {
      const body = JSON.parse(String(init?.body));
      return body.action === "donors"
        ? { donors: [{ id: "abc", title: "Şebnem Ferah - Mayın Tarlası (album)", duration: 241, match: 0.94 }] }
        : { words: [] };
    }
    if (path.startsWith("/api/music/lyrics")) return { trackId: "t1", lines: seed.lines.map(({ at, line }) => [at, line]) };
    return path.startsWith("/api/music/playlists") ? PLAYLISTS : {};
  });
  show();
  act(() => openMusicPlayer({ channelId: room, tab: "lyrics" }));
  fireEvent.click(await screen.findByText("Word by word…"));
  expect(await screen.findByText("94% of the words match")).toBeTruthy();
  fireEvent.click(screen.getByText("Use this"));
  await waitFor(() => {
    const sent = apiFetch.mock.calls.filter(([path]) => path === "/api/music/lyrics/words").map(([, init]) => JSON.parse(String(init.body)));
    expect(sent.at(-1)).toEqual({ voiceChannelId: room, trackId: "t1", action: "borrow", from: "abc" });
  });
  expect(await screen.findByText(/Word timing from Şebnem Ferah/)).toBeTruthy();
});
