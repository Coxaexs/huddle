"use client";

import type { ComponentProps, ReactNode } from "react";
import { useSpeaking, type SpeakingStore } from "../../../lib/speaking-store";
import { RecordingDirector } from "../../recording-director";

/**
 * Renders `children` with whether `id` is speaking, re-rendering only itself
 * when that changes, so the parent doesn't have to follow the speaking set.
 */
export function Speaking({
  store,
  id,
  children,
}: {
  store: SpeakingStore;
  id: string;
  children: (speaking: boolean) => ReactNode;
}) {
  return <>{children(useSpeaking(store).has(id))}</>;
}

/** RecordingDirector that follows the speaking set itself. */
export function LiveRecordingDirector({
  speakingStore,
  ...props
}: Omit<ComponentProps<typeof RecordingDirector>, "speaking"> & {
  speakingStore: SpeakingStore;
}) {
  return <RecordingDirector {...props} speaking={useSpeaking(speakingStore)} />;
}
