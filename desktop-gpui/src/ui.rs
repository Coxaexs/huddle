//! Small pieces every view uses, sized and coloured like the web app's.

use gpui::{
    AnyElement, App, BoxShadow, Hsla, IntoElement, ObjectFit, Rgba, SharedString, Window, div, hsla,
    img, point, prelude::*, px, svg,
};

use crate::theme::{Theme, css_color, on_color};

/// A Lucide icon from resources/icons, drawn in `color`.
pub fn icon(name: &str, size: f32, color: impl Into<Hsla>) -> gpui::Svg {
    svg().path(SharedString::from(format!("icons/{name}.svg"))).size(px(size)).flex_none().text_color(color.into())
}

/// The web's card shadow: `0 6px 20px rgba(0,0,0,.42), 0 2px 6px rgba(0,0,0,.3)`.
pub fn card_shadow() -> Vec<BoxShadow> {
    vec![
        BoxShadow { color: hsla(0., 0., 0., 0.42), offset: point(px(0.), px(6.)), blur_radius: px(20.), spread_radius: px(0.) },
        BoxShadow { color: hsla(0., 0., 0., 0.30), offset: point(px(0.), px(2.)), blur_radius: px(6.), spread_radius: px(0.) },
    ]
}

/// A round avatar: picture when there is one, otherwise the emoji or letter on the account colour
/// (`.avatar-base`: weight 800, text at about 36% of the size).
/// A picture cut to its centre square (every frame of a GIF), so a round avatar stays round: gpui's
/// `ObjectFit::Cover` paints the whole scaled picture and rounds its corners instead of clipping.
pub fn square(url: String) -> gpui::ImageSource {
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::sync::Arc;
    thread_local! {
        static SQUARES: RefCell<HashMap<String, Arc<gpui::RenderImage>>> = RefCell::new(HashMap::new());
    }
    gpui::ImageSource::Custom(Arc::new(move |window, cx| {
        if let Some(done) = SQUARES.with(|s| s.borrow().get(&url).cloned()) {
            return Some(Ok(done));
        }
        let full = match window.use_asset::<gpui::ImgResourceLoader>(&gpui::Resource::Uri(url.clone().into()), cx)? {
            Ok(full) => full,
            Err(e) => return Some(Err(e)),
        };
        let size = full.size(0);
        let (w, h) = (size.width.0 as u32, size.height.0 as u32);
        let side = w.min(h);
        let result = if side == 0 || w == h {
            full
        } else {
            let (x, y) = ((w - side) / 2, (h - side) / 2);
            let frames: Vec<image::Frame> = (0..full.frame_count())
                .filter_map(|i| {
                    let bytes = full.as_bytes(i)?;
                    let buffer = image::RgbaImage::from_raw(w, h, bytes.to_vec())?;
                    let cut = image::imageops::crop_imm(&buffer, x, y, side, side).to_image();
                    Some(image::Frame::from_parts(cut, 0, 0, full.delay(i)))
                })
                .collect();
            if frames.is_empty() { full } else { Arc::new(gpui::RenderImage::new(frames)) }
        };
        SQUARES.with(|s| s.borrow_mut().insert(url.clone(), result.clone()));
        Some(Ok(result))
    }))
}

/// An avatar whose letter is set in its own size, weight and colour (the profile card's 68px one
/// keeps the 16px regular letter in the card's text colour).
pub fn avatar_with(picture: Option<String>, glyph: &str, color: &str, name: &str, size: f32, font: f32, weight: gpui::FontWeight, text: Hsla) -> AnyElement {
    match picture.filter(|p| !p.is_empty()) {
        Some(url) => avatar(Some(url), glyph, color, name, size),
        None => {
            let bg: Hsla = css_color(color).unwrap_or(Theme::lavender_soft().into());
            let face = if glyph.trim().is_empty() { name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default() } else { glyph.to_string() };
            div()
                .size(px(size))
                .flex_none()
                .rounded_full()
                .bg(bg)
                .text_color(text)
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(font))
                .line_height(px(font))
                .font_weight(weight)
                .child(face)
                .into_any_element()
        }
    }
}

