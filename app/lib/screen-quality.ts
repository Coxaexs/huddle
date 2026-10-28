/** Screen-share quality choices: resolution and frame rate, e.g. "1080p30". */

/** Screen share heights on offer, lowest first. */
export const SCREEN_RESOLUTIONS = [480, 720, 900, 1080] as const;
/** Screen share frame rates on offer, lowest first. */
export const SCREEN_FRAMERATES = [15, 24, 30, 60] as const;
export type ScreenResolution = (typeof SCREEN_RESOLUTIONS)[number];
export type ScreenFramerate = (typeof SCREEN_FRAMERATES)[number];
/** Resolution and frame rate together, e.g. "1080p30". */
export type ScreenShareQuality = `${ScreenResolution}p${ScreenFramerate}`;

/** Every combination, lowest first. */
export const SCREEN_SHARE_QUALITIES: ScreenShareQuality[] = SCREEN_RESOLUTIONS.flatMap((height) =>
  SCREEN_FRAMERATES.map((fps) => `${height}p${fps}` as ScreenShareQuality),
);

export function screenQualityParts(quality: ScreenShareQuality): {
  height: ScreenResolution;
  fps: ScreenFramerate;
} {
  const [height, fps] = quality.split("p").map(Number);
  return { height: height as ScreenResolution, fps: fps as ScreenFramerate };
}

export function makeScreenQuality(height: ScreenResolution, fps: ScreenFramerate): ScreenShareQuality {
  return `${height}p${fps}`;
}

export function isScreenQuality(value: unknown): value is ScreenShareQuality {
  return SCREEN_SHARE_QUALITIES.includes(value as ScreenShareQuality);
}

/** "900p 24FPS" — for the live badge. */
export function screenQualityLabel(quality: ScreenShareQuality): string {
  const { height, fps } = screenQualityParts(quality);
  return `${height}p ${fps}FPS`;
}

/** The next resolution up at the same frame rate, wrapping round. */
export function nextScreenQuality(quality: ScreenShareQuality): ScreenShareQuality {
  const { height, fps } = screenQualityParts(quality);
  const index = SCREEN_RESOLUTIONS.indexOf(height);
  return makeScreenQuality(SCREEN_RESOLUTIONS[(index + 1) % SCREEN_RESOLUTIONS.length], fps);
}

/** Capture size for a quality: 16:9 at its height. */
export function screenConstraints(quality: ScreenShareQuality) {
  const { height, fps } = screenQualityParts(quality);
  return { width: Math.round((height * 16) / 9), height, frameRate: fps };
}
