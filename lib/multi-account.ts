/**
 * Multi-account session vault stored in an HttpOnly, AES-GCM encrypted cookie
 * (`hoffle_accounts`). Holds up to 5 active sessions so users can switch
 * accounts in one click without re-entering credentials.
 */

import { ensureSchema } from "./schema";
import { bindings } from "./storage";
import { isSafeProfileImage } from "./users";

export const ACCOUNTS_COOKIE = "hoffle_accounts";
export const SESSION_COOKIE_NAME = "hoffle_session";
export const LEGACY_SESSION_COOKIE_NAME = "huddle_session";
export const MAX_VAULT_ACCOUNTS = 5;
const VAULT_TTL_SECONDS = 90 * 24 * 60 * 60;
const VAULT_META_KEY = "account_vault_secret";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface VaultEntry {
  userId: string;
  token: string;
}

export interface AccountSummary {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  isActive: boolean;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function readCookieFromHeader(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return new URL(request.url).protocol === "https:";
}

function cookiePath(request: Request): string {
  return new URL(request.url).pathname.startsWith("/hangout") ? "/hangout" : "/";
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`hoffle-vault|${secret}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Resolve a persistent instance secret for sealing the multi-account vault. */
export async function vaultSecret(db?: D1Database): Promise<string> {
  const env = bindings();
  const configured = env.IP_HASH_SALT?.trim() || env.BOT_TOKEN?.trim();
  if (configured) return configured;

  if (db) {
    await ensureSchema(db);
    const existing = await db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .bind(VAULT_META_KEY)
      .first<{ value: string }>()
      .catch(() => null);
    if (existing?.value) return existing.value;

    const generated = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    await db
      .prepare("INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)")
      .bind(VAULT_META_KEY, generated)
      .run()
      .catch(() => undefined);
    const stored = await db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .bind(VAULT_META_KEY)
      .first<{ value: string }>()
      .catch(() => null);
    if (stored?.value) return stored.value;
    return generated;
  }

  return "hoffle-ephemeral-vault-fallback";
}

export function dedupeVaultEntries(entries: VaultEntry[], max = MAX_VAULT_ACCOUNTS): VaultEntry[] {
  const seen = new Set<string>();
  const out: VaultEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry.userId !== "string" || typeof entry.token !== "string") continue;
    const userId = entry.userId.trim();
    const token = entry.token.trim();
    if (!userId || !token || seen.has(userId)) continue;
    seen.add(userId);
    out.push({ userId, token });
    if (out.length >= max) break;
  }
  return out;
}

export async function sealVault(entries: VaultEntry[], secret: string): Promise<string> {
  const clean = dedupeVaultEntries(entries);
  if (clean.length === 0) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(secret);
  const plaintext = encoder.encode(JSON.stringify(clean.map((e) => [e.userId, e.token])));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(ciphertext)}`;
}

export async function openVault(cookieValue: string | null, secret: string): Promise<VaultEntry[]> {
  if (!cookieValue || !cookieValue.startsWith("v1.")) return [];
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return [];
  const iv = fromBase64Url(parts[1]);
  const ciphertext = fromBase64Url(parts[2]);
  if (!iv || !ciphertext || iv.length !== 12 || ciphertext.length < 16) return [];

  try {
    const key = await importAesKey(secret);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    const parsed = JSON.parse(decoder.decode(decrypted)) as unknown;
    if (!Array.isArray(parsed)) return [];
    const entries: VaultEntry[] = [];
    for (const row of parsed) {
      if (Array.isArray(row) && typeof row[0] === "string" && typeof row[1] === "string") {
        entries.push({ userId: row[0], token: row[1] });
      }
    }
    return dedupeVaultEntries(entries);
  } catch {
    return [];
  }
}

export function clearAccountsCookie(request: Request): string {
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `${ACCOUNTS_COOKIE}=; Path=${cookiePath(request)}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function buildAccountsCookie(
  request: Request,
  entries: VaultEntry[],
  secret: string,
): Promise<string> {
  const clean = dedupeVaultEntries(entries);
  if (clean.length === 0) return clearAccountsCookie(request);
  const sealed = await sealVault(clean, secret);
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `${ACCOUNTS_COOKIE}=${encodeURIComponent(sealed)}; Path=${cookiePath(request)}; HttpOnly; SameSite=Lax; Max-Age=${VAULT_TTL_SECONDS}${secure}`;
}

async function resolveActiveSessionOwner(
  db: D1Database,
  token: string,
): Promise<VaultEntry | null> {
  if (!token) return null;
  try {
    const row = await db
      .prepare(
        `SELECT s.user_id, s.expires_at, u.suspended_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ?`,
      )
      .bind(await sha256Hex(token))
      .first<{ user_id: string; expires_at: string; suspended_at: string | null }>();
    if (!row || row.suspended_at) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    return { userId: row.user_id, token };
  } catch {
    return null;
  }
}

/**
 * Updates the multi-account vault cookie header when signing into `newUserId` with `newToken`.
 * Preserves up to 4 previously active accounts on this browser, rescuing the currently active
 * `hoffle_session` even if the vault cookie didn't exist yet.
 */
export async function accountsCookieForSignIn(
  db: D1Database,
  request: Request,
  newUserId: string,
  newToken: string,
): Promise<string> {
  const secret = await vaultSecret(db);
  const existing = await openVault(readCookieFromHeader(request, ACCOUNTS_COOKIE), secret);
  const currentToken =
    readCookieFromHeader(request, SESSION_COOKIE_NAME) ||
    readCookieFromHeader(request, LEGACY_SESSION_COOKIE_NAME);

  const candidates: VaultEntry[] = [{ userId: newUserId, token: newToken }];
  if (currentToken && currentToken !== newToken) {
    const previous = await resolveActiveSessionOwner(db, currentToken);
    if (previous && previous.userId !== newUserId) {
      candidates.push(previous);
    }
  }
  for (const entry of existing) {
    if (entry.userId !== newUserId) candidates.push(entry);
  }
  return buildAccountsCookie(request, candidates, secret);
}

/** Removes one user/token from the vault (or all when `clearAll` is true). */
export async function accountsCookieAfterRemoval(
  db: D1Database,
  request: Request,
  opts: { userId?: string; token?: string; clearAll?: boolean },
): Promise<{ entries: VaultEntry[]; cookie: string }> {
  if (opts.clearAll) {
    return { entries: [], cookie: clearAccountsCookie(request) };
  }
  const secret = await vaultSecret(db);
  const existing = await openVault(readCookieFromHeader(request, ACCOUNTS_COOKIE), secret);
  const filtered = existing.filter(
    (entry) =>
      (!opts.userId || entry.userId !== opts.userId) &&
      (!opts.token || entry.token !== opts.token),
  );
  return {
    entries: filtered,
    cookie: await buildAccountsCookie(request, filtered, secret),
  };
}

/**
 * Reads both the vault cookie and the active `hoffle_session` cookie, verifies
 * each stored session against D1 (`sessions JOIN users`), and returns display summaries.
 */
export async function listValidAccounts(
  db: D1Database,
  request: Request,
): Promise<{
  accounts: AccountSummary[];
  entries: VaultEntry[];
  activeUserId: string | null;
  changed: boolean;
}> {
  await ensureSchema(db);
  const secret = await vaultSecret(db);
  const vaultEntries = await openVault(readCookieFromHeader(request, ACCOUNTS_COOKIE), secret);
  const currentToken =
    readCookieFromHeader(request, SESSION_COOKIE_NAME) ||
    readCookieFromHeader(request, LEGACY_SESSION_COOKIE_NAME);

  const activeOwner = currentToken ? await resolveActiveSessionOwner(db, currentToken) : null;
  const rawList: VaultEntry[] = [];
  if (activeOwner) rawList.push(activeOwner);
  for (const entry of vaultEntries) rawList.push(entry);
  const candidates = dedupeVaultEntries(rawList);

  const validEntries: VaultEntry[] = [];
  const accounts: AccountSummary[] = [];
  const now = Date.now();

  for (const entry of candidates) {
    const tokenHash = await sha256Hex(entry.token);
    const row = await db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.avatar, u.avatar_url, u.color,
                u.suspended_at, s.expires_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ?`,
      )
      .bind(tokenHash)
      .first<{
        id: string;
        username: string;
        display_name: string;
        avatar: string;
        avatar_url: string | null;
        color: string;
        suspended_at: string | null;
        expires_at: string;
      }>()
      .catch(() => null);

    if (!row || row.suspended_at || new Date(row.expires_at).getTime() < now) continue;
    validEntries.push({ userId: row.id, token: entry.token });
    accounts.push({
      userId: row.id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      avatarUrl: isSafeProfileImage(row.avatar_url) ? row.avatar_url : null,
      color: row.color,
      isActive: activeOwner ? row.id === activeOwner.userId : false,
    });
  }

  const changed =
    validEntries.length !== vaultEntries.length ||
    validEntries.some((v, idx) => vaultEntries[idx]?.userId !== v.userId || vaultEntries[idx]?.token !== v.token);

  return {
    accounts,
    entries: validEntries,
    activeUserId: activeOwner?.userId ?? null,
    changed,
  };
}
