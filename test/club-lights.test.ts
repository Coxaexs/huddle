import { describe, expect, it } from "vitest";
import { CLUB_FRAME_MS, cleanClubBatch, decodeBars, decodeFrames, decodeNotes, readNote, type ClubBatch, type ClubSongMap } from "@/lib/club-feed";
import { ClubLights, MIN_FLASH_GAP_MS, NOTE_STEP, SOUND_DELAY_MS, TIER_OPEN, moodName } from "@/app/lib/club-lights";
import { DEFAULT_DESK, HOLD_MAX_MS, fifths, keyHue, keyMiddle } from "@/lib/club-desk";

const encode = (frames: number[][]) =>
  btoa(String.fromCharCode(...frames.flatMap((frame) => frame.map((v) => Math.round(v * 255)))));

/** A clock the test moves, and lights that read it. */
function rig(options: { nudge?: number; strobes?: boolean } = {}) {
  const clock = { now: 0 };
  const lights = new ClubLights(() => clock.now, () => options.nudge ?? 0, () => options.strobes ?? true);
  return { clock, lights };
}

/** Feed `seconds` of music from `from` (bot clock): a kick on every beat at `bpm`, unless `kick` says no. */
function feed(lights: ClubLights, from: number, seconds: number, opts: { bpm?: number; kick?: (t: number) => boolean; level?: number; beatAt?: number } = {}) {
  const bpm = opts.bpm ?? 120;
  const beatMs = 60_000 / bpm;
  for (let start = 0; start < seconds * 1000; start += 80) {
    const frames: number[][] = [];
    for (let i = 0; i < 4; i++) {
      const t = start + i * CLUB_FRAME_MS;
      const since = t % beatMs;
      const kicking = opts.kick ? opts.kick(t) : true;
      frames.push([kicking && since < 60 ? 0.95 : 0.02, 0.1, 0.5, 0.3, 0.4, opts.level ?? 0.6]);
    }
    lights.push({ at: from + start, f: encode(frames), b: (opts.beatAt ?? 0) + start / beatMs, bpm, stems: true });
  }
}

/** Steps the show through bot time a..b, a frame at a time, collecting samples. */
function play(clock: { now: number }, lights: ClubLights, from: number, to: number, nudge = 0) {
  const shows = [];
  for (let t = from; t < to; t += 16) {
    clock.now = t + SOUND_DELAY_MS + nudge;
    shows.push({ t, show: lights.sample() });
  }
  return shows;
}

describe("the club feed on the wire", () => {
  it("keeps a clean batch and drops junk", () => {
    expect(cleanClubBatch(null)).toBeNull();
    expect(cleanClubBatch({ at: "x", f: "" })).toBeNull();
    expect(cleanClubBatch({ at: 1, f: "<script>" })).toBeNull();
    expect(cleanClubBatch({ at: 1, f: "A".repeat(5000) })).toBeNull();
    const batch = cleanClubBatch({
      at: 1000.4, f: encode([[1, 0, 0, 0, 0, 1]]), b: 12.34567, bpm: 999, stems: true, extra: "no",
      ev: [{ k: "drop", at: 2000 }, { k: "nope", at: 1 }, { k: "sample", at: 3000, name: "horn" }, { k: "sample", at: 3000, name: "<b>" }],
      info: { mode: "real", vibe: "club", mix: { style: "Mashup", progress: 3 }, next: "  Next song ", key: "8A", paused: "yes" },
    });
    expect(batch).toEqual({
      at: 1000, f: encode([[1, 0, 0, 0, 0, 1]]), b: 12.346, stems: true,
      ev: [{ k: "drop", at: 2000 }, { k: "sample", at: 3000, name: "horn" }, { k: "sample", at: 3000 }],
      info: { mode: "real", vibe: "club", mix: { style: "Mashup", progress: 1 }, next: "Next song", key: "8A", paused: false },
    });
    expect(cleanClubBatch({ at: 1, f: "", info: { mode: "party" } })?.info).toBeUndefined();
  });

  it("carries each frame's notes, and nothing that isn't them", () => {
    const n = btoa(String.fromCharCode(0x9a, 0, 0x45, 0xf1, 0x31, 0));
    expect(cleanClubBatch({ at: 1, f: "", n })?.n).toBe(n);
    expect(cleanClubBatch({ at: 1, f: "", n: "<b>" })?.n).toBeUndefined();
    expect(cleanClubBatch({ at: 1, f: "", n: "A".repeat(401) })?.n).toBeUndefined();
    expect(decodeNotes(n)).toEqual([[0x9a, 0, 0x45], [0xf1, 0x31, 0]]);
    expect(readNote(0x9a)).toEqual({ pc: 9, strength: 0.6 });   // A, fairly clear
    expect(readNote(0xf1)).toEqual({ pc: 0, strength: 1 });     // C, as clear as it gets
    expect(readNote(0)).toBeNull();
    expect(readNote(0x0a)).toBeNull();                          // a note with no clarity is none
    expect(readNote(0x9d)).toBeNull();                          // no such pitch class
  });

  it("decodes frames of six channels", () => {
    const frames = decodeFrames(encode([[1, 0.5, 0, 0, 0, 0.2], [0, 0, 1, 1, 1, 1]]));
    expect(frames).toHaveLength(2);
    expect(frames[0][0]).toBe(1);
    expect(frames[0][1]).toBeCloseTo(0.5, 2);
    expect(decodeFrames("!!!")).toEqual([]);
  });
});

