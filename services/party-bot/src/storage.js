import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const DATA_FILE = path.join(DATA_DIR, "party-data.json");

let state = {
  karma: {},      // username -> { points: number, lastGiven: number, compliments: string[] }
  trivia: {},     // username -> { score: number, wins: number, streak: number }
  wordle: {},     // username -> { played: number, won: number, streak: number, maxStreak: number }
  roulette: {},   // channelId -> { cylinder: number[], chamber: number }
};

let saveTimer = null;

export async function loadStorage() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    state = {
      karma: parsed.karma || {},
      trivia: parsed.trivia || {},
      wordle: parsed.wordle || {},
      roulette: parsed.roulette || {},
    };
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("[storage] Could not load state file, starting fresh:", err.message);
    }
  }
  return state;
}

export function getStorage() {
  return state;
}

export function queueSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tempPath = `${DATA_FILE}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(state, null, 2), "utf-8");
      await fs.rename(tempPath, DATA_FILE);
    } catch (err) {
      console.error("[storage] Failed to save state:", err.message);
    }
  }, 1000);
}
