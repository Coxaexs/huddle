/**
 * A guest's username, made from the name they typed so pickers and mentions
 * read "deniz-51ee" rather than "guest-51ee2e58". Turkish letters are spelled
 * out in plain Latin; a name with nothing usable falls back to "guest".
 * Always 2–24 characters of [a-z0-9-], which validateUsername accepts.
 */
const PLAIN: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

export function guestUsername(displayName: string, suffix: string): string {
  const base = Array.from(displayName.toLocaleLowerCase("tr"))
    .map((ch) => PLAIN[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 14);
  return `${base.length >= 2 ? base : "guest"}-${suffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "0"}`;
}
