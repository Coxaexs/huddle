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
    /// Messenger Plus!-style tags (lib/text-style.ts): `[c=red]`, `[c=red]…[/c=blue]`, `[a=yellow]`,
    /// `[f=comic]`, `[size=big]` and the effects, as packed 0xRRGGBB colours and indexes.
    Color(u32),
    Gradient(u32, u32),
    Highlight(u32),
    Font(u8),
    Size(u8),
    Effect(u8),
}

/// TEXT_COLORS.
const TEXT_COLORS: [(&str, u32); 15] = [
    ("red", 0xe5484d),
    ("orange", 0xf76b15),
    ("yellow", 0xe2b203),
    ("lime", 0x7bc043),
    ("green", 0x30a46c),
    ("teal", 0x12a594),
    ("cyan", 0x05a2c2),
    ("blue", 0x3e7bfa),
    ("navy", 0x1c3f95),
    ("purple", 0x8e4ec6),
    ("pink", 0xe93d82),
    ("brown", 0xa0632d),
    ("gray", 0x8b8d98),
    ("black", 0x111111),
    ("white", 0xffffff),
];

/// Messenger Plus!'s numbered (mIRC) palette.
const PLUS_PALETTE: [u32; 16] = [
    0xffffff, 0x000000, 0x00007f, 0x009300, 0xff0000, 0x7f0000, 0x9c009c, 0xfc7f00, 0xffff00, 0x00fc00, 0x009393, 0x00ffff, 0x0000fc, 0xff00ff, 0x7f7f7f, 0xd2d2d2,
];

/// HIGHLIGHT_COLORS.
const HIGHLIGHT_COLORS: [(&str, u32); 6] = [("yellow", 0xfff3a3), ("green", 0xc8f7c5), ("blue", 0xcfe4ff), ("pink", 0xffd1e8), ("orange", 0xffe0b8), ("purple", 0xe6d6ff)];

/// TEXT_FONTS: id, name, and the macOS face for it.
pub const TEXT_FONTS: [(&str, &str, &str); 14] = [
    ("comic", "Comic Sans MS", "Comic Sans MS"),
    ("times", "Times New Roman", "Times New Roman"),
    ("georgia", "Georgia", "Georgia"),
    ("courier", "Courier New", "Courier New"),
    ("impact", "Impact", "Impact"),
    ("arial", "Arial", "Arial"),
    ("verdana", "Verdana", "Verdana"),
    ("tahoma", "Tahoma", "Tahoma"),
    ("trebuchet", "Trebuchet MS", "Trebuchet MS"),
    ("script", "Script", "Brush Script MT"),
    ("papyrus", "Papyrus", "Papyrus"),
    ("gothic", "Old English", "Old English Text MT"),
    ("typewriter", "Typewriter", "American Typewriter"),
    ("lucida", "Lucida Console", "Monaco"),
];

/// TEXT_SIZES (as multiples of the text size).
pub const TEXT_SIZES: [(&str, f32); 4] = [("tiny", 0.7), ("small", 0.85), ("big", 1.3), ("huge", 1.75)];

/// TEXT_EFFECTS, in order.
pub const TEXT_EFFECTS: [(&str, &str); 15] = [
    ("rainbow", "Rainbow"),
    ("glow", "Glow"),
    ("shadow", "Shadow"),
    ("outline", "Outline"),
    ("wave", "Wave"),
    ("shake", "Shake"),
    ("bounce", "Bounce"),
    ("blink", "Blink"),
    ("sparkle", "Sparkle"),
    ("flip", "Upside down"),
    ("mirror", "Mirror"),
    ("wide", "Wide"),
    ("caps", "Small caps"),
    ("sup", "Superscript"),
    ("sub", "Subscript"),
];

fn hex(v: &str) -> Option<u32> {
    let v = v.trim_start_matches('#');
    match v.len() {
        3 => {
            let n = u32::from_str_radix(v, 16).ok()?;
            let (r, g, b) = ((n >> 8) & 0xf, (n >> 4) & 0xf, n & 0xf);
            Some((r * 17) << 16 | (g * 17) << 8 | b * 17)
        }
        6 => u32::from_str_radix(v, 16).ok(),
        _ => None,
    }
}

/// resolveColor(): a name, a Plus! number, or #rgb / #rrggbb.
pub fn resolve_color(value: &str, highlight: bool) -> Option<u32> {
    let v = value.to_lowercase();
    if highlight && let Some((_, c)) = HIGHLIGHT_COLORS.iter().find(|(n, _)| *n == v) {
        return Some(*c);
    }
    if let Some((_, c)) = TEXT_COLORS.iter().find(|(n, _)| *n == v) {
        return Some(*c);
    }
    if (1..=2).contains(&v.len()) && v.bytes().all(|b| b.is_ascii_digit()) {
        return v.parse::<usize>().ok().and_then(|n| PLUS_PALETTE.get(n).copied());
    }
    if v.bytes().all(|b| b.is_ascii_hexdigit() || b == b'#') && (v.starts_with('#') || matches!(v.len(), 3 | 6)) {
        return hex(&v);
    }
    None
}

