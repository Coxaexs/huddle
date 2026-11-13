//! The Markdown subset Hoffle messages use (as Discord does): **bold**, *italic*, __underline__,
//! ~~strike~~, `code`, ```blocks```, > quotes, # headings, - bullets, ||spoilers||, links and @mentions.

use std::ops::Range;

#[derive(Clone, Debug, PartialEq)]
pub enum Block {
    Para(String),
    Heading(u8, String),
    Quote(String),
    Bullet(String),
    Code(String),
}

pub fn blocks(src: &str) -> Vec<Block> {
    let mut out = Vec::new();
    let mut para: Vec<&str> = Vec::new();
    let mut lines = src.split('\n').peekable();
    let flush = |para: &mut Vec<&str>, out: &mut Vec<Block>| {
        if !para.is_empty() {
            out.push(Block::Para(para.join("\n")));
            para.clear();
        }
    };
    while let Some(line) = lines.next() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("```") {
            flush(&mut para, &mut out);
            // ```lang\n…``` or a one-liner ```code```.
            if let Some(end) = rest.find("```") {
                out.push(Block::Code(rest[..end].to_string()));
                continue;
            }
            let mut code = Vec::new();
            if !rest.trim().is_empty() && rest.trim().contains(' ') {
                code.push(rest);
            }
            for inner in lines.by_ref() {
                if let Some(pos) = inner.find("```") {
                    if !inner[..pos].is_empty() {
                        code.push(&inner[..pos]);
                    }
                    break;
                }
                code.push(inner);
            }
            out.push(Block::Code(code.join("\n")));
        } else if let Some(rest) = trimmed.strip_prefix("> ").or(trimmed.strip_prefix(">").filter(|r| r.is_empty())) {
            flush(&mut para, &mut out);
            match out.last_mut() {
                Some(Block::Quote(q)) => {
                    q.push('\n');
                    q.push_str(rest);
                }
                _ => out.push(Block::Quote(rest.to_string())),
            }
        } else if let Some((level, rest)) = heading(trimmed) {
            flush(&mut para, &mut out);
            out.push(Block::Heading(level, rest.to_string()));
        } else if let Some(rest) = trimmed.strip_prefix("- ").or(trimmed.strip_prefix("* ")).or(trimmed.strip_prefix("• ")) {
            flush(&mut para, &mut out);
            out.push(Block::Bullet(rest.to_string()));
        } else {
            para.push(line);
        }
    }
    flush(&mut para, &mut out);
    out
}

fn heading(line: &str) -> Option<(u8, &str)> {
    for (prefix, level) in [("### ", 3), ("## ", 2), ("# ", 1)] {
        if let Some(rest) = line.strip_prefix(prefix) {
            return Some((level, rest));
        }
    }
    None
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Span {
    Bold,
    Italic,
    Underline,
    Strike,
    Code,
    Link,
    Mention { me: bool },
    /// `#name` naming one of this server's channels.
    Channel,
    Spoiler,
}

thread_local! {
    /// The open server's channels by name, so `#name` can become a chip that opens the channel.
    static CHANNELS: std::cell::RefCell<std::collections::HashMap<String, String>> = Default::default();
}

thread_local! {
    /// The open server's custom emoji by name, so `:name:` can draw the image.
    static EMOJIS: std::cell::RefCell<std::collections::HashMap<String, String>> = Default::default();
}

pub fn set_emojis(emojis: impl IntoIterator<Item = (String, String)>) {
    EMOJIS.with(|e| *e.borrow_mut() = emojis.into_iter().collect());
}

/// lib/emoji-shortcodes.ts resolveEmojiShortcode: `tada` → 🎉 (exported by tools/export-shortcodes.mjs).
pub fn shortcode(name: &str) -> Option<&'static str> {
    use std::sync::OnceLock;
    static TABLE: OnceLock<std::collections::HashMap<String, String>> = OnceLock::new();
    let table = TABLE.get_or_init(|| {
        crate::assets::ASSETS
            .iter()
            .find(|(p, _)| *p == "emoji/shortcodes.json")
            .and_then(|(_, b)| serde_json::from_slice(b).ok())
            .unwrap_or_default()
    });
    table.get(&name.to_lowercase()).map(String::as_str)
}

