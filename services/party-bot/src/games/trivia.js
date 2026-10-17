import { getStorage, queueSave } from "../storage.js";

const QUESTIONS = [
  // Gaming
  { q: "In Minecraft, what do you need to cure a Zombie Villager?", choices: ["Golden Apple & Weakness Potion", "Milk & Enchanted Apple", "Totem of Undying", "Healing Potion"], answer: 0, cat: "gaming" },
  { q: "What is the name of the protagonist in the original Half-Life?", choices: ["Gordon Freeman", "Barney Calhoun", "Adrian Shephard", "Alyx Vance"], answer: 0, cat: "gaming" },
  { q: "Which company originally created the Dark Souls franchise?", choices: ["FromSoftware", "Capcom", "Square Enix", "Konami"], answer: 0, cat: "gaming" },
  { q: "In The Legend of Zelda, what is the name of the princess's kingdom?", choices: ["Hyrule", "Termina", "Lorule", "Koholint"], answer: 0, cat: "gaming" },
  { q: "What year was the original PlayStation released in Japan?", choices: ["1994", "1996", "1992", "1998"], answer: 0, cat: "gaming" },
  { q: "In Skyrim, what shout knocks enemies back with immense force?", choices: ["Fus Ro Dah", "Yol Toor Shul", "Wuld Nah Kest", "Tiid Klo Ul"], answer: 0, cat: "gaming" },
  { q: "What is the highest competitive rank in Valorant?", choices: ["Radiant", "Immortal", "Apex", "Ascendant"], answer: 0, cat: "gaming" },
  { q: "Which game features characters named Tracer, Reaper, and Mercy?", choices: ["Overwatch", "Team Fortress 2", "Paladins", "Apex Legends"], answer: 0, cat: "gaming" },
  { q: "In Portal, what was famously claimed to be 'a lie'?", choices: ["The Cake", "The Companion Cube", "The Exit Door", "The Turret"], answer: 0, cat: "gaming" },
  { q: "Who is Mario's dinosaur companion?", choices: ["Yoshi", "Birdo", "Bowser Jr.", "Koopa"], answer: 0, cat: "gaming" },

  // Movies & Pop Culture
  { q: "In The Matrix, which pill does Neo take to wake up in reality?", choices: ["The Red Pill", "The Blue Pill", "The Green Pill", "The Yellow Pill"], answer: 0, cat: "movies" },
  { q: "Who directed the 2014 sci-fi masterpiece 'Interstellar'?", choices: ["Christopher Nolan", "Denis Villeneuve", "Ridley Scott", "James Cameron"], answer: 0, cat: "movies" },
  { q: "What is the name of the hobbit who carried the One Ring to Mordor?", choices: ["Frodo Baggins", "Samwise Gamgee", "Bilbo Baggins", "Peregrin Took"], answer: 0, cat: "movies" },
  { q: "In Star Wars, what is the name of Han Solo's starship?", choices: ["Millennium Falcon", "X-Wing", "Star Destroyer", "Razor Crest"], answer: 0, cat: "movies" },
  { q: "Which actor portrayed Iron Man / Tony Stark in the MCU?", choices: ["Robert Downey Jr.", "Chris Evans", "Mark Ruffalo", "Tom Hiddleston"], answer: 0, cat: "movies" },
  { q: "In Spirited Away, what do Chihiro's parents turn into?", choices: ["Pigs", "Dragons", "Frogs", "Spirits"], answer: 0, cat: "movies" },
  { q: "What is the fictional metal mined in Wakanda?", choices: ["Vibranium", "Adamantium", "Mithril", "Beskar"], answer: 0, cat: "movies" },
  { q: "In Pulp Fiction, what does Vincent Vega order at Jack Rabbit Slim's?", choices: ["Douglas Sirk steak & vanilla shake", "Big Kahuna Burger", "Quarter Pounder with Cheese", "Blueberry pancake"], answer: 0, cat: "movies" },

  // Science & Nature
  { q: "What is the most abundant gas in Earth's atmosphere?", choices: ["Nitrogen", "Oxygen", "Argon", "Carbon Dioxide"], answer: 0, cat: "science" },
  { q: "What is the chemical symbol for Gold?", choices: ["Au", "Ag", "Fe", "Gd"], answer: 0, cat: "science" },
  { q: "Which planet in the solar system has the most moons?", choices: ["Saturn", "Jupiter", "Neptune", "Uranus"], answer: 0, cat: "science" },
  { q: "What is the powerhouse organelle of the eukaryotic cell?", choices: ["Mitochondria", "Nucleus", "Ribosome", "Endoplasmic Reticulum"], answer: 0, cat: "science" },
  { q: "How many bones are in the adult human body?", choices: ["206", "195", "214", "220"], answer: 0, cat: "science" },
  { q: "What particle carries a negative electrical charge in an atom?", choices: ["Electron", "Proton", "Neutron", "Positron"], answer: 0, cat: "science" },
  { q: "What is the speed of light in vacuum approximately?", choices: ["300,000 km/s", "150,000 km/s", "500,000 km/s", "1,000,000 km/s"], answer: 0, cat: "science" },

  // History & Geography
  { q: "What year did the Apollo 11 mission land humans on the Moon?", choices: ["1969", "1965", "1972", "1968"], answer: 0, cat: "history" },
  { q: "What ancient city was famously destroyed by Mount Vesuvius in 79 AD?", choices: ["Pompeii", "Rome", "Athens", "Carthage"], answer: 0, cat: "history" },
  { q: "What is the longest river in the world by length?", choices: ["Nile River", "Amazon River", "Yangtze River", "Mississippi River"], answer: 0, cat: "history" },
  { q: "What was the capital of the Byzantine Empire?", choices: ["Constantinople", "Rome", "Alexandria", "Ravenna"], answer: 0, cat: "history" },
  { q: "Which mountain is the highest peak above sea level on Earth?", choices: ["Mount Everest", "K2", "Kangchenjunga", "Mont Blanc"], answer: 0, cat: "history" },
  { q: "Who was the first President of the United States?", choices: ["George Washington", "Thomas Jefferson", "John Adams", "Benjamin Franklin"], answer: 0, cat: "history" },

  // General & Fun
  { q: "What is the only mammal capable of sustained true flight?", choices: ["Bat", "Flying Squirrel", "Sugar Glider", "Colugo"], answer: 0, cat: "general" },
  { q: "How many dots appear on a standard pair of six-sided dice?", choices: ["42", "36", "48", "21"], answer: 0, cat: "general" },
  { q: "What color is the 'Black Box' flight recorder on an airplane?", choices: ["Bright Orange", "Matte Black", "Bright Red", "Fluorescent Yellow"], answer: 0, cat: "general" },
  { q: "Which instrument has 88 keys?", choices: ["Piano", "Harpsichord", "Accordion", "Synthesizer"], answer: 0, cat: "general" },
  { q: "What is the main ingredient of traditional hummus?", choices: ["Chickpeas", "Lentils", "Black Beans", "Soybeans"], answer: 0, cat: "general" },
];

