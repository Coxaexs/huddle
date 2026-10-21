/** /8ball, /choose and /rps: a quick answer from the bot, for whoever asked. */

export const FUN_COMMANDS: ReadonlySet<string> = new Set(["8ball", "choose", "rps"]);

const EIGHT_BALL = [
  "It is certain.",
  "Without a doubt.",
  "Yes, definitely.",
  "You may rely on it.",
  "Most likely.",
  "Outlook good.",
  "Signs point to yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Don't count on it.",
  "My reply is no.",
  "My sources say no.",
  "Outlook not so good.",
  "Very doubtful.",
];

const RPS = ["rock", "paper", "scissors"] as const;
const RPS_EMOJI = { rock: "🪨", paper: "📄", scissors: "✂️" } as const;

/** Splits "/choose a, b or c" style options: by |, then commas, then " or ". */
export function chooseOptions(value: string): string[] {
  const by = value.includes("|") ? /\|/ : value.includes(",") ? /,/ : /\s+or\s+/i;
  return value
    .split(by)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The bot's reply to a fun command; `random` returns [0, 1) like Math.random.
 * The reply repeats the question so it reads on its own in the channel.
 */
export function funCommandReply(name: string, value: string, random: () => number = Math.random): string {
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length) % items.length];
  if (name === "8ball") {
    const answer = pick(EIGHT_BALL);
    return value ? `🎱 “${value}” — ${answer}` : `🎱 ${answer}`;
  }
  if (name === "choose") {
    const options = chooseOptions(value);
    if (options.length < 2) return "Give me at least two things to choose from: /choose pizza, tacos, sushi";
    return `🤔 I choose **${pick(options)}**.`;
  }
  // rps
  const mine = pick(RPS);
  const typed = value.trim().toLowerCase();
  const theirs = RPS.find((move) => move.startsWith(typed) && typed.length > 0) ?? null;
  if (!theirs) return `${RPS_EMOJI[mine]} I throw ${mine}. Your move next time: /rps rock, paper or scissors.`;
  const beats = { rock: "scissors", paper: "rock", scissors: "paper" } as const;
  const outcome = theirs === mine ? "It's a tie." : beats[theirs] === mine ? "You win!" : "I win!";
  return `${RPS_EMOJI[theirs]} ${theirs} vs ${RPS_EMOJI[mine]} ${mine}: ${outcome}`;
}
