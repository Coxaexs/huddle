/**
 * MSN Messenger turned typed emoticons into pictures. The MSN theme does the
 * same when you send: `:)` becomes 🙂, `(Y)` becomes 👍, and so on.
 *
 * Only whole whitespace-separated tokens convert, so URLs (`http://`), times
 * (`12:30`) and code are left alone. Messages with backticks are skipped
 * entirely rather than risk changing code.
 */
const EMOTICONS: Record<string, string> = {
  ":)": "🙂",
  ":-)": "🙂",
  ":D": "😃",
  ":-D": "😃",
  ";)": "😉",
  ";-)": "😉",
  ":(": "🙁",
  ":-(": "🙁",
  ":P": "😛",
  ":-P": "😛",
  ":p": "😛",
  ":O": "😮",
  ":-O": "😮",
  ":o": "😮",
  ":S": "😖",
  ":-S": "😖",
  ":|": "😐",
  ":-|": "😐",
  ":$": "😳",
  ":-$": "😳",
  ":@": "😠",
  ":-@": "😠",
  ":'(": "😢",
  "8-)": "😎",
  "(H)": "😎",
  "(A)": "😇",
  "(6)": "😈",
  "<3": "❤️",
  "(L)": "❤️",
  "(U)": "💔",
  "(Y)": "👍",
  "(N)": "👎",
  "(K)": "💋",
  "(F)": "🌹",
  "(W)": "🥀",
  "(*)": "⭐",
  "(S)": "🌙",
  "(#)": "☀️",
  "(R)": "🌈",
  "(G)": "🎁",
  "(^)": "🎂",
  "(B)": "🍺",
  "(D)": "🍸",
  "(C)": "☕",
  "(P)": "📷",
  "(E)": "📧",
  "(T)": "📞",
  "(I)": "💡",
  "(Z)": "👦",
  "(X)": "👧",
  "(8)": "🎵",
  "(~)": "🎞️",
  "(O)": "⏰",
  "(M)": "💬",
  "(@)": "🐱",
  "(&)": "🐶",
  "(sn)": "🐌",
  "(pi)": "🍕",
  "(so)": "⚽",
  "(ap)": "✈️",
  "(co)": "💻",
  "(mp)": "📱",
  "(brb)": "🔙",
};

export function convertMsnEmoticons(text: string): string {
  if (text.includes("`")) return text;
  return text.replace(/(^|\s)(\S+)(?=\s|$)/g, (whole, lead: string, token: string) => {
    const emoji = EMOTICONS[token] ?? EMOTICONS[token.toUpperCase()];
    return emoji ? lead + emoji : whole;
  });
}