/// The space a custom emoji takes in the text: `.custom-emoji` is 1.35em wide with 1px either side;
/// seven no-break spaces (0.2em each in Instrument Sans) come closest.
pub const EMOJI_SLOT: &str = "\u{00A0}\u{00A0}\u{00A0}\u{00A0}\u{00A0}\u{00A0}\u{00A0}";

pub fn set_channels(channels: impl IntoIterator<Item = (String, String)>) {
    CHANNELS.with(|c| *c.borrow_mut() = channels.into_iter().collect());
}

fn channel_id(name: &str) -> Option<String> {
    CHANNELS.with(|c| c.borrow().get(name).cloned())
}

#[derive(Debug, Default, PartialEq)]
pub struct Inline {
    pub text: String,
    pub spans: Vec<(Range<usize>, Span)>,
    /// Clickable ranges in `text` and what they open.
    pub links: Vec<(Range<usize>, String)>,
    pub spoilers: Vec<Range<usize>>,
    /// Custom emoji: where each one's slot starts in `text`, and its image.
    pub emojis: Vec<(usize, String)>,
}

const TOGGLES: [(&str, Span); 6] = [
    ("**", Span::Bold),
    ("__", Span::Underline),
    ("~~", Span::Strike),
    ("||", Span::Spoiler),
    ("*", Span::Italic),
    ("_", Span::Italic),
];

