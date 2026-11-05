/**
 * Whether a mail really is from an authority we act on, and which links it
 * names. Anyone can write any From line, and anyone can write their own
 * Authentication-Results header into a mail, so only the topmost one counts,
 * and only when our own mail server (authServer) wrote it. Anything unclear
 * is not verified: the phone still rings, and a person decides.
 */
function headerLines(raw) {
  const end = raw.search(/\r?\n\r?\n/);
  const block = end === -1 ? raw : raw.slice(0, end);
  return block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);
}

export function isVerifiedOrder(raw, senders, authServer) {
  const lines = headerLines(raw);
  const from = lines.filter((line) => /^from:/i.test(line));
  if (from.length !== 1) return false;
  const addresses = from[0].match(/[^\s<>"(),;:]+@[^\s<>"(),;:]+/g) || [];
  if (addresses.length !== 1) return false;
  const domain = addresses[0].split("@")[1].toLowerCase();
  if (!senders.includes(domain)) return false;

  const results = lines.find((line) => /^authentication-results:/i.test(line));
  if (!results) return false;
  const value = results.slice(results.indexOf(":") + 1).trim();
  if (value.split(/[;\s]/)[0].toLowerCase() !== authServer.toLowerCase()) return false;
  return value
    .split(";")
    .some((part) => /\bdkim=pass\b/i.test(part) && new RegExp(`header\\.[di]=@?${domain.replace(/\./g, "\\.")}(\\s|$)`, "i").test(part.trim()));
}

export function parseSenders(list) {
  return String(list || "").split(",").map((domain) => domain.trim().toLowerCase()).filter(Boolean);
}

/** Every web link in a mail's text. */
export function linksIn(text) {
  const found = String(text || "").match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  return [...new Set(found.map((link) => link.replace(/&amp;/g, "&").replace(/[.,;]+$/, "")))];
}
