/**
 * Stock display pictures in the spirit of Messenger's built-in set (the duck,
 * the chess pieces, the soccer ball…), drawn as small SVGs so there's nothing
 * to download. Picking one renders it to a PNG and uploads it as your avatar.
 */

const frame = (bg: [string, string], body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">` +
  `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>` +
  `<radialGradient id="shine" cx=".3" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/>` +
  `<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
  `<rect width="96" height="96" fill="url(#bg)"/>${body}</svg>`;

export interface MsnPicture {
  id: string;
  name: string;
  svg: string;
}

export const MSN_PICTURES: MsnPicture[] = [
  {
    id: "duck",
    name: "Rubber Duck",
    svg: frame(
      ["#9fd6ff", "#3f8fd9"],
      `<ellipse cx="48" cy="84" rx="40" ry="8" fill="#2f7ac6" opacity=".6"/>` +
        `<ellipse cx="50" cy="66" rx="30" ry="18" fill="#ffd21f"/>` +
        `<circle cx="36" cy="40" r="17" fill="#ffd21f"/>` +
        `<path d="M18 42 q-10 2 -8 8 q8 2 12 -2z" fill="#ff8a1f"/>` +
        `<circle cx="32" cy="36" r="3.2" fill="#222"/><circle cx="31" cy="35" r="1" fill="#fff"/>` +
        `<path d="M52 60 q14 -6 22 4 q-10 10 -22 4z" fill="#f2bb00"/>` +
        `<ellipse cx="44" cy="58" rx="26" ry="14" fill="url(#shine)"/>`,
    ),
  },
  {
    id: "chess",
    name: "Chess",
    svg: frame(
      ["#f1e3c4", "#b08a5a"],
      `<path d="M0 70 h96 v26 h-96z" fill="#6b4a2b" opacity=".35"/>` +
        `<path d="M30 82 h36 l-3 -8 h-30z" fill="#1d1d1d"/>` +
        `<path d="M36 74 q2 -14 -6 -22 q-2 -14 12 -24 q14 -4 20 10 q-8 2 -10 8 q10 6 12 28z" fill="#1d1d1d"/>` +
        `<circle cx="44" cy="36" r="2" fill="#fff"/>` +
        `<path d="M40 30 q4 -6 12 -4" stroke="#555" stroke-width="2" fill="none"/>`,
    ),
  },
  {
    id: "soccer",
    name: "Soccer Ball",
    svg: frame(
      ["#8be07a", "#2f9a2f"],
      `<ellipse cx="48" cy="84" rx="28" ry="6" fill="#1d6b1d" opacity=".5"/>` +
        `<circle cx="48" cy="48" r="30" fill="#fff" stroke="#222" stroke-width="2"/>` +
        `<path d="M48 36 l11 8 -4 13 h-14 l-4 -13z" fill="#222"/>` +
        `<path d="M48 18 v8 M72 36 l-8 5 M67 70 l-6 -8 M29 70 l6 -8 M24 36 l8 5" stroke="#222" stroke-width="3"/>` +
        `<path d="M40 19 l8 7 8 -7 M18 44 l6 -3 M78 44 l-6 -3" stroke="#222" stroke-width="3" fill="none"/>` +
        `<circle cx="48" cy="48" r="30" fill="url(#shine)"/>`,
    ),
  },
  {
    id: "dog",
    name: "Puppy",
    svg: frame(
      ["#ffe3b3", "#e8a95a"],
      `<ellipse cx="48" cy="58" rx="26" ry="24" fill="#c98a4b"/>` +
        `<ellipse cx="24" cy="46" rx="9" ry="18" fill="#7a4a22" transform="rotate(18 24 46)"/>` +
        `<ellipse cx="72" cy="46" rx="9" ry="18" fill="#7a4a22" transform="rotate(-18 72 46)"/>` +
        `<ellipse cx="48" cy="68" rx="14" ry="10" fill="#f1d3ad"/>` +
        `<ellipse cx="48" cy="62" rx="6" ry="4" fill="#222"/>` +
        `<circle cx="38" cy="50" r="3.5" fill="#222"/><circle cx="58" cy="50" r="3.5" fill="#222"/>` +
        `<path d="M48 66 v6 q-4 4 -8 1 M48 72 q4 4 8 1" stroke="#222" stroke-width="2" fill="none"/>` +
        `<ellipse cx="54" cy="80" rx="4" ry="6" fill="#ff7b9c"/>`,
    ),
  },
  {
    id: "cat",
    name: "Kitty",
    svg: frame(
      ["#e3d4ff", "#9b7ee0"],
      `<path d="M24 34 l6 -18 12 12z M72 34 l-6 -18 -12 12z" fill="#8a8a8a"/>` +
        `<circle cx="48" cy="54" r="26" fill="#a3a3a3"/>` +
        `<ellipse cx="38" cy="50" rx="5" ry="6" fill="#9be35a"/><ellipse cx="58" cy="50" rx="5" ry="6" fill="#9be35a"/>` +
        `<ellipse cx="38" cy="50" rx="1.8" ry="5" fill="#222"/><ellipse cx="58" cy="50" rx="1.8" ry="5" fill="#222"/>` +
        `<path d="M45 60 h6 l-3 3z" fill="#ff8fab"/>` +
        `<path d="M48 63 q-4 5 -8 2 M48 63 q4 5 8 2 M20 58 h14 M20 64 l14 -2 M76 58 h-14 M76 64 l-14 -2" stroke="#444" stroke-width="1.5" fill="none"/>`,
    ),
  },
  {
    id: "flower",
    name: "Daisy",
    svg: frame(
      ["#bff0ff", "#69c3ea"],
      `<path d="M48 56 q-4 20 0 40" stroke="#3f9a3f" stroke-width="4" fill="none"/>` +
        `<ellipse cx="38" cy="80" rx="10" ry="4" fill="#4caf50" transform="rotate(-30 38 80)"/>` +
        Array.from({ length: 10 }, (_, i) =>
          `<ellipse cx="48" cy="28" rx="7" ry="16" fill="#fff" stroke="#e8e8e8" transform="rotate(${i * 36} 48 44)"/>`,
        ).join("") +
        `<circle cx="48" cy="44" r="10" fill="#ffcc1f"/><circle cx="45" cy="41" r="4" fill="#fff" opacity=".5"/>`,
    ),
  },
  {
    id: "guitar",
    name: "Guitar",
    svg: frame(
      ["#ffd0c0", "#e2583b"],
      `<rect x="45" y="6" width="7" height="46" fill="#5b3a1f" transform="rotate(30 48 48)"/>` +
        `<rect x="42" y="2" width="13" height="10" rx="2" fill="#2b1a0c" transform="rotate(30 48 48)"/>` +
        `<path d="M30 58 q-12 6 -6 20 q8 14 22 6 q10 -6 6 -16 q6 -6 0 -12 q-10 -6 -22 2z" fill="#c1272d"/>` +
        `<circle cx="38" cy="68" r="5" fill="#2b1a0c"/>` +
        `<path d="M30 58 q-12 6 -6 20" stroke="#fff" stroke-opacity=".4" stroke-width="3" fill="none"/>`,
    ),
  },
  {
    id: "sun",
    name: "Sunny",
    svg: frame(
      ["#fff7b0", "#ffb23f"],
      Array.from({ length: 12 }, (_, i) =>
        `<rect x="46" y="4" width="4" height="14" rx="2" fill="#ff8a00" transform="rotate(${i * 30} 48 48)"/>`,
      ).join("") +
        `<circle cx="48" cy="48" r="24" fill="#ffd21f"/>` +
        `<circle cx="40" cy="44" r="3" fill="#6b3b00"/><circle cx="56" cy="44" r="3" fill="#6b3b00"/>` +
        `<path d="M38 54 q10 10 20 0" stroke="#6b3b00" stroke-width="3" fill="none" stroke-linecap="round"/>` +
        `<circle cx="48" cy="48" r="24" fill="url(#shine)"/>`,
    ),
  },
  {
    id: "car",
    name: "Race Car",
    svg: frame(
      ["#d8e6ff", "#7f9fd6"],
      `<rect y="70" width="96" height="26" fill="#555"/><path d="M0 82 h12 M20 82 h12 M40 82 h12 M60 82 h12 M80 82 h12" stroke="#fff" stroke-width="2"/>` +
        `<path d="M10 64 q2 -12 16 -14 l12 -10 h22 l12 12 q14 2 14 12 v6 h-76z" fill="#e53935"/>` +
        `<path d="M40 42 h18 l9 9 h-31z" fill="#bfe3ff"/>` +
        `<circle cx="28" cy="70" r="8" fill="#222"/><circle cx="28" cy="70" r="3" fill="#aaa"/>` +
        `<circle cx="70" cy="70" r="8" fill="#222"/><circle cx="70" cy="70" r="3" fill="#aaa"/>` +
        `<text x="48" y="64" font-size="10" font-family="Arial" font-weight="700" fill="#fff" text-anchor="middle">7</text>`,
    ),
  },
  {
    id: "butterfly",
    name: "Butterfly",
    svg: frame(
      ["#ffe0f1", "#f07ab8"],
      `<ellipse cx="32" cy="38" rx="18" ry="16" fill="#7c4dff"/><ellipse cx="64" cy="38" rx="18" ry="16" fill="#7c4dff"/>` +
        `<ellipse cx="34" cy="64" rx="13" ry="12" fill="#26c6da"/><ellipse cx="62" cy="64" rx="13" ry="12" fill="#26c6da"/>` +
        `<circle cx="30" cy="36" r="6" fill="#fff" opacity=".6"/><circle cx="66" cy="36" r="6" fill="#fff" opacity=".6"/>` +
        `<rect x="45" y="30" width="6" height="44" rx="3" fill="#333"/>` +
        `<path d="M47 30 q-6 -12 -12 -14 M49 30 q6 -12 12 -14" stroke="#333" stroke-width="2" fill="none"/>`,
    ),
  },
  {
    id: "beach",
    name: "Beach",
    svg: frame(
      ["#7fd4ff", "#ffe29a"],
      `<circle cx="74" cy="20" r="10" fill="#fff59d"/>` +
        `<path d="M0 64 q24 -8 48 0 t48 0 v8 h-96z" fill="#2a9df4"/>` +
        `<path d="M0 72 h96 v24 h-96z" fill="#f3d38a"/>` +
        `<path d="M30 80 q2 -30 8 -44" stroke="#8d5a2b" stroke-width="5" fill="none"/>` +
        `<path d="M38 36 q-16 -4 -24 6 q12 -2 24 -6 q-6 -14 -20 -12 q12 4 20 12 q8 -14 24 -10 q-14 2 -24 10 q16 0 22 10 q-12 -6 -22 -10z" fill="#2e9d44"/>`,
    ),
  },
  {
    id: "fish",
    name: "Goldfish",
    svg: frame(
      ["#b3ecff", "#1f8fcf"],
      `<circle cx="20" cy="26" r="4" fill="none" stroke="#fff" stroke-opacity=".7"/><circle cx="28" cy="16" r="3" fill="none" stroke="#fff" stroke-opacity=".7"/>` +
        `<path d="M72 48 l16 -14 v28z" fill="#ff7a1f"/>` +
        `<ellipse cx="48" cy="48" rx="28" ry="18" fill="#ff9a1f"/>` +
        `<path d="M40 30 q10 -8 20 2 z M42 66 q8 8 16 -2z" fill="#ff7a1f"/>` +
        `<circle cx="32" cy="44" r="5" fill="#fff"/><circle cx="31" cy="44" r="2.5" fill="#222"/>` +
        `<ellipse cx="44" cy="42" rx="18" ry="8" fill="url(#shine)"/>`,
    ),
  },
];

/** Renders a stock picture to a PNG file ready for /api/uploads. */
export async function msnPictureFile(picture: MsnPicture, size = 192): Promise<File> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(picture.svg)}`;
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Couldn't draw that picture."));
    image.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw that picture.");
  ctx.drawImage(image, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't draw that picture.");
  return new File([blob], `${picture.id}.png`, { type: "image/png" });
}
