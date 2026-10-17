import { getStorage, queueSave } from "../storage.js";

const WORDS = [
  "APPLE", "BEACH", "BRAIN", "BREAD", "CHAIR", "CHEST", "CLOUD", "CROWN", "DANCE", "DREAM",
  "EARTH", "FLAME", "FLOOR", "GHOST", "GLASS", "GRASS", "HEART", "HOUSE", "LIGHT", "MAGIC",
  "MONEY", "MUSIC", "NIGHT", "OCEAN", "PARTY", "PEACE", "PIANO", "PLANT", "POWER", "QUEEN",
  "RIVER", "ROBOT", "SHADOW", "SHINE", "SHIRT", "SMILE", "SNAKE", "SPACE", "STORM", "STORY",
  "SWORD", "TIGER", "TRAIN", "WATER", "WHALE", "WORLD", "YOUTH", "ZEBRA", "SOLAR", "LUNAR",
  "QUEST", "PIXEL", "FLUID", "BLADE", "EMBER", "FROST", "HAVEN", "NOBLE", "ORBIT", "VALOR"
];

const activeGames = new Map(); // channelId -> { targetWord: string, guesses: Array<{ word: string, result: string }>, remainingLetters: Set<string> }

function evaluateGuess(guess, target) {
  const result = Array(5).fill("⬛");
  const targetChars = target.split("");
  const guessChars = guess.split("");
  const targetUsed = Array(5).fill(false);
  const guessMatched = Array(5).fill(false);

  // First pass: Greens (exact matches)
  for (let i = 0; i < 5; i++) {
    if (guessChars[i] === targetChars[i]) {
      result[i] = "🟩";
      targetUsed[i] = true;
      guessMatched[i] = true;
    }
  }

  // Second pass: Yellows (wrong position)
  for (let i = 0; i < 5; i++) {
    if (guessMatched[i]) continue;
    for (let j = 0; j < 5; j++) {
      if (!targetUsed[j] && guessChars[i] === targetChars[j]) {
        result[i] = "🟨";
        targetUsed[j] = true;
        break;
      }
    }
  }

  return result.join(" ");
}

export async function handleWordleCommand(client, channelId, author, args) {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "stop" || sub === "cancel") {
    if (!activeGames.has(channelId)) {
      return client.sendMessage(channelId, "❌ No active Wordle game in this channel.");
    }
    const current = activeGames.get(channelId);
    activeGames.delete(channelId);
    return client.sendMessage(channelId, `🛑 Wordle game ended. The word was **${current.targetWord}**.`);
  }

  if (activeGames.has(channelId)) {
    const current = activeGames.get(channelId);
    const history = current.guesses
      .map(g => `${g.result}  \`${g.word}\``)
      .join("\n");
    return client.sendMessage(
      channelId,
      `🟩 **Active Wordle Game (${current.guesses.length}/6)**\n\n` +
      `${history || "No guesses yet!"}\n\n` +
      `Make a guess using: \`!guess <5-letter-word>\``
    );
  }

  // Start new Wordle game
  const targetWord = WORDS[Math.floor(Math.random() * WORDS.length)];
  const allLetters = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));

  activeGames.set(channelId, {
    targetWord,
    guesses: [],
    remainingLetters: allLetters,
  });

  await client.sendMessage(
    channelId,
    `🟩 **WORDLE STARTED!** 🟩\n\n` +
    `I'm thinking of a **5-letter word**.\n` +
    `You have **6 attempts** to guess it!\n\n` +
    `🟩 = Correct letter & spot\n` +
    `🟨 = Correct letter, wrong spot\n` +
    `⬛ = Not in word\n\n` +
    `👉 Submit your guess with: \`!guess <word>\``
  );
}

export async function handleWordleGuess(client, channelId, author, wordGuess) {
  if (!activeGames.has(channelId)) {
    return client.sendMessage(channelId, "❌ No Wordle game is active. Start one with `!wordle`!");
  }

  const cleanGuess = (wordGuess || "").trim().toUpperCase();
  if (cleanGuess.length !== 5 || !/^[A-Z]+$/.test(cleanGuess)) {
    return client.sendMessage(channelId, "⚠️ Guess must be an exact **5-letter word** (A-Z)!");
  }

  const game = activeGames.get(channelId);
  const evaluation = evaluateGuess(cleanGuess, game.targetWord);

  game.guesses.push({
    word: cleanGuess,
    result: evaluation,
  });

  // Track letters
  for (const char of cleanGuess) {
    if (!game.targetWord.includes(char)) {
      game.remainingLetters.delete(char);
    }
  }

  const gridDisplay = game.guesses
    .map(g => `${g.result}  \`${g.word}\``)
    .join("\n");

  const isWin = cleanGuess === game.targetWord;
  const isLoss = !isWin && game.guesses.length >= 6;

  if (isWin) {
    activeGames.delete(channelId);

    // Save stats
    const state = getStorage();
    if (!state.wordle[author]) {
      state.wordle[author] = { played: 0, won: 0, streak: 0, maxStreak: 0 };
    }
    const stat = state.wordle[author];
    stat.played += 1;
    stat.won += 1;
    stat.streak += 1;
    stat.maxStreak = Math.max(stat.maxStreak, stat.streak);
    queueSave();

    return client.sendMessage(
      channelId,
      `🎉 **SPLENDID! ${author} solved Wordle in ${game.guesses.length}/6 attempts!** 🏆\n\n` +
      `${gridDisplay}\n\n` +
      `The word was: **${game.targetWord}**!\n` +
      `🔥 Win Streak: **${stat.streak}** (Total wins: **${stat.won}**)`
    );
  }

  if (isLoss) {
    activeGames.delete(channelId);

    const state = getStorage();
    if (state.wordle[author]) {
      state.wordle[author].played += 1;
      state.wordle[author].streak = 0;
      queueSave();
    }

    return client.sendMessage(
      channelId,
      `💀 **Game Over!** You've used all 6 attempts.\n\n` +
      `${gridDisplay}\n\n` +
      `The word was: **${game.targetWord}**.\n` +
      `Better luck next time! Type \`!wordle\` to play again.`
    );
  }

  // Game continues
  const attemptsLeft = 6 - game.guesses.length;
  await client.sendMessage(
    channelId,
    `🟩 **Wordle (${game.guesses.length}/6)**\n\n` +
    `${gridDisplay}\n\n` +
    `Attempts left: **${attemptsLeft}** · Guess again with \`!guess <word>\``
  );
}
