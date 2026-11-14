// Exports the slash commands for the native client: every command "/" offers (app/lib/commands.ts)
// and the sets runCommand sorts them by. Run from the huddle repo root:
//   node desktop-gpui/tools/export-commands.mjs <out.json>
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const { build } = createRequire(join(process.cwd(), "package.json"))("esbuild");

const out = process.argv[2] || "desktop-gpui/resources/data/commands.json";
const entry = `
  export * from "./app/lib/commands";
  export { ROLL_COMMANDS } from "./app/lib/chat/commands/roll";
  export { SPEECH_COMMANDS } from "./app/lib/chat/speech-commands";
  export { FUN_COMMANDS } from "./lib/fun-commands";
  export { PLAYER_COMMANDS } from "./lib/music-bot";
`;
const bundle = join(process.env.TMPDIR || "/tmp", `hoffle-commands-${process.pid}.mjs`);
await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "error",
  alias: { "@": process.cwd() },
});
const m = await import(pathToFileURL(bundle).href);
const set = (s) => [...s].sort();
writeFileSync(out, JSON.stringify({
  commands: m.SLASH_COMMANDS,
  aliases: m.COMMAND_ALIASES,
  music: set(m.MUSIC_COMMANDS),
  voiceRequiredMusic: set(m.VOICE_REQUIRED_MUSIC_COMMANDS),
  discordOnly: set(m.DISCORD_ONLY_COMMANDS),
  lookup: set(m.LOOKUP_COMMANDS),
  dndLink: set(m.DND_LINK_COMMANDS),
  roll: set(m.ROLL_COMMANDS),
  speech: set(m.SPEECH_COMMANDS),
  fun: set(m.FUN_COMMANDS),
  player: set(m.PLAYER_COMMANDS),
}, null, 1) + "\n");
console.log(`${m.SLASH_COMMANDS.length} commands -> ${out}`);
