import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "../src/store.js";

const message = {
  discordId: "100",
  hoffleId: "200",
  discordChannel: "1",
  hoffleChannel: "2",
  serverId: "srv",
  origin: "discord",
  viaWebhook: "wh",
  extraHoffle: ["201"],
  hash: "h1",
};

test("message mappings both ways", () => {
  const store = new Store(":memory:");
  store.putMessage(message);
  assert.equal(store.byDiscord("100").hoffle_id, "200");
  assert.equal(store.byHoffle("200").discord_id, "100");
  assert.deepEqual(JSON.parse(store.byHoffle("200").extra_hoffle), ["201"]);
  store.setHash("100", "h2");
  assert.equal(store.byDiscord("100").hash, "h2");
  store.forget("100");
  assert.equal(store.byDiscord("100"), null);
  assert.equal(store.byHoffle(null), null);
  store.close();
});

test("webhooks are remembered per side and channel", () => {
  const store = new Store(":memory:");
  store.putWebhook("discord", "c1", "w1", "t1");
  store.putWebhook("hoffle", "c1", "w2", "t2");
  assert.deepEqual({ ...store.webhook("discord", "c1") }, { id: "w1", token: "t1" });
  assert.deepEqual({ ...store.webhookById("hoffle", "w2") }, { channel: "c1", id: "w2", token: "t2" });
  assert.deepEqual([...store.webhookIds("discord")], ["w1"]);
  store.dropWebhook("discord", "c1");
  assert.equal(store.webhook("discord", "c1"), null);
  store.close();
});

test("cursors only move forward", () => {
  const store = new Store(":memory:");
  assert.equal(store.cursor("discord", "c"), null);
  store.advance("discord", "c", "1234567890123456789");
  store.advance("discord", "c", "999");
  assert.equal(store.cursor("discord", "c"), "1234567890123456789");
  store.advance("discord", "c", "1234567890123456790");
  assert.equal(store.cursor("discord", "c"), "1234567890123456790");
  store.close();
});

test("threads map one to one", () => {
  const store = new Store(":memory:");
  store.putThread("dt", "ht", "srv");
  assert.equal(store.threadByDiscord("dt").hoffle_thread, "ht");
  assert.equal(store.threadByHoffle("ht").discord_thread, "dt");
  store.close();
});

test("reactor counting decides when the bot's own reaction comes and goes", () => {
  const store = new Store(":memory:");
  assert.equal(store.addReactor("hoffle", "m", "👍", "u1"), true);
  assert.equal(store.addReactor("hoffle", "m", "👍", "u2"), false);
  // The same person twice is still one.
  assert.equal(store.addReactor("hoffle", "m", "👍", "u2"), false);
  assert.equal(store.dropReactor("hoffle", "m", "👍", "u1"), 1);
  assert.equal(store.dropReactor("hoffle", "m", "👍", "u2"), 0);
  store.addReactor("discord", "m", ":pog:", "d1", "Ayşe");
  store.addReactor("discord", "m", "🔥", "d1", "Ayşe");
  assert.equal(store.reactorName("discord", "d1"), "Ayşe");
  assert.equal(store.reactorsOf("discord", "m").length, 2);
  store.dropReactorsOf("discord", "m", ":pog:");
  assert.equal(store.reactorsOf("discord", "m").length, 1);
  store.dropReactorsOf("discord", "m");
  assert.equal(store.reactorsOf("discord", "m").length, 0);
  store.close();
});

test("prune keeps recent mappings", () => {
  const store = new Store(":memory:");
  store.putMessage(message);
  store.prune();
  assert.ok(store.byDiscord("100"));
  store.close();
});
