/**
 * How long someone has been sitting in a voice room, as a compact clock.
 *
 * The hub only records when a seat was taken; this turns "now minus that" into
 * the label shown in one place, so the room roster, the stage tiles and the
 * member menu can never disagree about the same person.
 */

/**
 * `M:SS` under an hour, `H:MM:SS` beyond it, so a long call does not grow a
 * useless `0:` prefix while a short one stays readable at a glance.
 */
export function formatVoiceDuration(elapsedMs: number): string {
  const totalSeconds = Number.isFinite(elapsedMs)
    ? Math.max(0, Math.floor(elapsedMs / 1000))
    : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, "0")}`
    : `${mm}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Time spent in the room, clamped at zero. A missing `joinedAt` (0, null or
 * undefined) means "unknown", which callers render as no timer at all.
 */
export function voiceElapsedMs(
  joinedAt: number | null | undefined,
  now: number,
): number {
  if (!joinedAt) return 0;
  return Math.max(0, now - joinedAt);
}
