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
            // `.message-heading`: 19 / 16 / 14px, bold, 1.3 lines, 4px above and 2px below.
            Block::Heading(level, text) => {
                let size = match level {
                    1 => 19.,
                    2 => 16.,
                    _ => 14.,
                };
                div()
                    .mt(px(4.))
                    .mb(px(2.))
                    .text_size(px(size))
                    .line_height(px(size * 1.3))
                    .font_weight(FontWeight::BOLD)
                    .text_color(Theme::ink())
                    .child(line(&key, &text, my_username, revealed, on_spoiler.clone()))
                    .into_any_element()
            }
            // `.messages blockquote`: a 3px lavender edge, 10px in, the text a little faded.
            Block::Quote(text) => div()
                .my(px(2.))
                .pl(px(10.))
                .py(px(1.))
                .border_l(px(3.))
                .border_color(Theme::lavender())
                .text_color(Theme::ink())
                .opacity(0.92)
                .child(line(&key, &text, my_username, revealed, on_spoiler.clone()))
                .into_any_element(),
            // `.message-subtext`: 0.78em, muted, 1.35 lines.
            Block::Subtext(text) => div()
                .text_size(px(12.48))
                .line_height(px(16.85))
                .text_color(Theme::muted())
                .child(line(&key, &text, my_username, revealed, on_spoiler.clone()))
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
    let Inline { text, links, spoilers, emojis, .. } = parsed;
    let styled = StyledText::new(SharedString::from(text)).with_runs(runs);
    // Custom emoji: their slots are in the text; the images are painted over them.
    let painter = (!emojis.is_empty()).then(|| emoji_painter(styled.layout().clone(), emojis));
    let mut ranges: Vec<Range<usize>> = links.iter().map(|(r, _)| r.clone()).collect();
    let hidden = !revealed && !spoilers.is_empty();
    if hidden {
        ranges.extend(spoilers.iter().cloned());
    }
    if ranges.is_empty() {
        return div().relative().w_full().child(styled).children(painter).into_any_element();
    }
    let urls: Vec<String> = links.into_iter().map(|(_, u)| u).collect();
    div()
        .relative()
        .w_full()
        .children(painter)
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

/// `.custom-emoji`: 1.35em square, `object-fit: contain`, its bottom 0.3em under the baseline, drawn
/// where the text left room for it.
fn emoji_painter(layout: gpui::TextLayout, emojis: Vec<(usize, String)>) -> impl IntoElement {
    gpui::canvas(
        |_, _, _| {},
        move |_, _, window, cx| {
            let style = window.text_style();
            let rem = window.rem_size();
            let size = f32::from(style.font_size.to_pixels(rem));
            let line_height = f32::from(style.line_height_in_pixels(rem));
            let (ascent, descent) = crate::fonts::bytes(crate::theme::UI_FONT)
                .map(|b| crate::fonts::vertical_metrics(&b))
                .unwrap_or((0.95, 0.25));
            // The CSS baseline: half the leading above the font's own box.
            let baseline = (line_height - (ascent + descent) * size) / 2. + ascent * size;
            let side = 1.35 * size;
            let slot = crate::markdown::EMOJI_SLOT.chars().count() as f32 * 0.2 * size;
            for (ix, url) in &emojis {
                let Some(at) = layout.position_for_index(*ix) else { continue };
                let source = gpui::Resource::Uri(url.clone().into());
                let Some(Ok(image)) = window.use_asset::<gpui::ImgResourceLoader>(&source, cx) else { continue };
                let natural = image.size(0);
                let (w, h) = (f32::from(natural.width.0 as f32), f32::from(natural.height.0 as f32));
                let scale = if w > 0. && h > 0. { (side / w).min(side / h) } else { 1. };
                let (dw, dh) = (w * scale, h * scale);
                let top = f32::from(at.y) + baseline + 0.3 * size - side + (side - dh) / 2.;
                let left = f32::from(at.x) + (slot - side) / 2. + (side - dw) / 2.;
                let bounds = gpui::Bounds::new(gpui::point(px(left), px(top)), gpui::size(px(dw), px(dh)));
                let _ = window.paint_image(bounds, gpui::Corners::default(), image, 0, false);
            }
        },
    )
    .absolute()
    .top_0()
    .left_0()
    .size_full()
}

