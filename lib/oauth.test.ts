import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  completeOAuthCallback,
  configuredOAuthProviders,
  normalizeDiscordProfile,
  normalizeGoogleProfile,
  oauthRedirectUri,
  pkceChallengeS256,
  startOAuthFlow,
} from "./oauth";
import { ensureSchema } from "./schema";
import { setSignupSettings } from "./signup";

function realDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (query: string, params: unknown[] = []) => {
    const values = params as Array<string | number | null>;
    const self = {
      bind: (...args: unknown[]) => statement(query, args),
      async first<T>() {
        return (sqlite.prepare(query).get(...values) ?? null) as T;
      },
      async all<T>() {
        return { results: sqlite.prepare(query).all(...values) as T[] };
      },
      async run() {
        const result = sqlite.prepare(query).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
      async raw() {
        return sqlite.prepare(query).all(...values).map((row) => Object.values(row as object));
      },
    };
    return self;
  };
  return {
    prepare: (query: string) => statement(query),
    async batch(statements: ReturnType<typeof statement>[]) {
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  } as unknown as D1Database;
}

describe("Google & Discord OAuth 2.0", () => {
  const db = realDb();

  beforeAll(async () => {
    setBindings({
      DB: db,
      PUBLIC_URL: "https://hoffle.online",
      GOOGLE_CLIENT_ID: "google-cid",
      GOOGLE_CLIENT_SECRET: "google-csecret",
      DISCORD_OAUTH_CLIENT_ID: "discord-cid",
      DISCORD_OAUTH_CLIENT_SECRET: "discord-csecret",
    });
    await ensureSchema(db);
  });

  beforeEach(async () => {
    for (const table of ["oauth_states", "oauth_accounts", "users", "invites", "server_members", "meta"]) {
      await db.prepare(`DELETE FROM ${table}`).run().catch(() => undefined);
    }
  });

  it("computes PKCE S256 challenges, redirect URIs, and normalized profiles", async () => {
    expect(configuredOAuthProviders()).toEqual({ google: true, discord: true });
    expect(oauthRedirectUri(new Request("https://hoffle.online/hangout/api/auth/oauth/google"), "google")).toBe(
      "https://hoffle.online/hangout/api/auth/oauth/google/callback",
    );

    const challenge = await pkceChallengeS256("verifier-123");
    expect(challenge.length).toBeGreaterThan(30);
    expect(challenge).not.toContain("=");

    expect(
      normalizeGoogleProfile({
        sub: "g-1",
        email: "Alice@Example.com",
        email_verified: true,
        name: "Alice Wonderland",
        picture: "https://lh3.googleusercontent.com/avatar.png",
      }),
    ).toMatchObject({
      provider: "google",
      providerUserId: "g-1",
      emailVerified: true,
      displayName: "Alice Wonderland",
    });

    expect(
      normalizeDiscordProfile({
        id: "123456",
        username: "dungeon_master",
        global_name: "DM Alice",
        email: "dm@example.com",
        verified: false,
        avatar: "abc123",
      }),
    ).toMatchObject({
      provider: "discord",
      providerUserId: "123456",
      emailVerified: false,
      avatarUrl: "https://cdn.discordapp.com/avatars/123456/abc123.png",
    });
  });

  it("enforces state single-use replay protection, verified-email linking, and invite-gated signups", async () => {
    // Bootstrap first user via Google OAuth
    const start1 = await startOAuthFlow(
      db,
      new Request("https://hoffle.online/hangout/api/auth/oauth/google"),
      "google",
      { mode: "signin" },
    );
    if ("error" in start1) throw new Error(start1.error);
    const state1 = new URL(start1.authorizeUrl).searchParams.get("state")!;

    const googleFetch = (async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes("oauth2.googleapis.com/token")) {
        return Response.json({ access_token: "tok-google-1" });
      }
      return Response.json({
        sub: "g-owner-1",
        email: "Owner@Example.com",
        email_verified: true,
        name: "Owner Person",
      });
    }) as unknown as typeof fetch;

    const firstResult = await completeOAuthCallback(
      db,
      new Request("https://hoffle.online/hangout/api/auth/oauth/google/callback"),
      "google",
      "code-1",
      state1,
      googleFetch,
    );
    expect(firstResult.kind).toBe("signed_in");
    if (firstResult.kind === "signed_in") {
      expect(firstResult.isNewUser).toBe(true);
      expect(firstResult.user.is_admin).toBe(1);
      // External avatar URLs stay out of users.avatar_url for IP privacy.
      expect(firstResult.user.avatar_url ?? null).toBeNull();
    }

    // State replay must be rejected.
    const replay = await completeOAuthCallback(
      db,
      new Request("https://hoffle.online/hangout/api/auth/oauth/google/callback"),
      "google",
      "code-1",
      state1,
      googleFetch,
    );
    expect(replay).toEqual({ kind: "error", code: "invalid_state" });

    // Unverified Discord email matching Owner's email MUST NOT auto-link into Owner's account;
    // when open signup is OFF and no invite was given, it fails with invite_required.
    await setSignupSettings(db, { open: false, serverId: null });
    const start2 = await startOAuthFlow(
      db,
      new Request("https://hoffle.online/hangout/api/auth/oauth/discord"),
      "discord",
      { mode: "signin" },
    );
    if ("error" in start2) throw new Error(start2.error);
    const state2 = new URL(start2.authorizeUrl).searchParams.get("state")!;

    const unverifiedDiscordFetch = (async (url: RequestInfo | URL) => {
      if (String(url).includes("/token")) return Response.json({ access_token: "tok-disc" });
      return Response.json({
        id: "d-attacker",
        username: "spoof",
        email: "owner@example.com",
        verified: false,
      });
    }) as unknown as typeof fetch;

    const blocked = await completeOAuthCallback(
      db,
      new Request("https://hoffle.online/hangout/api/auth/oauth/discord/callback"),
      "discord",
      "code-2",
      state2,
      unverifiedDiscordFetch,
    );
    expect(blocked).toEqual({ kind: "error", code: "invite_required" });

    // Verified Discord email matching Owner DOES auto-link seamlessly!
    const start3 = await startOAuthFlow(
      db,
      new Request("https://hoffle.online/hangout/api/auth/oauth/discord"),
      "discord",
      { mode: "signin" },
    );
    if ("error" in start3) throw new Error(start3.error);
    const state3 = new URL(start3.authorizeUrl).searchParams.get("state")!;

    const verifiedDiscordFetch = (async (url: RequestInfo | URL) => {
      if (String(url).includes("/token")) return Response.json({ access_token: "tok-disc-v" });
      return Response.json({
        id: "d-real-owner",
        username: "owner_disc",
        email: "owner@example.com",
        verified: true,
      });
    }) as unknown as typeof fetch;

    const autoLinked = await completeOAuthCallback(
      db,
      new Request("https://hoffle.online/hangout/api/auth/oauth/discord/callback"),
      "discord",
      "code-3",
      state3,
      verifiedDiscordFetch,
    );
    expect(autoLinked.kind).toBe("signed_in");
    if (autoLinked.kind === "signed_in" && firstResult.kind === "signed_in") {
      expect(autoLinked.user.id).toBe(firstResult.user.id);
      expect(autoLinked.isNewUser).toBe(false);
    }
  });
});
