//! Hoffle's default "Cozy" look, with the values the web app actually computes (app/globals.css,
//! lib/themes.ts), measured from the live page at 1180×760.

use gpui::{Hsla, Rgba, rgb, rgba};

pub const UI_FONT: &str = "Instrument Sans";
pub const DISPLAY_FONT: &str = "Fraunces";
pub const MONO_FONT: &str = "JetBrains Mono";

pub struct Theme;

#[allow(dead_code)]
impl Theme {
    /// Main text (232,227,245).
    pub fn ink() -> Rgba { rgb(0xe8e3f5) }
    /// Secondary text (157,149,188): timestamps, labels, statuses.
    pub fn muted() -> Rgba { rgb(0x9d95bc) }
    /// Channel names at rest and the topic (143,137,167).
    pub fn quiet() -> Rgba { rgb(0x8f89a7) }
    /// Hairlines (rgba 255,255,255,0.07).
    pub fn line() -> Rgba { rgba(0xffffff12) }
    /// Dividers in the rail (0.06).
    pub fn divider() -> Rgba { rgba(0xffffff0f) }
    /// Body behind the app.
    pub fn paper() -> Rgba { rgb(0x16131f) }
    /// Rail, sidebar and members panel (26,22,40).
    pub fn panel() -> Rgba { rgb(0x1a1628) }
    /// The conversation card (30,26,46).
    pub fn chat_bg() -> Rgba { rgb(0x1e1a2e) }
    /// Raised cards: the user footer, the composer, the member search (37,32,64).
    pub fn card() -> Rgba { rgb(0x252040) }
    /// Accent (167,139,250).
    pub fn lavender() -> Rgba { rgb(0xa78bfa) }
    /// Light accent text: bot tags (196,181,253).
    pub fn lavender_light() -> Rgba { rgb(0xc4b5fd) }
    /// Selected rows, active header buttons, the brand mark (46,39,80).
    pub fn lavender_soft() -> Rgba { rgb(0x2e2750) }
    pub fn lavender_muted() -> Rgba { rgb(0x3d2f6b) }
    /// The voice-message / send button (124,92,191).
    pub fn send() -> Rgba { rgb(0x7c5cbf) }
    pub fn coral() -> Rgba { rgb(0xf59e6e) }
    pub fn mint() -> Rgba { rgb(0x4ade80) }
    /// Presence: online in the footer (59,165,93), idle (250,204,21), dnd/away (250,168,26).
    pub fn online() -> Rgba { rgb(0x3ba55d) }
    pub fn idle() -> Rgba { rgb(0xfacc15) }
    pub fn away() -> Rgba { rgb(0xfaa81a) }
    /// The rail's "someone is talking here" badge (35,165,90).
    pub fn voice_badge() -> Rgba { rgb(0x23a55a) }
    /// Unread / mention counters (242,63,67).
    pub fn badge() -> Rgba { rgb(0xf23f43) }
    /// "LIVE" pill (218,241,232 on 43,149,111).
    pub fn live_bg() -> Rgba { rgb(0xdaf1e8) }
    pub fn live_fg() -> Rgba { rgb(0x2b956f) }
    /// "Join" pill in Simple mode.
    pub fn join_bg() -> Rgba { rgba(0x4ade8033) }
    pub fn join_fg() -> Rgba { rgb(0x71df9d) }
    /// A row under the pointer.
    pub fn hover() -> Rgba { rgba(0xffffff0b) }
    /// Ink at 7%: the rail's add/explore buttons.
    pub fn ink_faint() -> Rgba { rgba(0xe8e3f512) }
    /// Text fields that are not cards (sign-in).
    pub fn field() -> Rgba { rgb(0x15121d) }
    pub fn radius() -> f32 { 16.0 }
}

/// A CSS colour from the API ("#a78bfa", "#abc") as a gpui colour.
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

/// The web's avatar text colour: dark on light backgrounds, light on dark ones.
pub fn on_color(bg: Hsla) -> Hsla {
    if bg.l > 0.62 { rgb(0x48424a).into() } else { Theme::ink().into() }
}

/// CSS `color-mix(in srgb, a p, b)`: premultiplied, so mixing with `transparent` fades.
pub fn mix(a: impl Into<Hsla>, p: f32, b: impl Into<Hsla>) -> Hsla {
    let (a, b) = (gpui::Rgba::from(a.into()), gpui::Rgba::from(b.into()));
    let q = 1. - p;
    let alpha = a.a * p + b.a * q;
    if alpha <= 0. {
        return gpui::hsla(0., 0., 0., 0.);
    }
    let ch = |x: f32, y: f32| (x * a.a * p + y * b.a * q) / alpha;
    gpui::Rgba { r: ch(a.r, b.r), g: ch(a.g, b.g), b: ch(a.b, b.b), a: alpha }.into()
}
