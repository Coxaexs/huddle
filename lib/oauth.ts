/**
 * Google and Discord OAuth 2.0 authentication (PKCE S256 + state nonces).
 * Designed for Cloudflare Workers (`workerd`) using WebCrypto and Fetch.
 */

import {
  AVATAR_COLORS,
  hashPassword,
  userColumns,
  USERNAME_PATTERN,
  type User,
} from "./auth";
import { ensureSchema } from "./schema";
import { markServerRead } from "./servers";
import { getSignupSettings, signupAddressHash } from "./signup";
import { bindings, type HuddleBindings } from "./storage";

export type OAuthProvider = "google" | "discord";
export type OAuthFlowMode = "signin" | "add" | "link";

export interface OAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface LinkedOAuthAccount {
  provider: OAuthProvider;
  email: string | null;
  displayName: string | null;
  createdAt: number;
}

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string;
}

const encoder = new TextEncoder();
const STATE_TTL_MS = 10 * 60_000;

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "discord";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(byteLength: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function pkceChallengeS256(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
  return toBase64Url(new Uint8Array(digest));
}

export function oauthProviderConfig(
  provider: OAuthProvider,
  env: Partial<HuddleBindings> = bindings(),
): ProviderConfig | null {
  if (provider === "google") {
    const clientId = env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scopes: "openid email profile",
    };
  }

  const clientId = (env.DISCORD_OAUTH_CLIENT_ID || env.DISCORD_CLIENT_ID)?.trim();
  const clientSecret = (env.DISCORD_OAUTH_CLIENT_SECRET || env.DISCORD_CLIENT_SECRET)?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    authorizeUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userInfoUrl: "https://discord.com/api/users/@me",
    scopes: "identify email",
  };
}

export function configuredOAuthProviders(
  env: Partial<HuddleBindings> = bindings(),
): { google: boolean; discord: boolean } {
  return {
    google: Boolean(oauthProviderConfig("google", env)),
    discord: Boolean(oauthProviderConfig("discord", env)),
  };
}

export function appBaseUrl(
  request: Request,
  env: Partial<HuddleBindings> = bindings(),
): string {
  const reqUrl = new URL(request.url);
  const base = (env.PUBLIC_URL?.trim() || reqUrl.origin).replace(/\/+$/, "");
  const hasHangoutPrefix = reqUrl.pathname.startsWith("/hangout") && !base.endsWith("/hangout");
  return `${base}${hasHangoutPrefix ? "/hangout" : ""}`;
}

export function oauthRedirectUri(
  request: Request,
  provider: OAuthProvider,
  env: Partial<HuddleBindings> = bindings(),
): string {
  return `${appBaseUrl(request, env)}/api/auth/oauth/${provider}/callback`;
}

export async function startOAuthFlow(
  db: D1Database,
  request: Request,
  provider: OAuthProvider,
  opts: {
    mode: OAuthFlowMode;
    inviteCode?: string | null;
    userId?: string | null;
    redirectTo?: string | null;
  },
): Promise<{ authorizeUrl: string } | { error: string; status: number }> {
  const config = oauthProviderConfig(provider);
  if (!config) {
    return { error: `${provider} OAuth is not configured on this server.`, status: 501 };
  }

  await ensureSchema(db);
  const now = Date.now();
  await db.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").bind(now).run();

  const state = randomBase64Url(24);
  const codeVerifier = randomBase64Url(32);
  const codeChallenge = await pkceChallengeS256(codeVerifier);
  const cleanInvite = opts.inviteCode?.trim().toUpperCase().slice(0, 64) || null;

  await db
    .prepare(
      `INSERT INTO oauth_states
         (state, provider, mode, code_verifier, invite_code, user_id, redirect_to, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      state,
      provider,
      opts.mode,
      codeVerifier,
      cleanInvite,
      opts.userId ?? null,
      opts.redirectTo ?? null,
      now,
      now + STATE_TTL_MS,
    )
    .run();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: oauthRedirectUri(request, provider),
    scope: config.scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  if (provider === "google") {
    params.set("access_type", "online");
    params.set("prompt", "select_account");
  }

  return { authorizeUrl: `${config.authorizeUrl}?${params.toString()}` };
}

export async function exchangeOAuthCode(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
  env: Partial<HuddleBindings> = bindings(),
): Promise<string> {
  const config = oauthProviderConfig(provider, env);
  if (!config) throw new Error(`${provider} OAuth not configured.`);

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    throw new Error(`OAuth token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("OAuth response missing access_token");
  }
  return data.access_token;
}

