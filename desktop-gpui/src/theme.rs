//! Hoffle's default "Cozy" look, with the values the web app actually computes (app/globals.css,
//! lib/themes.ts), measured from the live page at 1180×760.

use gpui::{Hsla, Rgba, rgb, rgba};

pub const UI_FONT: &str = "Instrument Sans";
pub const DISPLAY_FONT: &str = "Fraunces";
pub const MONO_FONT: &str = "JetBrains Mono";

pub struct Theme;

/// The colours a theme sets (lib/themes.ts ThemeColors) and the ones derived from them.
#[derive(Clone, Copy)]
pub struct Palette {
    pub ink: Rgba,
    pub muted: Rgba,
    pub quiet: Rgba,
    pub line: Rgba,
    pub divider: Rgba,
    pub paper: Rgba,
    pub panel: Rgba,
    pub chat_bg: Rgba,
    pub card: Rgba,
    pub lavender: Rgba,
    pub lavender_light: Rgba,
    pub lavender_soft: Rgba,
    pub lavender_muted: Rgba,
    pub send: Rgba,
    pub coral: Rgba,
    pub mint: Rgba,
    pub hover: Rgba,
    pub ink_faint: Rgba,
    pub field: Rgba,
    pub radius: f32,
}

/// Cozy, exactly as the web computes it.
const COZY: Palette = Palette {
    ink: Rgba { r: 232. / 255., g: 227. / 255., b: 245. / 255., a: 1. },
    muted: Rgba { r: 157. / 255., g: 149. / 255., b: 188. / 255., a: 1. },
    quiet: Rgba { r: 143. / 255., g: 137. / 255., b: 167. / 255., a: 1. },
    line: Rgba { r: 1., g: 1., b: 1., a: 0.07 },
    divider: Rgba { r: 1., g: 1., b: 1., a: 0.06 },
    paper: Rgba { r: 22. / 255., g: 19. / 255., b: 31. / 255., a: 1. },
    panel: Rgba { r: 26. / 255., g: 22. / 255., b: 40. / 255., a: 1. },
    chat_bg: Rgba { r: 30. / 255., g: 26. / 255., b: 46. / 255., a: 1. },
    card: Rgba { r: 37. / 255., g: 32. / 255., b: 64. / 255., a: 1. },
    lavender: Rgba { r: 167. / 255., g: 139. / 255., b: 250. / 255., a: 1. },
    lavender_light: Rgba { r: 196. / 255., g: 181. / 255., b: 253. / 255., a: 1. },
    lavender_soft: Rgba { r: 46. / 255., g: 39. / 255., b: 80. / 255., a: 1. },
    lavender_muted: Rgba { r: 61. / 255., g: 47. / 255., b: 107. / 255., a: 1. },
    send: Rgba { r: 124. / 255., g: 92. / 255., b: 191. / 255., a: 1. },
    coral: Rgba { r: 245. / 255., g: 158. / 255., b: 110. / 255., a: 1. },
    mint: Rgba { r: 74. / 255., g: 222. / 255., b: 128. / 255., a: 1. },
    hover: Rgba { r: 1., g: 1., b: 1., a: 0.043 },
    ink_faint: Rgba { r: 232. / 255., g: 227. / 255., b: 245. / 255., a: 0.07 },
    field: Rgba { r: 21. / 255., g: 18. / 255., b: 29. / 255., a: 1. },
    radius: 16.,
};

static PALETTE: std::sync::RwLock<Palette> = std::sync::RwLock::new(COZY);
static THEME_ID: std::sync::RwLock<String> = std::sync::RwLock::new(String::new());

fn p() -> Palette {
    *PALETTE.read().unwrap()
}

/// A built-in theme from lib/themes.ts (exported to resources/themes.json).
#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeDef {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub colors: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub corners: Option<f32>,
    #[serde(default)]
    pub base_theme: String,
}

pub fn builtin_themes() -> Vec<ThemeDef> {
    crate::assets::ASSETS.iter().find(|(p, _)| *p == "themes/builtin.json").and_then(|(_, b)| serde_json::from_slice(b).ok()).unwrap_or_default()
}

fn custom_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("custom-themes.json"))
}

/// Themes installed from Community (kept on this computer, like the web's stored themes).
pub fn custom_themes() -> Vec<ThemeDef> {
    custom_path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn save_custom_theme(def: &ThemeDef) {
    let mut all = custom_themes();
    all.retain(|t| t.id != def.id);
    all.push(def.clone());
    if let Some(path) = custom_path() {
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
        let _ = std::fs::write(path, serde_json::to_vec(&all).unwrap_or_default());
    }
}

/// Built-in themes, then installed ones.
pub fn all_themes() -> Vec<ThemeDef> {
    let mut all = builtin_themes();
    all.extend(custom_themes());
    all
}

fn theme_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("theme"))
}

/// The theme picked on this computer (`huddle-theme`), Cozy until one is.
pub fn active_theme() -> String {
    let id = THEME_ID.read().unwrap().clone();
    if id.is_empty() { "cozy".into() } else { id }
}

/// Applies the saved theme at start.
pub fn load_theme() {
    let id = theme_path().and_then(|p| std::fs::read_to_string(p).ok()).map(|s| s.trim().to_string()).unwrap_or_else(|| "cozy".into());
    if let Some(def) = all_themes().into_iter().find(|t| t.id == id) {
        set_theme(&def, false);
    }
}

