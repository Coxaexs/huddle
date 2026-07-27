/**
 * A deliberately small syntax highlighter for fenced code blocks.
 *
 * Full highlighters are heavy for a Worker bundle, and we only need code to be
 * readable, not perfect. This tokenises comments, strings, numbers and a short
 * keyword list per language, and returns plain spans — the renderer builds React
 * nodes from them, so no HTML is ever injected.
 */

export interface CodeToken {
  text: string;
  kind: "plain" | "comment" | "string" | "number" | "keyword";
}

const KEYWORDS: Record<string, string[]> = {
  js: "const let var function return if else for while class extends new await async import from export default try catch finally throw typeof instanceof null undefined true false this switch case break continue delete in of".split(
    " ",
  ),
  py: "def class return if elif else for while import from as try except finally raise with lambda None True False and or not in is pass yield global async await".split(
    " ",
  ),
  sh: "if then else fi for while do done case esac function return export local echo cd sudo apt npm git".split(
    " ",
  ),
  css: "important media keyframes import from to and not only".split(" "),
  sql: "select from where insert into update delete join left right inner outer on group by order having limit values set create table drop alter index as and or not null".split(
    " ",
  ),
};

/** Maps the fence label to a keyword set. */
function keywordsFor(language: string): string[] {
  const lang = language.toLowerCase();
  if (["js", "javascript", "ts", "typescript", "jsx", "tsx", "json"].includes(lang)) {
    return KEYWORDS.js;
  }
  if (["py", "python"].includes(lang)) return KEYWORDS.py;
  if (["sh", "bash", "zsh", "shell", "console"].includes(lang)) return KEYWORDS.sh;
  if (["css", "scss", "less"].includes(lang)) return KEYWORDS.css;
  if (["sql"].includes(lang)) return KEYWORDS.sql;
  return [];
}

/** Line-comment prefix(es) for a language. */
function commentPrefixes(language: string): string[] {
  const lang = language.toLowerCase();
  if (["py", "python", "sh", "bash", "zsh", "shell", "yaml", "yml", "toml"].includes(lang)) {
    return ["#"];
  }
  if (["sql"].includes(lang)) return ["--"];
  return ["//"];
}

/**
 * Splits code into coloured tokens. Deliberately line-based and simple: it will
 * not understand every nesting case, but it never loses characters — the
 * concatenated token text always equals the input.
 */
export function highlight(code: string, language: string): CodeToken[] {
  if (!language) return [{ text: code, kind: "plain" }];

  const keywords = new Set(keywordsFor(language));
  const comments = commentPrefixes(language);
  const tokens: CodeToken[] = [];
  const push = (text: string, kind: CodeToken["kind"]) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind) last.text += text;
    else tokens.push({ text, kind });
  };

  for (const line of code.split("\n")) {
    // A comment swallows the rest of the line.
    let commentAt = -1;
    for (const prefix of comments) {
      const at = line.indexOf(prefix);
      if (at >= 0 && (commentAt < 0 || at < commentAt)) commentAt = at;
    }

    const code_ = commentAt >= 0 ? line.slice(0, commentAt) : line;
    const comment = commentAt >= 0 ? line.slice(commentAt) : "";

    // Walk the code part, pulling out strings, numbers and words.
    let i = 0;
    while (i < code_.length) {
      const char = code_[i];

      if (char === '"' || char === "'" || char === "`") {
        let j = i + 1;
        while (j < code_.length && code_[j] !== char) {
          if (code_[j] === "\\") j += 1;
          j += 1;
        }
        push(code_.slice(i, Math.min(j + 1, code_.length)), "string");
        i = j + 1;
        continue;
      }

      if (/[A-Za-z_$]/.test(char)) {
        let j = i;
        while (j < code_.length && /[A-Za-z0-9_$]/.test(code_[j])) j += 1;
        const word = code_.slice(i, j);
        push(word, keywords.has(word.toLowerCase()) ? "keyword" : "plain");
        i = j;
        continue;
      }

      if (/[0-9]/.test(char)) {
        let j = i;
        while (j < code_.length && /[0-9._xa-fA-F]/.test(code_[j])) j += 1;
        push(code_.slice(i, j), "number");
        i = j;
        continue;
      }

      push(char, "plain");
      i += 1;
    }

    if (comment) push(comment, "comment");
    push("\n", "plain");
  }

  // Drop the trailing newline we always append.
  const last = tokens[tokens.length - 1];
  if (last && last.text.endsWith("\n")) {
    last.text = last.text.slice(0, -1);
    if (!last.text) tokens.pop();
  }
  return tokens;
}