export function normalizeGoogleProfile(raw: Record<string, unknown>): OAuthProfile {
  const sub = typeof raw.sub === "string" ? raw.sub.trim() : "";
  if (!sub) throw new Error("Google profile missing sub");
  const email = typeof raw.email === "string" ? raw.email.trim() : null;
  const emailVerified = raw.email_verified === true;
  const displayName =
    (typeof raw.name === "string" && raw.name.trim()) ||
    (typeof raw.given_name === "string" && raw.given_name.trim()) ||
    (email ? email.split("@")[0] : "Google User");
  const picture = typeof raw.picture === "string" && raw.picture.startsWith("https://") ? raw.picture : null;
  return {
    provider: "google",
    providerUserId: sub,
    email,
    emailVerified,
    username: email ? email.split("@")[0] : displayName,
    displayName: displayName.slice(0, 48),
    avatarUrl: picture,
  };
}

export function normalizeDiscordProfile(raw: Record<string, unknown>): OAuthProfile {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) throw new Error("Discord profile missing id");
  const email = typeof raw.email === "string" ? raw.email.trim() : null;
  const emailVerified = raw.verified === true;
  const username = typeof raw.username === "string" ? raw.username.trim() : null;
  const globalName = typeof raw.global_name === "string" ? raw.global_name.trim() : null;
  const displayName = globalName || username || "Discord User";
  const avatarHash = typeof raw.avatar === "string" && /^[a-zA-Z0-9_-]+$/.test(raw.avatar) ? raw.avatar : null;
  const avatarUrl = avatarHash ? `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.png` : null;
  return {
    provider: "discord",
    providerUserId: id,
    email,
    emailVerified,
    username,
    displayName: displayName.slice(0, 48),
    avatarUrl,
  };
}

export async function fetchOAuthProfile(
  provider: OAuthProvider,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
  env: Partial<HuddleBindings> = bindings(),
): Promise<OAuthProfile> {
  const config = oauthProviderConfig(provider, env);
  if (!config) throw new Error(`${provider} OAuth not configured.`);
  const res = await fetchImpl(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`OAuth profile fetch failed (${res.status})`);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  return provider === "google" ? normalizeGoogleProfile(raw) : normalizeDiscordProfile(raw);
}

/** Sanitizes an arbitrary handle/name into a valid Hoffle username candidate. */
export function sanitizeUsernameBase(candidate: string | null | undefined): string {
  const cleaned = (candidate || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 18);
  if (cleaned.length >= 2 && USERNAME_PATTERN.test(cleaned)) return cleaned;
  return "hoffle_user";
}

async function allocateUniqueUsername(db: D1Database, preferred: string | null): Promise<string> {
  const base = sanitizeUsernameBase(preferred);
  const direct = await db
    .prepare("SELECT 1 FROM users WHERE username_lower = ?")
    .bind(base.toLowerCase())
    .first();
  if (!direct) return base;

  for (let i = 2; i <= 20; i++) {
    const candidate = `${base.slice(0, 24 - String(i).length - 1)}-${i}`;
    if (!USERNAME_PATTERN.test(candidate)) continue;
    const taken = await db
      .prepare("SELECT 1 FROM users WHERE username_lower = ?")
      .bind(candidate.toLowerCase())
      .first();
    if (!taken) return candidate;
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = randomBase64Url(3).replace(/[^a-zA-Z0-9]/g, "x").slice(0, 4);
    const candidate = `${base.slice(0, 19)}_${suffix}`;
    const taken = await db
      .prepare("SELECT 1 FROM users WHERE username_lower = ?")
      .bind(candidate.toLowerCase())
      .first();
    if (!taken) return candidate;
  }

  return `user_${randomBase64Url(4).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`;
}

export type OAuthCallbackResult =
  | { kind: "signed_in"; user: User; isNewUser: boolean }
  | { kind: "linked"; provider: OAuthProvider; userId: string }
  | {
      kind: "error";
      code:
        | "invalid_state"
        | "oauth_failed"
        | "suspended"
        | "already_linked"
        | "invite_required";
    };