const activeGames = new Map(); // channelId -> { question, shuffledChoices, correctIndex, timer, startedAt }

export async function handleTriviaCommand(client, channelId, author, args) {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "stop" || sub === "cancel") {
    if (!activeGames.has(channelId)) {
      return client.sendMessage(channelId, "❌ No active trivia game in this channel.");
    }
    const current = activeGames.get(channelId);
    clearTimeout(current.timer);
    activeGames.delete(channelId);
    return client.sendMessage(channelId, `🛑 Trivia round cancelled. The answer was: **${current.shuffledChoices[current.correctIndex]}**`);
  }

  if (sub === "categories" || sub === "cats") {
    const cats = [...new Set(QUESTIONS.map(q => q.cat))].join(", ");
    return client.sendMessage(channelId, `📚 **Available categories:** \`${cats}\`\nStart with: \`!trivia [category]\``);
  }

  if (activeGames.has(channelId)) {
    return client.sendMessage(channelId, "⚠️ A trivia question is already active in this channel! Answer with `A`, `B`, `C`, or `D`.");
  }

  // Filter by category if requested
  const category = sub && QUESTIONS.some(q => q.cat === sub) ? sub : null;
  const pool = category ? QUESTIONS.filter(q => q.cat === category) : QUESTIONS;
  const rawQ = pool[Math.floor(Math.random() * pool.length)];

  // Shuffle choices
  const originalChoices = [...rawQ.choices];
  const correctAnswerText = originalChoices[rawQ.answer];
  const shuffledChoices = [...originalChoices].sort(() => Math.random() - 0.5);
  const correctIndex = shuffledChoices.indexOf(correctAnswerText);
  const letters = ["A", "B", "C", "D"];

  const optionsDisplay = shuffledChoices
    .map((choice, i) => `**${letters[i]})** ${choice}`)
    .join("\n");

  const messageText = 
    `🧠 **TRIVIA TIME** · *[${rawQ.cat.toUpperCase()}]*\n\n` +
    `**${rawQ.q}**\n\n` +
    `${optionsDisplay}\n\n` +
    `⏱️ *You have 30 seconds to answer! Reply with A, B, C, or D.*`;

  await client.sendMessage(channelId, messageText);

  const timer = setTimeout(async () => {
    if (activeGames.has(channelId)) {
      activeGames.delete(channelId);
      await client.sendMessage(channelId, `⌛ **Time's up!** Nobody got it.\nThe correct answer was: **${letters[correctIndex]}) ${correctAnswerText}**`);
    }
  }, 30000);

  activeGames.set(channelId, {
    question: rawQ.q,
    correctText: correctAnswerText.toLowerCase(),
    correctLetter: letters[correctIndex],
    correctIndex,
    shuffledChoices,
    timer,
  });
}

export async function checkTriviaAnswer(client, channelId, author, text) {
  if (!activeGames.has(channelId)) return false;

  const game = activeGames.get(channelId);
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();

  const isMatch = (upper === game.correctLetter) || (lower === game.correctText);

  if (isMatch) {
    clearTimeout(game.timer);
    activeGames.delete(channelId);

    // Update player score in storage
    const state = getStorage();
    if (!state.trivia[author]) {
      state.trivia[author] = { score: 0, wins: 0, streak: 0 };
    }
    state.trivia[author].score += 10;
    state.trivia[author].wins += 1;
    state.trivia[author].streak += 1;
    queueSave();

    const streakText = state.trivia[author].streak > 1 ? ` 🔥 Streak: **${state.trivia[author].streak}**` : "";
    await client.sendMessage(
      channelId,
      `🎉 **Correct, ${author}!** The answer was **${game.correctLetter}) ${game.shuffledChoices[game.correctIndex]}**.\n` +
      `🏆 +10 points (Total: **${state.trivia[author].score}**)${streakText}`
    );
    return true;
  }

  return false;
}