pub fn avatar(picture: Option<String>, glyph: &str, color: &str, name: &str, size: f32) -> AnyElement {
    match picture.filter(|p| !p.is_empty()) {
        Some(url) => {
            let (glyph, color, name) = (glyph.to_string(), color.to_string(), name.to_string());
            // In a sized box: lists measure rows once, so the size must hold before the picture loads.
            div()
                .size(px(size))
                .flex_none()
                .child(
                    img(square(url))
                        .size(px(size))
                        .rounded_full()
                        .object_fit(ObjectFit::Cover)
                        .with_fallback(move || letter_avatar(&glyph, &color, &name, size)),
                )
                .into_any_element()
        }
        None => letter_avatar(glyph, color, name, size),
    }
}

/// An offline member's avatar: the web greys these out (`filter: grayscale(1)`).
pub fn grey_avatar(picture: Option<String>, glyph: &str, color: &str, name: &str, size: f32) -> AnyElement {
    match picture.filter(|p| !p.is_empty()) {
        Some(url) => img(square(url)).size(px(size)).flex_none().rounded_full().object_fit(ObjectFit::Cover).grayscale(true).into_any_element(),
        None => grey_letter_avatar(glyph, color, name, size),
    }
}

/// CSS `filter: grayscale(1)` on a letter avatar: colour and letter both turned to their luminance.
fn grey_letter_avatar(glyph: &str, color: &str, name: &str, size: f32) -> AnyElement {
    let bg: Hsla = css_color(color).unwrap_or(Theme::lavender_soft().into());
    let grey = |c: Hsla| {
        let rgb = c.to_rgb();
        // The filter's matrix (sRGB weights as CSS defines grayscale()).
        let l = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
        Hsla::from(gpui::Rgba { r: l, g: l, b: l, a: rgb.a })
    };
    let face = if glyph.trim().is_empty() { name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default() } else { glyph.to_string() };
    div()
        .size(px(size))
        .flex_none()
        .rounded_full()
        .bg(grey(bg))
        .text_color(grey(on_color(bg)))
        .flex()
        .items_center()
        .justify_center()
        .text_size(px((size * 0.38).round()))
        .line_height(px((size * 0.38).round()))
        .font_weight(gpui::FontWeight::EXTRA_BOLD)
        .child(face)
        .into_any_element()
}

pub fn letter_avatar(glyph: &str, color: &str, name: &str, size: f32) -> AnyElement {
    let bg: Hsla = css_color(color).unwrap_or(Theme::lavender_soft().into());
    let face = if glyph.trim().is_empty() {
        name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default()
    } else {
        glyph.to_string()
    };
    div()
        .size(px(size))
        .flex_none()
        .rounded_full()
        .bg(bg)
        .text_color(on_color(bg))
        .flex()
        .items_center()
        .justify_center()
        .text_size(px((size * 0.38).round()))
        .line_height(px((size * 0.38).round()))
        .font_weight(gpui::FontWeight::EXTRA_BOLD)
        .child(face)
        .into_any_element()
}

/// Presence dot with the ring that cuts it out of the avatar. The members panel and the user card
/// use Discord's colours (`.presence-dot`); the rail's DM dots use brighter ones (`.rail-dm-online-dot`).
pub fn presence_dot(status: &str, size: f32, ring: Rgba) -> impl IntoElement {
    let color = match status {
        "online" => Theme::online(),
        "idle" => Theme::away(),
        "dnd" => gpui::rgb(0xed4245),
        _ => Theme::muted(),
    };
    dot(color, size, ring)
}