/// TAG_ALIASES → canonical tag.
fn canonical_tag(name: &str) -> Option<&'static str> {
    let n = name.to_lowercase();
    Some(match n.as_str() {
        "b" => "b",
        "i" => "i",
        "u" => "u",
        "s" => "s",
        "c" | "color" | "colour" => "c",
        "a" | "bg" | "hl" | "highlight" => "a",
        "f" | "font" => "f",
        "size" => "size",
        other => TEXT_EFFECTS.iter().find(|(id, _)| *id == other)?.0,
    })
}

/// describeTag(): the span for a tag, or None when its argument is junk (the text stays as typed).
fn describe_tag(tag: &str, arg: Option<&str>, end: Option<&str>) -> Option<Span> {
    match tag {
        "b" => Some(Span::Bold),
        "i" => Some(Span::Italic),
        "u" => Some(Span::Underline),
        "s" => Some(Span::Strike),
        "c" => {
            let from = resolve_color(arg?, false)?;
            Some(match end.and_then(|e| resolve_color(e, false)) {
                Some(to) => Span::Gradient(from, to),
                None => Span::Color(from),
            })
        }
        "a" => Some(Span::Highlight(resolve_color(arg.unwrap_or("yellow"), true)?)),
        "f" => {
            let v: String = arg?.to_lowercase().chars().filter(|c| c.is_ascii_lowercase()).collect();
            let at = TEXT_FONTS.iter().position(|(id, name, _)| *id == v || name.to_lowercase().chars().filter(|c| c.is_ascii_lowercase()).collect::<String>() == v)?;
            Some(Span::Font(at as u8))
        }
        "size" => {
            let arg = arg?;
            Some(Span::Size(TEXT_SIZES.iter().position(|(n, _)| n.eq_ignore_ascii_case(arg))? as u8))
        }
        effect => Some(Span::Effect(TEXT_EFFECTS.iter().position(|(id, _)| *id == effect)? as u8)),
    }
}

/// TAG_SOURCE at `rest`: `[tag(=arg)?]…[/tag(=end)?]` with the first matching close. Answers the
/// opening tag's length, where the close starts (from `rest`), the close's length and the span.
fn style_tag(rest: &str) -> Option<(usize, usize, usize, Span)> {
    let close_bracket = rest.find(']')?;
    let inner = &rest[1..close_bracket];
    let (name, arg) = match inner.split_once('=') {
        Some((n, a)) => (n, Some(a)),
        None => (inner, None),
    };
    let valid_arg = |a: &str| (1..=24).contains(&a.len()) && a.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'#');
    if name.is_empty() || arg.is_some_and(|a| !valid_arg(a)) {
        return None;
    }
    let tag = canonical_tag(name)?;
    let open_len = close_bracket + 1;
    let body = &rest[open_len..];
    let lower = body.to_lowercase();
    let needle = format!("[/{}", name.to_lowercase());
    let mut from = 0;
    while let Some(p) = lower[from..].find(&needle) {
        let at = from + p;
        let after = &body[at + needle.len()..];
        let (end, len) = if after.starts_with(']') {
            (None, needle.len() + 1)
        } else if let Some(stripped) = after.strip_prefix('=')
            && let Some(q) = stripped.find(']')
            && valid_arg(&stripped[..q])
        {
            (Some(&stripped[..q]), needle.len() + 2 + q)
        } else {
            from = at + needle.len();
            continue;
        };
        let span = describe_tag(tag, arg, end)?;
        return Some((open_len, open_len + at, len, span));
    }
    None
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
    /// Picture links taken out of the text.
    pub images: Vec<String>,
}

/// isImageUrl: our own uploads and stickers, or a link whose path ends in a picture's extension.
pub fn is_image_url(url: &str) -> bool {
    let url = url.trim();
    if url.starts_with("/hangout/api/uploads/") || url.starts_with("/hangout/stickers/") {
        return true;
    }
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return false;
    }
    let path = url.split(['?', '#']).next().unwrap_or(url).to_lowercase();
    [".gif", ".png", ".jpg", ".jpeg", ".webp", ".avif"].iter().any(|e| path.ends_with(e))
}

