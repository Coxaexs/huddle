// Exports Hoffle's UI strings for the native client: for every English key, the string each locale
// resolves to through lib/i18n.ts's own translate() (so fallbacks match the web exactly), with
// {placeholders} left in. Run from the huddle repo root:
//   node desktop-gpui/tools/export-i18n.mjs <out-dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// esbuild from the repo being exported, wherever this script lives.
const { build } = createRequire(join(process.cwd(), "package.json"))("esbuild");

const out = process.argv[2] || "desktop-gpui/resources/i18n";
const entry = `
  import { translate } from "./lib/i18n";
  import * as enCatalog from "./lib/i18n-catalog/en";
  export { translate, enCatalog };
`;
const bundle = join(process.env.TMPDIR || "/tmp", `hoffle-i18n-${process.pid}.mjs`);
await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "error",
  alias: { "@": process.cwd() },
});
const { translate, enCatalog } = await import(pathToFileURL(bundle).href);
const en = Object.assign({}, ...Object.values(enCatalog).filter((v) => v && typeof v === "object"));
const keys = Object.keys(en).sort();
mkdirSync(out, { recursive: true });
for (const locale of ["en", "tr", "es", "de", "fr", "pt-BR", "nl"]) {
  const table = {};
  for (const key of keys) table[key] = translate(locale, key);
  writeFileSync(join(out, `${locale}.json`), JSON.stringify(table, null, 0));
  console.log(locale, Object.keys(table).length);
}
