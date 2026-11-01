import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { derivedBridgeToken, loadConfig, parseEnvFile, splitTokens } from "../src/config.js";

test("the derived token matches Hoffle's (lib/bot-auth.ts discordBridgeToken)", () => {
  const expected = `hfl_bridge_${createHash("sha256").update("hoffle-discord-bridge:secret").digest("hex")}`;
  assert.equal(derivedBridgeToken("secret"), expected);
});

test(".env parsing", () => {
  const env = parseEnvFile('A=1\n# note\nexport B="two words"\nC=three # comment\nD=\'x#y\'\nbad line');
  assert.deepEqual(env, { A: "1", B: "two words", C: "three", D: "x#y" });
});

test("defaults and normalising", () => {
  const cfg = loadConfig({ HOFFLE_BOT_TOKEN: "secret", HOFFLE_URL: "http://h:1/", HOFFLE_BASE_PATH: "hangout/" });
  assert.equal(cfg.hoffleUrl, "http://h:1");
  assert.equal(cfg.basePath, "/hangout");
  assert.equal(cfg.publicUrl, "http://h:1");
  assert.equal(cfg.hoffleToken, derivedBridgeToken("secret"));
  assert.equal(cfg.healthPort, 8733);
  assert.equal(loadConfig({ HOFFLE_BASE_PATH: "/" }).basePath, "");
});

test("a ready bridge token is used as is, and the old HUDDLE_ names still work", () => {
  assert.equal(loadConfig({ HOFFLE_BOT_TOKEN: "hfl_bridge_abc" }).hoffleToken, "hfl_bridge_abc");
  assert.equal(loadConfig({ HUDDLE_BOT_TOKEN: "s" }).hoffleToken, derivedBridgeToken("s"));
  assert.equal(loadConfig({ HUDDLE_URL: "http://old:2" }).hoffleUrl, "http://old:2");
});

test("BOT_TOKEN can come from Hoffle's .env", () => {
  const dir = mkdtempSync(join(tmpdir(), "bridge-cfg-"));
  writeFileSync(join(dir, ".env"), "OTHER=1\nBOT_TOKEN=from-file\n");
  assert.equal(loadConfig({ HOFFLE_ENV_FILE: join(dir, ".env") }).hoffleToken, derivedBridgeToken("from-file"));
  assert.equal(loadConfig({ HOFFLE_ENV_FILE: join(dir, "missing") }).hoffleToken, "");
});

test("voice helper tokens: a list, without repeats or the main bot's own token", () => {
  assert.deepEqual(splitTokens("a, b\nc,,a"), ["a", "b", "c"]);
  const cfg = loadConfig({ DISCORD_BOT_TOKEN: "main", DISCORD_VOICE_BOT_TOKENS: "one,main, two" });
  assert.deepEqual(cfg.voiceBotTokens, ["one", "two"]);
  assert.deepEqual(loadConfig({}).voiceBotTokens, []);
});
