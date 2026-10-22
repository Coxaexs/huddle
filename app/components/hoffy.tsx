import type { CSSProperties } from "react";
import { hoffySvg, type HoffyCostume, type HoffyFace, type HoffyPose } from "@/lib/hoffy-svg";

type HoffyProps = {
  face?: HoffyFace;
  pose?: HoffyPose;
  costume?: HoffyCostume;
  legs?: boolean;
  /** Width and height in px (or any CSS length). */
  size?: number | string;
  /**
   * idle: bobs and blinks. wave: idle plus a wave. boot: drops in, the syrup
   * pours, the butter lands, then waves. none: holds still.
   * All of it is CSS (app/hoffy.css), so it plays before hydration.
   */
  motion?: "idle" | "wave" | "boot" | "none";
  /** Prefix for the SVG's ids; give each Hoffy on one page its own. */
  id?: string;
  /** Accessible name; leave it out where Hoffy is decoration. */
  label?: string;
  className?: string;
  style?: CSSProperties;
};

/** Hoffy, the Hoffle mascot (see lib/hoffy-svg.ts). */
export function Hoffy({ face = "happy", pose = "wave", costume, legs = true, size = 120, motion = "idle", id, label, className = "", style }: HoffyProps) {
  const base = id ?? `hoffy-${face}-${pose}${costume ? `-${costume}` : ""}${legs ? "" : "-bust"}`;
  return (
    <span
      className={`hoffy hoffy-${motion}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, ...style }}
      dangerouslySetInnerHTML={{ __html: hoffySvg({ face, pose, costume, legs, base, label }) }}
    />
  );
}
