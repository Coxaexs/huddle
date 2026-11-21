/**
 * Steam, for Play together (lib/play-together.ts):
 * - "Sign in through Steam" (OpenID 2.0) to link a Steam account, so we know
 *   whose lobby to look up. It proves the account without any password or
 *   key reaching us.
 * - GetPlayerSummaries (needs STEAM_WEB_API_KEY) to see the game and lobby a
 *   linked host is in. Steam fills `lobbysteamid` while someone sits in a
 *   joinable lobby and their game details are visible.
 * - The `steam://` links a joiner's computer opens. Steam's own "Join Game"
 *   in the friends list does exactly this: `steam://joinlobby/<app>/<lobby>/
 *   <friend>`, and Steam starts the game with `+connect_lobby <lobby>`.
 */

export const STEAM_OPENID_LOGIN = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https?:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})\/?$/;

/** A SteamID64 of an individual account: 17 digits starting 7656119. */
export function isSteamId(value: unknown): value is string {
  return typeof value === "string" && /^7656119\d{10}$/.test(value);
}

/** Where to send someone to sign in through Steam. */
export function steamLoginUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_LOGIN}?${params.toString()}`;
}

/**
 * Checks Steam's answer and returns the signed-in SteamID64, or null. The
 * assertion is only trusted after Steam itself confirms it
 * (check_authentication), and only for the return address we asked for.
 */
export async function verifySteamLogin(
  params: URLSearchParams,
  expectedReturnTo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (params.get("openid.mode") !== "id_res") return null;
  if (params.get("openid.op_endpoint") !== STEAM_OPENID_LOGIN) return null;
  const returnTo = params.get("openid.return_to") || "";
  if (returnTo !== expectedReturnTo) return null;
  const claimed = CLAIMED_ID.exec(params.get("openid.claimed_id") || "");
  if (!claimed) return null;
  if (params.get("openid.identity") !== params.get("openid.claimed_id")) return null;

  const check = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith("openid.")) check.set(key, value);
  }
  check.set("openid.mode", "check_authentication");
  try {
    const response = await fetchImpl(STEAM_OPENID_LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: check.toString(),
    });
    if (!response.ok) return null;
    const text = await response.text();
    return /(^|\n)is_valid\s*:\s*true(\n|$)/.test(text) ? claimed[1] : null;
  } catch {
    return null;
  }
}

export interface SteamPresence {
  personaName: string;
  /** Profile is public (communityvisibilitystate 3); otherwise Steam hides the game. */
  visible: boolean;
  /** The Steam app id they are in, if Steam says. */
  appId: number | null;
  /** The lobby they sit in, if it is joinable and Steam shares it. */
  lobbyId: string | null;
}

/** Reads one account's summary. null when the key is missing or Steam fails. */
export async function steamPresence(
  steamId: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamPresence | null> {
  if (!apiKey || !isSteamId(steamId)) return null;
  const url =
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?" +
    new URLSearchParams({ key: apiKey, steamids: steamId }).toString();
  try {
    const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      response?: { players?: Array<Record<string, unknown>> };
    };
    const player = data.response?.players?.[0];
    if (!player) return null;
    const appId = Number(player.gameid);
    const lobby = String(player.lobbysteamid ?? "");
    return {
      personaName: String(player.personaname ?? "").slice(0, 64),
      visible: Number(player.communityvisibilitystate) === 3,
      appId: Number.isInteger(appId) && appId > 0 ? appId : null,
      lobbyId: /^\d{15,20}$/.test(lobby) && lobby !== "0" ? lobby : null,
    };
  } catch {
    return null;
  }
}

export function steamJoinLobbyUrl(appId: number, lobbyId: string, hostSteamId: string): string {
  return `steam://joinlobby/${appId}/${lobbyId}/${hostSteamId}`;
}

export function steamRunUrl(appId: number): string {
  return `steam://run/${appId}`;
}

export function steamAddFriendUrl(steamId: string): string {
  return `steam://friends/add/${steamId}`;
}

/**
 * The only non-web links Hoffle will open for someone: starting or joining a
 * game through Steam, or adding a Steam friend. The desktop apps and the
 * /play/launch page check links against this same list.
 */
export const GAME_LINK_PATTERN =
  /^steam:\/\/(?:joinlobby\/\d{1,10}\/\d{15,20}\/7656119\d{10}|run\/\d{1,10}|rungameid\/\d{1,20}|friends\/add\/7656119\d{10})$/;

export function isGameLink(url: unknown): url is string {
  return typeof url === "string" && GAME_LINK_PATTERN.test(url);
}