pub fn rail_presence_dot(status: &str, size: f32, ring: Rgba) -> impl IntoElement {
    let color = match status {
        "online" => Theme::mint(),
        "idle" => Theme::idle(),
        "dnd" => gpui::rgb(0xf87171),
        _ => Theme::muted(),
    };
    dot(color, size, ring)
}

fn dot(color: Rgba, size: f32, ring: Rgba) -> impl IntoElement {
    div().size(px(size)).rounded_full().bg(color).border_2().border_color(ring)
}

/// The red counter on rail items (`.rail-badge`).
pub fn rail_badge(count: u32) -> impl IntoElement {
    div()
        .min_w(px(18.))
        .h(px(18.))
        .px(px(4.))
        .rounded(px(9.))
        .bg(Theme::badge())
        .border_2()
        .border_color(Theme::panel())
        .flex()
        .items_center()
        .justify_center()
        .text_size(px(11.))
        .line_height(px(11.))
        .font_weight(gpui::FontWeight::EXTRA_BOLD)
        .text_color(gpui::white())
        .child(if count > 99 { "99+".to_string() } else { count.to_string() })
}

pub fn tooltip(text: impl Into<SharedString>) -> impl Fn(&mut Window, &mut App) -> gpui::AnyView {
    let text = text.into();
    move |_, cx| cx.new(|_| Tooltip(text.clone())).into()
}

struct Tooltip(SharedString);

impl gpui::Render for Tooltip {
    fn render(&mut self, _: &mut Window, _: &mut gpui::Context<Self>) -> impl IntoElement {
        div()
            .px_2()
            .py_1()
            .rounded(px(8.))
            .bg(Theme::paper())
            .border_1()
            .border_color(Theme::line())
            .text_color(Theme::ink())
            .text_size(px(12.))
            .font_weight(gpui::FontWeight::SEMIBOLD)
            .child(self.0.clone())
    }
}

/// One line of text cut to `max_width` with "…", measured in the face it is drawn in (gpui's own
/// truncation measures the regular weight, so bold text overshoots and loses its ellipsis).
pub fn fit(window: &Window, text: &str, weight: gpui::FontWeight, size: f32, max_width: gpui::Pixels) -> String {
    let mut face = gpui::font(crate::theme::UI_FONT);
    face.weight = weight;
    let width = |s: &str| {
        let run = gpui::TextRun { len: s.len(), font: face.clone(), color: gpui::black(), background_color: None, underline: None, strikethrough: None };
        window.text_system().shape_line(gpui::SharedString::from(s.to_string()), px(size), &[run], None).width
    };
    if width(text) <= max_width {
        return text.to_string();
    }
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let (mut lo, mut hi) = (0usize, chars.len());
    while lo < hi {
        let mid = (lo + hi + 1) / 2;
        let candidate = format!("{}…", text[..chars[mid - 1].0 + chars[mid - 1].1.len_utf8()].trim_end());
        if width(&candidate) <= max_width { lo = mid } else { hi = mid - 1 }
    }
    if lo == 0 { "…".into() } else { format!("{}…", text[..chars[lo - 1].0 + chars[lo - 1].1.len_utf8()].trim_end()) }
}

/// Width of one line of UI text.
pub fn text_width(window: &Window, text: &str, weight: gpui::FontWeight, size: f32) -> gpui::Pixels {
    let mut face = gpui::font(crate::theme::UI_FONT);
    face.weight = weight;
    let run = gpui::TextRun { len: text.len(), font: face, color: gpui::black(), background_color: None, underline: None, strikethrough: None };
    window.text_system().shape_line(gpui::SharedString::from(text.to_string()), px(size), &[run], None).width
}

