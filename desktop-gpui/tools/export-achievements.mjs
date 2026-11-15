// Exports the achievement catalogue for the native client (lib/achievement-defs.ts: every
// achievement, the categories, tier labels and points, the showcase limit). Run from the huddle
// repo root:
//   node desktop-gpui/tools/export-achievements.mjs <out.json>
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const { build } = createRequire(join(process.cwd(), "package.json"))("esbuild");

const out = process.argv[2] || "desktop-gpui/resources/data/achievements.json";
const entry = `
  export * from "./lib/achievement-defs";
`;
const bundle = join(process.env.TMPDIR || "/tmp", `hoffle-achievements-${process.pid}.mjs`);
await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "error",
  alias: { "@": process.cwd() },
});
const m = await import(pathToFileURL(bundle).href);
writeFileSync(out, JSON.stringify({
  achievements: m.ACHIEVEMENTS,
  categories: m.ACHIEVEMENT_CATEGORIES,
  tierLabels: m.TIER_LABELS,
  // app/lib/achievement-client.ts
  tierPoints: { bronze: 10, silver: 25, gold: 50, platinum: 100 },
  showcaseLimit: m.SHOWCASE_LIMIT,
}, null, 1) + "\n");
console.log(`${m.ACHIEVEMENTS.length} achievements -> ${out}`);
