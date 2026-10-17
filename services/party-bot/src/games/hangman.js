const HANGMAN_STAGES = [
  // 0 misses
  `\`\`\`\n  ┌───┐\n  │\n  │\n  │\n  ┴──────\n\`\`\``,
  // 1 miss: head
  `\`\`\`\n  ┌───┐\n  │   😐\n  │\n  │\n  ┴──────\n\`\`\``,
  // 2 misses: torso
  `\`\`\`\n  ┌───┐\n  │   😰\n  │   │\n  │\n  ┴──────\n\`\`\``,
  // 3 misses: left arm
  `\`\`\`\n  ┌───┐\n  │   😨\n  │  /│\n  │\n  ┴──────\n\`\`\``,
  // 4 misses: right arm
  `\`\`\`\n  ┌───┐\n  │   😱\n  │  /│\\\n  │\n  ┴──────\n\`\`\``,
  // 5 misses: left leg
  `\`\`\`\n  ┌───┐\n  │   💥\n  │  /│\\\n  │  /\n  ┴──────\n\`\`\``,
  // 6 misses: dead
  `\`\`\`\n  ┌───┐\n  │   💀\n  │  /│\\\n  │  / \\\n  ┴──────\n\`\`\``,
];

const WORDS = {
  easy: [
    "APPLE", "BEACH", "CHAIR", "DOGGO", "EAGLE", "FROST", "GHOST", "HOUSE", "JUICE", "KOALA",
    "LEMON", "MUSIC", "NINJA", "PANDA", "PIZZA", "QUEEN", "ROBOT", "SMILE", "TIGER", "ZEBRA"
  ],
  medium: [
    "BLIZZARD", "CHAMPION", "DRAGON", "FIREPLACE", "GALAXY", "HORIZON", "INFINITY", "JOURNEY",
    "KINGDOM", "LABYRINTH", "MIDNIGHT", "NOTEBOOK", "OVERLORD", "PARADOX", "RAINBOW", "STARLIGHT"
  ],
  hard: [
    "ARCHAEOLOGY", "ASTRONAUT", "CRYPTOGRAPHY", "CYBERPUNK", "ELECTRONS", "JUGGERNAUT",
    "METAMORPHIC", "PHOTOSYNTHESIS", "QUINTESSENCE", "RENAISSANCE", "STRATOSPHERE", "VOYAGER"
  ]
};

const activeGames = new Map(); // channelId -> { word, guessedLetters: Set, wrongCount: number }

export async function handleHangmanCommand(client, channelId, author, args) {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "stop" || sub === "cancel") {
    if (!activeGames.has(channelId)) {
      return client.sendMessage(channelId, "❌ No active Hangman game in this channel.");
    }
    const current = activeGames.get(channelId);
    activeGames.delete(channelId);
    return client.sendMessage(channelId, `🛑 Hangman game ended. The word was: **${current.word}**.`);
  }

  if (activeGames.has(channelId)) {
    const game = activeGames.get(channelId);
    return renderHangmanState(client, channelId, game, "A game is already active! Guess a letter with `!h <letter>` or solve with `!solve <word>`");
  }

  const difficulty = ["easy", "medium", "hard"].includes(sub) ? sub : "medium";
  const pool = WORDS[difficulty];
  const word = pool[Math.floor(Math.random() * pool.length)];

  const game = {
    word,
    guessedLetters: new Set(),
    wrongCount: 0,
    difficulty,
  };

  activeGames.set(channelId, game);
  await renderHangmanState(client, channelId, game, `🎮 **HANGMAN STARTED (${difficulty.toUpperCase()})**!\nGuess a letter with \`!h <letter>\` or the whole word with \`!solve <word>\`.`);
}

export async function handleHangmanGuess(client, channelId, author, rawInput) {
  if (!activeGames.has(channelId)) return false;

  const game = activeGames.get(channelId);
  const input = (rawInput || "").trim().toUpperCase();

  if (!input || !/^[A-Z]+$/.test(input)) return false;

  // Single letter guess
  if (input.length === 1) {
    if (game.guessedLetters.has(input)) {
      await client.sendMessage(channelId, `⚠️ **${input}** has already been guessed! Try another letter.`);
      return true;
    }

    game.guessedLetters.add(input);

    if (game.word.includes(input)) {
      // Check if won
      const allRevealed = game.word.split("").every(char => game.guessedLetters.has(char));
      if (allRevealed) {
        activeGames.delete(channelId);
        await client.sendMessage(
          channelId,
          `🎉 **VICTORY! ${author} helped solve the word: ${game.word}!** 🏆\n\n` +
          `${HANGMAN_STAGES[game.wrongCount]}\n` +
          `Great teamwork! Type \`!hangman\` for another round.`
        );
        return true;
      }

      await renderHangmanState(client, channelId, game, `✨ Good guess, **${author}**! **${input}** is in the word!`);
      return true;
    } else {
      // Wrong guess
      game.wrongCount += 1;

      if (game.wrongCount >= 6) {
        activeGames.delete(channelId);
        await client.sendMessage(
          channelId,
          `💀 **GAME OVER!** The stick figure met their fate...\n\n` +
          `${HANGMAN_STAGES[6]}\n` +
          `The secret word was: **${game.word}**.\nType \`!hangman\` to try again!`
        );
        return true;
      }

      await renderHangmanState(client, channelId, game, `❌ Ouch, **${author}**! **${input}** is NOT in the word.`);
      return true;
    }
  }

  // Full word solve attempt
  if (input.length > 1) {
    if (input === game.word) {
      activeGames.delete(channelId);
      await client.sendMessage(
        channelId,
        `🎯 **BULLSEYE! ${author} solved the entire word: ${game.word}!** 👑\n\n` +
        `${HANGMAN_STAGES[game.wrongCount]}\n` +
        `Incredible deduction! Type \`!hangman\` to play again.`
      );
      return true;
    } else {
      game.wrongCount += 1;
      if (game.wrongCount >= 6) {
        activeGames.delete(channelId);
        await client.sendMessage(
          channelId,
          `💀 **GAME OVER!** Incorrect solve attempt for "${input}".\n\n` +
          `${HANGMAN_STAGES[6]}\n` +
          `The word was: **${game.word}**!`
        );
        return true;
      }

      await renderHangmanState(client, channelId, game, `❌ **${author}**, "${input}" is not the word! Lost 1 life.`);
      return true;
    }
  }

  return false;
}

async function renderHangmanState(client, channelId, game, headerMessage) {
  const gallows = HANGMAN_STAGES[game.wrongCount];
  const revealedWord = game.word
    .split("")
    .map(c => (game.guessedLetters.has(c) ? c : "\\_"))
    .join(" ");

  const misses = [...game.guessedLetters]
    .filter(c => !game.word.includes(c))
    .sort()
    .join(", ");

  const livesIcons = "❤️".repeat(6 - game.wrongCount) + "🖤".repeat(game.wrongCount);

  const display = 
    `${headerMessage}\n\n` +
    `${gallows}\n` +
    `📖 Word: \` ${revealedWord} \`\n\n` +
    `💔 Lives: ${livesIcons} (${6 - game.wrongCount}/6)\n` +
    `🚫 Misses: ${misses ? `\`${misses}\`` : "None"}\n` +
    `👉 Guess a letter with \`!h <letter>\` or full word with \`!solve <word>\``;

  await client.sendMessage(channelId, display);
}
