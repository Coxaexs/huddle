/**
 * The hoffle.online guestbook: the live channel on the landing page.
 *
 * Visitors without an account can post plain text into one real, public
 * channel: everyone on the landing page sees it. In the app it lives in its
 * own server whose only members are the moderators below, who delete what
 * shouldn't be there.
 *
 * Everything here is pure so the filters can be tested without a request.
 * Because anyone on the internet can post, the rules are strict on purpose:
 * no links, no images, no swearing, and no names that pass for the team.
 */

export const GUESTBOOK_SERVER_ID = "hoffle-online-visitors";
export const GUESTBOOK_CHANNEL_ID = "hoffle-online-say-hi";
export const GUESTBOOK_CHANNEL_NAME = "say-hi";

/** Usernames that see and moderate the guestbook. The first one owns the server. */
export const GUESTBOOK_MODERATORS = ["flo", "kiwi"] as const;

/** Dice skins a visitor's /roll may use: the app picks these from the active theme. */
export const GUESTBOOK_DICE_THEMES = ["default", "vampire", "dark-academia", "matrix", "cyberpunk"] as const;

export const MAX_GUEST_TEXT = 500;
export const MIN_GUEST_NAME = 2;
export const MAX_GUEST_NAME = 24;

/** Per-IP budgets for posting. Checked in this order. */
export const GUESTBOOK_RATE_LIMITS = [
  { action: "guestbook-min", limit: 5, windowSeconds: 60 },
  { action: "guestbook-hour", limit: 20, windowSeconds: 60 * 60 },
  { action: "guestbook-day", limit: 60, windowSeconds: 24 * 60 * 60 },
] as const;

export type GuestCheck = { ok: true; value: string } | { ok: false; error: string };

/* ─── Normalising ─────────────────────────────────────────────────────── */

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a",
  "5": "s", "$": "s", "7": "t", "8": "b", "9": "g", "+": "t",
};

/** Lowercase, no accents, dotless i folded, leetspeak undone. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[0-9!|@$+]/g, (ch) => LEET[ch] ?? ch);
}

/** "fuuuck" → "fuck". Swear roots below are written in this squashed form. */
function squash(word: string): string {
  return word.replace(/(.)\1+/g, "$1");
}

/** "assss" → "ass": runs of three or more cut to two, for the exact-word list. */
function trimRuns(word: string): string {
  return word.replace(/(.)\1{2,}/g, "$1$1");
}

/**
 * The words of a text, folded. Single letters spelled out with gaps
 * ("f u c k", "f.u.c.k") are joined back into one word as well.
 */
function words(text: string): string[] {
  const parts = fold(text).split(/[^\p{L}]+/u).filter(Boolean);
  const out = [...parts];
  let run = "";
  for (const part of parts) {
    if (part.length === 1) {
      run += part;
    } else {
      if (run.length > 2) out.push(run);
      run = "";
    }
  }
  if (run.length > 2) out.push(run);
  return out;
}

/* ─── Swearing ────────────────────────────────────────────────────────── */

/** Blocked anywhere inside a word (squashed form). English, Turkish, Dutch. */
const SWEAR_ROOTS = [
  "fuck", "shit", "cunt", "niga", "niger", "fagot", "bitch", "whore", "slut",
  "ashole", "dickhead", "cocksucker", "porn", "twat", "jiz", "retard", "bastard", "pusy",
  "orospu", "siktir", "sikerim", "sikim", "sikis", "aminakoy", "amcik", "yarak", "pezevenk",
  "kahpe", "yavsak", "gavat",
  "godverdome", "klotzak",
];

/** Blocked only as a whole word, because they hide inside harmless ones. */
const SWEAR_WORDS = new Set([
  "ass", "arse", "asses", "tits", "titties", "cum", "fag", "fags", "dick", "dicks",
  "cock", "cocks", "prick", "piss", "pissed", "boobs", "kys", "fuk", "fuking", "fukin",
  "wank", "wanker", "wanking", "wankers",
  "amk", "aq", "sik", "ibne",
  "kut", "kanker", "tering", "hoer", "mongool",
]);

/** Real words that contain a root above. */
const ALLOWED_WORDS = new Set(["niger", "nigeria", "nigerian", "nigerien", "scunthorpe", "shiitake", "shitake"]);

export function containsSwearing(text: string): boolean {
  for (const word of words(text)) {
    if (ALLOWED_WORDS.has(word)) continue;
    if (SWEAR_WORDS.has(trimRuns(word)) || SWEAR_WORDS.has(word)) return true;
    const squashed = squash(word);
    if (SWEAR_ROOTS.some((root) => squashed.includes(root))) return true;
  }
  return false;
}

/* ─── Links and images ────────────────────────────────────────────────── */

