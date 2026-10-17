/**
 * Hoffle Party Bot
 *
 * A high-energy, fun community & party games bot for Hoffle servers.
 * Features:
 *  - 🧠 Trivia Quiz (!trivia, !trivia categories)
 *  - 🟩 Wordle with visual colored emoji grids (!wordle, !guess)
 *  - 😵 Hangman with ASCII gallows & lives (!hangman, !h, !solve)
 *  - 🌟 Social Karma & Props (!rep, !karma, !leaderboard)
 *  - 🎱 Magic 8-Ball, Coinflip, Dice rolling (!8ball, !coinflip, !roll)
 *  - 🤠 Wild West Duels & Russian Roulette (!duel, !roulette)
 */

import { HoffleClient } from "./client.js";
import { loadStorage } from "./storage.js";
import { handleTriviaCommand, checkTriviaAnswer } from "./games/trivia.js";
import { handleWordleCommand, handleWordleGuess } from "./games/wordle.js";
import { handleHangmanCommand, handleHangmanGuess } from "./games/hangman.js";
import { handleRepCommand, handleKarmaCheck, handleLeaderboard } from "./games/karma.js";
import {
  handleEightBall,
  handleCoinflip,
  handleChoose,
  handleRoll,
  handleRoulette,
  handleDuel
} from "./games/fun.js";

// Configuration
const HUDDLE_URL = (process.env.HUDDLE_URL || "http://127.0.0.1:8730").replace(/\/+$/, "");
const HUDDLE_BASE_PATH = process.env.HUDDLE_BASE_PATH || "/hangout";
const BOT_TOKEN = process.env.BOT_TOKEN || "hfl_bot_dc92250d96e3cfc6d5c2f92120d55af83b2943edd8a3a803";

const client = new HoffleClient({
  baseUrl: HUDDLE_URL,
  basePath: HUDDLE_BASE_PATH,
  token: BOT_TOKEN,
});

async function sendHelp(channelId) {
  const helpText = 
    `🎉 **HOFFLE PARTY BOT · COMMAND MENU** 🎉\n\n` +
    `🧠 **TRIVIA & BRAIN GAMES**\n` +
    `• \`!trivia [category]\` — Start a 30s timed trivia round (earn +10 pts!)\n` +
    `• \`!trivia categories\` — View available trivia topics\n` +
    `• \`!trivia stop\` — Cancel the active trivia question\n\n` +
    `🟩 **WORDLE**\n` +
    `• \`!wordle\` — Start a 5-letter Wordle game (6 attempts)\n` +
    `• \`!guess <word>\` or \`!w <word>\` — Submit your 5-letter guess\n` +
    `• \`!wordle stop\` — End game & reveal word\n\n` +
    `😵 **HANGMAN**\n` +
    `• \`!hangman [easy|medium|hard]\` — Start a game with stick figure gallows\n` +
    `• \`!h <letter>\` — Guess a single letter\n` +
    `• \`!solve <word>\` — Guess the entire word at once\n` +
    `• \`!hangman stop\` — End active hangman game\n\n` +
    `🌟 **COMMUNITY KARMA & PROPS**\n` +
    `• \`!rep @user [reason]\` — Give +1 karma/props to a friend\n` +
    `• \`!karma [@user]\` — View karma score & recent compliments\n` +
    `• \`!leaderboard\` (or \`!lb\`) — Top Karma & Trivia Champions\n\n` +
    `🎲 **FUN & CHANCE**\n` +
    `• \`!8ball <question>\` — Ask the mysterious Magic 8-Ball\n` +
    `• \`!coinflip\` — Flip a coin (Heads/Tails)\n` +
    `• \`!roll [dice]\` — Roll dice (e.g. \`!roll 1d20\`, \`!roll 2d6+3\`)\n` +
    `• \`!choose a, b, or c\` — Make the bot decide for you\n` +
    `• \`!roulette\` — Russian Roulette (1 bullet in 6 chambers!)\n` +
    `• \`!duel @opponent\` — Quick Western standoff challenge`;

  await client.sendMessage(channelId, helpText);
}

async function handleMessage(msg) {
  const content = (msg.content || "").trim();
  const author = msg.author?.username || "Friend";
  const channelId = msg.channel_id;

  if (!content || !channelId) return;

  // 1. Check for passive trivia answers (A, B, C, D)
  if (["A", "B", "C", "D"].includes(content.toUpperCase())) {
    const answered = await checkTriviaAnswer(client, channelId, author, content);
    if (answered) return;
  }

  // 2. Command dispatching
  if (!content.startsWith("!")) return;

  const parts = content.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case "!help":
    case "!commands":
      await sendHelp(channelId);
      break;

    // Trivia
    case "!trivia":
    case "!quiz":
      await handleTriviaCommand(client, channelId, author, args);
      break;

    // Wordle
    case "!wordle":
      await handleWordleCommand(client, channelId, author, args);
      break;
    case "!guess":
    case "!w":
      await handleWordleGuess(client, channelId, author, args[0]);
      break;

    // Hangman
    case "!hangman":
      await handleHangmanCommand(client, channelId, author, args);
      break;
    case "!h":
    case "!letter":
      await handleHangmanGuess(client, channelId, author, args[0]);
      break;
    case "!solve":
      await handleHangmanGuess(client, channelId, author, args.join(""));
      break;

    // Karma
    case "!rep":
    case "!give":
      await handleRepCommand(client, channelId, author, args);
      break;
    case "!karma":
    case "!props":
    case "!profile":
      await handleKarmaCheck(client, channelId, author, args);
      break;
    case "!leaderboard":
    case "!lb":
    case "!top":
      await handleLeaderboard(client, channelId);
      break;

    // Fun & Chance
    case "!8ball":
      await handleEightBall(client, channelId, author, args);
      break;
    case "!coinflip":
    case "!flip":
      await handleCoinflip(client, channelId, author);
      break;
    case "!choose":
    case "!pick":
      await handleChoose(client, channelId, author, args);
      break;
    case "!roll":
    case "!dice":
      await handleRoll(client, channelId, author, args);
      break;
    case "!roulette":
      await handleRoulette(client, channelId, author);
      break;
    case "!duel":
      await handleDuel(client, channelId, author, args);
      break;
  }
}

async function main() {
  console.log("=========================================");
  console.log("   Hoffle Party & Minigames Bot v1.0   ");
  console.log("=========================================");

  await loadStorage();
  console.log("[party-bot] Persistent storage initialized.");

  client.onMessage(handleMessage);
  await client.start();
}

// Graceful exit
process.on("SIGINT", () => {
  console.log("\n[party-bot] Shutting down...");
  client.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[party-bot] Shutting down...");
  client.stop();
  process.exit(0);
});

main();
