"use client";

import type { VideoTile } from "./types";
import { EyeOff, Eye } from "lucide-react";

export function hasLiveVideo(stream: MediaStream): boolean {
  return stream.getVideoTracks().some((track) => track.readyState === "live");
}
/**
 * A tile's picture, or a placeholder once the viewer has stopped receiving it,
 * plus the small corner button that switches between the two.
 */
export function TileVideo({
  tile,
  onHide,
}: {
  tile: VideoTile;
  onHide?: (tile: VideoTile, hidden: boolean) => void;
}) {
  const what = tile.videoKind === "camera" ? "camera" : "screen share";
  return (
    <>
      {tile.hidden ? (
        <div className="video-hidden-placeholder">
          <EyeOff size={22} aria-hidden="true" />
          <span>{tile.videoKind === "camera" ? "Camera hidden" : "Screen share hidden"}</span>
          <small>Not using your data</small>
        </div>
      ) : (
        <VideoSurface stream={tile.stream} mirrored={tile.mirrored} />
      )}
      {!tile.self && tile.remoteId && onHide && (
        <span
          role="button"
          tabIndex={0}
          className="video-hide-btn"
          title={tile.hidden ? `Show this ${what} again` : `Stop receiving this ${what} (saves data)`}
          aria-label={tile.hidden ? `Show this ${what}` : `Hide this ${what}`}
          onClick={(event) => {
            event.stopPropagation();
            onHide(tile, !tile.hidden);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onHide(tile, !tile.hidden);
          }}
        >
          {tile.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          {tile.hidden ? "Show" : "Hide"}
        </span>
      )}
    </>
  );
}
/** Attaches a MediaStream to a <video>, replacing it only when it changes. */
export function VideoSurface({
  stream,
  mirrored,
  muted = true,
}: {
  stream: MediaStream;
  mirrored?: boolean;
  muted?: boolean;
}) {
  return (
    <video
      autoPlay
      playsInline
      muted={muted}
      className={mirrored ? "mirrored" : ""}
      ref={(element) => {
        if (element && element.srcObject !== stream) {
          element.srcObject = stream;
          void element.play().catch(() => undefined);
        }
      }}
    />
  );
}