const TLDS =
  "com|net|org|io|gg|co|me|ly|tv|xyz|ru|su|cn|info|biz|online|site|app|dev|link|live|shop|store|club|top|click|" +
  "in|uk|de|nl|tr|fr|be|eu|us|ca|au|ai|so|to|cc|ws|tk|ml|ga|cf|gq|pw|vip|win|bet|cam|lol|fun|pro|one|page|sh|gl|" +
  "ink|sex|porn|xxx|onion|ms|gd|im|is|it|es|pl|br|jp|kr|id|vn|ph|pk|bd|ng|za|mx|ar|cl|ch|at|se|no|dk|fi|ie|pt|gr|" +
  "ro|hu|cz|sk|ua|by|kz|ir|sa|ae|il|nz|sg|my|hk|tw|tech|space|website|today|world|email|network|zone|stream|chat|social|art";

const LINK_PATTERNS = [
  /\b(?:https?|ftp|file|data|javascript|mailto|discord|steam|tg|magnet):/i,
  /\bwww\s*\./i,
  // name.tld, or name (dot) tld / name[dot]tld written out.
  new RegExp(`[\\p{L}\\p{N}-]+(?:\\.|\\s*[(\\[{]\\s*(?:dot|nokta|punt)\\s*[)\\]}]\\s*)(?:${TLDS})\\b`, "iu"),
  // "example . com": sentences never put a space before a full stop.
  new RegExp(`[\\p{L}\\p{N}]\\s+\\.\\s*(?:${TLDS})\\b`, "iu"),
  // Bare IP addresses.
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
  // Invite-style paths: discord.gg/abc is caught above, "gg/abc" alone is not.
  /\b(?:gg|com|net|org)\s*\/\s*\w/i,
];

export function containsLink(text: string): boolean {
  return LINK_PATTERNS.some((pattern) => pattern.test(text));
}

const IMAGE_PATTERNS = [
  /!\[[^\]]*\]\(/, // markdown image
  /<\s*(?:img|image|svg|video|iframe|picture|source|object|embed)\b/i,
  /\[\s*img\s*\]/i, // bbcode
  /\b[\w-]+\.(?:png|jpe?g|gif|webp|bmp|svg|heic|avif|tiff?)\b/i,
  /base64,/i,
];

export function containsImage(text: string): boolean {
  return IMAGE_PATTERNS.some((pattern) => pattern.test(text));
}

/* ─── Checks ──────────────────────────────────────────────────────────── */

/** Control characters and zero-width/bidi marks, which only hide things. */
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

function clean(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(INVISIBLE, "").replace(/\r\n?/g, "\n") : "";
}

function screen(text: string, what: "message" | "name"): string | null {
  if (containsImage(text)) return what === "name" ? "Names can't be file names or images." : "Only text, please. Images can't be sent here.";
  if (containsLink(text)) return what === "name" ? "Names can't contain links." : "Links aren't allowed here. Take out the link and send it again.";
  if (containsSwearing(text)) return what === "name" ? "Please pick a name without swearing." : "Please keep it clean. That message has a word that isn't allowed here.";
  return null;
}

export function checkGuestText(raw: unknown): GuestCheck {
  const text = clean(raw).replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > MAX_GUEST_TEXT) return { ok: false, error: `Keep it under ${MAX_GUEST_TEXT} characters.` };
  const problem = screen(text, "message");
  return problem ? { ok: false, error: problem } : { ok: true, value: text };
}

/** Names that would pass for the Hoffle team or the app itself. */
const RESERVED_NAMES = [
  "admin", "administrator", "moderator", "mod", "mods", "staff", "team", "official", "system",
  "support", "owner", "dev", "developer", "bot", "huddle", "flo", "kiwi", "mewis",
];
/** Reserved anywhere inside a name: "Hoffle Support", "xAdminx". */
const RESERVED_PARTS = ["hoffle", "admin", "moderator", "official"];

export function checkGuestName(raw: unknown): GuestCheck {
  const name = clean(raw).replace(/\s+/g, " ").trim();
  if (name.length < MIN_GUEST_NAME) return { ok: false, error: `Use at least ${MIN_GUEST_NAME} characters.` };
  if (name.length > MAX_GUEST_NAME) return { ok: false, error: `Keep it to ${MAX_GUEST_NAME} characters or fewer.` };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u.test(name)) {
    return { ok: false, error: "Use letters, numbers, spaces, dots, dashes or underscores." };
  }
  // Compared both as typed and with leetspeak undone: "kiwi123" and "k1wi" are both Kiwi.
  const plain = squash(name.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, ""));
  const leet = squash(fold(name).replace(/[^\p{L}]/gu, ""));
  const looksReserved = [plain, leet].some(
    (letters) =>
      RESERVED_NAMES.some((reserved) => letters === squash(reserved)) ||
      RESERVED_PARTS.some((part) => letters.includes(squash(part))),
  );
  if (looksReserved) {
    return { ok: false, error: "That name is kept for the Hoffle team. Pick another one." };
  }
  const problem = screen(name, "name");
  return problem ? { ok: false, error: problem } : { ok: true, value: name };
}

/** A stable name colour, so one visitor keeps one colour in the moderators' view. */
const NAME_COLOURS = ["#e879a6", "#60a5fa", "#f59e0b", "#34d399", "#c084fc", "#f87171", "#22d3ee", "#a3e635"];

export function guestColour(name: string): string {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return NAME_COLOURS[hash % NAME_COLOURS.length];
}
