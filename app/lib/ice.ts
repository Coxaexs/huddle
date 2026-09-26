/**
 * The parts of ICE configuration worth being able to reason about on their own.
 *
 * Voice is peer-to-peer, so the relay only matters to people whose networks
 * refuse a direct connection — and every way it can be wrong is silent. A TURN
 * server that answers but advertises a private address, or an address the
 * machine no longer has, finishes the ICE handshake and then carries no media.
 * The only clue is that some friends cannot hear each other while everyone else
 * sounds fine, which is why the app checks the relay itself.
 */

/**
 * Describes why an address could never carry media from another network, or an
 * empty string when it is fine. Mirrors `addressVerdict` in
 * scripts/check-turn.mjs, which asks the same question from a terminal.
 */
export function privateAddress(address: string): string {
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(address);
  if (ipv4) {
    const first = Number(ipv4[1]);
    const second = Number(ipv4[2]);
    if (first === 0) return "unspecified";
    if (first === 10) return "private";
    if (first === 127) return "loopback";
    if (first === 169 && second === 254) return "link-local";
    if (first === 172 && second >= 16 && second <= 31) return "private";
    if (first === 192 && second === 168) return "private";
    if (first === 100 && second >= 64 && second <= 127) return "carrier-grade NAT";
    if (first >= 224) return "reserved";
    return "";
  }
  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return "loopback";
  if (lower.startsWith("fe80")) return "link-local";
  if (lower.startsWith("fc") || lower.startsWith("fd")) return "unique-local";
  return "";
}

/**
 * Just the TURN entries of an ICE server list, with the other URL kinds in the
 * same server object dropped: a relay check has to ask only the relay.
 */
export function turnOnly(servers: RTCIceServer[]): RTCIceServer[] {
  return servers.flatMap((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    const turn = urls.filter((url) => /^turns?:/i.test(url));
    return turn.length ? [{ ...server, urls: turn }] : [];
  });
}
