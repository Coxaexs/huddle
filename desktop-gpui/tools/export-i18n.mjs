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
  import { translate, __EN } from "./lib/i18n";
  export { translate, __EN };
`;
const bundle = join(process.env.TMPDIR || "/tmp", `hoffle-i18n-${process.pid}.mjs`);
await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "error",
  alias: { "@": process.cwd() },
  // English (every key) is module-private in lib/i18n.ts: expose it in this throwaway bundle only.
  plugins: [{
    name: "expose-en",
    setup(b) {
      b.onLoad({ filter: /lib\/i18n\.ts$/ }, async (args) => {
        const { readFile } = await import("node:fs/promises");
        return { contents: (await readFile(args.path, "utf8")) + "\nexport { en as __EN };\n", loader: "ts" };
      });
    },
  }],
});
const { translate, __EN: en } = await import(pathToFileURL(bundle).href);
const keys = Object.keys(en).sort();
mkdirSync(out, { recursive: true });
for (const locale of ["en", "tr", "es", "de", "fr", "pt-BR", "nl"]) {
  const table = {};
  for (const key of keys) table[key] = translate(locale, key);
  writeFileSync(join(out, `${locale}.json`), JSON.stringify(table, null, 0));
  console.log(locale, Object.keys(table).length);
}
