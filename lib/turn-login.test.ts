import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TURN_LOGIN_TTL_S, turnLogin, withTurnLogins } from "./turn-login";

describe("turnLogin", () => {
  it("signs `expiry:user` the way coturn's use-auth-secret checks it", async () => {
    const now = Date.UTC(2026, 9, 28, 12);
    const login = await turnLogin("s3cret", "user-1", now);
    const expiry = Math.floor(now / 1000) + TURN_LOGIN_TTL_S;
    expect(login.username).toBe(`${expiry}:user-1`);
    expect(login.credential).toBe(createHmac("sha1", "s3cret").update(login.username).digest("base64"));
    expect(login.expiresAt).toBe(expiry * 1000);
  });
});

describe("withTurnLogins", () => {
  const fixed = { urls: ["turn:a.example:3478"], username: "u", credential: "p" };
  const minted = { urls: ["turn:b.example:3478", "turns:b.example:5349"] };
  const stun = { urls: ["stun:c.example:3478"] };

  it("mints only for TURN entries listed without a login", async () => {
    const result = await withTurnLogins([stun, fixed, minted], "s3cret", "user-1");
    expect(result.iceServers[0]).toEqual(stun);
    expect(result.iceServers[1]).toEqual(fixed);
    expect(result.iceServers[2]).toMatchObject({ urls: minted.urls, username: expect.stringMatching(/^\d+:user-1$/) });
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it("leaves the list alone without a secret, or when every relay has a fixed login", async () => {
    expect(await withTurnLogins([fixed, minted], undefined, "u")).toEqual({ iceServers: [fixed, minted] });
    expect(await withTurnLogins([stun, fixed], "s3cret", "u")).toEqual({ iceServers: [stun, fixed] });
  });
});
