"use strict";

const { execFile } = require("node:child_process");

/**
 * Looks at what is running on this computer so Hoffle can show "Playing X" and
 * the song in the Spotify app. Runs only inside the desktop shell, only reads
 * the process list and Spotify's now-playing info, and only the final result
 * (a game/app name and a song) is handed to the page. Nothing else leaves.
 */

// [process name pattern, label, kind]. First match wins, so games come first.
const KNOWN = [
  [/^valorant-win64|^valorant\.exe/i, "VALORANT", "playing"],
  [/^leagueclient|^league of legends/i, "League of Legends", "playing"],
  [/^minecraft|^javaw?.*minecraft/i, "Minecraft", "playing"],
  [/^fortniteclient/i, "Fortnite", "playing"],
  [/^overwatch/i, "Overwatch 2", "playing"],
  [/^gta5|^gtav/i, "Grand Theft Auto V", "playing"],
  [/^rocketleague/i, "Rocket League", "playing"],
  [/^apexlegends|^r5apex/i, "Apex Legends", "playing"],
  [/^terraria/i, "Terraria", "playing"],
  [/^stardewvalley/i, "Stardew Valley", "playing"],
  [/^eldenring/i, "Elden Ring", "playing"],
  [/^baldur'?s ?gate3?|^bg3/i, "Baldur's Gate 3", "playing"],
  [/^roblox(?:player|beta)/i, "Roblox", "playing"],
  [/^genshinimpact|^yuanshen/i, "Genshin Impact", "playing"],
  [/^factorio/i, "Factorio", "playing"],
  [/^rimworld/i, "RimWorld", "playing"],
  [/^hades2?(?:\.exe)?$/i, "Hades", "playing"],
  [/^ffxiv/i, "Final Fantasy XIV", "playing"],
  [/^wow(?:classic)?\b|^world of warcraft/i, "World of Warcraft", "playing"],
  [/^dota2/i, "Dota 2", "playing"],
  [/^cs2$/i, "Counter-Strike 2", "playing"],
  [/^obs(?:64)?$|^obs-studio/i, "OBS Studio", "streaming"],
  [/^code(?:-insiders)?$|^visual studio code/i, "Visual Studio Code", "coding"],
  [/^idea64|^intellij/i, "IntelliJ IDEA", "coding"],
  [/^pycharm/i, "PyCharm", "coding"],
  [/^webstorm/i, "WebStorm", "coding"],
  [/^cursor$/i, "Cursor", "coding"],
  [/^zed$/i, "Zed", "coding"],
  [/^nvim$|^vim$/i, "Neovim", "coding"],
  [/^blender/i, "Blender", "app"],
  [/^godot/i, "Godot Engine", "coding"],
  [/^unity$|^unity\.exe/i, "Unity", "coding"],
  [/^figma/i, "Figma", "app"],
  [/^aseprite/i, "Aseprite", "app"],
  [/^krita/i, "Krita", "app"],
  [/^photoshop/i, "Photoshop", "app"],
];

function run(cmd, args, timeout = 4000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout) =>
      resolve(err ? "" : String(stdout)),
    );
  });
}

/** Lower-cased executable names of everything running. */
async function processNames() {
  if (process.platform === "win32") {
    const out = await run("tasklist", ["/fo", "csv", "/nh"]);
    return out
      .split(/\r?\n/)
      .map((line) => line.split('","')[0]?.replace(/^"/, "").replace(/\.exe$/i, ""))
      .filter(Boolean);
  }
  const out = await run("ps", ["-A", "-o", "comm="]);
  return out
    .split("\n")
    .map((line) => line.trim().split("/").pop().replace(/\.app$/i, ""))
    .filter(Boolean);
}

const PRIORITY = { playing: 0, streaming: 1, coding: 2, app: 3 };

/** The most telling thing running: a game beats a stream beats an editor. */
function classify(names) {
  let best = null;
  const consider = (name, kind) => {
    if (!best || PRIORITY[kind] < PRIORITY[best.kind]) best = { name, kind };
  };
  for (const proc of names) {
    if (/^steam_app_\d+/i.test(proc)) consider("a Steam game", "playing");
    for (const [pattern, label, kind] of KNOWN) {
      if (pattern.test(proc)) {
        consider(label, kind);
        break;
      }
    }
  }
  return best;
}

async function spotifyFromMpris() {
  const out = await run("playerctl", [
    "-p",
    "spotify",
    "metadata",
    "--format",
    "{{status}}\u0001{{artist}}\u0001{{title}}\u0001{{mpris:artUrl}}\u0001{{xesam:url}}",
  ]);
  const [status, artist, title, art, url] = out.trim().split("\u0001");
  if (status !== "Playing" || !title) return null;
  return {
    song: title,
    artist: artist || "Spotify",
    albumArt: /^https:\/\//.test(art || "") ? art : "",
    url: /^https:\/\/open\.spotify\.com\//.test(url || "") ? url : undefined,
  };
}

async function spotifyFromMac() {
  const script =
    'if application "Spotify" is running then tell application "Spotify" to if player state is playing then ' +
    'return (artist of current track) & (character id 1) & (name of current track) & (character id 1) & (artwork url of current track)';
  const out = (await run("osascript", ["-e", script])).trim();
  if (!out) return null;
  const [artist, title, art] = out.split("\u0001");
  if (!title) return null;
  return { song: title, artist: artist || "Spotify", albumArt: /^https:\/\//.test(art || "") ? art : "" };
}

async function spotifyFromWindows() {
  // Spotify titles its window "Artist - Song" while playing, "Spotify" when idle.
  const out = await run("tasklist", ["/v", "/fo", "csv", "/nh", "/fi", "imagename eq Spotify.exe"]);
  for (const line of out.split(/\r?\n/)) {
    const cells = line.split('","');
    const title = cells[cells.length - 1]?.replace(/"$/, "").trim();
    const match = title && /^(.+?) - (.+)$/.exec(title);
    if (match && !/^(Spotify|N\/A)/i.test(title)) {
      return { song: match[2], artist: match[1], albumArt: "" };
    }
  }
  return null;
}

async function spotifyNowPlaying() {
  try {
    if (process.platform === "linux") return await spotifyFromMpris();
    if (process.platform === "darwin") return await spotifyFromMac();
    if (process.platform === "win32") return await spotifyFromWindows();
  } catch {
    // Spotify closed mid-query: nothing playing.
  }
  return null;
}

async function scan() {
  const [names, music] = await Promise.all([processNames(), spotifyNowPlaying()]);
  return { activity: classify(names), music };
}

module.exports = { scan, classify };
