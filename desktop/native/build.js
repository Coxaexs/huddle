// Builds the per-app screen-share audio helper into native/bin/, where
// electron-builder (and the Lite and native apps' builds) pick it up:
//
//   node native/build.js win   hoffle-app-audio.exe from app-audio.cpp. Zig
//                              cross-compiles it from any OS: the repo's
//                              .tools/zig when present, otherwise zig on PATH.
//   node native/build.js mac   hoffle-app-audio from app-audio-mac.m, a
//                              universal (arm64 + x86_64) binary. Needs a Mac.
//
// Plain Node rather than a shell script: `npm run` uses cmd.exe on Windows,
// where `bash` can resolve to the WSL launcher instead of Git Bash.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const bin = path.join(dir, "bin");
const target = process.argv[2] || (process.platform === "darwin" ? "mac" : "win");
fs.mkdirSync(bin, { recursive: true });

let out;
if (target === "mac") {
  out = path.join(bin, "hoffle-app-audio");
  execFileSync(
    "clang",
    [
      "-arch", "arm64", "-arch", "x86_64", "-mmacosx-version-min=12.0", "-O2", "-fobjc-arc",
      path.join(dir, "app-audio-mac.m"),
      "-framework", "Foundation", "-framework", "CoreAudio", "-framework", "CoreGraphics",
      "-o", out,
    ],
    { stdio: "inherit" },
  );
} else if (target === "win") {
  const local = path.join(dir, "../../.tools/zig", process.platform === "win32" ? "zig.exe" : "zig");
  const zig = fs.existsSync(local) ? local : "zig";
  out = path.join(bin, "hoffle-app-audio.exe");
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
} else {
  throw new Error(`unknown target "${target}": use win or mac`);
}
console.log(`built ${out}`);
