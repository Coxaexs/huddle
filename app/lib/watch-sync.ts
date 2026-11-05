/**
 * Keeps one viewer's player on the room's clock without fighting it.
 *
 * A seek throws away what the player has loaded. Seeking a viewer who is
 * behind only because they are still loading means nothing ever loads: the
 * picture stays blank while the clock, and the subtitles that follow it, walk
 * on without them. So a small drift is eased out with the playback speed, only
 * a big one is a seek, never while the player is still loading, and each seek
 * that does not stick waits longer before the next. A slow viewer ends up a
 * little behind the room with a picture, which beats on time with none.
 *
 * The thresholds follow Jellyfin's SyncPlay: speed up to 3 s, skip past that.
 */

/** Closer than this (seconds) is in step. */
const IN_STEP = 0.25;
/** Up to this much is eased out with the speed; past it, a seek. */
const EASE_UP_TO = 3;
/** How far a paused player may sit from the room's frame. */
const PAUSED_SLACK = 0.3;
/** The wait after a seek, doubled each time one does not stick. */
const FIRST_WAIT_MS = 5_000;
const LONGEST_WAIT_MS = 60_000;
/** In step for this long, and the viewer is keeping up again. */
const SETTLED_MS = 15_000;

export interface PlayerReading {
  /** Where this player is, and where the room is, in seconds. */
  current: number;
  expected: number;
  /** The room is paused. */
  paused: boolean;
  /** The player has too little to play on (readyState under HAVE_FUTURE_DATA). */
  loading: boolean;
  /** A seek is still landing. */
  seeking: boolean;
  /** Changes when someone in the room pauses, plays or seeks. */
  moment: string;
  now: number;
}

export interface FollowStep {
  seekTo: number | null;
  rate: number;
}

/** What the room's clock asks of this player; `w` is the room's watch state. */
export const roomMoment = (w: { position: number; at: number; paused: boolean }) => `${w.position}|${w.at}|${w.paused}`;

/** One per film: it remembers how the last seeks went. */
export function createRoomFollower() {
  let moment: string | null = null;
  let wait = FIRST_WAIT_MS;
  let nextSeekAt = 0;
  let inStepSince: number | null = null;

  return {
    next(reading: PlayerReading): FollowStep {
      const { current, expected, paused, loading, seeking, now } = reading;
      const drift = expected - current;
      const size = Math.abs(drift);
      const roomMoved = moment !== null && moment !== reading.moment;
      moment = reading.moment;

      // Someone moved the film: everyone goes there at once, loading or not.
      if (roomMoved && size > PAUSED_SLACK) {
        wait = FIRST_WAIT_MS;
        nextSeekAt = now + wait;
        inStepSince = null;
        return { seekTo: expected, rate: 1 };
      }
      if (paused) return { seekTo: size > PAUSED_SLACK && !seeking ? expected : null, rate: 1 };
      // Let it load. Seeking now would throw away what is on its way.
      if (loading || seeking) return { seekTo: null, rate: 1 };

      if (size < IN_STEP) {
        inStepSince ??= now;
        if (now - inStepSince >= SETTLED_MS) wait = FIRST_WAIT_MS;
        return { seekTo: null, rate: 1 };
      }
      inStepSince = null;
      if (size > EASE_UP_TO && now >= nextSeekAt) {
        nextSeekAt = now + wait;
        wait = Math.min(wait * 2, LONGEST_WAIT_MS);
        return { seekTo: expected, rate: 1 };
      }
      const push = size > 1 ? 0.1 : 0.05;
      return { seekTo: null, rate: drift > 0 ? 1 + push : 1 - push };
    },
  };
}
