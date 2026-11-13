//! Draws a message body: Markdown blocks, inline styles, clickable links and spoilers.

use std::ops::Range;
use std::rc::Rc;

use gpui::{
    AnyElement, App, Font, FontStyle, FontWeight, Hsla, InteractiveText, IntoElement, Pixels, SharedString,
    StrikethroughStyle, StyledText, TextRun, UnderlineStyle, Window, div, font, prelude::*, px,
};
use gpui::LineFragment;

use crate::markdown::{self, Block, Inline, Span};
use crate::theme::Theme;

/// How paragraphs wrap: the column width and the font they are set in, so lines can be broken the
/// way Chrome's `text-wrap: pretty` does (no single word left alone on the last line).
pub struct Wrap<'a> {
    /// Opens a channel named in the text (`#name` chips).
    pub on_channel: Option<Rc<dyn Fn(String, &mut App)>>,
    pub window: &'a Window,
    pub width: Pixels,
    pub font: Font,
    pub size: Pixels,
}

pub fn ui_font(size: f32) -> (Font, Pixels) {
    (font(crate::theme::UI_FONT), px(size))
}

/// `on_spoiler` runs when a hidden spoiler is clicked (the caller remembers it as revealed).
pub fn message_body(
    id: &str,
    src: &str,
    my_username: &str,
    revealed: bool,
    on_spoiler: Rc<dyn Fn(&mut App)>,
    wrap: Option<&Wrap>,
) -> AnyElement {
    let blocks = markdown::blocks(src);
    let mut col = div().w_full().flex().flex_col().gap(px(2.));
    for (n, block) in blocks.into_iter().enumerate() {
        let key = format!("{id}-{n}");
        let el: AnyElement = match block {
            Block::Para(text) => line_wrapped(&key, &text, my_username, revealed, on_spoiler.clone(), wrap).into_any_element(),
            Block::Heading(level, text) => div()
                .text_size(px(match level { 1 => 20., 2 => 17., _ => 15. }))
                .font_weight(FontWeight::BOLD)
                .child(line(&key, &text, my_username, revealed, on_spoiler.clone()))
                .into_any_element(),
            Block::Quote(text) => div()
                .pl_3()
                .border_l_2()
                .border_color(Theme::lavender_muted())
                .text_color(Theme::muted())
                .child(line(&key, &text, my_username, revealed, on_spoiler.clone()))
                .into_any_element(),
            Block::Bullet(text) => div()
                .flex()
                .gap_2()
                .child(div().text_color(Theme::muted()).child("•"))
                .child(div().flex_1().min_w_0().child(line(&key, &text, my_username, revealed, on_spoiler.clone())))
                .into_any_element(),
            Block::Code(code) => div()
                .w_full()
                .px_3()
                .py_2()
                .rounded(px(8.))
                .bg(Theme::paper())
                .border_1()
                .border_color(Theme::line())
                .font_family("Menlo")
                .text_size(px(12.5))
                .text_color(Theme::ink())
                .child(code.trim_end().to_string())
                .into_any_element(),
        };
        col = col.child(el);
    }
    col.into_any_element()
}

fn line(id: &str, src: &str, my_username: &str, revealed: bool, on_spoiler: Rc<dyn Fn(&mut App)>) -> impl IntoElement {
    line_wrapped(id, src, my_username, revealed, on_spoiler, None)
}

fn line_wrapped(
    id: &str,
    src: &str,
    my_username: &str,
    revealed: bool,
    on_spoiler: Rc<dyn Fn(&mut App)>,
    wrap: Option<&Wrap>,
) -> impl IntoElement {
    let mut parsed = markdown::inline(src, my_username);
    let on_channel = wrap.and_then(|w| w.on_channel.clone());
    if let Some(wrap) = wrap {
        pretty(&mut parsed.text, wrap);
    }
    let runs = flatten(&parsed, revealed);
    let Inline { text, links, spoilers, .. } = parsed;
    let styled = StyledText::new(SharedString::from(text)).with_runs(runs);
    let mut ranges: Vec<Range<usize>> = links.iter().map(|(r, _)| r.clone()).collect();
    let hidden = !revealed && !spoilers.is_empty();
    if hidden {
        ranges.extend(spoilers.iter().cloned());
    }
    if ranges.is_empty() {
        return div().w_full().child(styled).into_any_element();
    }
    let urls: Vec<String> = links.into_iter().map(|(_, u)| u).collect();
    div()
        .w_full()
        .child(
            InteractiveText::new(SharedString::from(id.to_string()), styled).on_click(ranges, move |ix, _, cx| {
                if let Some(url) = urls.get(ix) {
                    match (url.strip_prefix("channel:"), &on_channel) {
                        (Some(id), Some(open)) => open(id.to_string(), cx),
                        (Some(_), None) => {}
                        _ => cx.open_url(url),
                    }
                } else {
                    on_spoiler(cx);
                }
            }),
        )
        .into_any_element()
}

