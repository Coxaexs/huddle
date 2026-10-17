# Hoffle Party & Minigames Bot 🎮

A zero-dependency, high-energy party and minigame bot built specifically for **Hoffle**.

## Features

- 🧠 **Trivia Quiz**: Over 50+ curated questions across gaming, science, history, pop culture, and movies with 30s timed countdowns and leaderboards.
- 🟩 **Wordle**: Interactive 5-letter word game with colored emoji grids (🟩 🟨 ⬛) right inside channel chat!
- 😵 **Hangman**: Classic word-guessing game with ASCII stick figure gallows and life counter.
- 🌟 **Social Karma & Props**: Give friends rep (`!rep @user [reason]`), view profiles (`!karma`), and check the server hall of fame (`!leaderboard`).
- 🎱 **Party Tools**: Magic 8-Ball (`!8ball`), Coinflips (`!coinflip`), Dice rolling (`!roll 2d20+5`), and random decision maker (`!choose`).
- 🤠 **Duels & Roulette**: High-noon wild west standoff (`!duel @user`) and suspenseful Russian Roulette (`!roulette`).

## Quick Start

### Running Locally with Node.js (Node 18+)

```bash
cd services/party-bot

# Set your Hoffle URL and token (or rely on defaults)
export HUDDLE_URL="http://127.0.0.1:8730"
export BOT_TOKEN="hfl_bot_dc92250d96e3cfc6d5c2f92120d55af83b2943edd8a3a803"

node src/index.js
```

### Running with Docker

```bash
docker build -t hoffle-party-bot services/party-bot
docker run -d --name party-bot \
  -e HUDDLE_URL="http://host.docker.internal:8730" \
  -e BOT_TOKEN="hfl_bot_dc92250d96e3cfc6d5c2f92120d55af83b2943edd8a3a803" \
  hoffle-party-bot
```

## Command Reference

| Category | Command | Description |
|---|---|---|
| **Help** | `!help` | Displays the full interactive command list |
| **Trivia** | `!trivia [category]` | Starts a 30-second timed trivia question |
| | `!trivia categories` | Lists available trivia categories |
| | `!trivia stop` | Cancels active trivia round |
| **Wordle** | `!wordle` | Starts a new 5-letter Wordle round |
| | `!guess <word>` (or `!w`) | Submits a 5-letter guess |
| | `!wordle stop` | Ends game and reveals the secret word |
| **Hangman** | `!hangman [easy\|medium\|hard]` | Starts a game of Hangman |
| | `!h <letter>` | Guesses a single letter |
| | `!solve <word>` | Attempts to solve the entire word |
| | `!hangman stop` | Cancels the active Hangman round |
| **Karma** | `!rep @user [reason]` | Gives +1 rep to a fellow server member |
| | `!karma [@user]` | Checks karma points and recent compliments |
| | `!leaderboard` (or `!lb`) | Displays Top Karma and Top Trivia champions |
| **Fun** | `!8ball <question>` | Consults the Magic 8-Ball |
| | `!coinflip` | Flips a coin (Heads/Tails) |
| | `!roll [dice]` | Rolls dice notation (e.g. `!roll 1d20`, `!roll 2d6+3`) |
| | `!choose a, b, or c` | Randomly picks one of the given choices |
| | `!roulette` | Spins the 6-chamber cylinder and pulls the trigger |
| | `!duel @user` | Challenges an opponent to a quickdraw duel |
