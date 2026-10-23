// Writes Hoffle Lite's update manifest (lite-latest.json) for a Release:
//   node update-manifest.mjs <tag> <folder with the .sig files>
// Each platform points at its file in that Release, with the signature
// `tauri build` made for it. GitHub stores uploads with their spaces turned
// into dots, so a file is looked up under either name.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const [tag, dir] = process.argv.slice(2);
if (!tag || !dir) throw new Error("usage: update-manifest.mjs <tag> <folder with the .sig files>");
const repo = process.env.GITHUB_REPOSITORY || "Coxaexs/huddle";
const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const assets = JSON.parse(
  execFileSync("gh", ["release", "view", tag, "--repo", repo, "--json", "assets"], { encoding: "utf8" }),
).assets.map((asset) => asset.name);
const signatures = readdirSync(dir).filter((name) => name.endsWith(".sig"));

function platform(suffix) {
  const sig = signatures.find((name) => name.endsWith(suffix));
  if (!sig) throw new Error(`No *${suffix} in ${dir}`);
  const file = sig.slice(0, -".sig".length);
  const name = assets.find((asset) => asset === file || asset === file.replaceAll(" ", "."));
  if (!name) throw new Error(`The ${tag} Release has no ${file}`);
  return {
    signature: readFileSync(path.join(dir, sig), "utf8").trim(),
    url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`,
  };
}

const mac = platform(".app.tar.gz.sig");
const manifest = {
  version: config.version,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": platform("-setup.exe.sig"),
    // One universal build serves both.
    "darwin-aarch64": mac,
    "darwin-x86_64": mac,
  },
};
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
