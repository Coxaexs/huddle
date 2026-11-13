// Exports lib/emoji-shortcodes.ts's :shortcode: → emoji table (dataset names, aliases and their
// underscore-less forms, built by the module itself) for the native client. Run from the huddle repo
// root:  node desktop-gpui/tools/export-shortcodes.mjs <out.json>
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const { build } = createRequire(join(process.cwd(), "package.json"))("esbuild");
const out = process.argv[2] || "desktop-gpui/resources/emoji/shortcodes.json";
const bundle = join(process.env.TMPDIR || "/tmp", `hoffle-shortcodes-${process.pid}.mjs`);
await build({
  stdin: { contents: `export * from "./lib/emoji-shortcodes";`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "error",
  alias: { "@": process.cwd() },
});
const { EMOJI_DATASET, EMOJI_ALIASES, resolveEmojiShortcode } = await import(pathToFileURL(bundle).href);
const names = new Set();
for (const e of EMOJI_DATASET) { names.add(e.name.toLowerCase()); names.add(e.name.toLowerCase().replace(/_/g, "")); }
for (const a of Object.keys(EMOJI_ALIASES)) { names.add(a.toLowerCase()); names.add(a.toLowerCase().replace(/_/g, "")); }
const table = {};
for (const n of [...names].sort()) { const s = resolveEmojiShortcode(n); if (s) table[n] = s; }
writeFileSync(out, JSON.stringify(table));
console.log(Object.keys(table).length, "shortcodes ->", out);
