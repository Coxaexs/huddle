"use client";

import { deferred } from "./chat/shell/deferred";
import { useMusicPlayerView } from "./music-player-store";
import type { MusicPlayerLayerProps } from "./music-player";

const MusicPlayer = deferred(() => import("./music-player").then((m) => m.MusicPlayer));

/**
 * Mounted once by the chat shell; shows the player while it is open. The
 * player's code is only fetched the first time someone opens it.
 */
export function MusicPlayerLayer(props: MusicPlayerLayerProps) {
  const view = useMusicPlayerView();
  if (!view) return null;
  return <MusicPlayer {...props} view={view} />;
}
