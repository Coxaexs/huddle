/**
 * Play together: invite people into the real game you are playing (Stardew
 * Valley first), the way Discord's "Ask to Join" works.
 *
 * Discord itself can only do this for games that built its SDK in: the game
 * hands Discord a join secret, and Discord passes it to whoever the host lets
 * in. Stardew has no such hook, but it does take Steam's own join route:
 * started with `+connect_lobby <lobby>` (or sent a lobby by a running Steam),
 * it goes straight into that farm (StardewValley.SDKs.Steam.SteamNetHelper
 * .FindLaunchLobby). So Hoffle finds the host's lobby through Steam and hands
 * it, as a `steam://joinlobby` link, only to the people the host accepts.
 *
 * Everything here is pure: /api/play loads the card's state, calls these and
 * saves the result. The join details never live in the card; /api/play works
 * them out per request for someone who is allowed in.
 */

import {
  isSteamId,
  steamAddFriendUrl,
  steamConnectUrl,
  steamJoinLobbyUrl,
  steamRunUrl,
  type SteamPresence,
} from "./steam";

/**
 * Which game an invite is for:
 * - a featured game with its own support ("stardew": the Hoffle mod);
 * - `steam:<app id>`: any Steam game (one click via Steam's lobby or server);
 * - `app:<slug>`: anything else the desktop app spotted (no link: friends
 *   join from inside the game).
 */
export type PlayGameId = string;

export interface PlayGameInfo {
  name: string;
  emoji: string;
  /** Steam app id, for `steam://` links and for matching Steam's "now playing". */
  steamAppId: number | null;
  /** What the desktop app's detector reports for it (ProfileActivity.name). */
  activityNames: string[];
  /** A Hoffle game mod reports how to get in (game-mods/). */
  mod?: boolean;
}

/** Games with their own support, shown in the Games menu. */
export const PLAY_GAMES: Record<string, PlayGameInfo> = {
  stardew: {
    name: "Stardew Valley",
    emoji: "🌱",
    steamAppId: 413150,
    activityNames: ["Stardew Valley"],
    mod: true,
  },
};

export const PLAY_GAME_IDS = Object.keys(PLAY_GAMES);
/** Games whose Hoffle mod reports a party (play-prompts passes it on). */
export const MOD_GAMES = PLAY_GAME_IDS.filter((id) => PLAY_GAMES[id].mod);

/**
 * Steam app ids of games the desktop apps can spot by name, so an invite can
 * at least open the game (and join it, once Steam shares the host's lobby).
 */
export const KNOWN_STEAM_APPS: Record<string, number> = {
  "terraria": 105600,
  "factorio": 427520,
  "rimworld": 294100,
  "baldur's gate 3": 1086940,
  "elden ring": 1245620,
  "rocket league": 252950,
  "dota 2": 570,
  "counter-strike 2": 730,
  "apex legends": 1172470,
  "among us": 945360,
  "valheim": 892970,
  "lethal company": 1966720,
  "don't starve together": 322330,
  "deep rock galactic": 548430,
  "it takes two": 1426210,
  "phasmophobia": 739630,
  "no man's sky": 275850,
  "risk of rain 2": 632360,
  "palworld": 1623730,
  "hades": 1145360,
  "grand theft auto v": 271590,
  "cyberpunk 2077": 1091500,
};

function slug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function isPlayGame(value: unknown): value is PlayGameId {
  return (
    typeof value === "string" &&
    (Object.hasOwn(PLAY_GAMES, value) || /^steam:[1-9]\d{0,9}$/.test(value) || /^app:[a-z0-9][a-z0-9-]{0,39}$/.test(value))
  );
}

/** The Steam app id behind a game key, if any. */
export function steamAppOf(game: PlayGameId): number | null {
  if (Object.hasOwn(PLAY_GAMES, game)) return PLAY_GAMES[game].steamAppId;
  const match = /^steam:(\d+)$/.exec(game);
  return match ? Number(match[1]) : null;
}

