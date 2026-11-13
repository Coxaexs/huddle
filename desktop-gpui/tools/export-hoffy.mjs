// Exports every Hoffy mascot face × pose (lib/hoffy-svg.ts) as SVG files for the native client.
// Run from the huddle repo root: node desktop-gpui/tools/export-hoffy.mjs <out-dir>
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { build } = createRequire(join(process.cwd(), "package.json"))("esbuild");
const out = process.argv[2] || "desktop-gpui/resources/images";
const bundle = join(process.env.TMPDIR || "/tmp", `hoffy-${process.pid}.mjs`);
await build({
  stdin: { contents: `export * from "./lib/hoffy-svg";`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "error", alias: { "@": process.cwd() },
  // FACES is module-private; expose it in this throwaway bundle only.
  plugins: [{
    name: "expose-faces",
    setup(b) {
      b.onLoad({ filter: /lib\/hoffy-svg\.ts$/ }, async (args) => {
        const { readFile } = await import("node:fs/promises");
        return { contents: (await readFile(args.path, "utf8")) + "\nexport { FACES };\n", loader: "ts" };
      });
    },
  }],
});
const mod = await import(pathToFileURL(bundle).href);
const faces = Object.keys(mod.FACES ?? {});
const poses = Object.keys(mod.HOFFY_POSES ?? {});
if (!faces.length || !poses.length) throw new Error("FACES / HOFFY_POSES are not exported from lib/hoffy-svg.ts");
mkdirSync(out, { recursive: true });
for (const face of faces) for (const pose of poses) {
  writeFileSync(join(out, `hoffy-${face}-${pose}.svg`), mod.hoffySvg({ face, pose, base: `h-${face}-${pose}` }));
}
console.log(faces.length * poses.length, "variants:", faces.join(","), "|", poses.join(","));
