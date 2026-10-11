"use strict";

/**
 * Signs the Mac app with an ad-hoc signature (no certificate needed).
 *
 * electron-builder only signs with a real identity from the keychain, so
 * without one the app ships unsigned, and macOS on Apple silicon refuses an
 * unsigned downloaded app with "is damaged and can't be opened". An ad-hoc
 * signature is enough to turn that into the usual "unidentified developer"
 * prompt (right-click > Open). Real Developer ID signing and notarization
 * still win when CSC_LINK is set: electron-builder signs first and this is
 * skipped.
 */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const run = (args) => execFileSync("codesign", args, { stdio: "inherit" });
  // Everything inside is signed too (--deep), replacing the signatures Electron's prebuilt parts carry.
  run(["--force", "--deep", "--sign", "-", app]);
  // Fail the build here rather than ship an app macOS will call damaged.
  run(["--verify", "--deep", "--strict", app]);
  console.log(`  • ad-hoc signed ${app}`);
};
