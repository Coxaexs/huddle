/**
 * Settings from the environment (discord-bridge/.env under systemd or Docker).
 *
 *   DISCORD_BOT_TOKEN   the Discord bot every Hoffle server shares (required)
 *   HOFFLE_URL          where Hoffle answers locally   (default http://127.0.0.1:8730)
 *   HOFFLE_BASE_PATH    Hoffle's base path              (default /hangout)
 *   HOFFLE_PUBLIC_URL   the public site, for links and pictures Discord fetches
 *                       (default: HOFFLE_URL)
 *   HOFFLE_BOT_TOKEN    Hoffle's BOT_TOKEN (the bridge derives its own token from
 *                       it), or a ready hfl_bridge_ token. HOFFLE_ENV_FILE may
 *                       point at Hoffle's .env instead, to read BOT_TOKEN there.
 *   BRIDGE_STATE_DIR    where bridge.db lives           (default ./state)
 *   BRIDGE_HEALTH_PORT  127.0.0.1 port for /healthz     (default 8733, 0 = off)
 *
 * The old HUDDLE_* names still work.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Mirrors lib/bot-auth.ts `discordBridgeToken`; keep them in step. */
export function derivedBridgeToken(botToken) {
  const hex = createHash("sha256").update(`hoffle-discord-bridge:${botToken}`).digest("hex");
  return `hfl_bridge_${hex}`;
}

/** KEY=value lines, quotes optional, # comments. */
export function parseEnvFile(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    out[match[1]] = value;
  }
  return out;
}

export function loadConfig(env = process.env) {
  const pick = (...names) => {
    for (const name of names) {
      const value = env[name];
      if (value && String(value).trim()) return String(value).trim();
    }
    return "";
  };
  const hoffleUrl = (pick("HOFFLE_URL", "HUDDLE_URL") || "http://127.0.0.1:8730").replace(/\/+$/, "");
  let basePath = pick("HOFFLE_BASE_PATH", "HUDDLE_BASE_PATH") || "/hangout";
  if (basePath === "/") basePath = "";
  if (basePath && !basePath.startsWith("/")) basePath = `/${basePath}`;
  basePath = basePath.replace(/\/+$/, "");

  let hoffleToken = pick("HOFFLE_BOT_TOKEN", "HUDDLE_BOT_TOKEN");
  const envFile = pick("HOFFLE_ENV_FILE");
  if (!hoffleToken && envFile) {
    try {
      hoffleToken = parseEnvFile(readFileSync(envFile, "utf8")).BOT_TOKEN || "";
    } catch {
      hoffleToken = "";
    }
  }
  if (hoffleToken && !hoffleToken.startsWith("hfl_bridge_")) hoffleToken = derivedBridgeToken(hoffleToken);

  return {
    discordToken: pick("DISCORD_BOT_TOKEN"),
    hoffleUrl,
    basePath,
    publicUrl: (pick("HOFFLE_PUBLIC_URL") || hoffleUrl).replace(/\/+$/, ""),
    hoffleToken,
    stateDir: resolve(pick("BRIDGE_STATE_DIR") || "state"),
    healthPort: Number(pick("BRIDGE_HEALTH_PORT") || 8733),
    /** How often Hoffle is asked for the bridge settings. */
    configEveryMs: Number(pick("BRIDGE_CONFIG_EVERY_MS") || 10_000),
    /** How often the status (and the channel lists Settings shows) is sent. */
    statusEveryMs: Number(pick("BRIDGE_STATUS_EVERY_MS") || 30_000),
    /** Messages missed while down are carried over if they are younger than this. */
    catchUpHours: Number(pick("BRIDGE_CATCH_UP_HOURS") || 12),
  };
}
