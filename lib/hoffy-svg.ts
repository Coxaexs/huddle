/**
 * Hoffy, the Hoffle mascot: a waffle with syrup for hair and a pat of butter
 * for a hat. hoffySvg() returns the character as an SVG string on a 400x400
 * canvas (the same drawing the launch reels animate).
 *
 * Parts carry classes so CSS can animate them: .hb-arm-l / .hb-arm-r (rotate
 * about the shoulder with transform-box: fill-box; transform-origin: 50% 0),
 * .hb-eyes (blink), .hb-syrup (pours in from the top), .hb-hat, .hb-legs.
 * Ids are prefixed with `base`, so server and client render the same markup.
 */

const C = {
  V: "#6a4ddb", V_DARK: "#4f35b8", A: "#ffae42", A_MID: "#f39b2f", A_DARK: "#e48a1f", A_DEEP: "#c96f14",
  SOAK: "#dc7f1c", BUTTER: "#fff1b8", BUTTER_SIDE: "#f5cf5e", INK: "#24163f", MOUTH: "#3b1d4f",
  TONGUE: "#ff6f8e", BLUSH: "#ff7d9c", NIGHT: "#241a5c", GEAR: "#2b2342",
};
const EYE_Y = 214, EYE_L = 162, EYE_R = 238, MOUTH_Y = 244;
const SHOULDER_L = [96, 220] as const, SHOULDER_R = [304, 220] as const;

/** Arm angles in degrees (0 = straight down; the left arm turns out with +, the right with -). */
export const HOFFY_POSES = {
  wave: [30, -145], cheer: [145, -145], down: [24, -24], point: [24, -95],
  shrug: [118, -118], hold: [60, -24], rest: [10, -10],
} as const satisfies Record<string, readonly [number, number]>;
export type HoffyPose = keyof typeof HOFFY_POSES;

type EyeKind = "open" | "small" | "wide" | "up" | "down" | "heart";
type MouthKind = "smile" | "grin" | "o" | "talk" | "frown" | "smirk" | "tiny";

const FACES = {
  happy: ["open", "open", "smile"], laugh: ["up", "up", "grin"], surprised: ["small", "small", "o"],
  sleepy: ["down", "down", "tiny"], wink: ["open", "up", "smile"], sad: ["open", "open", "frown"],
  love: ["heart", "heart", "smile"], talk: ["open", "open", "talk"], cool: ["open", "open", "smirk"],
  excited: ["wide", "wide", "grin"], closed: ["down", "down", "tiny"],
} as const satisfies Record<string, readonly [EyeKind, EyeKind, MouthKind]>;
export type HoffyFace = keyof typeof FACES;

function eye(x: number, kind: EyeKind): string {
  const y = EYE_Y;
  if (kind === "open" || kind === "small" || kind === "wide") {
    const [rx, ry] = { open: [15, 20], small: [12, 14], wide: [17, 23] }[kind];
    return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${C.INK}"/>`
      + `<circle cx="${x + rx * 0.35}" cy="${y - ry * 0.4}" r="5.5" fill="#fff"/>`
      + `<circle cx="${x - rx * 0.35}" cy="${y + ry * 0.4}" r="2.6" fill="#fff" opacity=".8"/>`;
  }
  if (kind === "up") return `<path d="M${x - 14} ${y + 5}Q${x} ${y - 14} ${x + 14} ${y + 5}" fill="none" stroke="${C.INK}" stroke-width="7" stroke-linecap="round"/>`;
  if (kind === "heart") return `<path d="M${x} ${y + 16}C${x - 26} ${y - 2} ${x - 14} ${y - 22} ${x} ${y - 8}C${x + 14} ${y - 22} ${x + 26} ${y - 2} ${x} ${y + 16}Z" fill="#ff4f7b"/>`;
  return `<path d="M${x - 14} ${y}Q${x} ${y + 11} ${x + 14} ${y}" fill="none" stroke="${C.INK}" stroke-width="6" stroke-linecap="round"/>`;
}

