/**
 * Command buttons in message text: `<button>/roll 1d20</button>` or
 * `<button label="Roll for initiative">/roll 1d20+3</button>`.
 *
 * Whoever presses one runs the command as themselves, as if they had typed
 * it in that channel's composer. Because the person who wrote the message
 * chooses the command and someone else runs it, only commands that post a
 * fun result for the presser are allowed: dice, coins, the 8-ball and
 * friends, and read-only lookups. Anything else stays plain text.
 */

/**
 * Commands a button may run. Each one only posts a result for the person
 * pressing it (or, for /gmroll, shows it to them alone). Never add anything
 * that changes settings, membership, other people, the voice room or music,
 * sends a DM, or reaches a bot: a malicious message must not be able to make
 * someone do any of that by tricking them into one click.
 */
export const BUTTON_COMMANDS: ReadonlySet<string> = new Set([
  // Dice (app/lib/chat/commands/roll.ts)
  "roll",
  "gmroll",
  "blindroll",
  "v",
  "vroll",
  "vtm",
  "gmv",
  "rouse",
  // Small games of chance
  "flip",
  "coinflip",
  "8ball",
  "choose",
  "rps",
  // D&D compendium lookups: read-only cards
  "spell",
  "monster",
  "item",
  "feat",
  "race",
  "class",
  "subclass",
]);

/** At most this many buttons render in one message; later ones stay text. */
export const MAX_BUTTONS_PER_MESSAGE = 5;

/** How long one button stays pressed before it can be pressed again. */
export const BUTTON_COOLDOWN_MS = 3000;

const MAX_COMMAND_LENGTH = 150;
const MAX_LABEL_LENGTH = 80;

/**
 * The inline token, as a regex source with named groups (`btnlabel`,
 * `btncmd`) for message-body's INLINE_PATTERN. Straight or curly quotes
 * around the label, since phone keyboards curl them. One line only.
 */
export const COMMAND_BUTTON_SOURCE =
  `<button(?:\\s+label=["“](?<btnlabel>[^"“”<>\\n]{1,${MAX_LABEL_LENGTH}})["”])?\\s*>` +
  `(?<btncmd>[^<>\\n]{1,${MAX_COMMAND_LENGTH}})<\\/button>`;

export interface CommandButton {
  /** The exact text that runs, e.g. "/roll 1d20+3". */
  command: string;
  /** The command's name without the slash, lower-case. */
  name: string;
  /** What the button says; null shows the command itself. */
  label: string | null;
}

/** The allowlisted command a button's text runs, or null when it may not be a button. */
export function parseButtonCommand(raw: string): { command: string; name: string } | null {
  const command = raw.trim().replace(/\s+/g, " ");
  if (!command || command.length > MAX_COMMAND_LENGTH) return null;
  const match = command.match(/^\/([a-z0-9_]{1,32})(?: |$)/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (!BUTTON_COMMANDS.has(name)) return null;
  return { command, name };
}

/** A matched `<button …>…</button>` token's parts, or null when it should stay text. */
export function readCommandButton(label: string | undefined, body: string): CommandButton | null {
  const parsed = parseButtonCommand(body);
  if (!parsed) return null;
  const text = label?.trim() || null;
  return { ...parsed, label: text };
}