describe("the club's lights", () => {
  it("shows each frame when its sound is heard here, and the nudge holds it later", () => {
    const { clock, lights } = rig({ nudge: 100 });
    clock.now = 10_000;
    lights.push({ at: 10_000, f: encode([[0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1]]) });
    clock.now = 10_000 + SOUND_DELAY_MS + 100 + 10;      // halfway between the two frames
    expect(lights.frameAt(lights.heardAt())?.[0]).toBeCloseTo(0.5, 2);
    expect(lights.heardAt()).toBe(10_010);
    clock.now = 10_000 + SOUND_DELAY_MS + 100 + 5000;    // long after: nothing is coming
    expect(lights.sample().live).toBe(false);
    expect(lights.sample().section).toBe("idle");
  });

  it("finds the kicks and the beat", () => {
    const { clock, lights } = rig();
    feed(lights, 0, 6, { bpm: 120 });
    const shows = play(clock, lights, 1000, 5000);
    const hits = shows.filter(({ show }, i) => i > 0 && show.kickHit === 1).map(({ t }) => t);
    expect(hits.length).toBeGreaterThanOrEqual(7);
    for (let i = 1; i < hits.length; i++) expect(hits[i] - hits[i - 1]).toBeGreaterThan(400);
    const last = shows.at(-1)!.show;
    expect(last.live).toBe(true);
    expect(last.bpm).toBe(120);
    expect(last.beat).toBeCloseTo(4990 / 500, 1);
    expect(last.energy).toBeGreaterThan(0.2);
  });

  it("drops when the bot says, flashes once, and not at all with strobes off", () => {
    for (const strobes of [true, false]) {
      const { clock, lights } = rig({ strobes });
      feed(lights, 0, 8);
      lights.push({ at: 4000, f: "", ev: [{ k: "build", at: 2000, until: 4000 }, { k: "drop", at: 4000 }] });
      const shows = play(clock, lights, 1000, 7000);
      const during = shows.find(({ t }) => t >= 3000 && t < 3020)!.show;
      expect(during.section).toBe("build");
      expect(during.build).toBeCloseTo(0.5, 1);
      const after = shows.find(({ t }) => t >= 4100)!.show;
      expect(after.section).toBe("drop");
      const flashes = shows.filter(({ show }, i) => show.flash > 0 && !(shows[i - 1]?.show.flash > show.flash));
      if (strobes) {
        expect(flashes.length).toBeGreaterThan(0);
        expect(shows.some(({ t, show }) => t >= 4000 && t < 4100 && show.flash > 0.9)).toBe(true);
        const starts = shows.filter(({ show }, i) => i > 0 && show.flash > shows[i - 1].show.flash + 0.2).map(({ t }) => t);
        for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(MIN_FLASH_GAP_MS - 16);
      } else {
        expect(shows.every(({ show }) => show.flash === 0)).toBe(true);
      }
    }
  });

  it("reads a breakdown and the drop after it from the music alone", () => {
    const { clock, lights } = rig();
    // Kicks, eight seconds without (the music still playing), then kicks again.
    feed(lights, 0, 16, { kick: (t) => t < 3000 || t >= 11_000, level: 0.5 });
    const shows = play(clock, lights, 500, 13_000);
    expect(shows.find(({ t }) => t >= 7000)!.show.section).toBe("breakdown");
    const back = shows.find(({ t }) => t >= 11_300)!.show;
    expect(back.section).toBe("drop");
    expect(back.sinceDrop).toBeLessThan(1);
  });

  it("sounds a sampler hit once, and a boom is a drop", () => {
    const { clock, lights } = rig();
    feed(lights, 0, 4);
    const batch: ClubBatch = { at: 2000, f: "", ev: [{ k: "sample", at: 2000, name: "horn" }, { k: "sample", at: 3000, name: "boom" }] };
    lights.push(batch);
    lights.push(batch);                                   // the same moments twice: still once each
    const shows = play(clock, lights, 1000, 3500);
    expect(shows.filter(({ show }, i) => show.hits.horn === 1 && shows[i - 1]?.show.hits.horn !== 1)).toHaveLength(1);
    expect(shows.find(({ t }) => t >= 3100)!.show.section).toBe("drop");
  });
});