function mouth(kind: MouthKind, id: string, fangs: boolean): string {
  const x = 200, y = MOUTH_Y;
  if (kind === "smile" || kind === "grin") {
    const [w, h] = kind === "smile" ? [18, 22] : [25, 32];
    const d = `M${x - w} ${y}C${x - w} ${y + h * 1.25} ${x + w} ${y + h * 1.25} ${x + w} ${y}Z`;
    const teeth = fangs ? `<path d="M${x - 13} ${y}l4 9l4 -9zM${x + 5} ${y}l4 9l4 -9z" fill="#fff"/>` : "";
    return `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${C.MOUTH}"/>`
      + `<ellipse clip-path="url(#${id})" cx="${x}" cy="${y + h * 1.02}" rx="${w * 0.62}" ry="${h * 0.4}" fill="${C.TONGUE}"/>${teeth}`;
  }
  if (kind === "o") return `<ellipse cx="${x}" cy="${y + 9}" rx="8" ry="11" fill="${C.MOUTH}"/>`;
  if (kind === "talk") return `<ellipse cx="${x}" cy="${y + 8}" rx="13" ry="9" fill="${C.MOUTH}"/>`;
  if (kind === "frown") return `<path d="M${x - 13} ${y + 14}Q${x} ${y + 2} ${x + 13} ${y + 14}" fill="none" stroke="${C.MOUTH}" stroke-width="6" stroke-linecap="round"/>`;
  if (kind === "smirk") return `<path d="M${x - 14} ${y + 6}Q${x + 2} ${y + 15} ${x + 16} ${y + 1}" fill="none" stroke="${C.MOUTH}" stroke-width="6" stroke-linecap="round"/>`;
  return `<path d="M${x - 8} ${y + 4}Q${x} ${y + 10} ${x + 8} ${y + 4}" fill="none" stroke="${C.MOUTH}" stroke-width="5" stroke-linecap="round"/>`;
}

function face(name: HoffyFace, id: string, fangs: boolean): string {
  const [l, r, m] = FACES[name];
  const brows = name === "sad"
    ? `<path d="M${EYE_L - 16} ${EYE_Y - 26}L${EYE_L + 12} ${EYE_Y - 34}M${EYE_R + 16} ${EYE_Y - 26}L${EYE_R - 12} ${EYE_Y - 34}" stroke="${C.INK}" stroke-width="6" stroke-linecap="round"/>`
    : "";
  return `<g class="hb-eyes">${eye(EYE_L, l)}${eye(EYE_R, r)}</g>${brows}${mouth(m, id, fangs)}`
    + `<ellipse cx="124" cy="236" rx="13" ry="8" fill="${C.BLUSH}" opacity=".5"/><ellipse cx="276" cy="236" rx="13" ry="8" fill="${C.BLUSH}" opacity=".5"/>`;
}

function zzz(x: number, y: number): string {
  return [1, 0.75, 0.55].map((k, i) => {
    const zx = x + i * 22, zy = y - i * 26, w = 18 * k;
    return `<path d="M${zx} ${zy}h${w}l${-w} ${w}h${w}" fill="none" stroke="${C.V}" stroke-width="${5 * k + 1}" stroke-linecap="round" stroke-linejoin="round" opacity="${0.9 - i * 0.2}"/>`;
  }).join("");
}

const DRIPS = [[100, 110, 24, 78], [178, 110, 18, 42], [262, 110, 24, 66], [300, 110, 16, 40]] as const;
const BUMPS = [[146, 126, 16], [222, 128, 18], [296, 124, 14]] as const;

function syrup(color: string, grow = 0): string {
  return `<rect x="80" y="80" width="240" height="${46 + grow}" fill="${color}"/>`
    + BUMPS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + grow}" fill="${color}"/>`).join("")
    + DRIPS.map(([x, top, w, len]) => {
      const ww = w + grow * 2;
      return `<rect x="${x - grow}" y="${top}" width="${ww}" height="${len + grow}" rx="${ww / 2}" fill="${color}"/>`
        + `<circle cx="${x + w / 2}" cy="${top + len + grow - ww / 2}" r="${ww / 2 + 3}" fill="${color}"/>`;
    }).join("");
}

const BUTTER = `<g transform="rotate(-8 204 78)"><rect x="170" y="71" width="68" height="30" rx="9" fill="${C.BUTTER_SIDE}"/>`
  + `<rect x="170" y="63" width="68" height="28" rx="9" fill="${C.BUTTER}"/>`
  + `<rect x="178" y="68" width="24" height="6" rx="3" fill="#fff" opacity=".75"/></g>`;

