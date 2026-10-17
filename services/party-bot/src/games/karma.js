import { getStorage, queueSave } from "../storage.js";

const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function cleanUsername(raw) {
  if (!raw) return "";
  return raw.replace(/^@/, "").trim();
}

export async function handleRepCommand(client, channelId, author, args) {
  const targetRaw = args[0];
  const target = cleanUsername(targetRaw);
  const reason = args.slice(1).join(" ").trim() || "Being awesome!";

  if (!target) {
    return client.sendMessage(channelId, "Usage: `!rep @username [reason]` (give props to a friend!)");
  }

  if (target.toLowerCase() === author.toLowerCase()) {
    return client.sendMessage(channelId, "❌ You cannot give karma to yourself! Nice try though 😉");
  }

  const state = getStorage();
  const giverKey = author.toLowerCase();
  const targetKey = target.toLowerCase();

  // Check cooldown
  const giverRecord = state.karma[giverKey] || { lastGiven: 0 };
  const now = Date.now();
  const elapsed = now - (giverRecord.lastGiven || 0);

  if (elapsed < COOLDOWN_MS) {
    const remainingMins = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
    return client.sendMessage(
      channelId,
      `⏳ **${author}**, you recently gave karma! Please wait **${remainingMins} minute(s)** before giving rep again.`
    );
  }

  // Record giver cooldown
  if (!state.karma[giverKey]) {
    state.karma[giverKey] = { points: 0, lastGiven: now, compliments: [] };
  } else {
    state.karma[giverKey].lastGiven = now;
  }

  // Award recipient
  if (!state.karma[targetKey]) {
    state.karma[targetKey] = { points: 0, lastGiven: 0, compliments: [] };
  }
  state.karma[targetKey].points += 1;
  state.karma[targetKey].compliments.unshift(`"${reason}" — from ${author}`);
  if (state.karma[targetKey].compliments.length > 10) {
    state.karma[targetKey].compliments.pop();
  }

  queueSave();

  await client.sendMessage(
    channelId,
    `🌟 **KARMA AWARDED!** 🌟\n` +
    `**${author}** gave +1 rep to **${target}**!\n` +
    `💬 *"${reason}"*\n` +
    `🏆 **${target}** now has **${state.karma[targetKey].points}** karma points!`
  );
}

export async function handleKarmaCheck(client, channelId, author, args) {
  const state = getStorage();
  const targetRaw = args[0] || author;
  const target = cleanUsername(targetRaw);
  const targetKey = target.toLowerCase();

  const record = state.karma[targetKey];
  const points = record ? record.points : 0;
  const compliments = record?.compliments || [];

  let text = `✨ **Karma Profile for ${target}** ✨\n` +
             `🏆 Total Karma: **${points}** point(s)\n`;

  if (compliments.length > 0) {
    const recent = compliments.slice(0, 3).map(c => `• ${c}`).join("\n");
    text += `\n**Recent Props:**\n${recent}`;
  } else {
    text += `\n*No compliments recorded yet. Be nice and earn some!*`;
  }

  await client.sendMessage(channelId, text);
}

export async function handleLeaderboard(client, channelId) {
  const state = getStorage();

  // 1. Top Karma
  const karmaEntries = Object.entries(state.karma)
    .filter(([_, data]) => (data.points || 0) > 0)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 5);

  const karmaBoard = karmaEntries.length
    ? karmaEntries.map(([name, data], i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "•";
        return `${medal} **${name}**: ${data.points} karma`;
      }).join("\n")
    : "No karma recorded yet!";

  // 2. Top Trivia
  const triviaEntries = Object.entries(state.trivia)
    .filter(([_, data]) => (data.score || 0) > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 5);

  const triviaBoard = triviaEntries.length
    ? triviaEntries.map(([name, data], i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "•";
        return `${medal} **${name}**: ${data.score} pts (${data.wins || 0} wins)`;
      }).join("\n")
    : "No trivia wins yet!";

  const message = 
    `🏆 **SERVER LEADERBOARDS** 🏆\n\n` +
    `⭐ **Top Karma Legends:**\n${karmaBoard}\n\n` +
    `🧠 **Top Trivia Champions:**\n${triviaBoard}\n\n` +
    `*Earn karma with \`!rep @user\`, earn trivia score with \`!trivia\`!*`;

  await client.sendMessage(channelId, message);
}