/// The links in a message the web turns into pictures and preview cards: picture links (in order)
/// and the others (once each, not inside code, not written as `<link>`).
pub fn link_parts(src: &str) -> (Vec<String>, Vec<String>) {
    let (mut images, mut links) = (Vec::new(), Vec::new());
    for (n, segment) in src.split("```").enumerate() {
        if n % 2 == 1 {
            continue;
        }
        let mut in_code = false;
        let mut i = 0;
        let bytes = segment.as_bytes();
        while i < segment.len() {
            let rest = &segment[i..];
            if rest.starts_with('`') {
                in_code = !in_code;
                i += 1;
                continue;
            }
            let prev = segment[..i].chars().next_back();
            if !in_code && (rest.starts_with("https://") || rest.starts_with("http://")) && prev.is_none_or(|c| !c.is_alphanumeric()) {
                let end = rest.find(|c: char| c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\'')).unwrap_or(rest.len());
                let url = &rest[..end];
                if is_image_url(url) {
                    images.push(url.to_string());
                } else {
                    let suppressed = prev == Some('<') && bytes.get(i + end) == Some(&b'>');
                    if !suppressed && !links.iter().any(|l| l == url) {
                        links.push(url.to_string());
                    }
                }
                i += end.max(1);
                continue;
            }
            i += rest.chars().next().map_or(1, char::len_utf8);
        }
    }
    (images, links)
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
    // Style tags waiting for their close: where it starts in `src`, its length, the span, where it began.
    let mut tags: Vec<(usize, usize, Span, usize)> = Vec::new();
    let mut i = 0;
    let bytes = src.as_bytes();
    while i < src.len() {
        let rest = &src[i..];
        let prev = src[..i].chars().next_back();

        // The close of an open style tag.
        if let Some(pos) = tags.iter().rposition(|(at, _, _, _)| *at == i) {
            let (_, len, span, start) = tags.remove(pos);
            if start < out.text.len() {
                out.spans.push((start..out.text.len(), span));
            }
            i += len;
            continue;
        }
        // `[c=red]…[/c]` and the other Messenger Plus! tags.
        if rest.starts_with('[')
            && let Some((open_len, close_at, close_len, span)) = style_tag(rest)
        {
            tags.push((i + close_at, close_len, span, out.text.len()));
            i += open_len;
            continue;
        }

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

        // Bare links (message-body.tsx: `https?://` up to whitespace, < > " or '). A picture's link is
        // not text: the picture shows under the message instead.
        if (rest.starts_with("https://") || rest.starts_with("http://")) && prev.is_none_or(|c| !c.is_alphanumeric()) {
            let end = rest.find(|c: char| c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\'')).unwrap_or(rest.len());
            let url = &rest[..end];
            if is_image_url(url) {
                out.images.push(url.to_string());
                i += end;
                continue;
            }
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
    // A tag whose close was swallowed (inside code, say) runs to the end.
    for (_, _, span, start) in tags {
        if start < out.text.len() {
            out.spans.push((start..out.text.len(), span));
        }
    }
    out
}

fn is_url(text: &str) -> bool {
    text.starts_with("https://") || text.starts_with("http://")
}

#[cfg(test)]
mod tests {
    #[test]
    fn style_tags() {
        let p = inline("say [c=red]hi[/c] and [c=pink]yo[/c=blue] [B]x[/b]", "me");
        assert_eq!(p.text, "say hi and yo x");
        assert!(p.spans.contains(&(4..6, Span::Color(0xe5484d))));
        assert!(p.spans.contains(&(11..13, Span::Gradient(0xe93d82, 0x3e7bfa))));
        assert!(p.spans.contains(&(14..15, Span::Bold)));
        // Junk arguments and unclosed tags stay as typed.
        assert_eq!(inline("[c=nope]a[/c] [c=red]b", "me").text, "[c=nope]a[/c] [c=red]b");
        assert_eq!(inline("[c=4]a[/c]", "me").spans, vec![(0..1, Span::Color(0xff0000))]);
        assert_eq!(inline("[f=comic]a[/f][wave]b[/wave]", "me").spans, vec![(0..1, Span::Font(0)), (1..2, Span::Effect(4))]);
    }

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
        // As on the web, a link runs to the next space: the full stop is part of it.
        let r = inline("see https://hoffle.online/docs.", "me");
        assert_eq!(r.links, vec![(4..31, "https://hoffle.online/docs.".to_string())]);
        // A picture's link leaves the text and shows as the picture.
        let r = inline("look https://x.com/a.gif ok", "me");
        assert_eq!(r.text, "look  ok");
        assert_eq!(r.images, vec!["https://x.com/a.gif".to_string()]);
        assert_eq!(link_parts("a <https://q.com/x> `https://c.com` https://y.com https://y.com https://z.com/p.png"), (vec!["https://z.com/p.png".to_string()], vec!["https://y.com".to_string()]));
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
