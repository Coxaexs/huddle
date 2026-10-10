/** The app icon badge, like Discord/WhatsApp: a red count for unread mentions
 *  (and DMs), or a plain dot when there is only unread chatter. Drawn on the
 *  tab favicon, set on the installed app (PWA) icon, and passed to the
 *  desktop shell for the dock/taskbar. */

const ICON_SRC = "/favicon-32.png?v=2";
const SIZE = 64;

let baseIcon: HTMLImageElement | null = null;
let baseLoad: Promise<HTMLImageElement | null> | null = null;
let originalHrefs: Map<HTMLLinkElement, string> | null = null;
let lastKey = "";

function loadBase(): Promise<HTMLImageElement | null> {
  if (baseIcon) return Promise.resolve(baseIcon);
  baseLoad ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve((baseIcon = img));
    img.onerror = () => resolve(null);
    img.src = ICON_SRC;
  });
  return baseLoad;
}

function iconLinks(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel~=\"icon\"]"));
}

function drawBadge(img: HTMLImageElement, count: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const label = count > 99 ? "99+" : count > 0 ? String(count) : "";
  const r = label ? 19 : 14;
  const width = label.length > 1 ? r * 2 + (label.length - 1) * 12 : r * 2;
  const x = SIZE - width;
  const y = SIZE - r * 2;
  ctx.fillStyle = "#f23f43";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, width - 4, r * 2 - 4, r);
  ctx.fill();
  ctx.stroke();
  if (label) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${label.length > 2 ? 22 : 28}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + width / 2, y + r + 1);
  }
  return canvas.toDataURL("image/png");
}

/** `count` is mentions + unread DMs; `dot` means other unread messages exist. */
export function updateAppBadge(count: number, dot: boolean): void {
  if (typeof window === "undefined") return;
  const key = `${count}:${dot}`;
  if (key === lastKey) return;
  lastKey = key;

  // Desktop shell (Electron): dock/taskbar badge.
  (window as unknown as { huddle?: { setBadge?: (n: number) => void } }).huddle?.setBadge?.(count);

  // Installed app (PWA) icon. A bare setAppBadge() shows a dot.
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) void nav.setAppBadge?.(count).catch(() => undefined);
  else if (dot) void nav.setAppBadge?.().catch(() => undefined);
  else void nav.clearAppBadge?.().catch(() => undefined);

  // Tab favicon.
  const links = iconLinks();
  if (!originalHrefs) originalHrefs = new Map(links.map((link) => [link, link.href]));
  if (count <= 0 && !dot) {
    for (const [link, href] of originalHrefs) link.href = href;
    return;
  }
  void loadBase().then((img) => {
    if (!img || lastKey !== key) return;
    const href = drawBadge(img, count);
    if (!href) return;
    for (const link of iconLinks()) {
      if (!originalHrefs?.has(link)) originalHrefs?.set(link, link.href);
      link.href = href;
    }
  });
}
