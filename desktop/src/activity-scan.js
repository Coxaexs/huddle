"use strict";

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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
  [/^stardew ?valley|^stardewmoddingapi/i, "Stardew Valley", "playing"],
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

// ---- Play together: game mods (game-mods/ in the Hoffle repo) ----
// A mod writes ~/.hoffle/play/<game>-host.json while you host, and reads
// <game>-join.json when Hoffle lets you into someone's game. Only these files
// in this one folder are touched.
const PLAY_DIR = path.join(os.homedir(), ".hoffle", "play");
const PLAY_GAMES = ["stardew"];
const HOST_FRESH_MS = 30_000;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(PLAY_DIR, file), "utf8"));
  } catch {
    return null;
  }
}

/** Per game: whether its mod is installed, and what it reports while you host. */
function playState() {
  const state = {};
  for (const game of PLAY_GAMES) {
    const mod = Boolean(readJson(`${game}-mod.json`));
    const host = readJson(`${game}-host.json`);
    const fresh = host && host.hosting === true && Date.now() - Number(host.updatedAt || 0) < HOST_FRESH_MS;
    state[game] = {
      mod,
      party: fresh
        ? {
            inviteCode: typeof host.inviteCode === "string" ? host.inviteCode : null,
            steamLobby: typeof host.steamLobby === "string" ? host.steamLobby : null,
            steamId: typeof host.steamId === "string" ? host.steamId : null,
            farm: typeof host.farm === "string" ? host.farm.slice(0, 40) : "",
            players: Number.isInteger(host.players) ? host.players : null,
            maxPlayers: Number.isInteger(host.maxPlayers) ? host.maxPlayers : null,
          }
        : null,
    };
  }
  return state;
}

/**
 * Asks the game's mod to join with this invite code (it does so from the
 * title screen). Returns false for anything that isn't a plain invite code.
 */
function queueGameJoin(game, data) {
  const code = data && data.inviteCode;
  if (!PLAY_GAMES.includes(game) || typeof code !== "string" || !/^[SG][0-9A-Za-z]{1,16}$/.test(code)) return false;
  try {
    fs.mkdirSync(PLAY_DIR, { recursive: true });
    const file = path.join(PLAY_DIR, `${game}-join.json`);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ v: 1, inviteCode: code, at: Date.now() }));
    fs.renameSync(`${file}.tmp`, file);
    return true;
  } catch {
    return false;
  }
}

async function scan() {
  const [names, music] = await Promise.all([processNames(), spotifyNowPlaying()]);
  return { activity: classify(names), music, play: playState() };
}

// Same list as lib/steam.ts GAME_LINK_PATTERN: the only non-web links the
// page may ask the shell to open (Play together).
const GAME_LINK =
  /^steam:\/\/(?:joinlobby\/\d{1,10}\/\d{15,20}\/7656119\d{10}|run\/\d{1,10}|rungameid\/\d{1,20}|friends\/add\/7656119\d{10})$/;

function isGameLink(url) {
  return typeof url === "string" && GAME_LINK.test(url);
}

module.exports = { scan, classify, isGameLink, queueGameJoin, playState };
