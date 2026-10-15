/**
 * What a pawn is standing in, judged from the colour of the battle map under
 * it: blue is water, bright red is fire, green is grass or forest, near black
 * is darkness, and anything else is plain ground.
 */
export type Terrain = "water" | "fire" | "green" | "dark" | "ground";

/** The terrain for an sRGB colour (0-255 each). */
export function terrainOf([r, g, b]: readonly [number, number, number]): Terrain {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const light = (max + min) / 2;
  const range = max - min;
  const saturation = range === 0 ? 0 : range / (1 - Math.abs(2 * light - 1));
  let hue = 0;
  if (range > 0) {
    const [rr, gg, bb] = [r / 255, g / 255, b / 255];
    if (max === rr) hue = 60 * (((gg - bb) / range) % 6);
    else if (max === gg) hue = 60 * ((bb - rr) / range + 2);
    else hue = 60 * ((rr - gg) / range + 4);
    if (hue < 0) hue += 360;
  }
  if (light < 0.13) return "dark";
  if (saturation > 0.25 && hue >= 175 && hue <= 250 && light < 0.85) return "water";
  if (saturation > 0.45 && (hue <= 28 || hue >= 345) && light > 0.3 && max > 0.66) return "fire";
  if (saturation > 0.18 && hue >= 65 && hue <= 165) return "green";
  return "ground";
}