/// Chrome's `text-wrap: pretty`, the part that shows: when a paragraph's last line would be a single
/// word, the word before it moves down too. The space between them becomes a line break, which keeps
/// every byte offset (styles, links) where it was.
fn pretty(text: &mut String, wrap: &Wrap) {
    let mut wrapper = wrap.window.text_system().line_wrapper(wrap.font.clone(), wrap.size);
    let mut breaks = Vec::new();
    let mut offset = 0;
    for hard in text.split('\n') {
        // A hair of slack: only break where the line surely wraps, never one that would just fit.
        let starts: Vec<usize> = wrapper.wrap_line(&[LineFragment::text(hard)], wrap.width + px(1.)).map(|b| b.ix).collect();
        if let Some(&last_start) = starts.last() {
            let orphan = !hard[last_start..].trim().contains(char::is_whitespace);
            let prev_start = starts.len().checked_sub(2).map_or(0, |i| starts[i]);
            let prev = hard[prev_start..last_start].trim_end();
            if orphan && let Some(space) = prev.rfind(' ') && space > 0 {
                breaks.push(offset + prev_start + space);
            }
        }
        offset += hard.len() + 1;
    }
    for at in breaks {
        text.replace_range(at..at + 1, "\n");
    }
}

/// Spans can nest (**bold *and italic***); gpui wants runs that do not overlap, so split the text
/// at every span edge and merge the styles that cover each piece.
fn flatten(parsed: &Inline, revealed: bool) -> Vec<TextRun> {
    // Every span edge splits the text; each piece gets the styles of all spans covering it
    // (spans nest: **bold *and italic***), and the gaps get the plain message style.
    let mut edges: Vec<usize> = parsed.spans.iter().flat_map(|(r, _)| [r.start, r.end]).collect();
    edges.push(0);
    edges.push(parsed.text.len());
    edges.sort_unstable();
    edges.dedup();
    let mut runs = Vec::new();
    for pair in edges.windows(2) {
        let (start, end) = (pair[0], pair[1]);
        if start >= end {
            continue;
        }
        let mut look = Look::default();
        for (range, span) in &parsed.spans {
            if range.start <= start && end <= range.end {
                look.apply(*span, revealed);
            }
        }
        runs.push(look.run(end - start));
    }
    runs
}

/// The web's inline styles (app/globals.css): `.mention` 22% lavender (40% when it is you), weight
/// 600; `.inline-code` monospace on 12% ink; `.spoiler` 82% ink with clear text, 10% once revealed;
/// links are plain message text.
#[derive(Default)]
struct Look {
    weight: Option<FontWeight>,
    italic: bool,
    mono: bool,
    color: Option<Hsla>,
    background: Option<Hsla>,
    underline: bool,
    strike: bool,
}

impl Look {
    fn apply(&mut self, span: Span, revealed: bool) {
        let ink: Hsla = Theme::ink().into();
        match span {
            Span::Bold => self.weight = Some(FontWeight::BOLD),
            Span::Italic => self.italic = true,
            Span::Underline => self.underline = true,
            Span::Strike => self.strike = true,
            Span::Code => {
                self.mono = true;
                self.background = Some(ink.opacity(0.12));
            }
            Span::Link => {}
            Span::Channel => {
                // `.mention.mention-channel`: measured at weight 400 (the channel rule overrides 600).
                let lavender: Hsla = Theme::lavender().into();
                self.background = Some(lavender.opacity(0.22));
                self.color = Some(lavender);
            }
            Span::Mention { me } => {
                let lavender: Hsla = Theme::lavender().into();
                self.background = Some(lavender.opacity(if me { 0.40 } else { 0.22 }));
                self.color = Some(lavender);
                self.weight = Some(FontWeight::SEMIBOLD);
            }
            Span::Spoiler => {
                if revealed {
                    self.background = Some(ink.opacity(0.10));
                } else {
                    self.background = Some(ink.opacity(0.82));
                    self.color = Some(gpui::transparent_black());
                }
            }
        }
    }

    fn run(&self, len: usize) -> TextRun {
        let mut face = font(if self.mono { "Menlo" } else { crate::theme::UI_FONT });
        face.weight = self.weight.unwrap_or(FontWeight::NORMAL);
        if self.italic {
            face.style = FontStyle::Italic;
        }
        TextRun {
            len,
            font: face,
            color: self.color.unwrap_or(Theme::ink().into()),
            background_color: self.background,
            underline: self.underline.then_some(UnderlineStyle { thickness: px(1.), color: None, wavy: false }),
            strikethrough: self.strike.then_some(StrikethroughStyle { thickness: px(1.), color: None }),
        }
    }
}