function arm(side: "l" | "r", angle: number): string {
  const [sx, sy] = side === "l" ? SHOULDER_L : SHOULDER_R, bend = side === "l" ? -10 : 10;
  return `<g transform="translate(${sx} ${sy})"><g class="hb-arm-${side}" transform="rotate(${angle})" style="--hb-a:${angle}deg">`
    + `<path d="M0 0Q${bend} 36 0 72" fill="none" stroke="${C.A_DARK}" stroke-width="26" stroke-linecap="round"/>`
    + `<circle cx="0" cy="72" r="17" fill="${C.A}"/></g></g>`;
}

const COSTUMES = {
  headset: {
    behindHat: `<path d="M84 206C70 0 330 0 316 206" fill="none" stroke="${C.GEAR}" stroke-width="14" stroke-linecap="round"/>`,
    front: `<path d="M82 230Q96 272 144 266" fill="none" stroke="${C.GEAR}" stroke-width="7" stroke-linecap="round"/><circle cx="148" cy="265" r="10" fill="${C.GEAR}"/>`
      + `<rect x="62" y="176" width="34" height="62" rx="15" fill="${C.GEAR}"/><rect x="304" y="176" width="34" height="62" rx="15" fill="${C.GEAR}"/>`
      + `<rect x="70" y="188" width="8" height="38" rx="4" fill="${C.V}"/><rect x="322" y="188" width="8" height="38" rx="4" fill="${C.V}"/>`,
  },
  party: {
    hat: `<g transform="rotate(10 204 70)"><path d="M174 98L206 8L238 98Z" fill="#4fd1ff"/>`
      + `<path d="M186 64L222 64L228 80L182 80ZM196 36L214 36L218 48L193 48Z" fill="#ff7ac6"/>`
      + `<circle cx="206" cy="10" r="12" fill="${C.A}"/><ellipse cx="206" cy="98" rx="34" ry="7" fill="#2fb3e0"/></g>`,
  },
} as const;
export type HoffyCostume = keyof typeof COSTUMES;

export type HoffyOptions = {
  face?: HoffyFace;
  pose?: HoffyPose;
  costume?: HoffyCostume;
  /** Draw the legs and the floor shadow (off for head-and-shoulders crops). */
  legs?: boolean;
  /** Prefix for the SVG ids, unique on the page. */
  base?: string;
  /** Accessible name; without one the drawing is hidden from screen readers. */
  label?: string;
};

export function hoffySvg({ face: faceName = "happy", pose = "wave", costume, legs = true, base = "hoffy", label }: HoffyOptions = {}): string {
  const k: { back?: string; behindHat?: string; front?: string; hat?: string } = costume ? COSTUMES[costume] : {};
  const [al, ar] = HOFFY_POSES[pose];
  const clip = `${base}-c`;
  const body = `x="80" y="92" width="240" height="232" rx="58"`;
  let cells = "";
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    cells += `<rect x="${104.5 + i * 51}" y="${118 + j * 51}" width="38" height="38" rx="10" fill="${C.A_MID}"/>`;
  }
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, "&quot;")}"` : `aria-hidden="true"`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" class="hb" ${a11y} focusable="false">`,
    legs ? `<ellipse class="hb-shadow" cx="200" cy="368" rx="118" ry="12" fill="#1b1036" opacity=".13"/>` : "",
    k.back ?? "",
    legs ? `<g class="hb-legs"><rect x="146" y="300" width="34" height="58" rx="17" fill="${C.A_DARK}"/><rect x="220" y="300" width="34" height="58" rx="17" fill="${C.A_DARK}"/>`
      + `<ellipse cx="158" cy="360" rx="30" ry="14" fill="${C.V}"/><ellipse cx="242" cy="360" rx="30" ry="14" fill="${C.V}"/></g>` : "",
    arm("l", al), arm("r", ar),
    `<g class="hb-body"><clipPath id="${clip}"><rect ${body}/></clipPath>`,
    `<filter id="${clip}s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>`,
    `<rect x="80" y="104" width="240" height="232" rx="58" fill="${C.A_DEEP}"/><rect ${body} fill="${C.A}"/>${cells}`,
    `<g clip-path="url(#${clip})"><g class="hb-syrup"><g opacity=".5" filter="url(#${clip}s)">${syrup(C.SOAK, 9)}</g>${syrup(C.V)}</g></g></g>`,
    k.behindHat ?? "",
    `<g class="hb-face">${face(faceName, `${base}-m`, false)}</g>`,
    k.front ?? "",
    `<g class="hb-hat">${k.hat ?? BUTTER}</g>`,
    faceName === "sleepy" ? `<g class="hb-z">${zzz(312, 72)}</g>` : "",
    `</svg>`,
  ].join("");
}
