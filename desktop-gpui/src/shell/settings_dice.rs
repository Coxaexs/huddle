//! Settings → Dice & Tabletop (app/components/settings/dice-tab.tsx): your dice style, colour,
//! material and texture, kept on this computer and sent with every /roll.

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb, rgba};

use super::Shell;
use crate::theme::Theme;

/// What /roll sends (huddle_dice_theme, _color, _material, _texture).
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DicePrefs {
    pub theme: String,
    pub color: String,
    pub material: String,
    pub texture: String,
}

impl Default for DicePrefs {
    fn default() -> Self {
        Self { theme: "default".into(), color: "#2563eb".into(), material: "auto".into(), texture: "auto".into() }
    }
}

fn dice_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("dice.json"))
}

pub fn load_dice() -> DicePrefs {
    dice_path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn save_dice(prefs: &DicePrefs) {
    if let Some(path) = dice_path() {
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
        let _ = std::fs::write(path, serde_json::to_vec(prefs).unwrap_or_default());
    }
}

/// inheritDiceStyle: Solid Colour takes the app theme's own dice where it has some.
pub fn inherit_dice_style(style: &str, app_theme: &str) -> String {
    if style != "default" && !style.is_empty() {
        return style.to_string();
    }
    match app_theme {
        "vampire" => "vampire",
        "dark-academia" => "dark-academia",
        "matrix" => "matrix",
        "cyberpunk" => "cyberpunk",
        "msn" | "msn-dark" | "teamspeak" => "msn",
        "minecraft" => "minecraft",
        "zombie" => "zombie",
        "star-wars" => "kyber",
        _ => "default",
    }
    .to_string()
}

/// DICE_STYLE_MENU and each style's `.dice-theme-swatch` (background, glow, corners).
const STYLES: [(&str, &str, &str, Option<u32>, bool); 17] = [
    ("default", "Solid Colour", "", None, true),
    ("classic", "Dice Bag 🎲", "linear-gradient(90deg, rgb(200, 29, 37) 0px, rgb(200, 29, 37) 16.6%, rgb(29, 78, 216) 16.6%, rgb(29, 78, 216) 33.2%, rgb(245, 245, 244) 33.2%, rgb(245, 245, 244) 49.8%, rgb(21, 128, 61) 49.8%, rgb(21, 128, 61) 66.4%, rgb(250, 204, 21) 66.4%, rgb(250, 204, 21) 83%, rgb(24, 24, 27) 83%)", None, true),
    ("amber-resin", "Amber Resin 🍯", "radial-gradient(circle at 30% 50%, rgb(255, 243, 176) 0px, rgb(255, 243, 176) 1.5px, rgba(0, 0, 0, 0) 2.5px), radial-gradient(circle at 72% 40%, rgb(226, 179, 60) 0px, rgb(226, 179, 60) 2px, rgba(0, 0, 0, 0) 3px), linear-gradient(90deg, rgb(69, 26, 3) 0%, rgb(180, 83, 9) 40%, rgb(251, 191, 36) 70%, rgb(146, 64, 14) 100%)", Some(0xfbbf2466), true),
    ("shadowflame", "Shadowflame 🔮", "radial-gradient(circle at 25% 45%, rgb(226, 179, 60) 0px, rgb(226, 179, 60) 1.5px, rgba(0, 0, 0, 0) 2.5px), radial-gradient(circle at 66% 55%, rgb(255, 243, 176) 0px, rgb(255, 243, 176) 2px, rgba(0, 0, 0, 0) 3px), linear-gradient(90deg, rgb(5, 1, 13) 0%, rgb(59, 7, 100) 35%, rgb(168, 85, 247) 65%, rgb(30, 27, 75) 100%)", Some(0xa855f773), true),
    ("ocean-epoxy", "Ocean Epoxy 🌊", "radial-gradient(circle at 35% 50%, rgb(226, 179, 60) 0px, rgb(226, 179, 60) 2px, rgba(0, 0, 0, 0) 3px), radial-gradient(circle at 80% 40%, rgb(255, 243, 176) 0px, rgb(255, 243, 176) 1.5px, rgba(0, 0, 0, 0) 2.5px), linear-gradient(90deg, rgb(6, 24, 46) 0%, rgb(7, 89, 133) 35%, rgb(94, 234, 212) 60%, rgb(30, 58, 138) 100%)", Some(0x5eead466), true),
    ("matrix", "Matrix 📟", "linear-gradient(90deg, rgb(2, 11, 5) 0%, rgb(8, 60, 24) 50%, rgb(0, 255, 102) 100%)", Some(0x00ff6673), true),
    ("cyberpunk", "Cyberpunk ⚡", "linear-gradient(90deg, rgb(255, 0, 60) 0%, rgb(122, 12, 109) 35%, rgb(0, 240, 255) 70%, rgb(252, 238, 10) 100%)", Some(0x00f0ff80), true),
    ("vampire", "Vampire 🧛", "linear-gradient(90deg, rgb(20, 5, 8) 0%, rgb(138, 14, 30) 50%, rgb(200, 16, 46) 100%)", Some(0xc8102e73), true),
    ("dark-academia", "Dark Academia 📜", "linear-gradient(90deg, rgb(19, 26, 20) 0%, rgb(58, 42, 28) 45%, rgb(201, 164, 92) 100%)", Some(0xc9a45c59), true),
    ("msn", "Y2K · TeamSpeak 💬", "linear-gradient(rgba(255, 255, 255, 0.55) 0px, rgba(255, 255, 255, 0.55) 45%, rgba(0, 0, 0, 0) 45%), linear-gradient(90deg, rgb(47, 111, 214) 0%, rgb(37, 128, 195) 40%, rgb(79, 174, 53) 70%, rgb(120, 192, 67) 100%)", None, true),
    ("zombie", "Zombie 🧟", "radial-gradient(circle at 30% 50%, rgb(122, 10, 10) 0px, rgb(122, 10, 10) 2px, rgba(0, 0, 0, 0) 3px), radial-gradient(circle at 70% 40%, rgb(92, 8, 8) 0px, rgb(92, 8, 8) 1.5px, rgba(0, 0, 0, 0) 2.5px), linear-gradient(90deg, rgb(62, 74, 34) 0%, rgb(110, 123, 69) 45%, rgb(85, 82, 74) 75%, rgb(77, 94, 42) 100%)", None, true),
    ("kyber", "Kyber Crystal ✨", "linear-gradient(90deg, rgb(57, 167, 255) 0px, rgb(57, 167, 255) 20%, rgb(57, 255, 106) 20%, rgb(57, 255, 106) 40%, rgb(255, 43, 43) 40%, rgb(255, 43, 43) 60%, rgb(168, 85, 247) 60%, rgb(168, 85, 247) 80%, rgb(255, 210, 31) 80%)", Some(0x39a7ff8c), true),
    ("minecraft", "Blocks ⛏️", "linear-gradient(90deg, rgb(93, 156, 58) 0px, rgb(93, 156, 58) 20%, rgb(134, 96, 67) 20%, rgb(134, 96, 67) 40%, rgb(125, 125, 125) 40%, rgb(125, 125, 125) 60%, rgb(93, 236, 245) 60%, rgb(93, 236, 245) 80%, rgb(165, 131, 79) 80%)", None, false),
    ("pride", "Pride 🏳️\u{200d}🌈", "linear-gradient(90deg, rgb(228, 3, 3) 0px, rgb(228, 3, 3) 16.6%, rgb(255, 140, 0) 16.6%, rgb(255, 140, 0) 33.2%, rgb(255, 237, 0) 33.2%, rgb(255, 237, 0) 49.8%, rgb(0, 128, 38) 49.8%, rgb(0, 128, 38) 66.4%, rgb(36, 64, 142) 66.4%, rgb(36, 64, 142) 83%, rgb(115, 41, 130) 83%)", None, true),
    ("trans", "Trans 🏳️\u{200d}⚧️", "linear-gradient(90deg, rgb(91, 207, 250) 0px, rgb(91, 207, 250) 20%, rgb(245, 171, 185) 20%, rgb(245, 171, 185) 40%, rgb(255, 255, 255) 40%, rgb(255, 255, 255) 60%, rgb(245, 171, 185) 60%, rgb(245, 171, 185) 80%, rgb(91, 207, 250) 80%)", None, true),
    ("nonbinary", "Nonbinary 💛", "linear-gradient(90deg, rgb(255, 244, 48) 0px, rgb(255, 244, 48) 25%, rgb(255, 255, 255) 25%, rgb(255, 255, 255) 50%, rgb(156, 89, 209) 50%, rgb(156, 89, 209) 75%, rgb(45, 45, 45) 75%)", None, true),
    ("", "", "", None, true),
];

const COLORS: [u32; 9] = [0x2563eb, 0x0284c7, 0x6366f1, 0x7c3aed, 0xdb2777, 0xe11d48, 0x059669, 0xd97706, 0x1e293b];

const MATERIALS: [(&str, &str); 5] = [("auto", "Theme Default"), ("plastic", "Plastic / Resin 🎲"), ("metal", "Heavy Metal ⚔️"), ("wood", "Carved Wood 🪵"), ("glass", "Ruby Glass 💎")];

const TEXTURES: [(&str, &str); 16] = [
    ("auto", "Theme Default"),
    ("none", "Smooth ✨"),
    ("marble", "Marble 🏛️"),
    ("wood", "Wood Grain 🪵"),
    ("metal", "Steel ⚙️"),
    ("skulls", "Skulls 💀"),
    ("dragon", "Dragon Scales 🐉"),
    ("fire", "Inferno 🔥"),
    ("ice", "Glacial ❄️"),
    ("water", "Water Ripple 🌊"),
    ("stars", "Starlight ⭐"),
    ("astral", "Astral Sea 🌌"),
    ("stainedglass", "Stained Glass 🪟"),
    ("glitter", "Glitter ✨"),
    ("paper", "Parchment 📜"),
    ("speckles", "Speckled 🪄"),
];

impl Shell {
    fn change_dice(&mut self, change: impl FnOnce(&mut DicePrefs), cx: &mut Context<Self>) {
        let mut prefs = load_dice();
        change(&mut prefs);
        save_dice(&prefs);
        cx.notify();
    }

    pub(super) fn render_dice_page(&self, window: &Window, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let prefs = load_dice();
        let ink: Hsla = rgb(0xf5f3ee).into();
        let muted: Hsla = Theme::muted().into();
        let line: Hsla = Theme::line().into();
        let lavender: Hsla = Theme::lavender().into();
        let scale = window.scale_factor();
        let label = |text: &str| div().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(rgb(0xc9cad2)).child(text.to_uppercase());
        let small = |text: &str| div().mt(px(6.)).mb(px(8.)).text_size(px(12.)).line_height(px(18.)).text_color(muted).child(text.to_string());
        // `.dice-theme-row` and friends: a fixed grid of chips, the picked one lavender-edged.
        let chip = |id: SharedString, active: bool, w: f32| {
            div()
                .id(id)
                .flex_none()
                .w(px(w))
                .rounded(px(12.))
                .bg(rgb(0x1a1628))
                .border_1()
                .border_color(if active { lavender } else { line })
                .when(active, |d| d.shadow(vec![gpui::BoxShadow { color: lavender.opacity(0.25), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(2.) }]))
                .text_size(px(12.))
                .line_height(px(18.))
                .font_weight(FontWeight::BOLD)
                .text_color(if active { ink } else { muted })
                .flex()
                .flex_col()
                .items_center()
                .cursor_pointer()
        };
        let grid = |items: Vec<AnyElement>, per_row: usize| {
            let mut rows = div().flex().flex_col().gap(px(8.));
            let mut items = items.into_iter().peekable();
            while items.peek().is_some() {
                rows = rows.child(div().flex().gap(px(8.)).children(items.by_ref().take(per_row)));
            }
            rows
        };
        let mut out = Vec::new();
        let section = |gap_top: bool| div().flex_none().when(gap_top, |d| d.mt(px(24.))).flex().flex_col();

        out.push(
            section(false)
                .child(div().mb(px(4.)).text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(ink).child("3D Dice & Sound Physics"))
                .child(div().text_size(px(13.)).line_height(px(19.5)).text_color(muted).child("Customize your personal 3D polyhedral dice visual style, physical materials, tactile bump textures, and multi-dice collision audio."))
                .into_any_element(),
        );

        let styles: Vec<AnyElement> = STYLES
            .iter()
            .filter(|s| !s.0.is_empty())
            .map(|(id, name, css, glow, round)| {
                let active = prefs.theme == *id;
                let swatch: AnyElement = if css.is_empty() {
                    div().w(px(167.)).h(px(8.)).rounded_full().bg(crate::theme::css_color(&prefs.color).unwrap_or(rgb(0x2563eb).into())).into_any_element()
                } else {
                    let picture = crate::cssbg::picture(css, 167., 8., if *round { 4. } else { 0. }, scale);
                    div()
                        .w(px(167.))
                        .h(px(8.))
                        .when(*round, |d| d.rounded_full())
                        .when_some(*glow, |d, g| d.shadow(vec![gpui::BoxShadow { color: gpui::rgba(g).into(), offset: gpui::point(px(0.), px(0.)), blur_radius: px(6.), spread_radius: px(0.) }]))
                        .children(picture.map(|p| gpui::img(gpui::ImageSource::Render(p)).w(px(167.)).h(px(8.))))
                        .into_any_element()
                };
                let pick = id.to_string();
                chip(SharedString::from(format!("dice-style-{id}")), active, 187.)
                    .pt(px(9.))
                    .px(px(6.))
                    .pb(px(9.))
                    .child(swatch)
                    .child(div().mt(px(7.)).child(name.to_string()))
                    .on_click(cx.listener(move |this, _, _, cx| this.change_dice(|p| p.theme = pick.clone(), cx)))
                    .into_any_element()
            })
            .collect();
        let mut style_section = section(true).child(label("3D Dice Style")).child(div().mt(px(6.)).child(grid(styles, 4)));
        if prefs.theme == "default" {
            let mut colors = div().mt(px(6.)).flex().gap(px(8.));
            for c in COLORS {
                let hex = format!("#{c:06x}");
                let active = prefs.color.eq_ignore_ascii_case(&hex);
                colors = colors.child(
                    div()
                        .id(SharedString::from(format!("dice-color-{c:06x}")))
                        .size(px(30.))
                        .rounded_full()
                        .bg(rgb(c))
                        .border_2()
                        .border_color(if active { Hsla::from(Theme::ink()) } else { gpui::transparent_black() })
                        .when(active, |d| {
                            d.shadow(vec![
                                gpui::BoxShadow { color: lavender, offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(4.) },
                                gpui::BoxShadow { color: Theme::paper().into(), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(2.) },
                            ])
                        })
                        .cursor_pointer()
                        .on_click(cx.listener(move |this, _, _, cx| this.change_dice(|p| p.color = hex.clone(), cx))),
                );
            }
            // `<input type="color">` as Chrome draws it: the colour in a small rectangle.
            let current = crate::theme::css_color(&prefs.color).unwrap_or(rgb(0x2563eb).into());
            colors = colors.child(
                div()
                    .id("dice-color-custom")
                    .size(px(30.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .child(div().w(px(22.)).h(px(16.)).rounded(px(2.)).bg(current))
                    .on_click(cx.listener(|this, _, _, cx| this.settings_note("Picking your own colour is not in this app yet.", cx))),
            );
            style_section = style_section.child(div().mt(px(12.)).child(label("Dice Base Colour"))).child(colors);
        }
        out.push(style_section.into_any_element());

        let materials: Vec<AnyElement> = MATERIALS
            .iter()
            .map(|(id, name)| {
                let pick = id.to_string();
                chip(SharedString::from(format!("dice-mat-{id}")), prefs.material == *id, 148.)
                    .py(px(9.))
                    .px(px(8.))
                    .child(name.to_string())
                    .on_click(cx.listener(move |this, _, _, cx| this.change_dice(|p| p.material = pick.clone(), cx)))
                    .into_any_element()
            })
            .collect();
        out.push(
            section(true)
                .child(label("Dice Material"))
                .child(small("Controls 3D specular shine, physical reflectivity, and realistic collision acoustic timbre."))
                .child(grid(materials, 5))
                .into_any_element(),
        );
        let textures: Vec<AnyElement> = TEXTURES
            .iter()
            .map(|(id, name)| {
                let pick = id.to_string();
                chip(SharedString::from(format!("dice-tex-{id}")), prefs.texture == *id, 122.)
                    .py(px(9.))
                    .px(px(8.))
                    .child(name.to_string())
                    .on_click(cx.listener(move |this, _, _, cx| this.change_dice(|p| p.texture = pick.clone(), cx)))
                    .into_any_element()
            })
            .collect();
        out.push(
            section(true)
                .child(label("Dice Surface Texture"))
                .child(small("Binds tactile bump maps and procedural surface details onto the 3D dice."))
                .child(grid(textures, 6))
                .into_any_element(),
        );

        // The test rolls play the 3D dice, which this app does not have yet.
        let test = |id: &'static str, text: &'static str, border: Hsla, color: Hsla, cx: &mut Context<Self>| {
            div()
                .id(id)
                .px(px(14.))
                .py(px(8.))
                .rounded(px(10.))
                .border_1()
                .border_color(border)
                .bg(rgb(0x1a1628))
                .text_size(px(13.))
                .line_height(px(19.5))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(color)
                .cursor_pointer()
                .child(text)
                .on_click(cx.listener(|this, _, _, cx| this.settings_note("The 3D dice are not in this app yet.", cx)))
        };
        let white: Hsla = gpui::white().into();
        out.push(
            section(true)
                .child(label("Sound Physics & Multi-Dice Voices"))
                .child(small("Acoustics dynamically choreograph up to 50 individual dice collisions, bounces, and cascading chorus impacts matched to material acoustics."))
                .child(
                    div()
                        .mt(px(2.))
                        .flex()
                        .flex_wrap()
                        .gap(px(10.))
                        .child(test("dice-1d20", "🎲 Roll 1d20 (Solo Die)", line, white, cx))
                        .child(test("dice-2d20", "🎲 Roll 2d20 (Pair Clatter)", line, white, cx))
                        .child(test("dice-4d6", "🎲 Roll 4d6 (Cascade)", line, white, cx))
                        .child(test("dice-10d6", "🎲 Roll 10d6 (10-Dice Chorus)", line, white, cx)),
                )
                .into_any_element(),
        );
        out.push(
            section(true)
                .child(label("Critical Rolls: Nat 1 Disasters & Nat 20 Triumphs"))
                .child(small("Nat 1: glass shatters, metal breaks the screen, plastic melts, wood splits in half. Nat 20: glass throws prism light, metal slams down in sparks, plastic pops like a firework, wood grows into bloom. Pick a material above to test each one."))
                .child(
                    div()
                        .mt(px(2.))
                        .flex()
                        .flex_wrap()
                        .gap(px(10.))
                        .child(test("dice-nat1", "💥 Test Nat 1 (Critical Fumble)", rgba(0xff444466).into(), rgb(0xff8888).into(), cx))
                        .child(test("dice-nat20", "✨ Test Nat 20 (Critical Triumph)", rgba(0xffd70080).into(), rgb(0xffd700).into(), cx)),
                )
                .into_any_element(),
        );
        let code = |text: &str| div().px(px(4.)).rounded(px(4.)).bg(gpui::white().opacity(0.08)).font_family(crate::theme::MONO_FONT).text_size(px(11.)).child(text.to_string());
        out.push(
            div()
                .flex_none()
                .mt(px(24.))
                .px(px(14.))
                .py(px(12.))
                .rounded(px(10.))
                .bg(gpui::white().opacity(0.04))
                .border_1()
                .border_color(line)
                .flex()
                .flex_wrap()
                .items_center()
                .gap(px(4.))
                .text_size(px(12.))
                .line_height(px(18.))
                .text_color(muted)
                .child("💡")
                .child(div().font_weight(FontWeight::BOLD).text_color(ink).child("Channel Shortcuts:"))
                .child("You can override your dice style anytime directly in chat rolls:")
                .child(code("/roll 2d20 metal skulls"))
                .child(",")
                .child(code("/roll 4d6 wood"))
                .child(", or")
                .child(code("/roll 1d20 ruby glass"))
                .child(".")
                .into_any_element(),
        );
        out
    }
}
