// Once SignPath has signed the Windows installer, it no longer matches the
// sha512 and size electron-builder wrote into latest.yml, and electron-updater
// would refuse the download. This rewrites both from the files as they are now:
//   node scripts/refresh-update-info.mjs dist/latest.yml
// The blockmaps (for downloading only what changed) describe the unsigned
// files, so they are removed; the update then downloads whole.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) throw new Error("usage: refresh-update-info.mjs <latest.yml>");
const dir = path.dirname(file);
let current = null;
const named = new Set();
const lines = readFileSync(file, "utf8").split("\n").map((line) => {
  // "  - url: X" in the files list, "path: X" at the top level.
  const target = /^\s*(?:- )?(?:url|path): (.+)$/.exec(line);
  if (target) {
    current = target[1].trim().replace(/^(['"])(.*)\1$/, "$2");
    named.add(current);
    return line;
  }
  const field = /^(\s*)(sha512|size): /.exec(line);
  if (!field || !current || !existsSync(path.join(dir, current))) return line;
  const data = readFileSync(path.join(dir, current));
  return field[2] === "sha512"
    ? `${field[1]}sha512: ${createHash("sha512").update(data).digest("base64")}`
    : `${field[1]}size: ${data.length}`;
});
writeFileSync(file, lines.join("\n"));
for (const name of named) rmSync(path.join(dir, `${name}.blockmap`), { force: true });
console.log(`Refreshed ${file} for ${[...named].join(", ")}`);
