const EIGHT_BALL_ANSWERS = [
  // Affirmative
  "🟢 It is certain.",
  "🟢 It is decidedly so.",
  "🟢 Without a doubt.",
  "🟢 Yes definitely.",
  "🟢 You may rely on it.",
  "🟢 As I see it, yes.",
  "🟢 Most likely.",
  "🟢 Outlook good.",
  "🟢 Yes.",
  "🟢 Signs point to yes.",
  // Non-committal
  "🟡 Reply hazy, try again.",
  "🟡 Ask again later.",
  "🟡 Better not tell you now.",
  "🟡 Cannot predict now.",
  "🟡 Concentrate and ask again.",
  // Negative
  "🔴 Don't count on it.",
  "🔴 My reply is no.",
  "🔴 My sources say no.",
  "🔴 Outlook not so good.",
  "🔴 Very doubtful."
];

// In-memory channel roulette states
const rouletteChambers = new Map(); // channelId -> { chambers: boolean[], index: number }

export async function handleEightBall(client, channelId, author, args) {
  const question = args.join(" ").trim();
  if (!question) {
    return client.sendMessage(channelId, "🎱 *Ask the magic 8-ball a question!* Usage: `!8ball will we win tonight?`");
  }

  const answer = EIGHT_BALL_ANSWERS[Math.floor(Math.random() * EIGHT_BALL_ANSWERS.length)];
  await client.sendMessage(
    channelId,
    `🎱 **Magic 8-Ball**\n` +
    `❓ **${author} asked:** "${question}"\n` +
    `🔮 **Answer:** ${answer}`
  );
}

export async function handleCoinflip(client, channelId, author) {
  const isHeads = Math.random() < 0.5;
  const result = isHeads ? "🪙 **HEADS!**" : "🪙 **TAILS!**";
  await client.sendMessage(channelId, `${author} flipped a coin...\n${result}`);
}

export async function handleChoose(client, channelId, author, args) {
  const raw = args.join(" ");
  const options = raw.split(/\bor\b|,/).map(s => s.trim()).filter(Boolean);

  if (options.length < 2) {
    return client.sendMessage(channelId, "Usage: `!choose coffee or tea` or `!choose pizza, tacos, burger`");
  }

  const chosen = options[Math.floor(Math.random() * options.length)];
  await client.sendMessage(channelId, `🤔 Deciding between \`${options.join(", ")}\`...\n👉 **${author}**, I choose: **${chosen}**!`);
}

export async function handleRoll(client, channelId, author, args) {
  const notation = (args[0] || "1d6").toLowerCase();
  const match = notation.match(/^(\d*)d(\d+)(?:([+-])(\d+))?$/);

  if (!match) {
    return client.sendMessage(channelId, "Usage: `!roll [dice]` (e.g. `!roll 1d20`, `!roll 2d6+3`, `!roll 4d6`)");
  }

  const count = Math.min(Math.max(parseInt(match[1] || "1", 10), 1), 50);
  const sides = Math.min(Math.max(parseInt(match[2], 10), 2), 1000);
  const sign = match[3] || "+";
  const modifier = parseInt(match[4] || "0", 10);

  const rolls = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const val = Math.floor(Math.random() * sides) + 1;
    rolls.push(val);
    sum += val;
  }

  const total = sign === "-" ? sum - modifier : sum + modifier;
  const modText = modifier ? ` ${sign} ${modifier}` : "";
  const rollList = rolls.length <= 10 ? `[${rolls.join(", ")}]` : `[${rolls.slice(0, 10).join(", ")}... +${rolls.length - 10} more]`;

  await client.sendMessage(
    channelId,
    `🎲 **${author} rolled ${count}d${sides}${modText}:**\n` +
    `Rolls: ${rollList}${modText} = **${total}**`
  );
}

export async function handleRoulette(client, channelId, author) {
  let state = rouletteChambers.get(channelId);

  // Initialize 6-chamber cylinder (1 loaded bullet)
  if (!state || state.index >= 6) {
    const chambers = [false, false, false, false, false, false];
    const bulletIndex = Math.floor(Math.random() * 6);
    chambers[bulletIndex] = true;
    state = { chambers, index: 0 };
    rouletteChambers.set(channelId, state);
  }

  const chamberNum = state.index + 1;
  const isBullet = state.chambers[state.index];
  state.index += 1;

  if (isBullet) {
    rouletteChambers.delete(channelId); // reset cylinder
    await client.sendMessage(
      channelId,
      `🔫 **${author} pulls the trigger on chamber #${chamberNum}...**\n` +
      `💥 **BANG!** You are out! 💀\n` +
      `*The cylinder has been reloaded and spun for the next brave soul.*`
    );
  } else {
    const remaining = 6 - state.index;
    await client.sendMessage(
      channelId,
      `🔫 **${author} pulls the trigger on chamber #${chamberNum}...**\n` +
      `😅 *Click!* Empty chamber. You survived! ✨\n` +
      `*${remaining} chamber(s) left in the cylinder.*`
    );
  }
}

export async function handleDuel(client, channelId, author, args) {
  const opponent = (args[0] || "").replace(/^@/, "").trim();
  if (!opponent) {
    return client.sendMessage(channelId, "Usage: `!duel @opponent` (challenge someone to a high-noon duel!)");
  }
  if (opponent.toLowerCase() === author.toLowerCase()) {
    return client.sendMessage(channelId, "You cannot duel yourself, cowboy! Pick a worthy opponent.");
  }

  const winner = Math.random() < 0.5 ? author : opponent;
  const loser = winner === author ? opponent : author;

  const scenarios = [
    `The clock strikes noon. The desert wind howls. Dust settles.`,
    `A single tumbleweed rolls across the dusty road. Hands hover over holsters.`,
    `The tavern falls dead silent as both gunslingers square up in the dirt.`
  ];
  const intro = scenarios[Math.floor(Math.random() * scenarios.length)];

  await client.sendMessage(
    channelId,
    `🤠 **HIGH NOON DUEL: ${author} vs ${opponent}**\n\n` +
    `${intro}\n` +
    `3... 2... 1... **DRAW!** 💥🔫\n\n` +
    `🏆 **${winner}** drew faster and won the duel! **${loser}** bites the dust!`
  );
}