/** The key for a Steam game: the featured one when there is one (Stardew → "stardew"). */
export function keyForSteamApp(appId: number): PlayGameId {
  return PLAY_GAME_IDS.find((id) => PLAY_GAMES[id].steamAppId === appId) ?? `steam:${appId}`;
}

/** The game key for something the desktop app detected by name. */
export function gameKeyForActivity(name: string | null | undefined): PlayGameId | null {
  const clean = (name || "").trim();
  if (!clean || clean.toLowerCase() === "a steam game") return null;
  const lower = clean.toLowerCase();
  const featured = PLAY_GAME_IDS.find((id) => PLAY_GAMES[id].activityNames.some((n) => n.toLowerCase() === lower));
  if (featured) return featured;
  const app = KNOWN_STEAM_APPS[lower];
  if (app) return keyForSteamApp(app);
  const s = slug(clean);
  return s ? `app:${s}` : null;
}

/** The featured game behind a detected activity (gets the "invite people?" pop-up). */
export function playGameForActivity(name: string | null | undefined): PlayGameId | null {
  const key = gameKeyForActivity(name);
  return key && Object.hasOwn(PLAY_GAMES, key) ? key : null;
}

/** Name, emoji and Steam app of an invite's game (featured, or as stored on the card). */
export function playGameInfo(play: { game: PlayGameId; name?: string }): PlayGameInfo {
  if (Object.hasOwn(PLAY_GAMES, play.game)) return PLAY_GAMES[play.game];
  return { name: play.name || "a game", emoji: "🎮", steamAppId: steamAppOf(play.game), activityNames: [] };
}

export type PlayRequestStatus = "asked" | "accepted" | "declined";

export interface PlayRequest {
  id: string;
  name: string;
  status: PlayRequestStatus;
  /** ms epoch of the last change. */
  at: number;
}

export interface PlayInvite {
  game: PlayGameId;
  /** The game's name, for games that aren't featured. */
  name?: string;
  host: { id: string; name: string };
  status: "open" | "closed";
  /** true: the host answers each request. false: anyone here can join. */
  askFirst: boolean;
  requests: PlayRequest[];
  createdAt: number;
  /** Bumped on every change; the route uses it to refuse a stale write. */
  version: number;
}

/** A card keeps at most this many requests; old answered ones drop off first. */
export const MAX_PLAY_REQUESTS = 24;
/** An invite nobody closed stops taking requests after this long. */
export const PLAY_INVITE_TTL_MS = 12 * 60 * 60_000;

export type PlayResult = { state: PlayInvite } | { error: string };

