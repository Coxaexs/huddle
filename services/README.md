# Hoffle Auxiliary Services

This directory contains the containerized companion services that power Hoffle's built-in bots and integrations in [`docker-compose.yml`](../docker-compose.yml).

| Service | Directory | Port | Purpose |
| :--- | :--- | :--- | :--- |
| **Music Bot Helper** | [`music-bot/`](music-bot/) | `8731` (internal) | Python `aiohttp` + `yt-dlp` daemon that resolves and streams audio for the built-in voice room music player and auto-updates `yt-dlp`. |
| **D&D 5e Bot** | [`dnd-bot/`](dnd-bot/) | `8732` (internal) | Python SRD 5e compendium server providing instant spell, monster, item, condition, and rule lookups (`/dnd`, `/spell`, `/monster`). |
| **Music + Watch Together** | [`musicwatch/`](musicwatch/) | `8722` (`--profile musicbot`) | Full [MusicWatchTogether](https://github.com/Coxaexs/musicwatchtogether) container with web DJ booth, stem separation, synchronized lyrics, and Watch Together rooms. |
| **Party & Minigames Bot** | [`party-bot/`](party-bot/) | Outbound WS/HTTP | Zero-dependency Node.js bot with Trivia, Wordle, Hangman, Karma leaderboards, Duels, and Roulette. |
