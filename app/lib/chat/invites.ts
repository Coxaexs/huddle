/** Finding Hangout invite codes in message text and URLs. */

/** Extracts server invite codes from text that contain hangout invite links or codes. */
export function extractInviteCodes(text: string): string[] {
  if (!text) return [];
  const inviteRegex = /(?:https?:\/\/[^\s/?#]+|[a-zA-Z0-9.-]+)?\/hangout\?(?:(?:servercode|code|invite)=)?([A-Za-z0-9_-]{4,24})\b/gi;
  const codes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = inviteRegex.exec(text)) !== null) {
    const code = match[1]?.toUpperCase();
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes;
}

/** Builds a full user registration invite link for a given code. */
export function buildUserInviteLink(code: string): string {
  const cleanCode = (code || "").trim().toUpperCase();
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://deeppixel.online";
  const path =
    typeof window !== "undefined" && window.location?.pathname?.startsWith("/hangout")
      ? "/hangout"
      : "";
  return `${origin}${path || "/hangout"}?invite=${encodeURIComponent(cleanCode)}`;
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
