"use strict";

const crypto = require("node:crypto");
const EventEmitter = require("node:events");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");

const LATEST_MAC_YML = "https://github.com/Coxaexs/huddle/releases/latest/download/latest-mac.yml";
const ALLOWED_RELEASE_PREFIX = "https://github.com/Coxaexs/huddle/releases/";
const ALLOWED_REDIRECT_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);
const MAX_REDIRECTS = 6;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Parses the subset of electron-builder's latest-mac.yml needed for updates.
 * @param {string} text
 * @returns {{ version: string, files: Array<{ url: string, sha512: string, size: number }> }}
 */
function parseLatestMacYml(text) {
  const versionMatch = /^version:\s*['"]?([^'"\s]+)['"]?/m.exec(String(text || ""));
  const version = versionMatch ? versionMatch[1].replace(/^v/, "") : "";
  const files = [];
  let current = null;
  let inFiles = false;

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    if (/^files:\s*$/.test(rawLine)) {
      inFiles = true;
      continue;
    }
    if (inFiles && /^\S/.test(rawLine)) {
      inFiles = false;
      current = null;
    }
    if (!inFiles) continue;

    const itemMatch = /^\s*-\s+url:\s*['"]?([^'"\s]+)['"]?/.exec(rawLine);
    if (itemMatch) {
      current = { url: itemMatch[1], sha512: "", size: 0 };
      files.push(current);
      continue;
    }
    if (!current) continue;

    const shaMatch = /^\s+sha512:\s*['"]?([^'"\s]+)['"]?/.exec(rawLine);
    if (shaMatch) current.sha512 = shaMatch[1];

    const sizeMatch = /^\s+size:\s*(\d+)/.exec(rawLine);
    if (sizeMatch) current.size = Number(sizeMatch[1]) || 0;
  }

  return { version, files };
}

/**
 * Returns true if dotted semver `remote` is strictly newer than `current`.
 * @param {string} remote
 * @param {string} current
 */
