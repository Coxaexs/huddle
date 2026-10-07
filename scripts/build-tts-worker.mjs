// Builds the text-to-speech worker into public/assets/tts/ and copies the
// onnxruntime-web wasm next to it. The worker is its own bundle (like
// public/mic-worklet.js) so the app's build never has to understand workers,
// and the CSP only ever loads our own scripts.
//
//   node scripts/build-tts-worker.mjs
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public/assets/tts");
mkdirSync(join(out, "ort"), { recursive: true });

await build({
  entryPoints: [join(root, "app/lib/tts/worker/tts-worker.ts")],
  outfile: join(out, "tts-worker.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "eof",
  logLevel: "warning",
});

const ort = join(root, "node_modules/onnxruntime-web/dist");
copyFileSync(join(ort, "ort-wasm-simd-threaded.wasm"), join(out, "ort/ort-wasm-simd-threaded.wasm"));
// Renamed to .js: servers often send .mjs with a type browsers will not import.
copyFileSync(join(ort, "ort-wasm-simd-threaded.mjs"), join(out, "ort/ort-wasm-simd-threaded.js"));
rmSync(join(out, "ort/ort-wasm-simd-threaded.mjs"), { force: true });
copyFileSync(join(root, "app/lib/tts/NOTICE"), join(out, "NOTICE"));
console.log("TTS worker built into public/assets/tts/");
