//! Hoffle's "Cozy" theme (lib/themes.ts in the web app), the default for every account.

use gpui::{Hsla, Rgba, rgb, rgba};

pub struct Theme;

#[allow(dead_code)]
impl Theme {
    /// Main text.
    pub fn ink() -> Rgba { rgb(0xe8e3f5) }
    /// Secondary text: timestamps, hints, channel names at rest.
    pub fn muted() -> Rgba { rgb(0x9d95bc) }
    /// Hairlines between panes (rgba(255,255,255,0.07) on the web).
    pub fn line() -> Rgba { rgba(0xffffff12) }
    /// The window behind everything: the server rail.
    pub fn paper() -> Rgba { rgb(0x16131f) }
    /// The channel sidebar.
    pub fn panel() -> Rgba { rgb(0x1a1628) }
    /// The conversation.
    pub fn chat_bg() -> Rgba { rgb(0x1e1a2e) }
    /// Accent.
    pub fn lavender() -> Rgba { rgb(0xa78bfa) }
    pub fn lavender_soft() -> Rgba { rgb(0x2e2750) }
    pub fn lavender_muted() -> Rgba { rgb(0x3d2f6b) }
    pub fn coral() -> Rgba { rgb(0xf59e6e) }
    pub fn mint() -> Rgba { rgb(0x4ade80) }
    /// A row under the pointer.
    pub fn hover() -> Rgba { rgba(0xffffff0d) }
    /// Text fields.
    pub fn field() -> Rgba { rgb(0x15121d) }
    pub fn radius() -> f32 { 16.0 }
}

/// A CSS colour from the API ("#a78bfa", "#abc", "rgb(…)" is not used there) as a gpui colour.
pub fn css_color(value: &str) -> Option<Hsla> {
    let hex = value.trim().strip_prefix('#')?;
    let full = match hex.len() {
        3 => hex.chars().flat_map(|c| [c, c]).collect::<String>(),
        6 => hex.to_string(),
        8 => hex[..6].to_string(),
        _ => return None,
    };
    let n = u32::from_str_radix(&full, 16).ok()?;
    Some(rgb(n).into())
}