/** How far apart two hues are round the wheel. */
const wheelGap = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
/** Times a flash starts (jumps up) in a run of shows. */
const flashStarts = (shows: Array<{ t: number; show: { flash: number } }>) =>
  shows.filter(({ show }, i) => show.flash > (shows[i - 1]?.show.flash ?? 0) + 0.2).map(({ t }) => t);

describe("the club's light desk, in the lights", () => {
  it("holds a blackout while the button is down, and lets go by itself if the letting go never comes", () => {
    const { clock, lights } = rig();
    feed(lights, 0, 14);
    play(clock, lights, 1000, 2000);
    lights.fx({ thing: "blackout", on: true });
    expect(play(clock, lights, 2000, 2200).at(-1)!.show.blackout).toBeGreaterThan(0.95);
    lights.fx({ thing: "blackout", on: false });
    expect(play(clock, lights, 2200, 2400).at(-1)!.show.blackout).toBeLessThan(0.05);
    lights.fx({ thing: "blackout", on: true });
    const held = play(clock, lights, 2400, 2400 + HOLD_MAX_MS + 300);
    expect(held.find(({ t }) => t >= 2400 + HOLD_MAX_MS - 200)!.show.blackout).toBeGreaterThan(0.95);
    expect(held.at(-1)!.show.blackout).toBeLessThan(0.05);
  });

  it("strobes on the beat while held, never faster than the cap, and not at all for someone with strobes off", () => {
    for (const strobes of [true, false]) {
      const { clock, lights } = rig({ strobes });
      feed(lights, 0, 6, { bpm: 240 });
      play(clock, lights, 1000, 2000);
      lights.fx({ thing: "strobe", on: true });
      const shows = play(clock, lights, 2000, 4000);
      const starts = flashStarts(shows);
      if (strobes) {
        // 240 bpm is four beats a second: the cap lets every other one through.
        expect(starts.length).toBeGreaterThanOrEqual(3);
        expect(starts.length).toBeLessThanOrEqual(6);
        for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(MIN_FLASH_GAP_MS - 16);
      } else {
        expect(shows.every(({ show }) => show.flash === 0)).toBe(true);
      }
      lights.fx({ thing: "strobe", on: false });
      expect(flashStarts(play(clock, lights, 4000, 5000))).toEqual([]);
    }
  });

  it("keeps the music's strobe off with the strobe fader down, but a flash from the desk still fires", () => {
    const { clock, lights } = rig();
    lights.setDesk({ ...DEFAULT_DESK, strobe: 0 });
    feed(lights, 0, 8);
    lights.push({ at: 4000, f: "", ev: [{ k: "drop", at: 4000 }] });
    const shows = play(clock, lights, 1000, 6000);
    expect(shows.find(({ t }) => t >= 4100)!.show.section).toBe("drop");
    expect(shows.every(({ show }) => show.flash === 0)).toBe(true);
    lights.fx({ thing: "flash" });
    expect(flashStarts(play(clock, lights, 6000, 7000))).toHaveLength(1);
  });

  it("flashes the drop's kicks too with the strobe fader right up", () => {
    const starts = (strobe: number) => {
      const { clock, lights } = rig();
      lights.setDesk({ ...DEFAULT_DESK, strobe });
      feed(lights, 0, 8);
      lights.push({ at: 4000, f: "", ev: [{ k: "drop", at: 4000 }] });
      return flashStarts(play(clock, lights, 1000, 7000));
    };
    const full = starts(1);
    expect(full.length).toBeGreaterThan(starts(DEFAULT_DESK.strobe).length);
    for (let i = 1; i < full.length; i++) expect(full[i] - full[i - 1]).toBeGreaterThanOrEqual(MIN_FLASH_GAP_MS - 16);
  });

  it("fires confetti, CO2 and flames once per press, and a drop from the desk throws the colour and both", () => {
    const { clock, lights } = rig();
    feed(lights, 0, 8);
    const before = play(clock, lights, 1000, 2000).at(-1)!.show;
    expect(before.shots).toEqual({ confetti: 0, co2: 0, pyro: 0 });
    lights.fx({ thing: "pyro" });
    lights.fx({ thing: "pyro" });
    lights.fx({ thing: "confetti" });
    expect(play(clock, lights, 2000, 2100).at(-1)!.show.shots).toEqual({ confetti: 1, co2: 0, pyro: 2 });
    lights.fx({ thing: "drop" });
    const after = play(clock, lights, 2100, 2600).at(-1)!.show;
    expect(after.section).toBe("drop");
    expect(after.shots).toEqual({ confetti: 2, co2: 1, pyro: 2 });
    expect(wheelGap(after.hue, before.hue)).toBeGreaterThan(0.1);
  });

  it("settles on a picked colour, or the song's key, and only sways round it", () => {
    for (const colour of ["pick", "key"] as const) {
      const { clock, lights } = rig();
      lights.setDesk({ ...DEFAULT_DESK, colour, hue: 0.6, colourSpeed: 0.9 });
      feed(lights, 0, 30);
      lights.push({ at: 0, f: "", info: { mode: "real", key: "4A" } });
      const shows = play(clock, lights, 1000, 29_000);
      const centre = colour === "pick" ? 0.6 : keyHue("4A")!;
      for (const { show } of shows.slice(shows.length / 2)) expect(wheelGap(show.hue, centre)).toBeLessThan(colour === "pick" ? 0.03 : 0.06);
      // It does move with the phrases, a little.
      expect(new Set(shows.map(({ show }) => Math.round(show.hue * 200))).size).toBeGreaterThan(2);
    }
  });

  it("moves the theme's colour on each phrase, faster with the colour speed up, and not at all with it down", () => {
    const steps = (colourSpeed: number) => {
      const { clock, lights } = rig();
      lights.setDesk({ ...DEFAULT_DESK, colourSpeed });
      feed(lights, 0, 34);
      const shows = play(clock, lights, 1000, 33_000);
      return shows.filter(({ show }, i) => i > 0 && wheelGap(show.hue, shows[i - 1].show.hue) > 0.01).length;
    };
    expect(steps(0)).toBe(0);
    expect(steps(1)).toBeGreaterThan(steps(0.5));
  });

  it("reacts harder with the react fader up: quieter kicks still hit", () => {
    const hits = (react: number) => {
      const { clock, lights } = rig();
      lights.setDesk({ ...DEFAULT_DESK, react });
      // Soft kicks: 0.4 over a floor of 0.02.
      for (let start = 0; start < 6000; start += 80) {
        const frames = [0, 1, 2, 3].map((i) => ((start + i * CLUB_FRAME_MS) % 500 < 60 ? [0.4, 0.1, 0.5, 0.3, 0.4, 0.6] : [0.02, 0.1, 0.5, 0.3, 0.4, 0.6]));
        lights.push({ at: start, f: encode(frames), b: start / 500, bpm: 120, stems: true });
      }
      return play(clock, lights, 1000, 5000).filter(({ show }, i) => i > 0 && show.kickHit === 1).length;
    };
    expect(hits(0)).toBe(0);
    expect(hits(1)).toBeGreaterThanOrEqual(7);
  });

  it("shows how far through a mix the music is", () => {
    const { clock, lights } = rig();
    feed(lights, 0, 4);
    lights.push({ at: 1000, f: "", info: { mode: "player", mix: { style: "AutoMix", progress: 0.4 } } });
    expect(play(clock, lights, 1000, 1100).at(-1)!.show.mix).toBe(0.4);
    lights.push({ at: 2000, f: "", info: { mode: "player" } });
    expect(play(clock, lights, 1100, 1200).at(-1)!.show.mix).toBeNull();
  });
});