export function newPlayInvite(
  game: PlayGameId,
  host: { id: string; name: string },
  askFirst: boolean,
  now = Date.now(),
  name?: string,
): PlayInvite {
  const clean = Object.hasOwn(PLAY_GAMES, game) ? "" : (name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  return { game, ...(clean ? { name: clean } : {}), host, status: "open", askFirst, requests: [], createdAt: now, version: 0 };
}

export function inviteExpired(state: PlayInvite, now = Date.now()): boolean {
  return now - state.createdAt > PLAY_INVITE_TTL_MS;
}

function isOpen(state: PlayInvite, now: number): boolean {
  return state.status === "open" && !inviteExpired(state, now);
}

function withRequest(state: PlayInvite, request: PlayRequest): PlayInvite {
  let requests = [...state.requests.filter((r) => r.id !== request.id), request];
  // Drop the oldest answered requests first; pending ones are never pushed out.
  while (requests.length > MAX_PLAY_REQUESTS) {
    const oldestAnswered = requests.findIndex((r) => r.status !== "asked");
    if (oldestAnswered === -1) break;
    requests = requests.filter((_, i) => i !== oldestAnswered);
  }
  return { ...state, requests, version: state.version + 1 };
}

export function requestOf(state: PlayInvite, userId: string): PlayRequest | null {
  return state.requests.find((r) => r.id === userId) ?? null;
}

/**
 * Someone asks to join. On an "anyone can join" invite they are let in at
 * once; asking again after a decline is allowed (people misclick).
 */
export function askToJoin(
  state: PlayInvite,
  me: { id: string; name: string },
  now = Date.now(),
): PlayResult {
  if (me.id === state.host.id) return { error: "This is your own game." };
  if (!isOpen(state, now)) return { error: "This invite is closed." };
  const existing = requestOf(state, me.id);
  if (existing?.status === "accepted") return { state };
  if (existing?.status === "asked") return { error: "You already asked. Waiting for an answer." };
  const pending = state.requests.filter((r) => r.status === "asked").length;
  if (state.askFirst && pending >= MAX_PLAY_REQUESTS) return { error: "Too many people are waiting already." };
  return {
    state: withRequest(state, {
      id: me.id,
      name: me.name,
      status: state.askFirst ? "asked" : "accepted",
      at: now,
    }),
  };
}

/** The host lets someone in, or turns them down. */
export function answerRequest(
  state: PlayInvite,
  hostId: string,
  userId: string,
  accept: boolean,
  now = Date.now(),
): PlayResult {
  if (hostId !== state.host.id) return { error: "Only the host can answer." };
  if (!isOpen(state, now)) return { error: "This invite is closed." };
  const request = requestOf(state, userId);
  if (!request) return { error: "They haven't asked to join." };
  const status: PlayRequestStatus = accept ? "accepted" : "declined";
  if (request.status === status) return { state };
  return { state: withRequest(state, { ...request, status, at: now }) };
}

/** The host stops the invite (or it is their game they stopped playing). */
export function closeInvite(state: PlayInvite, userId: string): PlayResult {
  if (userId !== state.host.id) return { error: "Only the host can close this." };
  if (state.status === "closed") return { state };
  return { state: { ...state, status: "closed", version: state.version + 1 } };
}

/** Whether this person may be given the join details right now. */
export function mayJoin(state: PlayInvite, userId: string, now = Date.now()): boolean {
  if (userId === state.host.id || !isOpen(state, now)) return false;
  return requestOf(state, userId)?.status === "accepted";
}

/** The one-line text the message carries for search, previews and old clients. */
export function playSummary(state: PlayInvite): string {
  const game = playGameInfo(state).name;
  return state.status === "closed" ? `played ${game}.` : `is playing ${game}. Come join!`;
}

/** Validates a stored card (it is JSON from the database). */
export function parsePlayInvite(value: unknown): PlayInvite | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<PlayInvite>;
  if (!isPlayGame(v.game) || !v.host || typeof v.host.id !== "string") return null;
  return {
    game: v.game,
    ...(typeof v.name === "string" && v.name.trim() ? { name: v.name.trim().slice(0, 60) } : {}),
    host: { id: v.host.id, name: String(v.host.name || "") },
    status: v.status === "closed" ? "closed" : "open",
    askFirst: v.askFirst !== false,
    requests: Array.isArray(v.requests)
      ? v.requests
          .filter((r): r is PlayRequest => Boolean(r && typeof r.id === "string"))
          .map((r) => ({
            id: r.id,
            name: String(r.name || ""),
            status: r.status === "accepted" || r.status === "declined" ? r.status : "asked",
            at: Number(r.at) || 0,
          }))
      : [],
    createdAt: Number(v.createdAt) || 0,
    version: Number(v.version) || 0,
  };
}

/**
 * What the Hoffle Stardew mod (game-mods/stardew) reports while you host
 * co-op, passed on by the desktop app. The invite code is a secret like
 * Discord's join secret: only people the host lets in are given it.
 */
export interface GameParty {
  inviteCode: string | null;
  steamLobby: string | null;
  steamId: string | null;
  farm: string;
  players: number | null;
  maxPlayers: number | null;
}

/** A party report older than this is ignored (the game closed or the app did). */
export const PARTY_FRESH_MS = 90_000;

function smallInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 64 ? n : null;
}

