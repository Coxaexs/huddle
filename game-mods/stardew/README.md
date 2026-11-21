# Hoffle Play Together (Stardew Valley)

A tiny [SMAPI](https://smapi.io) mod for Hoffle's Play together. With it, friends you
let in on Hoffle join your farm in one click, and you join theirs.

- **Hosting:** while you host co-op it writes your invite code (and Steam lobby, on
  Steam) to `~/.hoffle/play/stardew-host.json`. The Hoffle desktop app passes it on, and
  Hoffle gives it only to the people you let in.
- **Joining:** when you're let in, the Hoffle app writes `~/.hoffle/play/stardew-join.json`.
  On the title screen the mod joins that farm with the invite code (like Co-op → Enter
  invite code). Works across Steam and GOG, and without being Steam friends.

It has no network access of its own and touches nothing outside `~/.hoffle/play`.

## Install

1. Install SMAPI.
2. Unzip `HofflePlayTogether-Stardew-<version>.zip` (from Hoffle) into Stardew's `Mods` folder.
3. Start the game through SMAPI once.

## Build

```
dotnet build -c Release -p:GamePath="<folder with Stardew Valley.dll and StardewModdingAPI.dll>"
```

Then zip `HofflePlayTogether/` with `HofflePlayTogether.dll` and `manifest.json` into
`public/mods/HofflePlayTogether-Stardew-<version>.zip`.