/// CSS flex-shrink for items with `flex: 0 1 auto`: when the natural widths overflow `available`, each
/// gives up space in proportion to its natural width, never below its minimum (then the rest share
/// what remains), which is how Chrome sizes a crowded header row.
pub fn css_shrink(natural: &[gpui::Pixels], least: &[gpui::Pixels], available: gpui::Pixels) -> Vec<gpui::Pixels> {
    let mut widths = natural.to_vec();
    let mut frozen = vec![false; natural.len()];
    for _ in 0..natural.len() + 1 {
        let total: f32 = widths.iter().map(|w| f32::from(*w)).sum();
        let overflow = total - f32::from(available);
        if overflow <= 0.5 {
            break;
        }
        let weight: f32 = natural.iter().zip(&frozen).filter(|(_, f)| !**f).map(|(n, _)| f32::from(*n)).sum();
        if weight <= 0. {
            break;
        }
        let mut clamped = false;
        for i in 0..natural.len() {
            if frozen[i] {
                continue;
            }
            let want = f32::from(widths[i]) - overflow * f32::from(natural[i]) / weight;
            if want < f32::from(least[i]) {
                widths[i] = least[i];
                frozen[i] = true;
                clamped = true;
            } else {
                widths[i] = px(want);
            }
        }
        if !clamped {
            break;
        }
    }
    widths
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shrinks_in_proportion() {
        let w = css_shrink(&[px(100.), px(300.)], &[px(0.), px(0.)], px(300.));
        assert!((f32::from(w[0]) - 75.).abs() < 0.01 && (f32::from(w[1]) - 225.).abs() < 0.01);
    }

    #[test]
    fn respects_minimums() {
        let w = css_shrink(&[px(100.), px(300.)], &[px(90.), px(0.)], px(300.));
        assert!((f32::from(w[0]) - 90.).abs() < 0.01 && (f32::from(w[1]) - 210.).abs() < 0.01);
    }
}

/// OutlineEmoji (app/components/outline-emoji.tsx): common reaction emoji drawn as coloured Lucide
/// outlines (Tailwind's 400 shades), anything else as the emoji itself.
pub fn outline_emoji(emoji: &str, size: f32) -> AnyElement {
    let clean = emoji.trim().to_lowercase();
    let clean = clean.trim_matches(':');
    let (name, color): (&str, u32) = match clean {
        "👍" | "+1" | "thumbsup" | "like" => ("thumbs-up", 0x34d399),
        "👎" | "-1" | "thumbsdown" | "dislike" => ("thumbs-down", 0xfb7185),
        "❤️" | "💖" | "💕" | "heart" | "love" => ("heart", 0xfb7185),
        "😂" | "🤣" | "joy" | "laugh" | "lol" => ("smile", 0xfbbf24),
        "🔥" | "fire" | "lit" => ("flame", 0xfb923c),
        "🎉" | "tada" | "party" | "celebrate" => ("party-popper", 0xc084fc),
        "😮" | "😲" | "open_mouth" | "wow" => ("sparkles", 0x38bdf8),
        "⭐" | "🌟" | "star" => ("star", 0xfacc15),
        "👀" | "eyes" | "look" => ("eye", 0x22d3ee),
        "🚀" | "rocket" => ("rocket", 0x818cf8),
        "💡" | "bulb" | "idea" => ("lightbulb", 0xfcd34d),
        "⚡" | "zap" | "lightning" => ("zap", 0xfacc15),
        "☕" | "coffee" => ("coffee", 0xf59e0b),
        "🎮" | "gamepad" | "game" => ("gamepad-2", 0xa78bfa),
        "💬" | "speech_balloon" | "chat" => ("message-square", 0x60a5fa),
        "🍕" | "pizza" => ("pizza", 0xfbbf24),
        "🌮" | "taco" => ("utensils", 0xfbbf24),
        "😢" | "sob" | "cry" | "sad" => ("frown", 0x60a5fa),
        "✅" | "check" | "white_check_mark" => ("check", 0x34d399),
        "❌" | "x" | "cross" => ("x", 0xfb7185),
        _ => return div().text_size(px(size)).line_height(px(size + 2.)).child(emoji.to_string()).into_any_element(),
    };
    icon(name, size, gpui::rgb(color)).into_any_element()
}
