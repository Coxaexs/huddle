/**
 * Starts the Hoffle Discord bridge. Settings come from the environment, or
 * from discord-bridge/.env next to this folder when it exists (systemd and a
 * plain `npm start` both pick it up; Docker passes the variables itself).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Bridge } from "./bridge.js";
import { loadConfig, parseEnvFile } from "./config.js";
import { Store } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = process.env.BRIDGE_ENV_FILE || join(here, "..", ".env");
if (existsSync(envFile)) {
  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(envFile, "utf8")))) {
    // Real environment variables win over the file.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const cfg = loadConfig(process.env);
// The state folder is relative to the bridge folder, not wherever it was started.
if (!process.env.BRIDGE_STATE_DIR) cfg.stateDir = resolve(here, "..", "state");
const store = new Store(join(cfg.stateDir, "bridge.db"));
const bridge = new Bridge(cfg, store);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(new Date().toISOString(), `${signal}: stopping`);
  const force = setTimeout(() => process.exit(0), 5000);
  force.unref();
  await bridge.stop().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
// One bad message must never take the bridge down for every server.
process.on("unhandledRejection", (error) => console.error(new Date().toISOString(), "unhandled:", error));
process.on("uncaughtException", (error) => console.error(new Date().toISOString(), "uncaught:", error));

bridge.start().catch((error) => {
  console.error(new Date().toISOString(), "could not start:", error?.message || error);
  process.exit(1);
});
