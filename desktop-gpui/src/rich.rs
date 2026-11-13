//! Draws a message body: Markdown blocks, inline styles, clickable links and spoilers.

use std::ops::Range;
use std::rc::Rc;

use gpui::{
    AnyElement, App, Font, FontStyle, FontWeight, HighlightStyle, InteractiveText, IntoElement, Pixels,
    SharedString, StrikethroughStyle, StyledText, UnderlineStyle, Window, div, font, prelude::*, px,
};
use gpui::LineFragment;

use crate::markdown::{self, Block, Inline, Span};
use crate::theme::Theme;

/// How paragraphs wrap: the column width and the font they are set in, so lines can be broken the
/// way Chrome's `text-wrap: pretty` does (no single word left alone on the last line).
pub struct Wrap<'a> {
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
    if let Some(wrap) = wrap {
        pretty(&mut parsed.text, wrap);
    }
    let highlights = flatten(&parsed, revealed);
    let Inline { text, links, spoilers, .. } = parsed;
    let styled = StyledText::new(SharedString::from(text)).with_highlights(highlights);
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
                    cx.open_url(url);
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
fn flatten(parsed: &Inline, revealed: bool) -> Vec<(Range<usize>, HighlightStyle)> {
    let mut edges: Vec<usize> = parsed.spans.iter().flat_map(|(r, _)| [r.start, r.end]).collect();
    edges.sort_unstable();
    edges.dedup();
    let mut out = Vec::new();
    for pair in edges.windows(2) {
        let (start, end) = (pair[0], pair[1]);
        if start >= end {
            continue;
        }
        let mut style = HighlightStyle::default();
        let mut any = false;
        for (range, span) in &parsed.spans {
            if range.start <= start && end <= range.end {
                any = true;
                apply(&mut style, *span, revealed);
            }
        }
        if any {
            out.push((start..end, style));
        }
    }
    out
}

fn apply(style: &mut HighlightStyle, span: Span, revealed: bool) {
    match span {
        Span::Bold => style.font_weight = Some(FontWeight::BOLD),
        Span::Italic => style.font_style = Some(FontStyle::Italic),
        Span::Underline => {
            style.underline = Some(UnderlineStyle { thickness: px(1.), color: None, wavy: false })
        }
        Span::Strike => style.strikethrough = Some(StrikethroughStyle { thickness: px(1.), color: None }),
        Span::Code => {
            style.background_color = Some(Theme::paper().into());
            style.color = Some(Theme::coral().into());
        }
        Span::Link => {
            style.color = Some(Theme::lavender().into());
            style.underline = Some(UnderlineStyle { thickness: px(1.), color: None, wavy: false });
        }
        Span::Mention { me } => {
            style.background_color = Some(if me { Theme::lavender_muted() } else { Theme::lavender_soft() }.into());
            style.color = Some(Theme::lavender().into());
            style.font_weight = Some(FontWeight::MEDIUM);
        }
        Span::Spoiler => {
            if revealed {
                style.background_color = Some(Theme::hover().into());
            } else {
                // Hidden: text painted in the block's own colour until clicked.
                style.background_color = Some(Theme::lavender_muted().into());
                style.color = Some(Theme::lavender_muted().into());
            }
        }
    }
}
