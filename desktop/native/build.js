// Builds hoffle-app-audio.exe (per-app screen-share audio on Windows) into
// native/bin/, where electron-builder picks it up. Zig cross-compiles it from
// any OS: the repo's .tools/zig when present, otherwise zig on PATH.
//
// Plain Node rather than a shell script: `npm run` uses cmd.exe on Windows,
// where `bash` can resolve to the WSL launcher instead of Git Bash.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const bin = path.join(dir, "bin");
const local = path.join(dir, "../../.tools/zig", process.platform === "win32" ? "zig.exe" : "zig");
const zig = fs.existsSync(local) ? local : "zig";

fs.mkdirSync(bin, { recursive: true });
const out = path.join(bin, "hoffle-app-audio.exe");
execFileSync(
  zig,
  [
    "c++", "-target", "x86_64-windows-gnu", "-O2", "-std=c++17", "-municode",
    path.join(dir, "app-audio.cpp"), "-lole32", "-lmmdevapi", "-luuid",
    "-o", out,
  ],
  { stdio: "inherit" },
);
for (const f of fs.readdirSync(bin)) {
  if (f.endsWith(".pdb") || f.endsWith(".lib")) fs.rmSync(path.join(bin, f));
}
console.log(`built ${out}`);
