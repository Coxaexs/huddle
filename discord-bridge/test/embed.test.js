import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanEmbed } from "../src/bridge.js";

test("cleanEmbed keeps only what Discord accepts", () => {
  const out = cleanEmbed({
    type: "rich",
    title: "Hi",
    url: "javascript:alert(1)",
    color: "#ff0000",
    author: { name: "A", icon_url: "http://insecure/x.png" },
    image: { url: "https://x/y.png" },
    fields: [{ name: "n", value: "v", inline: 1 }, { name: "", value: "skip" }],
    provider: { name: "nope" },
  });
  assert.deepEqual(out, {
    title: "Hi",
    color: 0xff0000,
    author: { name: "A" },
    image: { url: "https://x/y.png" },
    fields: [{ name: "n", value: "v", inline: true }],
  });
  assert.equal(cleanEmbed({ provider: {} }), null);
  assert.equal(cleanEmbed(null), null);
});