function isNewerVersion(remote, current) {
  const parse = (v) =>
    String(v || "")
      .replace(/^v/, "")
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(remote);
  const b = parse(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/**
 * Picks the macOS zip archive matching `arch` from parsed latest-mac.yml files.
 * @param {Array<{ url: string, sha512: string, size: number }>} files
 * @param {string} arch
 */
function pickMacZip(files, arch) {
  const zips = (files || []).filter((f) => f.url && f.url.endsWith(".zip") && f.sha512);
  if (arch === "arm64") {
    return zips.find((f) => /arm64/i.test(f.url)) || null;
  }
  return zips.find((f) => !/arm64/i.test(f.url)) || null;
}

/**
 * Checks whether `targetPath` and its parent directory are writable.
 * @param {string} targetPath
 */
function isPathWritable(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.W_OK);
    fs.accessSync(path.dirname(targetPath), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function httpsGetFollow(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return reject(err);
    }
    if (parsed.protocol !== "https:") {
      return reject(new Error(`Refusing non-HTTPS URL: ${url}`));
    }

    const req = https.get(
      parsed,
      { timeout: REQUEST_TIMEOUT_MS, headers: { "User-Agent": "Hoffle-Updater" } },
      (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error("Too many redirects"));
          const nextUrl = new URL(res.headers.location, parsed).toString();
          const nextHost = new URL(nextUrl).hostname;
          if (!ALLOWED_REDIRECT_HOSTS.has(nextHost)) {
            return reject(new Error(`Unexpected redirect host: ${nextHost}`));
          }
          return resolve(httpsGetFollow(nextUrl, redirectsLeft - 1));
        }
        if (code < 200 || code >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${code} from ${parsed.hostname}`));
        }
        resolve(res);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
  });
}

async function fetchText(url) {
  const res = await httpsGetFollow(url);
  return new Promise((resolve, reject) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    res.on("error", reject);
  });
}

async function downloadAndVerify(url, destPath, expectedSha512, expectedSize, onProgress) {
  const res = await httpsGetFollow(url);
  const total = Number(res.headers["content-length"]) || expectedSize || 0;
  let transferred = 0;
  const hash = crypto.createHash("sha512");
  const out = fs.createWriteStream(destPath);

  await new Promise((resolve, reject) => {
    const fail = (err) => {
      res.destroy();
      out.destroy();
      reject(err);
    };
    res.on("data", (chunk) => {
      transferred += chunk.length;
      hash.update(chunk);
      if (total > 0) {
        onProgress({
          percent: Math.min(100, (transferred / total) * 100),
          transferred,
          total,
        });
      }
    });
    res.on("error", fail);
    out.on("error", fail);
    out.on("finish", resolve);
    res.pipe(out);
  });

  const actual = hash.digest("base64");
  const aBuf = Buffer.from(actual, "utf8");
  const eBuf = Buffer.from(String(expectedSha512 || ""), "utf8");
  if (aBuf.length !== eBuf.length || !crypto.timingSafeEqual(aBuf, eBuf)) {
    fs.rmSync(destPath, { force: true });
    throw new Error("Update checksum mismatch");
  }
}

function extractZipWithDitto(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    execFile("ditto", ["-xk", zipPath, destDir], { timeout: 120_000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Creates an electron-updater-compatible EventEmitter for ad-hoc signed
 * macOS builds, downloading from latest-mac.yml and swapping Hoffle.app.
 */
function createMacBundleUpdater({ app, currentVersion, appBundle, stageDir, arch = process.arch }) {
  const emitter = new EventEmitter();
  emitter.autoDownload = true;
  emitter.autoInstallOnAppQuit = true;

  let checking = false;
  let readyInfo = null;
  let quitHookRegistered = false;

  const spawnSwapScript = (relaunch) => {
    if (!readyInfo || !fs.existsSync(readyInfo.newAppPath)) return false;
    const scriptPath = path.join(stageDir, "apply-update.sh");
    const script = [
      "#!/bin/sh",
      "set -eu",
      'pid="$1"',
      'app="$2"',
      'new_app="$3"',
      'stage="$4"',
      'relaunch="$5"',
      "i=0",
      'while kill -0 "$pid" 2>/dev/null && [ $i -lt 150 ]; do sleep 0.2; i=$((i + 1)); done',
      'rm -rf "$app.old"',
      'mv "$app" "$app.old"',
      'if mv "$new_app" "$app"; then',
      '  rm -rf "$app.old"',
      "else",
      '  mv "$app.old" "$app"',
      "  exit 1",
      "fi",
      'xattr -cr "$app" 2>/dev/null || true',
      'rm -rf "$stage"',
      'if [ "$relaunch" = "1" ]; then open -n "$app"; fi',
      "",
    ].join("\n");
    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(scriptPath, script, { mode: 0o700 });
    const child = spawn(
      "/bin/sh",
      [scriptPath, String(process.pid), appBundle, readyInfo.newAppPath, stageDir, relaunch ? "1" : "0"],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
    return true;
  };

  const ensureQuitHook = () => {
    if (quitHookRegistered || !app) return;
    quitHookRegistered = true;
    app.on("will-quit", () => {
      if (emitter.autoInstallOnAppQuit && readyInfo) {
        spawnSwapScript(false);
        readyInfo = null;
      }
    });
  };

  emitter.checkForUpdates = async () => {
    if (checking || readyInfo) return null;
    checking = true;
    emitter.emit("checking-for-update");
    try {
      const yml = await fetchText(LATEST_MAC_YML);
      const parsed = parseLatestMacYml(yml);
      const zip = pickMacZip(parsed.files, arch);
      if (!parsed.version || !zip || !isNewerVersion(parsed.version, currentVersion)) {
        emitter.emit("update-not-available", { version: parsed.version || currentVersion });
        return null;
      }

      const info = { version: parsed.version };
      emitter.emit("update-available", info);

      if (!emitter.autoDownload) return info;

      const downloadUrl = `${ALLOWED_RELEASE_PREFIX}download/desktop-v${parsed.version}/${encodeURIComponent(zip.url)}`;
      fs.rmSync(stageDir, { recursive: true, force: true });
      fs.mkdirSync(stageDir, { recursive: true });
      const zipPath = path.join(stageDir, "update.zip");
      const extractDir = path.join(stageDir, "extracted");
      fs.mkdirSync(extractDir, { recursive: true });

      await downloadAndVerify(downloadUrl, zipPath, zip.sha512, zip.size, (progress) => {
        emitter.emit("download-progress", progress);
      });
      await extractZipWithDitto(zipPath, extractDir);
      fs.rmSync(zipPath, { force: true });

      const newAppPath = path.join(extractDir, "Hoffle.app");
      if (!fs.existsSync(path.join(newAppPath, "Contents", "MacOS", "Hoffle"))) {
        throw new Error("Extracted archive did not contain Hoffle.app");
      }

      readyInfo = { version: parsed.version, newAppPath };
      ensureQuitHook();
      emitter.emit("update-downloaded", info);
      return info;
    } catch (err) {
      emitter.emit("error", err);
      return null;
    } finally {
      checking = false;
    }
  };

  emitter.quitAndInstall = (_isSilent, isForceRunAfter = true) => {
    if (!readyInfo) return;
    if (spawnSwapScript(Boolean(isForceRunAfter))) {
      readyInfo = null;
      app.quit();
    }
  };

  return emitter;
}

module.exports = {
  createMacBundleUpdater,
  parseLatestMacYml,
  isNewerVersion,
  pickMacZip,
  isPathWritable,
  LATEST_MAC_YML,
};
