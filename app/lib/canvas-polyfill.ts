/**
 * Canvas `roundRect` arrived in Safari 16; the webview in older Macs' Tauri
 * app lacks it, and the Living Room's labels, tokens and cards all use it.
 * Importing this file adds a plain-arcs version where it is missing.
 */
const proto = typeof CanvasRenderingContext2D !== "undefined" ? CanvasRenderingContext2D.prototype : null;

if (proto && !("roundRect" in proto)) {
  (proto as unknown as { roundRect: (x: number, y: number, w: number, h: number, radii?: number | number[]) => void }).roundRect = function (
    this: CanvasRenderingContext2D, x, y, w, h, radii = 0,
  ) {
    const first = Array.isArray(radii) ? radii[0] ?? 0 : radii;
    const r = Math.max(0, Math.min(first, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

export {};
