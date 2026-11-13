// Exports Hoffle's avatar decorations, nameplate art and profile frame art (app/components/cosmetics.tsx)
// as static SVG files, rendered with React on the server exactly as the web draws them.
// Run from the huddle repo root: node desktop-gpui/tools/export-cosmetics.mjs <out-dir>
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(join(process.cwd(), "package.json"));
const { build } = require("esbuild");
const out = process.argv[2] || "desktop-gpui/resources/cosmetics";
const bundle = join(process.env.TMPDIR || "/tmp", `cosmetics-${process.pid}.cjs`);
await build({
  stdin: {
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import * as c from "./app/components/cosmetics";
      export { createElement, renderToStaticMarkup, c };
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true, format: "cjs", platform: "node", outfile: bundle, logLevel: "error",
  jsx: "automatic", alias: { "@": process.cwd() },
  // The art tables are module-private: expose them in this throwaway bundle only.
  plugins: [{
    name: "expose-tables",
    setup(b) {
      b.onLoad({ filter: /app\/components\/cosmetics\.tsx$/ }, (args) => ({
        contents: readFileSync(args.path, "utf8") + "\nexport { DECORATIONS, NAMEPLATE_ART, FRAME_ART };\n",
        loader: "tsx",
      }));
    },
  }],
});
const { createElement, renderToStaticMarkup, c } = require(bundle);
const svg = (markup) => markup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
let n = 0;
for (const [dir, table, component] of [
  ["decorations", c.DECORATIONS, c.AvatarDecoration],
  ["nameplates", c.NAMEPLATE_ART, c.NameplateArt],
  ["frames", c.FRAME_ART, c.ProfileFrameArt],
]) {
  mkdirSync(join(out, dir), { recursive: true });
  for (const id of Object.keys(table ?? {})) {
    const markup = renderToStaticMarkup(createElement(component, { id }));
    if (!markup) continue;
    writeFileSync(join(out, dir, `${id}.svg`), svg(markup));
    n++;
  }
}
console.log(n, "files; decorations:", Object.keys(c.DECORATIONS ?? {}).length, "nameplates:", Object.keys(c.NAMEPLATE_ART ?? {}).length, "frames:", Object.keys(c.FRAME_ART ?? {}).length);
