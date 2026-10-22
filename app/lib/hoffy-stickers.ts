/**
 * Hoffy, the mascot, as a sticker pack every server has. The SVGs live in
 * public/stickers/hoffy (made by the launch kit's make-stickers.mjs); the
 * animated ones carry their animation in CSS, so they move in any <img>.
 * Sending one posts its path as a message, like any other sticker.
 */
export const HOFFY_STICKERS = [
  { id: "hi", tags: "hi hello hey wave selam merhaba" },
  { id: "lol", tags: "lol haha laugh funny gülmek komik" },
  { id: "yay", tags: "yay party hooray celebrate parti kutlama" },
  { id: "zzz", tags: "zzz sleepy tired night uyku uykulu gece" },
  { id: "love", tags: "love heart cute aşk kalp sevgi" },
  { id: "omg", tags: "omg wow shocked surprised şok vay" },
  { id: "sad", tags: "sad sorry cry üzgün ağlamak" },
  { id: "cool", tags: "cool sunglasses hacker matrix havalı" },
  { id: "wink", tags: "wink ok sure göz kırpmak" },
  { id: "spooky", tags: "spooky vampire halloween vampir cadılar" },
  { id: "in-voice", tags: "voice call talk headset ses arama konuş" },
  { id: "gg", tags: "gg dnd dice wizard nat20 zar büyücü" },
] as const;

export const hoffyStickerUrl = (id: string) => `/hangout/stickers/hoffy/${id}.svg`;

/** Stickers whose id or tags contain every word of the search. */
export function hoffyStickerItems(query: string): Array<{ id: string; name: string; url: string }> {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return HOFFY_STICKERS.filter((s) => words.every((w) => `${s.id} ${s.tags}`.includes(w))).map((s) => ({
    id: `hoffy-${s.id}`,
    name: `Hoffy: ${s.id}`,
    url: hoffyStickerUrl(s.id),
  }));
}