/// Chrome's `text-wrap: pretty`, the part that shows: when a paragraph's last line would be a single
/// word, the word before it moves down too. The space between them becomes a line break, which keeps
/// every byte offset (styles, links) where it was.
pub(crate) fn pretty(text: &mut String, wrap: &Wrap) {
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
    // Gradients and rainbows colour each letter on its own (background-clip: text, one frame of it).
    for (range, span) in &parsed.spans {
        if matches!(span, Span::Gradient(..)) || *span == Span::Effect(RAINBOW) {
            edges.extend(parsed.text[range.clone()].char_indices().map(|(i, _)| range.start + i));
        }
    }
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
                // Where this letter sits along the gradient.
                let t = || {
                    let letters = parsed.text[range.clone()].chars().count().max(2) - 1;
                    parsed.text[range.start..start].chars().count() as f32 / letters as f32
                };
                match span {
                    Span::Gradient(from, to) => look.color = Some(lerp(*from, *to, t())),
                    Span::Effect(RAINBOW) => look.color = Some(rainbow(t())),
                    _ => {}
                }
            }
        }
        runs.push(look.run(end - start));
    }
    runs
}

/// TEXT_EFFECTS' index of "rainbow".
const RAINBOW: u8 = 0;

/// A colour along `from` → `to` (the formatting menu's gradient previews too).
pub fn lerp_color(from: u32, to: u32, t: f32) -> Hsla {
    lerp(from, to, t)
}

/// A colour along `.fx-rainbow`.
pub fn rainbow_color(t: f32) -> Hsla {
    rainbow(t)
}

fn lerp(from: u32, to: u32, t: f32) -> Hsla {
    let ch = |c: u32, shift: u32| ((c >> shift) & 0xff) as f32;
    let mix = |shift: u32| (ch(from, shift) + (ch(to, shift) - ch(from, shift)) * t.clamp(0., 1.)).round() as u32;
    gpui::rgb(mix(16) << 16 | mix(8) << 8 | mix(0)).into()
}

/// `.fx-rainbow`'s stops (the first half of its 200%-wide gradient shows).
fn rainbow(t: f32) -> Hsla {
    const STOPS: [u32; 8] = [0xff4d4d, 0xff9f1a, 0xffe14d, 0x3ddc84, 0x3ea6ff, 0x8e5cff, 0xff4dd8, 0xff4d4d];
    let pos = (t.clamp(0., 1.) * 0.5 * 7.).min(6.999);
    let i = pos.floor() as usize;
    lerp(STOPS[i], STOPS[i + 1], pos - i as f32)
}

/// The web's inline styles (app/globals.css): `.mention` 22% lavender (40% when it is you), weight
/// 600; `.inline-code` monospace on 12% ink; `.spoiler` 82% ink with clear text, 10% once revealed;
/// links are plain message text.
pub static UNDERLINE_LINKS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[derive(Default)]
struct Look {
    family: Option<&'static str>,
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
            // `[data-underline-links="on"] a`: Settings → Accessibility → Always underline links.
            Span::Link => self.underline |= UNDERLINE_LINKS.load(std::sync::atomic::Ordering::Relaxed),
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
            Span::Color(c) => self.color = Some(gpui::rgb(c).into()),
            // `.fx-highlight`: the soft highlighter colour with dark text on it.
            Span::Highlight(c) => {
                self.background = Some(gpui::rgb(c).into());
                self.color = Some(gpui::rgb(0x1b1b1f).into());
            }
            Span::Font(n) => self.family = markdown::TEXT_FONTS.get(n as usize).map(|f| f.2),
            // Per-letter colours are set in flatten(); sizes and moving effects stay plain text.
            Span::Gradient(..) | Span::Size(_) | Span::Effect(_) => {}
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
        let mut face = font(if self.mono { "Menlo" } else { self.family.unwrap_or(crate::theme::UI_FONT) });
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
