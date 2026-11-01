import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avatarForDiscord,
  contentHash,
  discordToHoffle,
  discordUploadLimit,
  formatBytes,
  hoffleToDiscord,
  reactionForDiscord,
  reactionForHoffle,
  replyQuote,
  snowflakeAfter,
  splitText,
  twemojiCode,
  webhookName,
} from "../src/convert.js";

const names = {
  user: (id) => ({ 111111: "Ayşe" })[id],
  role: (id) => ({ 222222: "Mods" })[id],
  channel: (id) => ({ 333333: "genel" })[id],
};

test("Discord mentions, emoji and pings become readable Hoffle text", () => {
  assert.equal(discordToHoffle("hi <@111111> and <@!111111>", names), "hi @Ayşe and @Ayşe");
  assert.equal(discordToHoffle("<@&222222> look at <#333333>", names), "@Mods look at #genel");
  assert.equal(discordToHoffle("<@999999>", names), "@someone");
  assert.equal(discordToHoffle("nice <:pog:123456789> <a:dance:987654321>"), "nice :pog: :dance:");
  assert.equal(discordToHoffle("try </roll:123456789> or </music play:123456789>"), "try /roll or /music play");
  assert.match(discordToHoffle("@everyone and @here"), /^@​everyone and @​here$/);
  assert.equal(discordToHoffle(""), "");
});

test("timestamps render in UTC", () => {
  const out = discordToHoffle("at <t:0:d>");
  assert.equal(out, "at 01/01/1970");
  assert.match(discordToHoffle("<t:1700000000:R>"), /2023.*UTC$/);
});

test("Hoffle server emoji turn into the Discord emoji of the same name", () => {
  const emoji = (name) => (name === "pog" ? "<:pog:42>" : undefined);
  assert.equal(hoffleToDiscord(":pog: hi :nope:", { emoji }), "<:pog:42> hi :nope:");
  // Times and existing Discord emoji are left alone.
  assert.equal(hoffleToDiscord("at 10:30:45", { emoji }), "at 10:30:45");
  assert.equal(hoffleToDiscord("<:pog:42>", { emoji }), "<:pog:42>");
});

test("splitText keeps pieces under the limit and prefers line breaks", () => {
  const text = `${"a".repeat(1500)}\n${"b".repeat(1500)}`;
  const parts = splitText(text);
  assert.equal(parts.length, 2);
  assert.equal(parts[0], "a".repeat(1500));
  assert.equal(parts[1], "b".repeat(1500));
  assert.deepEqual(splitText("short"), ["short"]);
  assert.deepEqual(splitText(""), [""]);
  for (const piece of splitText("x".repeat(5000))) assert.ok(piece.length <= 2000);
});

test("webhook names Discord accepts", () => {
  assert.equal(webhookName("  Ayşe   K "), "Ayşe K");
  assert.ok(!/discord/i.test(webhookName("Discord fan")));
  assert.ok(!/clyde/i.test(webhookName("clyde")));
  assert.equal(webhookName(""), "Hoffle user");
  assert.equal(webhookName("everyone"), "everyone.");
  assert.equal([...webhookName("x".repeat(200))].length, 80);
});

test("reply quotes are one short line with a jump link", () => {
  const quote = replyQuote("Ali", `**bold** ${"word ".repeat(40)}`, "https://discord.com/channels/1/2/3");
  assert.match(quote, /^> ↪ \*\*Ali\*\*: bold word/);
  assert.ok(quote.includes("…"));
  assert.ok(quote.endsWith("[↗](<https://discord.com/channels/1/2/3>)"));
  assert.equal(replyQuote(null, ""), "> ↪ **someone**: a message");
});

test("avatars Discord can fetch", () => {
  assert.equal(avatarForDiscord({ hoffle_avatar_url: "/hangout/api/uploads/x.png" }, "https://h.online"), "https://h.online/hangout/api/uploads/x.png");
  assert.equal(avatarForDiscord({ hoffle_avatar_url: "https://cdn.x/a.png" }, "https://h.online"), "https://cdn.x/a.png");
  assert.match(avatarForDiscord({ hoffle_avatar: "🦊" }, ""), /twemoji@15\.1\.0\/assets\/72x72\/1f98a\.png$/);
  assert.equal(avatarForDiscord({ hoffle_avatar: "AB" }, ""), undefined);
  assert.equal(avatarForDiscord(null, ""), undefined);
});

test("twemoji file names", () => {
  assert.equal(twemojiCode("❤️"), "2764");
  assert.equal(twemojiCode("👨‍👩‍👧"), "1f468-200d-1f469-200d-1f467");
});

test("reaction emoji both ways", () => {
  const find = (name) => (name === "pog" ? { id: "42", name: "pog" } : undefined);
  assert.equal(reactionForDiscord("👍", find), "👍");
  assert.equal(reactionForDiscord("pog", find), "pog:42");
  assert.equal(reactionForDiscord(":pog:", find), "pog:42");
  assert.equal(reactionForDiscord("missing", find), null);
  assert.equal(reactionForHoffle({ id: null, name: "👍" }), "👍");
  assert.equal(reactionForHoffle({ id: "42", name: "pog" }), "pog:42");
  assert.equal(reactionForHoffle(null), null);
});

test("small helpers", () => {
  assert.equal(discordUploadLimit(0), 10 * 1024 * 1024);
  assert.equal(discordUploadLimit(2), 50 * 1024 * 1024);
  assert.equal(discordUploadLimit(3), 100 * 1024 * 1024);
  assert.ok(snowflakeAfter("1234567890123456790", "1234567890123456789"));
  assert.ok(!snowflakeAfter("9", "10"));
  assert.ok(snowflakeAfter("1", null));
  assert.equal(formatBytes(0), "");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(30 * 1024 * 1024), "30 MB");
  assert.equal(contentHash("a", []), contentHash("a", []));
  assert.notEqual(contentHash("a", []), contentHash("b", []));
});
