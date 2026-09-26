"use client";

import { useEffect, useState } from "react";
import { formatVoiceDuration, voiceElapsedMs } from "@/lib/voice-duration";

interface VoiceDurationProps {
  /**
   * Hub-clock milliseconds when this seat was taken, from
   * `VoiceParticipant.joinedAt`. A missing value renders nothing, which is how
   * participants whose seat time the hub does not know are shown.
   */
  joinedAt?: number | null;
  /**
   * The hub's idea of "now" (`useHub().serverNow`). Counting against it rather
   * than the local clock keeps two browsers with skewed clocks in agreement.
   */
  serverNow: () => number;
  className?: string;
  /** Spoken and hover description, e.g. "In voice for 4:07". */
  label?: string;
}

/**
 * Live counter for how long one person has been in the voice room.
 *
 * Only the clock re-renders every second, so the surrounding roster and stage
 * are left alone.
 */
export function VoiceDuration({
  joinedAt,
  serverNow,
  className,
  label = "In voice for",
}: VoiceDurationProps) {
  const [elapsed, setElapsed] = useState(() =>
    voiceElapsedMs(joinedAt, serverNow()),
  );

  useEffect(() => {
    if (!joinedAt) return;
    const tick = () => setElapsed(voiceElapsedMs(joinedAt, serverNow()));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [joinedAt, serverNow]);

  if (!joinedAt) return null;
  const clock = formatVoiceDuration(elapsed);
  return (
    <span
      className={className}
      role="timer"
      title={`${label} ${clock}`}
      aria-label={`${label} ${clock}`}
    >
      {clock}
    </span>
  );
}
