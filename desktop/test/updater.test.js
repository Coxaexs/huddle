"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const { createUpdater, APPLY_AT_LAUNCH_MS } = require("../src/updater");
const { parseLatestMacYml, isNewerVersion, pickMacZip } = require("../src/mac-updater");

const SAMPLE_MAC_YML = `version: 2.1.3
files:
  - url: Hoffle-2.1.3-arm64-mac.zip
    sha512: abc123==
    size: 123456
  - url: Hoffle-2.1.3-mac.zip
    sha512: def456==
    size: 234567
  - url: Hoffle-2.1.3-arm64.dmg
    sha512: dmg111==
    size: 345678
path: Hoffle-2.1.3-arm64-mac.zip
sha512: abc123==
releaseDate: '2026-11-14T10:00:00.000Z'
`;

test("parseLatestMacYml extracts version and zip entries", () => {
  const parsed = parseLatestMacYml(SAMPLE_MAC_YML);
  assert.equal(parsed.version, "2.1.3");
  assert.equal(parsed.files.length, 3);
  assert.equal(pickMacZip(parsed.files, "arm64")?.url, "Hoffle-2.1.3-arm64-mac.zip");
  assert.equal(pickMacZip(parsed.files, "x64")?.url, "Hoffle-2.1.3-mac.zip");
});

test("isNewerVersion compares dotted semver properly", () => {
  assert.equal(isNewerVersion("2.1.3", "2.1.2"), true);
  assert.equal(isNewerVersion("v2.2.0", "2.1.9"), true);
  assert.equal(isNewerVersion("2.1.2", "2.1.2"), false);
  assert.equal(isNewerVersion("2.1.1", "2.1.2"), false);
});

function makeMockAutoUpdater() {
  const emitter = new EventEmitter();
  emitter.installed = 0;
  emitter.checkForUpdates = async () => {};
  emitter.quitAndInstall = () => {
    emitter.installed += 1;
  };
  return emitter;
}

test("createUpdater auto-installs while splash is open even past launch window", async () => {
  const autoUpdater = makeMockAutoUpdater();
  let clock = 1000;
  const states = [];
  let beforeInstallCalled = 0;

  const updater = createUpdater({
    autoUpdater,
    canInstall: true,
    isBusy: () => false,
    isSplashOpen: () => true,
    onChange: (s) => states.push(s),
    beforeInstall: () => {
      beforeInstallCalled += 1;
    },
    now: () => clock,
  });

  updater.check();
  autoUpdater.emit("checking-for-update");
  autoUpdater.emit("update-available", { version: "2.1.3" });
  autoUpdater.emit("download-progress", { percent: 55.4 });
  clock += APPLY_AT_LAUNCH_MS + 30_000;
  autoUpdater.emit("update-downloaded", { version: "2.1.3" });

  assert.equal(autoUpdater.installed, 1);
  assert.equal(beforeInstallCalled, 1);
  assert.deepEqual(
    states.map((s) => s.status),
    ["checking", "downloading", "downloading", "ready"],
  );
  assert.equal(states[2].percent, 55);
});

test("createUpdater does not auto-install after user clicks skip", async () => {
  const autoUpdater = makeMockAutoUpdater();
  const updater = createUpdater({
    autoUpdater,
    canInstall: true,
    isBusy: () => false,
    isSplashOpen: () => false,
    onChange: () => {},
    beforeInstall: () => {},
    now: () => 1000,
  });

  updater.check();
  autoUpdater.emit("checking-for-update");
  autoUpdater.emit("update-available", { version: "2.1.3" });
  updater.markSkipped();
  autoUpdater.emit("update-downloaded", { version: "2.1.3" });

  assert.equal(autoUpdater.installed, 0);
  assert.equal(updater.state().status, "ready");
});

test("createUpdater falls back to manual when canInstall is false", () => {
  const autoUpdater = makeMockAutoUpdater();
  const states = [];
  const updater = createUpdater({
    autoUpdater,
    canInstall: false,
    isBusy: () => false,
    onChange: (s) => states.push(s),
    beforeInstall: () => {},
  });

  updater.check();
  autoUpdater.emit("checking-for-update");
  autoUpdater.emit("update-available", { version: "2.1.3" });

  assert.equal(autoUpdater.autoDownload, false);
  assert.equal(updater.state().status, "manual");
  assert.equal(updater.state().version, "2.1.3");
});
