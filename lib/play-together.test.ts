import { describe, expect, it } from "vitest";
import {
  MAX_PLAY_REQUESTS,
  PLAY_INVITE_TTL_MS,
  answerRequest,
  askToJoin,
  closeInvite,
  mayJoin,
  newPlayInvite,
  gameKeyForActivity,
  isPlayGame,
  normalizeParty,
  playGameInfo,
  parsePlayInvite,
  planJoin,
  playGameForActivity,
  type PlayInvite,
  type PlayResult,
} from "./play-together";

const NOW = 1_800_000_000_000;
const host = { id: "host", name: "Kiwi" };
const mert = { id: "mert", name: "Mert" };

function ok(result: PlayResult): PlayInvite {
  if ("error" in result) throw new Error(result.error);
  return result.state;
}

describe("play together invites", () => {
  it("matches the detector's activity name", () => {
    expect(playGameForActivity("Stardew Valley")).toBe("stardew");
    expect(playGameForActivity(" stardew valley ")).toBe("stardew");
    expect(playGameForActivity("Minecraft")).toBeNull();
    expect(playGameForActivity(null)).toBeNull();
  });

  it("asks, then the host lets them in", () => {
    let state = newPlayInvite("stardew", host, true, NOW);
    state = ok(askToJoin(state, mert, NOW));
    expect(state.requests).toEqual([{ id: "mert", name: "Mert", status: "asked", at: NOW }]);
    expect(mayJoin(state, "mert", NOW)).toBe(false);
    expect(askToJoin(state, mert, NOW)).toEqual({ error: "You already asked. Waiting for an answer." });

    expect(answerRequest(state, "mert", "mert", true, NOW)).toEqual({ error: "Only the host can answer." });
    state = ok(answerRequest(state, "host", "mert", true, NOW));
    expect(mayJoin(state, "mert", NOW)).toBe(true);
    // Asking again once in changes nothing.
    expect(ok(askToJoin(state, mert, NOW))).toBe(state);
  });

  it("lets people in straight away when the host doesn't ask", () => {
    const state = ok(askToJoin(newPlayInvite("stardew", host, false, NOW), mert, NOW));
    expect(mayJoin(state, "mert", NOW)).toBe(true);
  });

  it("allows asking again after a decline", () => {
    let state = ok(askToJoin(newPlayInvite("stardew", host, true, NOW), mert, NOW));
    state = ok(answerRequest(state, "host", "mert", false, NOW));
    expect(mayJoin(state, "mert", NOW)).toBe(false);
    state = ok(askToJoin(state, mert, NOW + 1));
    expect(state.requests[0].status).toBe("asked");
  });

  it("refuses the host's own request, closed and expired invites", () => {
    const state = newPlayInvite("stardew", host, true, NOW);
    expect(askToJoin(state, host, NOW)).toEqual({ error: "This is your own game." });
    expect(mayJoin(state, "host", NOW)).toBe(false);
    const closed = ok(closeInvite(state, "host"));
    expect(askToJoin(closed, mert, NOW)).toEqual({ error: "This invite is closed." });
    expect(closeInvite(state, "mert")).toEqual({ error: "Only the host can close this." });
    expect(askToJoin(state, mert, NOW + PLAY_INVITE_TTL_MS + 1)).toEqual({ error: "This invite is closed." });
  });

  it("stops letting people in once closed or expired", () => {
    let state = ok(askToJoin(newPlayInvite("stardew", host, false, NOW), mert, NOW));
    expect(mayJoin(state, "mert", NOW + PLAY_INVITE_TTL_MS + 1)).toBe(false);
    state = ok(closeInvite(state, "host"));
    expect(mayJoin(state, "mert", NOW)).toBe(false);
  });

  it("drops old answered requests first and keeps pending ones", () => {
    let state = newPlayInvite("stardew", host, true, NOW);
    for (let i = 0; i < MAX_PLAY_REQUESTS; i += 1) {
      state = ok(askToJoin(state, { id: `u${i}`, name: `U${i}` }, NOW));
      if (i < 3) state = ok(answerRequest(state, "host", `u${i}`, false, NOW));
    }
    state = ok(askToJoin(state, { id: "late", name: "Late" }, NOW));
    expect(state.requests).toHaveLength(MAX_PLAY_REQUESTS);
    expect(state.requests.some((r) => r.id === "u0")).toBe(false);
    expect(state.requests.filter((r) => r.status === "asked")).toHaveLength(MAX_PLAY_REQUESTS - 2);
  });

  it("bumps the version on every change", () => {
    const start = newPlayInvite("stardew", host, true, NOW);
    const asked = ok(askToJoin(start, mert, NOW));
    expect(asked.version).toBe(start.version + 1);
    expect(ok(closeInvite(asked, "host")).version).toBe(asked.version + 1);
  });

  it("parses stored cards and rejects junk", () => {
    const state = ok(askToJoin(newPlayInvite("stardew", host, true, NOW), mert, NOW));
    expect(parsePlayInvite(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(parsePlayInvite({ game: "tetris", host })).toBeNull();
    expect(parsePlayInvite(null)).toBeNull();
  });
});

describe("planJoin", () => {
  const steamId = "76561198000000001";
  const lobby = "109775242243779373";
  const run = "steam://run/413150";
  const seen = { personaName: "kiwi", visible: true, appId: 413150, lobbyId: lobby, serverIp: null, gameName: "Stardew Valley" };
  const none = { hostSteamId: null, presence: null, hasKey: false, party: null };
  const party = { inviteCode: "S1A2B3C4D5", steamLobby: lobby, steamId, farm: "Kiwi Farm", players: 1, maxPlayers: 4 };

  it("prefers the host's mod: Steam lobby plus invite code", () => {
    expect(planJoin("stardew", { ...none, party })).toEqual({
      how: "lobby",
      url: `steam://joinlobby/413150/${lobby}/${steamId}`,
      runUrl: run,
      inviteCode: "S1A2B3C4D5",
      addFriendUrl: `steam://friends/add/${steamId}`,
    });
  });

  it("uses the invite code alone off Steam (GOG)", () => {
    expect(planJoin("stardew", { ...none, party: { ...party, steamLobby: null, steamId: null, inviteCode: "G9Z" } })).toEqual({
      how: "code",
      url: run,
      runUrl: run,
      inviteCode: "G9Z",
      addFriendUrl: null,
    });
  });

  it("falls back to Steam's Web API lobby", () => {
    expect(planJoin("stardew", { ...none, hostSteamId: steamId, presence: seen, hasKey: true })).toMatchObject({
      how: "lobby",
      url: `steam://joinlobby/413150/${lobby}/${steamId}`,
      inviteCode: null,
    });
  });

  it("falls back to opening the game, saying why", () => {
    const linked = { ...none, hostSteamId: steamId, hasKey: true };
    expect(planJoin("stardew", none)).toMatchObject({ how: "manual", reason: "host-not-linked", url: run, addFriendUrl: null });
    expect(planJoin("stardew", { ...linked, hasKey: false })).toMatchObject({ reason: "no-key", url: run });
    expect(planJoin("stardew", { ...linked, presence: { ...seen, visible: false, appId: null, lobbyId: null } })).toMatchObject({ reason: "hidden" });
    expect(planJoin("stardew", { ...linked, presence: { ...seen, appId: null, lobbyId: null } })).toMatchObject({ reason: "not-in-game" });
    expect(planJoin("stardew", { ...linked, presence: { ...seen, appId: 570, lobbyId: null } })).toMatchObject({ reason: "not-in-game" });
    expect(planJoin("stardew", { ...linked, presence: { ...seen, lobbyId: null } })).toMatchObject({ reason: "no-lobby" });
  });

  it("does not hand out a lobby from another game", () => {
    expect(planJoin("stardew", { ...none, hostSteamId: steamId, hasKey: true, presence: { ...seen, appId: 570 } })).toMatchObject({
      how: "manual",
      reason: "not-in-game",
    });
  });
});

describe("normalizeParty", () => {
  it("keeps only well-formed, joinable reports", () => {
    expect(normalizeParty({ inviteCode: "S1A2B3", farm: " Kiwi ", players: 2, maxPlayers: 4 })).toEqual({
      inviteCode: "S1A2B3",
      steamLobby: null,
      steamId: null,
      farm: "Kiwi",
      players: 2,
      maxPlayers: 4,
    });
    expect(normalizeParty({ inviteCode: "X123" })).toBeNull();
    expect(normalizeParty({ inviteCode: "S1; rm -rf" })).toBeNull();
    expect(normalizeParty({ steamLobby: "109775242243779373" })).toBeNull();
    expect(normalizeParty({ steamLobby: "109775242243779373", steamId: "76561198000000001" })).toMatchObject({ inviteCode: null });
    expect(normalizeParty({ inviteCode: "S1", players: 999 })).toMatchObject({ players: null });
    expect(normalizeParty(null)).toBeNull();
  });
});

describe("any game", () => {
  const steamId = "76561198000000001";
  const lobby = "109775242243779373";
  const none = { hostSteamId: null, presence: null, hasKey: false, party: null };

  it("keys games the desktop app spots", () => {
    expect(gameKeyForActivity("Stardew Valley")).toBe("stardew");
    expect(gameKeyForActivity("Terraria")).toBe("steam:105600");
    expect(gameKeyForActivity("Minecraft")).toBe("app:minecraft");
    expect(gameKeyForActivity("a Steam game")).toBeNull();
    expect(gameKeyForActivity("")).toBeNull();
  });

  it("accepts only real keys", () => {
    for (const ok of ["stardew", "steam:730", "app:minecraft"]) expect(isPlayGame(ok)).toBe(true);
    for (const bad of ["toString", "constructor", "steam:0", "steam:abc", "app:", "app:Bad Name", 5]) expect(isPlayGame(bad)).toBe(false);
  });

  it("names a game from the card", () => {
    expect(playGameInfo({ game: "steam:730", name: "Counter-Strike 2" })).toMatchObject({ name: "Counter-Strike 2", emoji: "🎮", steamAppId: 730 });
    expect(playGameInfo({ game: "stardew", name: "ignored" }).name).toBe("Stardew Valley");
    expect(playGameInfo({ game: "app:minecraft" })).toMatchObject({ steamAppId: null });
    expect(newPlayInvite("steam:730", { id: "h", name: "H" }, true, 1, "  Counter-Strike   2 ").name).toBe("Counter-Strike 2");
    expect(newPlayInvite("stardew", { id: "h", name: "H" }, true, 1, "x").name).toBeUndefined();
  });

  it("joins any Steam game's lobby, or its server", () => {
    const presence = { personaName: "k", visible: true, appId: 1086940, lobbyId: lobby, serverIp: null, gameName: "Baldur's Gate 3" };
    expect(planJoin("steam:1086940", { ...none, hostSteamId: steamId, hasKey: true, presence })).toMatchObject({
      how: "lobby",
      url: `steam://joinlobby/1086940/${lobby}/${steamId}`,
    });
    expect(
      planJoin("steam:730", { ...none, hostSteamId: steamId, hasKey: true, presence: { ...presence, appId: 730, lobbyId: null, serverIp: "203.0.113.7:27015" } }),
    ).toMatchObject({ how: "server", url: "steam://connect/203.0.113.7:27015" });
    // Without the key it still opens the game.
    expect(planJoin("steam:730", { ...none, hostSteamId: steamId })).toMatchObject({ how: "manual", reason: "no-key", url: "steam://run/730" });
  });

  it("has no link for games off Steam", () => {
    expect(planJoin("app:minecraft", { ...none, hostSteamId: steamId, hasKey: true })).toEqual({
      how: "manual",
      url: null,
      runUrl: null,
      inviteCode: null,
      addFriendUrl: null,
      reason: "not-steam",
    });
  });
});