/// Appearance → Customize: an accent of your own, corner roundness, and the rest kept for later
/// (kept on this computer like the web's appearance settings).
#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Customize {
    pub accent: Option<String>,
    pub corners: Option<f32>,
    pub pride: String,
    pub spacing: String,
    pub backdrop: String,
}

fn customize_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("customize.json"))
}

pub fn load_customize() -> Customize {
    let mut c: Customize = customize_path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    if c.pride.is_empty() { c.pride = "off".into(); }
    if c.spacing.is_empty() { c.spacing = "cozy".into(); }
    if c.backdrop.is_empty() { c.backdrop = "plain".into(); }
    c
}

/// Saves the choices and puts them on the current theme.
pub fn set_customize(c: &Customize) {
    if let Some(path) = customize_path() {
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
        let _ = std::fs::write(path, serde_json::to_vec(c).unwrap_or_default());
    }
    let id = active_theme();
    if let Some(def) = all_themes().into_iter().find(|t| t.id == id) {
        set_theme(&def, false);
    }
}

/// Switches the whole palette to this theme (and remembers it when `save`).
pub fn set_theme(def: &ThemeDef, save: bool) {
    let custom = load_customize();
    let mut def = def.clone();
    if let Some(accent) = custom.accent.clone() {
        def.colors.insert("lavender".into(), accent.clone());
    }
    let mut palette = if def.id == "cozy" && custom.accent.is_none() { COZY } else { derive(&def) };
    if custom.accent.is_some() && def.id == "cozy" {
        // Cozy's derived accents follow a custom accent.
        let lav: Hsla = palette.lavender.into();
        palette.lavender_soft = mix(lav, 0.25, COZY.panel).into();
        palette.lavender_muted = mix(lav, 0.4, COZY.panel).into();
    }
    if let Some(r) = custom.corners {
        palette.radius = r;
    }
    *PALETTE.write().unwrap() = palette;
    *THEME_ID.write().unwrap() = def.id.clone();
    if save
        && let Some(path) = theme_path()
    {
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
        let _ = std::fs::write(path, &def.id);
    }
}

/// A theme's palette: its own colours, the rest worked out the way they relate in Cozy.
fn derive(def: &ThemeDef) -> Palette {
    let get = |k: &str| def.colors.get(k).and_then(|v| css_color(v)).map(Rgba::from);
    let mut p = COZY;
    if let Some(c) = get("ink") { p.ink = c; }
    if let Some(c) = get("muted") { p.muted = c; }
    if let Some(c) = get("line") { p.line = c; }
    if let Some(c) = get("paper") { p.paper = c; }
    if let Some(c) = get("panel") { p.panel = c; }
    if let Some(c) = get("chatBg") { p.chat_bg = c; }
    if let Some(c) = get("lavender") { p.lavender = c; }
    if let Some(c) = get("lavenderSoft") { p.lavender_soft = c; }
    if let Some(c) = get("lavenderMuted") { p.lavender_muted = c; }
    if let Some(c) = get("coral") { p.coral = c; }
    if let Some(c) = get("mint") { p.mint = c; }
    let ink: Hsla = p.ink.into();
    p.quiet = mix(p.muted, 0.9, p.chat_bg).into();
    p.divider = ink.opacity(0.06).into();
    p.card = mix(p.panel, 0.5, p.lavender_soft).into();
    p.lavender_light = mix(p.lavender, 0.7, gpui::white()).into();
    p.send = mix(p.lavender, 0.75, gpui::black()).into();
    p.hover = ink.opacity(0.043).into();
    p.ink_faint = ink.opacity(0.07).into();
    p.field = mix(p.paper, 0.9, gpui::black()).into();
    p.radius = def.corners.unwrap_or(16.);
    p
}

#[allow(dead_code)]
impl Theme {
    /// Main text (232,227,245).
    pub fn ink() -> Rgba { p().ink }
    /// Secondary text (157,149,188): timestamps, labels, statuses.
    pub fn muted() -> Rgba { p().muted }
    /// Channel names at rest and the topic (143,137,167).
    pub fn quiet() -> Rgba { p().quiet }
    /// Hairlines (rgba 255,255,255,0.07).
    pub fn line() -> Rgba { p().line }
    /// Dividers in the rail (0.06).
    pub fn divider() -> Rgba { p().divider }
    /// Body behind the app.
    pub fn paper() -> Rgba { p().paper }
    /// Rail, sidebar and members panel (26,22,40).
    pub fn panel() -> Rgba { p().panel }
    /// The conversation card (30,26,46).
    pub fn chat_bg() -> Rgba { p().chat_bg }
    /// Raised cards: the user footer, the composer, the member search (37,32,64).
    pub fn card() -> Rgba { p().card }
    /// Accent (167,139,250).
    pub fn lavender() -> Rgba { p().lavender }
    /// Light accent text: bot tags (196,181,253).
    pub fn lavender_light() -> Rgba { p().lavender_light }
    /// Selected rows, active header buttons, the brand mark (46,39,80).
    pub fn lavender_soft() -> Rgba { p().lavender_soft }
    pub fn lavender_muted() -> Rgba { p().lavender_muted }
    /// The voice-message / send button (124,92,191).
    pub fn send() -> Rgba { p().send }
    pub fn coral() -> Rgba { p().coral }
    pub fn mint() -> Rgba { p().mint }
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
    pub fn hover() -> Rgba { p().hover }
    /// Ink at 7%: the rail's add/explore buttons.
    pub fn ink_faint() -> Rgba { p().ink_faint }
    /// Text fields that are not cards (sign-in).
    pub fn field() -> Rgba { p().field }
    pub fn radius() -> f32 { p().radius }
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
