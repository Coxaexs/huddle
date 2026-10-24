import { describe, expect, it } from "vitest";
import { CLUB_FRAME_MS, cleanClubBatch, decodeFrames, type ClubBatch } from "@/lib/club-feed";
import { ClubLights, MIN_FLASH_GAP_MS, SOUND_DELAY_MS } from "@/app/lib/club-lights";

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
