/** Finding invite codes in message text and URLs, and building invite links. */

/**
 * sessionStorage: a server invite someone accepted on the sign-up screen, so
 * the shell joins it after the account is made instead of asking again.
 */
export const ACCEPTED_INVITE_KEY = "hoffle-accepted-invite";

/** Hosts whose /i/CODE links are Hoffle invites (plus whatever host this page is on). */
const INVITE_HOSTS = ["hoffle.online", "www.hoffle.online", "chat.hoffle.online", "deeppixel.online"];

/** Hosts that serve the invite page at /i/CODE rather than /hangout/i/CODE. */
const ROOT_INVITE_HOSTS = ["hoffle.online", "www.hoffle.online", "chat.hoffle.online"];

function inviteHosts(): string[] {
  const here = typeof window !== "undefined" ? window.location?.host?.toLowerCase() : "";
  return here && !INVITE_HOSTS.includes(here) ? [...INVITE_HOSTS, here] : INVITE_HOSTS;
}

const escapeHost = (host: string) => host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Extracts server invite codes from text that contain invite links or codes:
 * the short form (https://hoffle.online/i/CODE) and the older
 * .../hangout?invite=CODE. Short links only count on Hoffle's own hosts, so
 * someone else's /i/ URL never turns into an invite card.
 */
export function extractInviteCodes(text: string): string[] {
  if (!text) return [];
  const codes: string[] = [];
  const add = (code: string | undefined) => {
    const upper = code?.toUpperCase();
    if (upper && !codes.includes(upper)) codes.push(upper);
  };
  const inviteRegex = /(?:https?:\/\/[^\s/?#]+|[a-zA-Z0-9.-]+)?\/hangout\?(?:(?:servercode|code|invite)=)?([A-Za-z0-9_-]{4,24})(?![\w=-])/gi;
  let match: RegExpExecArray | null;
  while ((match = inviteRegex.exec(text)) !== null) add(match[1]);
  const hosts = inviteHosts().map(escapeHost).join("|");
  // The lookbehind keeps "evilhoffle.online" from passing for "hoffle.online".
  const shortRegex = new RegExp(`(?<![\\w.-])(?:https?:\\/\\/)?(?:${hosts})(?:\\/hangout)?\\/i\\/([A-Za-z0-9_-]{4,24})(?![\\w-])`, "gi");
  while ((match = shortRegex.exec(text)) !== null) add(match[1]);
  return codes;
}

/**
 * The link to hand out for an invite code: /i/CODE on this instance, which
 * shows who invited you and to what (also to link previews in WhatsApp,
 * iMessage or Discord) before it sends you into the app.
 */
export function buildUserInviteLink(code: string): string {
  const cleanCode = (code || "").trim().toUpperCase();
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://chat.hoffle.online";
  // Hoffle's own hosts serve /i/ at the root; elsewhere (deeppixel.online)
  // the app, and so the invite page, only lives under /hangout.
  const host = typeof window !== "undefined" ? window.location?.host?.toLowerCase() || "" : "";
  const path =
    !ROOT_INVITE_HOSTS.includes(host) &&
    typeof window !== "undefined" &&
    window.location?.pathname?.startsWith("/hangout")
      ? "/hangout"
      : "";
  return `${origin}${path}/i/${encodeURIComponent(cleanCode)}`;
}

/** Extracts an invite code from a URL or query string if present. */
export function extractInviteCodeFromUrl(urlOrSearch: string): string {
  if (!urlOrSearch) return "";
  try {
    let search = "";
    if (urlOrSearch.includes("?")) {
      search = urlOrSearch.slice(urlOrSearch.indexOf("?"));
    } else if (
      urlOrSearch.startsWith("http://") ||
      urlOrSearch.startsWith("https://") ||
      urlOrSearch.startsWith("/")
    ) {
      // Full URL or path without query string has no invite parameters
      return "";
    } else {
      search = urlOrSearch.startsWith("?") ? urlOrSearch : `?${urlOrSearch}`;
    }

    if (!search || search === "?") return "";

    const params = new URLSearchParams(search);
    let code = (
      params.get("invite") ||
      params.get("code") ||
      params.get("servercode") ||
      ""
    ).trim();

    // Also support ?CODE (e.g. ?HX3F-9K2Q or ?ABCD1234 without key=value)
    if (!code && search.length > 1 && !search.includes("=")) {
      const bare = decodeURIComponent(search.slice(1)).trim();
      if (/^[A-Za-z0-9_-]{4,32}$/.test(bare)) {
        code = bare;
      }
    }

    return code.toUpperCase();
  } catch {
    return "";
  }
}