/** A note byte as the bot sends it: clear (12 of 15) on pitch class `pc` (C = 0), or none. */
const note = (pc: number | null) => (pc === null ? 0 : (12 << 4) | (pc + 1));
const [C, D, E, F, Fs, G, A, B] = [0, 2, 4, 5, 6, 7, 9, 11];

/** `seconds` of music from `from` whose parts are on the notes `at(t)` gives (bass, chord, voice). */
function feedNotes(lights: ClubLights, from: number, seconds: number, at: (t: number) => Array<number | null>, info?: ClubBatch["info"]) {
  for (let start = 0; start < seconds * 1000; start += 80) {
    const frames: number[][] = [];
    const notes: number[] = [];
    for (let i = 0; i < 4; i++) {
      frames.push([0.1, 0.1, 0.5, 0.4, 0.5, 0.6]);
      notes.push(...at(start + i * CLUB_FRAME_MS).map(note));
    }
    lights.push({ at: from + start, f: encode(frames), n: btoa(String.fromCharCode(...notes)), b: start / 500, bpm: 120, stems: true, ...(info ? { info } : {}) });
  }
}

describe("the club's colours, by the notes", () => {
  it("finds a key's middle round the circle of fifths", () => {
    expect([C, G, D, A, E, B, Fs].map(fifths)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(fifths(F)).toBe(11);
    expect(keyMiddle("8B")).toBe(fifths(D));        // C major: C..B, three fifths either side of D
    expect(keyMiddle("8A")).toBe(fifths(D));        // A minor: the same notes
    expect(keyMiddle("9B")).toBe(fifths(A));        // G major, a fifth on
    expect(keyMiddle("nope")).toBeNull();
  });

  it("colours each part by its note, as far round from the show's colour as the note is from the key's middle", () => {
    const { clock, lights } = rig();
    feedNotes(lights, 0, 3, (t) => (t < 1500 ? [A, C, E] : [D, C, E]), { mode: "real", key: "8B" });
    const before = play(clock, lights, 0, 1450).at(-1)!.show;
    expect(before.notes.map((n) => n?.pc)).toEqual([A, C, E]);
    // A is a fifth past D, C two fifths before it, E two past it.
    expect(before.noteShift[0]).toBeCloseTo(NOTE_STEP, 2);
    expect(before.noteShift[1]).toBeCloseTo(-2 * NOTE_STEP, 2);
    expect(before.noteShift[2]).toBeCloseTo(2 * NOTE_STEP, 2);
    expect(before.noteFollow).toBeGreaterThan(0.5);
    // The bass steps to D, the key's middle: its colour goes to the show's own, quickly.
    const after = play(clock, lights, 1450, 1750).at(-1)!.show;
    expect(after.notes[0]?.pc).toBe(D);
    expect(Math.abs(after.noteShift[0])).toBeLessThan(0.02);
    expect(after.noteShift[1]).toBeCloseTo(-2 * NOTE_STEP, 2);
  });

  it("without a key, measures from the middle of the notes heard", () => {
    const { clock, lights } = rig();
    const scale = [C, D, E, F, G, A, B];
    // Half a minute of C major's notes, then the bass holds D (the middle) and the chords F# (out of the key).
    feedNotes(lights, 0, 34, (t) => (t < 30_000 ? [scale[Math.floor(t / 250) % 7], scale[Math.floor(t / 500 + 3) % 7], null] : [D, Fs, null]));
    const show = play(clock, lights, 0, 31_000).at(-1)!.show;
    expect(Math.abs(show.noteShift[0])).toBeLessThan(0.06);
    expect(show.noteShift[1]).toBeGreaterThan(3 * NOTE_STEP);
    expect(show.notes[2]).toBeNull();
  });

  it("eases a part back when it stops, and follows nothing with the desk's notes off or from a bot without notes", () => {
    const { clock, lights } = rig();
    feedNotes(lights, 0, 10, (t) => [t < 2000 ? A : null, C, null], { mode: "real", key: "8B" });
    expect(play(clock, lights, 0, 1900).at(-1)!.show.noteShift[0]).toBeCloseTo(NOTE_STEP, 2);
    const later = play(clock, lights, 1900, 8000).at(-1)!.show;
    expect(later.notes[0]).toBeNull();
    expect(Math.abs(later.noteShift[0])).toBeLessThan(0.01);
    expect(later.noteShift[1]).toBeCloseTo(-2 * NOTE_STEP, 2);
    expect(later.noteFollow).toBeGreaterThan(0.9);
    lights.setDesk({ ...DEFAULT_DESK, notes: false });
    expect(play(clock, lights, 8000, 10_000).at(-1)!.show.noteFollow).toBeLessThan(0.3);

    const old = rig();
    feed(old.lights, 0, 3);
    const show = play(old.clock, old.lights, 0, 2500).at(-1)!.show;
    expect(show.notes).toEqual([null, null, null]);
    expect(show.noteFollow).toBe(0);
  });
});

/** A song's map: `sections` as [first bar, bars, level], every bar as hard as its section. */
function songMap(id: string, sections: Array<[number, number, number]>, mood = { energy: 0.8, minor: true, dyn: 0.6 }): ClubSongMap {
  const bars: number[] = [];
  for (const [, length, tier] of sections) for (let i = 0; i < length; i++) bars.push((Math.round([0.2, 0.45, 0.7, 1][tier] * 15) << 4) | 3);
  return { id, bpm: 120, bars: btoa(String.fromCharCode(...bars)), sec: sections.map(([bar, length, tier]) => [bar, length, tier, 3, 0]), dyn: 0.6, mood };
}

/**
 * A song with a map at 120 bpm, its id with every beat anchor, sent as the bot would: a batch at a time, a little
 * ahead of the sound. Returns the shows sampled from `from` to `to` (bot time).
 */
function playSong(clock: { now: number }, lights: ClubLights, map: ClubSongMap, from: number, to: number) {
  lights.push({ at: 0, f: "", map });
  const beatMs = 500;
  let sent = 0;
  const shows = [];
  for (let t = from; t < to; t += 16) {
    for (; sent < t + 300; sent += 80) {
      const frames: number[][] = [];
      for (let i = 0; i < 4; i++) frames.push([(sent + i * CLUB_FRAME_MS) % beatMs < 60 ? 0.95 : 0.02, 0.1, 0.5, 0.3, 0.4, 0.6]);
      lights.push({ at: sent, f: encode(frames), b: sent / beatMs, bpm: 120, stems: true, w: map.id });
    }
    clock.now = t + SOUND_DELAY_MS;
    shows.push({ t, show: lights.sample() });
  }
  return shows;
}

describe("the song's map", () => {
  it("comes over the wire whole, or not at all", () => {
    const map = songMap("A3", [[0, 8, 1], [8, 8, 3]]);
    const batch = cleanClubBatch({ at: 1, f: "", w: "A3", map, ev: [{ k: "loop", at: 5, until: 9, name: "guitar" }, { k: "loop", at: 5, name: "kazoo" }],
      info: { mode: "real", loop: { part: "piano", title: "Clocks" } } });
    expect(batch?.w).toBe("A3");
    expect(batch?.map).toEqual(map);
    expect(batch?.ev).toEqual([{ k: "loop", at: 5, until: 9, name: "guitar" }, { k: "loop", at: 5 }]);
    expect(batch?.info?.loop).toEqual({ part: "piano", title: "Clocks" });
    expect(cleanClubBatch({ at: 1, f: "", map: { ...map, bars: "<b>" } })?.map).toBeUndefined();
    expect(cleanClubBatch({ at: 1, f: "", map: { ...map, bpm: 1000 } })?.map).toBeUndefined();
    expect(cleanClubBatch({ at: 1, f: "", map: { ...map, sec: [[0, 4, 9, 255], ["x"], [8, 4, 3, 1, 11], [12, 4, 1, 1, 99]] } })?.map?.sec).toEqual([[0, 4, 3, 3, 0], [8, 4, 3, 1, 11], [12, 4, 1, 1, 0]]);
    expect(decodeBars(map.bars)[9]).toEqual({ hard: 1, flags: 3 });
  });

  it("closes the rig in the verse, squeezes it in the bar before the chorus and throws it open on the chorus's first beat", () => {
    const { clock, lights } = rig();
    // Eight bars of verse, eight of chorus, eight of verse: the chorus starts on beat 32 (16 s), the verse again at 32 s.
    const shows = playSong(clock, lights, songMap("A1", [[0, 8, 1], [8, 8, 3], [16, 8, 1]]), 1000, 36_000);
    const at = (ms: number) => shows.find(({ t }) => t >= ms)!.show;
    const verse = at(10_000);
    expect(verse.mapped).toBe(true);
    expect(verse.tier).toBe(1);
    expect(verse.nextTier).toBe(3);
    expect(verse.open).toBeCloseTo(TIER_OPEN[1], 1);
    expect(verse.squeeze).toBe(0);
    // The last bar before it: the squeeze builds, the rig pulls in.
    const squeezing = at(15_500);
    expect(squeezing.toNext).toBeCloseTo(1, 0);
    expect(squeezing.squeeze).toBeGreaterThan(0.6);
    expect(squeezing.section).toBe("build");
    expect(squeezing.open).toBeLessThan(verse.open);
    // The chorus's first beat: the hit, wide open within a few frames, and the colour thrown as on a drop.
    const hit = at(16_050);
    expect(hit.tier).toBe(3);
    expect(hit.accent).toBeGreaterThan(0.8);
    expect(hit.section).toBe("drop");
    expect(at(16_200).open).toBeGreaterThan(0.85);
    expect(at(17_500).accent).toBeLessThan(0.2);
    // Back to the verse: closed down again within a beat or two.
    expect(at(33_500).tier).toBe(1);
    expect(at(33_500).open).toBeLessThan(0.5);
    expect(at(33_500).accent).toBeLessThan(0.05);
  });

  it("only follows the map of the song that leads", () => {
    const { clock, lights } = rig();
    lights.push({ at: 0, f: "", map: songMap("B7", [[0, 4, 3]]) });
    feed(lights, 0, 4);
    const show = play(clock, lights, 1000, 3000).at(-1)!.show;
    expect(show.mapped).toBe(false);
  });

  it("names the song's mood", () => {
    expect(moodName({ energy: 0.8, minor: true, dyn: 0.5 })).toBe("fierce");
    expect(moodName({ energy: 0.3, minor: true, dyn: 0.5 })).toBe("blue");
    expect(moodName({ energy: 0.7, minor: false, dyn: null })).toBe("bright");
    expect(moodName({ energy: 0.4, minor: false, dyn: null })).toBe("warm");
    expect(moodName(null)).toBeNull();
    expect(moodName({ energy: 0.9, minor: true, dyn: null, name: "dreamy" })).toBe("dreamy");    // the words win over the key
    const { clock, lights } = rig();
    expect(playSong(clock, lights, songMap("A2", [[0, 8, 2]], { energy: 0.3, minor: true, dyn: 0.2 }), 1000, 2000).at(-1)!.show.mood).toBe("blue");
  });

  it("lands a chorus on the song's own bar line when its bars start off the grid's", () => {
    const { clock, lights } = rig();
    const map = { ...songMap("A5", [[0, 8, 1], [8, 8, 3]]), phase: 2 };       // bars start on the grid's third beat
    const shows = playSong(clock, lights, map, 1000, 20_000);
    // The chorus starts at bar 8: beat 2 + 32 = 34, at 17 s, not beat 32 (16 s).
    expect(shows.find(({ t }) => t >= 16_200)!.show.tier).toBe(1);
    expect(shows.find(({ t }) => t >= 17_050)!.show.tier).toBe(3);
    expect(cleanClubBatch({ at: 1, f: "", map })?.map?.phase).toBe(2);
    expect(cleanClubBatch({ at: 1, f: "", map: { ...map, phase: 7 } })?.map?.phase).toBeUndefined();
  });

  it("names the section when the song was listened to", () => {
    const { clock, lights } = rig();
    const map = songMap("A4", [[0, 4, 1], [4, 4, 2]]);
    map.sec = [[0, 4, 1, 3, 2], [4, 4, 2, 3, 11]];                 // a verse, then a solo
    const shows = playSong(clock, lights, map, 1000, 12_000);
    expect(shows.find(({ t }) => t >= 4000)!.show.part).toBe("verse");
    expect(shows.find(({ t }) => t >= 9000)!.show.part).toBe("solo");
  });

  it("shows a borrowed loop while it plays", () => {
    const { clock, lights } = rig();
    feed(lights, 0, 6);
    lights.push({ at: 1000, f: "", ev: [{ k: "loop", at: 2000, until: 4000, name: "guitar" }] });
    const shows = play(clock, lights, 1000, 5000);
    const at = (ms: number) => shows.find(({ t }) => t >= ms)!.show;
    expect(at(1200).loops.guitar ?? 0).toBe(0);
    expect(at(3000).loops.guitar).toBe(1);
    expect(at(4800).loops.guitar ?? 0).toBe(0);
  });
});
