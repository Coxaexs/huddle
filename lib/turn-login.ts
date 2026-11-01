/**
 * Relay logins minted per person, in coturn's REST scheme (`use-auth-secret`
 * with `static-auth-secret` in turnserver.conf): the username is
 * `<expiry>:<user>` and the password its HMAC-SHA1 under the shared secret, so
 * coturn checks them without a user list and refuses them once they expire.
 *
 * A fixed username and password in HUDDLE_ICE_SERVERS went to every signed-in
 * person, guests included, and worked forever: anyone who had it once could
 * relay whatever they liked through our servers. An entry listed without
 * them gets a login minted here instead.
 */

/** How long a minted login works. The app fetches a new one on joining voice when it is close. */
export const TURN_LOGIN_TTL_S = 24 * 60 * 60;

export async function turnLogin(
  secret: string,
  userId: string,
  nowMs = Date.now(),
): Promise<{ username: string; credential: string; expiresAt: number }> {
  const expiry = Math.floor(nowMs / 1000) + TURN_LOGIN_TTL_S;
  const username = `${expiry}:${userId}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  return { username, credential: btoa(binary), expiresAt: expiry * 1000 };
}

function hasTurn(server: RTCIceServer): boolean {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => /^turns?:/i.test(url));
}

/**
 * Fills in a minted login for each TURN entry configured without one. Entries
 * that still carry a fixed login keep it, so each relay can be switched over
 * on its own. `expiresAt` is set when anything was minted.
 */
export async function withTurnLogins(
  servers: RTCIceServer[],
  secret: string | undefined,
  userId: string,
): Promise<{ iceServers: RTCIceServer[]; expiresAt?: number }> {
  const needs = servers.some((server) => hasTurn(server) && !server.username && !server.credential);
  if (!secret || !needs) return { iceServers: servers };
  const login = await turnLogin(secret, userId);
  return {
    iceServers: servers.map((server) =>
      hasTurn(server) && !server.username && !server.credential
        ? { ...server, username: login.username, credential: login.credential }
        : server,
    ),
    expiresAt: login.expiresAt,
  };
}
