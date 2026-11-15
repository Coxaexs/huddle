// Exports Settings → Custom CSS's quick presets (lib/themes.ts CLIENT_UI_CSS_PRESETS). Run from
// the huddle repo root:
//   node desktop-gpui/tools/export-css-presets.mjs <out.json>
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const { build } = createRequire(join(process.cwd(), "package.json"))("esbuild");
const out = process.argv[2] || "desktop-gpui/resources/data/css-presets.json";
const bundle = join(process.env.TMPDIR || "/tmp", `hoffle-css-presets-${process.pid}.mjs`);
await build({
  stdin: { contents: `export { CLIENT_UI_CSS_PRESETS } from "./lib/themes";`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "error",
  alias: { "@": process.cwd() },
  // lib/themes.ts lists its theme sheets with Vite's import.meta.glob, which plain Node lacks.
  banner: { js: "import.meta.glob = () => ({});" },
});
const m = await import(pathToFileURL(bundle).href);
writeFileSync(out, JSON.stringify(m.CLIENT_UI_CSS_PRESETS, null, 1) + "\n");
console.log(`${m.CLIENT_UI_CSS_PRESETS.length} presets -> ${out}`);
