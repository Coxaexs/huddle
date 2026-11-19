/**
 * Where a new token goes: the start square if it is free, otherwise the
 * nearest square around it (ring by ring) that no token covers. Monsters
 * added one after another used to land on the very same square and had to
 * be dragged apart by hand.
 */
export function freeSpot(
  tokens: { x: number; y: number; size?: number }[],
  startX: number,
  startY: number,
  size = 1,
  width = Infinity,
  height = Infinity,
): { x: number; y: number } {
  const clear = (x: number, y: number) =>
    tokens.every((t) => {
      const reach = ((t.size ?? 1) + size) / 2;
      return Math.abs(t.x - x) >= reach || Math.abs(t.y - y) >= reach;
    });
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= width && y <= height;
  const step = Math.max(1, Math.ceil(size));
  for (let ring = 0; ring <= 12; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = startX + dx * step;
        const y = startY + dy * step;
        if (inside(x, y) && clear(x, y)) return { x, y };
      }
    }
  }
  return { x: startX, y: startY };
}
