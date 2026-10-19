#!/usr/bin/env node
/**
 * `npm run build` refuses to run in a checkout whose dist/ a running server
 * is serving, such as the live ~/huddle: `wrangler dev` with this dist's
 * wrangler.json, or workerd run directly (huddle.service) on this dist's
 * config or assets.
 *
 * Building in place rewrites dist/ under the running server; wrangler reloads
 * halfway through and the site goes down until it is restarted (it did on
 * 2026-10-14). scripts/deploy.sh builds in a separate copy instead, and
 * `scripts/deploy.sh --build-only` checks that a build works without deploying.
 * HOFFLE_BUILD_IN_PLACE=1 skips this check.
 */
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import path from "node:path";

if (process.env.HOFFLE_BUILD_IN_PLACE !== "1" && process.platform === "linux") {
  const root = process.cwd();
  const dist = path.join(root, "dist");
  const config = path.join(dist, "server", "wrangler.json");
  let serving = null;
  let what = "wrangler";
  for (const pid of readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
    let args;
    let cwd = "";
    try {
      args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
      cwd = readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      continue; // gone, or another user's process
    }
    // huddle.service: workerd serve dist/workerd/config.bin
    //   --directory-path=assets:…=dist/client
    if (path.basename(args[0] || "") === "workerd" && args.includes("serve")) {
      const usesDist = args.some((arg) => {
        const value = arg.includes("=") ? arg.slice(arg.lastIndexOf("=") + 1) : arg;
        const resolved = path.resolve(cwd, value);
        return resolved === dist || resolved.startsWith(dist + path.sep);
      });
      if (usesDist) {
        serving = pid;
        what = "workerd";
        break;
      }
      continue;
    }
    if (!args.includes("dev") || !args.some((arg) => arg.includes("wrangler"))) continue;
    const configArg = args[args.indexOf("--config") + 1];
    if (args.includes("--config") && configArg && path.resolve(cwd, configArg) === config) {
      serving = pid;
      break;
    }
  }
  if (serving) {
    console.error(
      [
        "",
        `  Not building here: ${what} (pid ${serving}) is serving this checkout's dist/.`,
        "  An in-place build rewrites it under the running server and takes the site down.",
        "",
        "    scripts/deploy.sh --build-only   check that it builds, nothing deployed",
        "    scripts/deploy.sh                build and deploy",
        "",
        "  (HOFFLE_BUILD_IN_PLACE=1 npm run build to do it anyway.)",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
}
