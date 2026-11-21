import { describe, expect, it, vi } from "vitest";
import { isGameLink, steamLoginUrl, steamPresence, verifySteamLogin } from "./steam";

const RETURN_TO = "https://hoffle.online/hangout/api/integrations/steam?state=abc";
const ID = "76561198000000001";

function assertion(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${ID}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${ID}`,
    "openid.return_to": RETURN_TO,
    "openid.response_nonce": "2026-11-21T10:00:00Zabc",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "c2ln",
    ...overrides,
  });
}

function steamSays(body: string, ok = true) {
  return vi.fn(async () => new Response(body, { status: ok ? 200 : 500 })) as unknown as typeof fetch;
}

describe("Steam sign-in", () => {
  it("builds the OpenID request", () => {
    const url = new URL(steamLoginUrl(RETURN_TO, "https://hoffle.online"));
    expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.return_to")).toBe(RETURN_TO);
    expect(url.searchParams.get("openid.realm")).toBe("https://hoffle.online");
  });

  it("accepts an assertion Steam confirms", async () => {
    const fetchImpl = steamSays("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n");
    expect(await verifySteamLogin(assertion(), RETURN_TO, fetchImpl)).toBe(ID);
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sent = new URLSearchParams(String(init.body));
    expect(sent.get("openid.mode")).toBe("check_authentication");
    expect(sent.get("openid.sig")).toBe("c2ln");
  });

  it("refuses what Steam doesn't confirm, or that was meant elsewhere", async () => {
    expect(await verifySteamLogin(assertion(), RETURN_TO, steamSays("is_valid:false\n"))).toBeNull();
    expect(await verifySteamLogin(assertion(), RETURN_TO, steamSays("", false))).toBeNull();
    const confirmed = steamSays("is_valid:true\n");
    expect(await verifySteamLogin(assertion({ "openid.return_to": "https://evil.example/" }), RETURN_TO, confirmed)).toBeNull();
    expect(await verifySteamLogin(assertion({ "openid.op_endpoint": "https://evil.example/openid" }), RETURN_TO, confirmed)).toBeNull();
    expect(await verifySteamLogin(assertion({ "openid.claimed_id": "https://evil.example/id/1" }), RETURN_TO, confirmed)).toBeNull();
    expect(await verifySteamLogin(assertion({ "openid.mode": "cancel" }), RETURN_TO, confirmed)).toBeNull();
    expect(confirmed).not.toHaveBeenCalled();
  });
});

describe("steamPresence", () => {
  const reply = (player: Record<string, unknown>) =>
    vi.fn(async () => Response.json({ response: { players: [player] } })) as unknown as typeof fetch;

  it("reads the game and lobby", async () => {
    const presence = await steamPresence(
      ID,
      "KEY",
      reply({ personaname: "kiwi", communityvisibilitystate: 3, gameid: "413150", lobbysteamid: "109775242243779373" }),
    );
    expect(presence).toEqual({ personaName: "kiwi", visible: true, appId: 413150, lobbyId: "109775242243779373" });
  });

  it("copes with no game, no key and bad ids", async () => {
    expect(await steamPresence(ID, "KEY", reply({ personaname: "kiwi", communityvisibilitystate: 1 }))).toEqual({
      personaName: "kiwi",
      visible: false,
      appId: null,
      lobbyId: null,
    });
    const never = vi.fn() as unknown as typeof fetch;
    expect(await steamPresence(ID, undefined, never)).toBeNull();
    expect(await steamPresence("123", "KEY", never)).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
});

describe("isGameLink", () => {
  it("allows only Steam join, run and add-friend links", () => {
    expect(isGameLink(`steam://joinlobby/413150/109775242243779373/${ID}`)).toBe(true);
    expect(isGameLink("steam://run/413150")).toBe(true);
    expect(isGameLink(`steam://friends/add/${ID}`)).toBe(true);
    expect(isGameLink("steam://install/413150")).toBe(false);
    expect(isGameLink("steam://run/413150//-evil")).toBe(false);
    expect(isGameLink("https://example.com")).toBe(false);
    expect(isGameLink("file:///etc/passwd")).toBe(false);
  });
});