/** Validates what the page sends; null unless it is hosting something joinable. */
export function normalizeParty(value: unknown): GameParty | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const code = typeof v.inviteCode === "string" && /^[SG][0-9A-Za-z]{1,16}$/.test(v.inviteCode) ? v.inviteCode : null;
  const lobby = typeof v.steamLobby === "string" && /^\d{15,20}$/.test(v.steamLobby) ? v.steamLobby : null;
  const steamId = isSteamId(v.steamId) ? v.steamId : null;
  if (!code && !(lobby && steamId)) return null;
  return {
    inviteCode: code,
    steamLobby: lobby,
    steamId,
    farm: typeof v.farm === "string" ? v.farm.trim().slice(0, 40) : "",
    players: smallInt(v.players),
    maxPlayers: smallInt(v.maxPlayers),
  };
}

/**
 * Why a one-click join isn't possible, so the card can say what to do:
 * - host-not-linked: the host has neither a game mod running nor Steam linked.
 * - no-key: Steam is linked but this Hoffle has no Steam Web API key.
 * - hidden: Steam hides the host's game (private profile or game details).
 * - not-in-game: Steam says the host isn't in this game right now.
 * - no-lobby: they are in the game but not hosting (or it is invite-only).
 * - not-steam: not a Steam game, so Hoffle has no way in; join inside the game.
 */
export type ManualReason = "host-not-linked" | "no-key" | "hidden" | "not-in-game" | "no-lobby" | "not-steam";

export interface JoinPlan {
  /** lobby/server: Steam drops you in; code: join with the invite code; manual: open the game and find it. */
  how: "lobby" | "server" | "code" | "manual";
  /** What Join opens; null when Hoffle can't open the game (not on Steam). */
  url: string | null;
  /** Just starts the game (when the joiner's mod takes it from there). */
  runUrl: string | null;
  /** The host's invite code, from their mod. */
  inviteCode: string | null;
  addFriendUrl: string | null;
  reason?: ManualReason;
}

export interface JoinSources {
  /** The host's linked Steam account. */
  hostSteamId: string | null;
  /** What Steam's Web API says about the host (needs a key). */
  presence: SteamPresence | null;
  hasKey: boolean;
  /** What the host's mod reported, if fresh. */
  party: GameParty | null;
}

/**
 * How someone who is allowed in gets into the host's game. The host's mod is
 * the best source (invite code + Steam lobby, no setup); Steam's Web API is
 * next. Without either it still opens the game, where Stardew lists Steam
 * friends' farms under Co-op → Join.
 */
export function planJoin(game: PlayGameId, sources: JoinSources): JoinPlan {
  const { hostSteamId, presence, hasKey, party } = sources;
  const appId = steamAppOf(game);
  const runUrl = appId ? steamRunUrl(appId) : null;
  const friendId = party?.steamId ?? hostSteamId;
  const addFriendUrl = friendId && appId ? steamAddFriendUrl(friendId) : null;
  const manual = (reason: ManualReason): JoinPlan => ({ how: "manual", url: runUrl, runUrl, inviteCode: null, addFriendUrl, reason });

  if (!appId) return manual("not-steam");
  if (party?.steamLobby && party.steamId) {
    return { how: "lobby", url: steamJoinLobbyUrl(appId, party.steamLobby, party.steamId), runUrl, inviteCode: party.inviteCode, addFriendUrl };
  }
  if (party?.inviteCode) return { how: "code", url: runUrl, runUrl, inviteCode: party.inviteCode, addFriendUrl };
  if (!hostSteamId) return manual("host-not-linked");
  if (!hasKey || !presence) return manual("no-key");
  const inThisGame = presence.appId === appId;
  if (presence.lobbyId && (inThisGame || presence.appId === null)) {
    return { how: "lobby", url: steamJoinLobbyUrl(appId, presence.lobbyId, hostSteamId), runUrl, inviteCode: null, addFriendUrl };
  }
  if (presence.serverIp && inThisGame) {
    return { how: "server", url: steamConnectUrl(presence.serverIp), runUrl, inviteCode: null, addFriendUrl };
  }
  if (!presence.visible || presence.appId === null) return manual(presence.visible ? "not-in-game" : "hidden");
  if (!inThisGame) return manual("not-in-game");
  return manual("no-lobby");
}