export async function completeOAuthCallback(
  db: D1Database,
  request: Request,
  provider: OAuthProvider,
  code: string,
  state: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthCallbackResult> {
  await ensureSchema(db);
  const now = Date.now();
  const stateRow = await db
    .prepare(
      `SELECT state, provider, mode, code_verifier, invite_code, user_id, expires_at
         FROM oauth_states
        WHERE state = ?`,
    )
    .bind(state)
    .first<{
      state: string;
      provider: string;
      mode: OAuthFlowMode;
      code_verifier: string;
      invite_code: string | null;
      user_id: string | null;
      expires_at: number;
    }>();

  if (!stateRow || stateRow.provider !== provider || stateRow.expires_at <= now) {
    if (stateRow) await db.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
    return { kind: "error", code: "invalid_state" };
  }

  const deleted = await db
    .prepare("DELETE FROM oauth_states WHERE state = ?")
    .bind(state)
    .run();
  if (!deleted.meta.changes) {
    return { kind: "error", code: "invalid_state" };
  }

  let profile: OAuthProfile;
  try {
    const accessToken = await exchangeOAuthCode(
      provider,
      code,
      stateRow.code_verifier,
      oauthRedirectUri(request, provider),
      fetchImpl,
    );
    profile = await fetchOAuthProfile(provider, accessToken, fetchImpl);
  } catch {
    return { kind: "error", code: "oauth_failed" };
  }

  if (stateRow.mode === "link") {
    if (!stateRow.user_id) return { kind: "error", code: "invalid_state" };
    const existingOwner = await db
      .prepare("SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?")
      .bind(provider, profile.providerUserId)
      .first<{ user_id: string }>();
    if (existingOwner && existingOwner.user_id !== stateRow.user_id) {
      return { kind: "error", code: "already_linked" };
    }
    await db
      .prepare(
        `INSERT OR REPLACE INTO oauth_accounts
           (provider, provider_user_id, user_id, email, display_name, avatar_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        provider,
        profile.providerUserId,
        stateRow.user_id,
        profile.email,
        profile.displayName,
        profile.avatarUrl,
        now,
      )
      .run();
    return { kind: "linked", provider, userId: stateRow.user_id };
  }

  // 1. Existing OAuth account link
  const linkedRow = await db
    .prepare(
      `SELECT ${userColumns("u")}
         FROM oauth_accounts oa
         JOIN users u ON u.id = oa.user_id
        WHERE oa.provider = ? AND oa.provider_user_id = ?`,
    )
    .bind(provider, profile.providerUserId)
    .first<User>();

  if (linkedRow) {
    if (linkedRow.suspended_at) return { kind: "error", code: "suspended" };
    await db
      .prepare(
        `UPDATE oauth_accounts
            SET email = COALESCE(?, email),
                display_name = COALESCE(?, display_name),
                avatar_url = COALESCE(?, avatar_url)
          WHERE provider = ? AND provider_user_id = ?`,
      )
      .bind(
        profile.email,
        profile.displayName,
        profile.avatarUrl,
        provider,
        profile.providerUserId,
      )
      .run();
    return { kind: "signed_in", user: linkedRow, isNewUser: false };
  }

  // 2. Verified email auto-link (never link on unverified email!)
  if (profile.email && profile.emailVerified === true) {
    const matchedByEmail = await db
      .prepare(`SELECT ${userColumns()} FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`)
      .bind(profile.email)
      .first<User>();
    if (matchedByEmail) {
      if (matchedByEmail.suspended_at) return { kind: "error", code: "suspended" };
      await db
        .prepare(
          `INSERT OR IGNORE INTO oauth_accounts
             (provider, provider_user_id, user_id, email, display_name, avatar_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          provider,
          profile.providerUserId,
          matchedByEmail.id,
          profile.email,
          profile.displayName,
          profile.avatarUrl,
          now,
        )
        .run();
      return { kind: "signed_in", user: matchedByEmail, isNewUser: false };
    }
  }

  // 3. Create new account honoring Hoffle's signup gate (bootstrap / openSignup / invite code)
  const total = await db.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  const isFirstUser = (total?.count ?? 0) === 0;
  const signupSettings = isFirstUser ? { open: true, serverId: null } : await getSignupSettings(db);

  let defaultServerId: string | null = null;
  let claimedInviteCode: string | null = null;

  if (!isFirstUser) {
    const inviteCode = stateRow.invite_code?.trim().toUpperCase() || null;
    if (inviteCode) {
      const invite = await db
        .prepare("SELECT code, server_id, max_uses, uses, revoked, default_server_id FROM invites WHERE code = ?")
        .bind(inviteCode)
        .first<{
          code: string;
          server_id: string | null;
          max_uses: number;
          uses: number;
          revoked: number;
          default_server_id: string | null;
        }>();
      const validInvite =
        invite && !invite.revoked && (invite.max_uses <= 0 || invite.uses < invite.max_uses);
      if (!validInvite) {
        if (!signupSettings.open) return { kind: "error", code: "invite_required" };
      } else if (invite.server_id != null && invite.server_id !== "") {
        if (!signupSettings.open) return { kind: "error", code: "invite_required" };
        defaultServerId = invite.server_id;
      } else {
        const claimed = await db
          .prepare(
            `UPDATE invites SET uses = uses + 1
              WHERE code = ? AND revoked = 0 AND (max_uses <= 0 OR uses < max_uses)`,
          )
          .bind(invite.code)
          .run();
        if (!claimed.meta.changes) return { kind: "error", code: "invite_required" };
        claimedInviteCode = invite.code;
        defaultServerId = invite.default_server_id || null;
      }
    } else if (!signupSettings.open) {
      return { kind: "error", code: "invite_required" };
    }
  }

  const username = await allocateUniqueUsername(db, profile.username || profile.displayName);
  const displayName = profile.displayName || username;
  const userId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const placeholderSecret = randomBase64Url(24);
  const passwordHash = await hashPassword(placeholderSecret);
  const addressHash = await signupAddressHash(request);

  const user: User = {
    id: userId,
    username,
    display_name: displayName,
    avatar: displayName.slice(0, 1).toUpperCase() || "H",
    color: AVATAR_COLORS[(total?.count ?? 0) % AVATAR_COLORS.length],
    is_admin: isFirstUser ? 1 : 0,
    can_invite: isFirstUser ? 1 : 0,
    created_at: createdAt,
    last_seen_at: createdAt,
    email: profile.emailVerified && profile.email ? profile.email.toLowerCase() : null,
    signup_source: isFirstUser ? "first" : `oauth:${provider}`,
    ui_mode: isFirstUser ? "full" : "simple",
  };

  try {
    await db
      .prepare(
        `INSERT INTO users
           (id, username, username_lower, display_name, password_hash, email, avatar, color, is_admin, can_invite, created_at, last_seen_at, signup_source, signup_ip_hash, ui_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id,
        user.username,
        user.username.toLowerCase(),
        user.display_name,
        passwordHash,
        user.email,
        user.avatar,
        user.color,
        user.is_admin,
        user.can_invite,
        createdAt,
        createdAt,
        user.signup_source,
        addressHash,
        user.ui_mode,
      )
      .run();

    await db
      .prepare(
        `INSERT INTO oauth_accounts
           (provider, provider_user_id, user_id, email, display_name, avatar_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        provider,
        profile.providerUserId,
        user.id,
        profile.email,
        profile.displayName,
        profile.avatarUrl,
        now,
      )
      .run();
  } catch (err) {
    if (claimedInviteCode) {
      await db
        .prepare("UPDATE invites SET uses = uses - 1 WHERE code = ? AND uses > 0")
        .bind(claimedInviteCode)
        .run()
        .catch(() => undefined);
    }
    throw err;
  }

  const everyoneServerId = isFirstUser ? null : signupSettings.serverId;
  for (const serverId of new Set([everyoneServerId, defaultServerId])) {
    if (!serverId) continue;
    const exists = await db.prepare("SELECT id FROM servers WHERE id = ?").bind(serverId).first();
    if (!exists) continue;
    await db
      .prepare("INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)")
      .bind(serverId, user.id, new Date().toISOString())
      .run();
    await markServerRead(db, serverId, user.id);
  }

  return { kind: "signed_in", user, isNewUser: true };
}