/// Turns one block's source into display text plus styled ranges. Markers are dropped only when
/// they pair up, so a lone `*` or a snake_case name reads as written.
pub fn inline(src: &str, my_username: &str) -> Inline {
    let mut out = Inline::default();
    let mut open: Vec<(&'static str, Span, usize)> = Vec::new();
    let mut i = 0;
    let bytes = src.as_bytes();
    while i < src.len() {
        let rest = &src[i..];
        let prev = src[..i].chars().next_back();

        // `code`: literal inside.
        if rest.starts_with('`')
            && let Some(end) = rest[1..].find('`')
            && end > 0
        {
            // No-break spaces inside the tinted run stand in for `.inline-code`'s side padding.
            let start = out.text.len();
            out.text.push('\u{00A0}');
            out.text.push_str(&rest[1..1 + end]);
            out.text.push('\u{00A0}');
            out.spans.push((start..out.text.len(), Span::Code));
            i += end + 2;
            continue;
        }

        // [label](https://…)
        if rest.starts_with('[')
            && let Some(close) = rest.find("](")
            && let Some(paren) = rest[close + 2..].find(')')
        {
            let label = &rest[1..close];
            let url = &rest[close + 2..close + 2 + paren];
            if is_url(url) && !label.is_empty() && !label.contains('\n') {
                let start = out.text.len();
                out.text.push_str(label);
                out.spans.push((start..out.text.len(), Span::Link));
                out.links.push((start..out.text.len(), url.to_string()));
                i += close + 3 + paren;
                continue;
            }
        }

        // Bare links.
        if (rest.starts_with("https://") || rest.starts_with("http://")) && prev.is_none_or(|c| !c.is_alphanumeric()) {
            let mut end = rest.find(|c: char| c.is_whitespace() || c == '<' || c == '>').unwrap_or(rest.len());
            while end > 0 && matches!(rest.as_bytes()[end - 1], b'.' | b',' | b')' | b'!' | b'?' | b':' | b';' | b'\'' | b'"') {
                end -= 1;
            }
            let url = &rest[..end];
            let start = out.text.len();
            out.text.push_str(url);
            out.spans.push((start..out.text.len(), Span::Link));
            out.links.push((start..out.text.len(), url.to_string()));
            i += end;
            continue;
        }

        // @mentions.
        if rest.starts_with('@') && prev.is_none_or(|c| c.is_whitespace() || c == '(') {
            let name_len = rest[1..]
                .find(|c: char| !(c.is_alphanumeric() || c == '_' || c == '-' || c == '.'))
                .unwrap_or(rest.len() - 1);
            if name_len > 0 {
                let name = rest[1..1 + name_len].trim_end_matches('.');
                let start = out.text.len();
                out.text.push('\u{00A0}');
                out.text.push('@');
                out.text.push_str(name);
                out.text.push('\u{00A0}');
                let me = name.eq_ignore_ascii_case(my_username) || matches!(name, "everyone" | "here");
                out.spans.push((start..out.text.len(), Span::Mention { me }));
                i += 1 + name.len();
                continue;
            }
        }

        // :name: (message-body.tsx, case-insensitive [a-z0-9_]{1,32}): this server's emoji as an image,
        // else a standard shortcode as its emoji, else the text as written.
        if rest.starts_with(':')
            && let Some(len) = rest[1..].find(':')
            && (1..=32).contains(&len)
            && rest[1..1 + len].bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        {
            let name = &rest[1..1 + len];
            if let Some(url) = EMOJIS.with(|e| e.borrow().get(name).cloned()) {
                out.emojis.push((out.text.len(), url));
                out.text.push_str(EMOJI_SLOT);
                i += len + 2;
                continue;
            }
            // An unknown name stays as written, all of it (the web moves past the whole token).
            out.text.push_str(shortcode(name).unwrap_or(&rest[..len + 2]));
            i += len + 2;
            continue;
        }

        // #channel (message-body.tsx: not after a word character, `#`, `/` or `&`; 1–32 of [a-zA-Z0-9._-]).
        if rest.starts_with('#') && prev.is_none_or(|c| !(c.is_alphanumeric() || c == '_' || c == '#' || c == '/' || c == '&')) {
            let len = rest[1..].find(|c: char| !(c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')).unwrap_or(rest.len() - 1).min(32);
            let name = rest[1..1 + len].trim_end_matches('.');
            if !name.is_empty()
                && let Some(id) = channel_id(name)
            {
                // No-break spaces inside the chip stand in for `.mention`'s 3px side padding (Instrument Sans has no hair space; its space is 3.2px).
                let start = out.text.len();
                out.text.push('\u{00A0}');
                out.text.push('#');
                out.text.push_str(name);
                out.text.push('\u{00A0}');
                out.spans.push((start..out.text.len(), Span::Channel));
                out.links.push((start..out.text.len(), format!("channel:{id}")));
                i += 1 + name.len();
                continue;
            }
        }

        // Paired markers.
        let mut matched = false;
        for (marker, span) in TOGGLES {
            if !rest.starts_with(marker) {
                continue;
            }
            // `_` only counts at word edges, so snake_case stays.
            let word_edge_ok = |at_open: bool| {
                if marker != "_" {
                    return true;
                }
                if at_open {
                    prev.is_none_or(|c| !c.is_alphanumeric())
                } else {
                    src[i + 1..].chars().next().is_none_or(|c| !c.is_alphanumeric())
                }
            };
            if let Some(pos) = open.iter().rposition(|(m, _, _)| *m == marker) {
                if !word_edge_ok(false) {
                    continue;
                }
                let (_, span, start) = open.remove(pos);
                if span == Span::Spoiler && start < out.text.len() {
                    // `.spoiler` has 3px side padding: no-break spaces at both ends of the block.
                    out.text.insert(start, '\u{00A0}');
                    out.text.push('\u{00A0}');
                    for (range, _) in out.spans.iter_mut().filter(|(r, _)| r.start >= start) {
                        range.start += '\u{00A0}'.len_utf8();
                        range.end += '\u{00A0}'.len_utf8();
                    }
                    for (range, _) in out.links.iter_mut().filter(|(r, _)| r.start >= start) {
                        range.start += '\u{00A0}'.len_utf8();
                        range.end += '\u{00A0}'.len_utf8();
                    }
                }
                if start < out.text.len() {
                    out.spans.push((start..out.text.len(), span));
                    if span == Span::Spoiler {
                        out.spoilers.push(start..out.text.len());
                    }
                }
                i += marker.len();
                matched = true;
                break;
            }
            let after = &src[i + marker.len()..];
            let closes = after.find(marker).is_some_and(|p| p > 0 && !after[..p].starts_with(' '));
            if closes && word_edge_ok(true) {
                open.push((marker, span, out.text.len()));
                i += marker.len();
                matched = true;
                break;
            }
        }
        if matched {
            continue;
        }

        // Escapes: \* shows a star.
        if bytes[i] == b'\\'
            && let Some(next) = src[i + 1..].chars().next()
            && "*_~`|\\[]>#-".contains(next)
        {
            out.text.push(next);
            i += 1 + next.len_utf8();
            continue;
        }

        let ch = rest.chars().next().unwrap();
        out.text.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn is_url(text: &str) -> bool {
    text.starts_with("https://") || text.starts_with("http://")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bold_and_italic() {
        let r = inline("Liked **Velvet Mood** — *nice*", "me");
        assert_eq!(r.text, "Liked Velvet Mood — nice");
        assert!(r.spans.contains(&(6..17, Span::Bold)));
        assert!(r.spans.iter().any(|(_, s)| *s == Span::Italic));
    }

    #[test]
    fn snake_case_survives() {
        assert_eq!(inline("my_var_name stays", "me").text, "my_var_name stays");
    }

    #[test]
    fn lone_star_survives() {
        assert_eq!(inline("2 * 3 = 6", "me").text, "2 * 3 = 6");
    }

    #[test]
    fn code_is_literal() {
        let r = inline("run `/radio **off**` now", "me");
        assert_eq!(r.text, "run \u{00A0}/radio **off**\u{00A0} now");
        assert_eq!(r.spans, vec![(4..22, Span::Code)]);
    }

    #[test]
    fn links_and_trailing_punctuation() {
        let r = inline("see https://hoffle.online/docs.", "me");
        assert_eq!(r.links, vec![(4..30, "https://hoffle.online/docs".to_string())]);
        let r = inline("[docs](https://hoffle.online) here", "me");
        assert_eq!(r.text, "docs here");
        assert_eq!(r.links[0].1, "https://hoffle.online");
    }

    #[test]
    fn mentions() {
        let r = inline("@kiwi bekle, mail a@b.c", "kiwi");
        assert_eq!(r.spans[0], (0..9, Span::Mention { me: true }));
        assert_eq!(r.spans.len(), 1);
    }

    #[test]
    fn channel_chips_only_for_real_channels() {
        set_channels([("genel".to_string(), "c1".to_string())]);
        let r = inline("see #genel and #nope, not a#genel", "me");
        assert_eq!(r.links, vec![(4..14, "channel:c1".to_string())]);
        set_channels([]);
    }

    #[test]
    fn spoilers_are_tracked() {
        let r = inline("the end: ||he lives||", "me");
        assert_eq!(r.text, "the end: \u{00A0}he lives\u{00A0}");
        assert_eq!(r.spoilers, vec![9..21]);
    }

    #[test]
    fn block_kinds() {
        let b = blocks("# Title\nplain\n> quoted\n> more\n- item\n```rs\nlet x = 1;\n```\nafter");
        assert_eq!(
            b,
            vec![
                Block::Heading(1, "Title".into()),
                Block::Para("plain".into()),
                Block::Quote("quoted\nmore".into()),
                Block::Bullet("item".into()),
                Block::Code("let x = 1;".into()),
                Block::Para("after".into()),
            ]
        );
    }
}
