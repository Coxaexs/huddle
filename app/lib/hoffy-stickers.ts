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

/**
 * The doodle gang from the launch reels, the same loops as on GIPHY and Klipy:
 * animated WebPs in public/stickers/gang (made by the launch kit's app-stickers.py),
 * one with English words and one with Turkish. The picker shows the app's language;
 * the tags hold both, so a search in either finds them.
 */
export const GANG_STICKERS = [
  { id: "hoffy-hi", tags: "hi hello hey wave greeting selam merhaba" },
  { id: "hoffy-voice", tags: "hop in voice chat call join talk gaming sese gel sesli sohbet" },
  { id: "hoffy-gg", tags: "gg good game win victory celebrate kazandık" },
  { id: "hoffy-love", tags: "love it heart aww bayıldım aşk kalp" },
  { id: "hoffy-gn", tags: "gn good night sleepy tired zzz iyi geceler uykum geldi" },
  { id: "toast-seen", tags: "seen left on seen read ignored ghosted görüldü" },
  { id: "toast-k", tags: "k ok okay whatever dry text tmm tamam" },
  { id: "toast-cry", tags: "no noooo cry crying sad tears hayır ağlıyorum üzgün" },
  { id: "pancake-voice", tags: "voice note voice message rambling long sesli mesaj ses kaydı" },
  { id: "pancake-lol", tags: "lol haha laughing funny lmao ahahah gülmek komik" },
  { id: "egg-omw", tags: "omw on my way running late 5 min hurry yoldayım geliyorum geç kaldım" },
  { id: "egg-omg", tags: "omg shocked surprised wow what oha şok şaşkın" },
  { id: "egg-hmm", tags: "hmm suspicious side eye thinking sus şüpheli" },
  { id: "donut-muted", tags: "you're muted mute mic unmute call meeting sesin kapalı mikrofon sessiz" },
  { id: "donut-dance", tags: "dance dancing party music vibing dans parti müzik" },
  { id: "broccoli-salad", tags: "i brought salad healthy broccoli veggies salata getirdim brokoli sağlıklı" },
  { id: "croissant-bonjour", tags: "bonjour hello french croissant fancy bonjur kruvasan" },
  { id: "coffee-jitters", tags: "too much coffee caffeine jittery hyper monday fazla kahve kafein pazartesi" },
  { id: "gang-yay", tags: "yay celebrate happy excited squad party friends yaşasın kutlama arkadaşlar" },
] as const;

export const gangStickerUrl = (id: string, lang: "en" | "tr", preview = false) =>
  `/hangout/stickers/gang/${preview ? "preview/" : ""}${id}-${lang}.webp`;

/** Hoffy's stickers, then the gang's, whose id or tags contain every word of the search. */
export function hoffyStickerItems(
  query: string,
  locale = "en",
): Array<{ id: string; name: string; url: string; preview?: string }> {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = (s: { id: string; tags: string }) => words.every((w) => `${s.id} ${s.tags}`.includes(w));
  const lang = locale === "tr" ? "tr" : "en";
  return [
    ...HOFFY_STICKERS.filter(matches).map((s) => ({
      id: `hoffy-${s.id}`,
      name: `Hoffy: ${s.id}`,
      url: hoffyStickerUrl(s.id),
    })),
    ...GANG_STICKERS.filter(matches).map((s) => ({
      id: `gang-${s.id}`,
      name: s.id.replace("-", ": "),
      url: gangStickerUrl(s.id, lang),
      preview: gangStickerUrl(s.id, lang, true),
    })),
  ];
}
