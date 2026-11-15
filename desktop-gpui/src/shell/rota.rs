//! Rota (components/rota-board.tsx, lib/rota.ts): connect two countries by naming the ones between.
//! The map is drawn as an SVG made for the game's state (`resources/data/rota.json`, exported from
//! lib/rota-data.ts and app/lib/rota-map.ts), the rest as the web lays it out.

use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use gpui::{AnyElement, AppContext as _, Context, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb};
use serde_json::{Value, json};

use super::Shell;
use crate::input::{InputEvent, Look, TextInput};
use crate::model::Message;
use crate::theme::Theme;

struct RotaData {
    countries: HashMap<String, (f32, f32, Vec<String>)>,
    tr: HashMap<String, String>,
    sea: Vec<(String, String)>,
    sea_ends: HashMap<String, Vec<(f32, f32)>>,
    paths: Vec<(String, String)>,
    by_folded: HashMap<String, String>,
}

static DATA: LazyLock<RotaData> = LazyLock::new(|| {
    let raw: Value = crate::assets::ASSETS.iter().find(|(p, _)| *p == "data/rota.json").and_then(|(_, b)| serde_json::from_slice(b).ok()).unwrap_or(Value::Null);
    let countries: HashMap<String, (f32, f32, Vec<String>)> = raw["countries"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(k, v)| {
                    let borders = v["borders"].as_array().map(|a| a.iter().filter_map(|b| b.as_str().map(String::from)).collect()).unwrap_or_default();
                    (k.clone(), (v["x"].as_f64().unwrap_or(0.) as f32, v["y"].as_f64().unwrap_or(0.) as f32, borders))
                })
                .collect()
        })
        .unwrap_or_default();
    let tr: HashMap<String, String> = raw["tr"].as_object().map(|m| m.iter().map(|(k, v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect()).unwrap_or_default();
    let sea = raw["sea"].as_array().map(|a| a.iter().filter_map(|p| Some((p[0].as_str()?.to_string(), p[1].as_str()?.to_string()))).collect()).unwrap_or_default();
    let sea_ends = raw["seaEnds"]
        .as_object()
        .map(|m| m.iter().map(|(k, v)| (k.clone(), v.as_array().map(|a| a.iter().map(|p| (p["x"].as_f64().unwrap_or(0.) as f32, p["y"].as_f64().unwrap_or(0.) as f32)).collect()).unwrap_or_default())).collect())
        .unwrap_or_default();
    let mut paths: Vec<(String, String)> = raw["paths"].as_object().map(|m| m.iter().map(|(k, v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect()).unwrap_or_default();
    paths.sort();
    let mut by_folded = HashMap::new();
    for name in countries.keys() {
        by_folded.insert(fold(name), name.clone());
    }
    for (name, t) in &tr {
        by_folded.insert(fold(t), name.clone());
    }
    if let Some(m) = raw["aliases"].as_object() {
        for (alias, name) in m {
            by_folded.insert(fold(alias), name.as_str().unwrap_or_default().to_string());
        }
    }
    RotaData { countries, tr, sea, sea_ends, paths, by_folded }
});

/// fold(): accents off, lower case, dotless i, no dots, one space.
fn fold(text: &str) -> String {
    let plain: String = text
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ä' | 'ã' | 'å' | 'Á' | 'À' | 'Â' | 'Ä' | 'Ã' | 'Å' => 'a',
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' | 'ı' | 'İ' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'i',
            'ó' | 'ò' | 'ô' | 'ö' | 'õ' | 'Ó' | 'Ò' | 'Ô' | 'Ö' | 'Õ' => 'o',
            'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'u',
            'ç' | 'Ç' => 'c',
            'ş' | 'Ş' => 's',
            'ğ' | 'Ğ' => 'g',
            'ñ' | 'Ñ' => 'n',
            '’' => '\'',
            c => c,
        })
        .filter(|c| *c != '.')
        .collect::<String>()
        .to_lowercase();
    plain.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// findCountry(): the map's name for what someone typed.
fn find_country(typed: &str) -> Option<String> {
    DATA.by_folded.get(&fold(&typed.chars().take(80).collect::<String>())).cloned()
}

fn guess_limit(shortest: i64) -> i64 {
    shortest * 2 + 8
}

fn grade(off: i64) -> (&'static str, u32, u32) {
    // (grade, map fill, chip background)
    if off <= 0 {
        ("hit", 0x22c55e, 0x16a34a)
    } else if off == 1 {
        ("near", 0xeab308, 0xca8a04)
    } else {
        ("far", 0xef4444, 0xdc2626)
    }
}

/// linkPoints(): middle, shore, shore, middle.
fn link_points(a: &str, b: &str) -> Vec<(f32, f32)> {
    let d = &*DATA;
    let mut shores = d.sea_ends.get(&format!("{a}|{b}")).cloned().unwrap_or_else(|| {
        let mut r = d.sea_ends.get(&format!("{b}|{a}")).cloned().unwrap_or_default();
        r.reverse();
        r
    });
    let mut out = Vec::new();
    if let Some(p) = d.countries.get(a) {
        out.push((p.0, p.1));
    }
    out.append(&mut shores);
    if let Some(p) = d.countries.get(b) {
        out.push((p.0, p.1));
    }
    out
}

/// segments(): straight lines, wrapping round the map's edge across the date line.
fn segments(points: &[(f32, f32)]) -> Vec<((f32, f32), (f32, f32))> {
    let mut out = Vec::new();
    for w in points.windows(2) {
        let (p, q) = (w[0], w[1]);
        if (p.0 - q.0).abs() <= 500. {
            out.push((p, q));
        } else {
            let (left, right) = if p.0 < q.0 { (p, q) } else { (q, p) };
            let span = left.0 + 1000. - right.0;
            let t = if span > 0. { left.0 / span } else { 0.5 };
            let y = left.1 + (right.1 - left.1) * t;
            out.push((left, (0., y)));
            out.push(((1000., y), right));
        }
    }
    out
}

fn label(name: &str, tr: bool) -> String {
    if tr { DATA.tr.get(name).cloned().unwrap_or_else(|| name.to_string()) } else { name.to_string() }
}

/// gpui decodes SVG images into RGBA but draws images as BGRA, so the map's colours are written with
/// red and blue swapped.
fn svg_color(rgb: u32) -> String {
    format!("#{:02x}{:02x}{:02x}", rgb & 0xff, (rgb >> 8) & 0xff, (rgb >> 16) & 0xff)
}

/// The map for a game's state: the viewBox the web picks (16:9 round the countries in play), at
/// twice the drawn width so it stays sharp.
fn map_svg(rota: &Value, width: f32) -> (String, (f32, f32, f32, f32)) {
    let d = &*DATA;
    let start = rota["start"].as_str().unwrap_or_default();
    let end = rota["end"].as_str().unwrap_or_default();
    let guesses: Vec<(String, i64, i64)> = rota["guesses"].as_array().map(|a| a.iter().map(|g| (g["name"].as_str().unwrap_or_default().to_string(), g["off"].as_i64().unwrap_or(99), g["by"].as_i64().unwrap_or(0))).collect()).unwrap_or_default();
    let names: Vec<&str> = [start, end].into_iter().chain(guesses.iter().map(|g| g.0.as_str())).collect();
    let points: Vec<(f32, f32)> = names.iter().filter_map(|n| d.countries.get(*n).map(|c| (c.0, c.1))).collect();
    let (mut x0, mut x1, mut y0, mut y1) = (f32::MAX, f32::MIN, f32::MAX, f32::MIN);
    for (x, y) in &points {
        x0 = x0.min(*x);
        x1 = x1.max(*x);
        y0 = y0.min(*y);
        y1 = y1.max(*y);
    }
    if points.is_empty() {
        (x0, x1, y0, y1) = (0., 1000., 0., 500.);
    }
    let (x0, x1, y0, y1) = (x0 - 50., x1 + 50., y0 - 40., y1 + 40.);
    let mut w = (x1 - x0).max((y1 - y0) * 16. / 9.).max(220.);
    let mut h = w * 9. / 16.;
    let (cx, cy) = ((x0 + x1) / 2., (y0 + y1) / 2.);
    w = w.min(1000.);
    h = h.min(500.);
    let vx = (cx - w / 2.).clamp(0., (1000. - w).max(0.));
    let vy = (cy - h / 2.).clamp(0., (500. - h).max(0.));
    let scale = w / 1000.;
    let fill_of = |name: &str| -> u32 {
        if name == start {
            0x3b82f6
        } else if name == end {
            0xf59e0b
        } else if let Some(g) = guesses.iter().find(|g| g.0 == name) {
            grade(g.1).1
        } else {
            0x26303d
        }
    };
    let px_w = (width * 2.).round();
    let px_h = (px_w * 9. / 16.).round();
    let mut svg = format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="{px_w}" height="{px_h}" viewBox="{vx} {vy} {w} {h}"><rect x="0" y="0" width="1000" height="500" fill="{}"/>"##, svg_color(0x10151d));
    for (name, path) in &d.paths {
        svg.push_str(&format!(r##"<path d="{path}" fill="{}" stroke="{}" stroke-linejoin="round" stroke-width="{}"/>"##, svg_color(fill_of(name)), svg_color(0x0b0f14), 0.6 * scale));
    }
    let in_play = |n: &str| n == start || n == end || guesses.iter().any(|g| g.0 == n);
    for (a, b) in &d.sea {
        if !(in_play(a) || in_play(b)) {
            continue;
        }
        for ((p0, p1), (q0, q1)) in segments(&link_points(a, b)) {
            svg.push_str(&format!(r##"<line x1="{p0}" y1="{p1}" x2="{q0}" y2="{q1}" stroke="#e1d5cb" stroke-opacity="0.7" stroke-linecap="round" stroke-width="{}" stroke-dasharray="{} {}"/>"##, 1.4 * scale, 2. * scale, 3. * scale));
        }
    }
    if let Some(route) = rota["route"].as_array() {
        let route: Vec<&str> = route.iter().filter_map(Value::as_str).collect();
        for pair in route.windows(2) {
            for ((p0, p1), (q0, q1)) in segments(&link_points(pair[0], pair[1])) {
                svg.push_str(&format!(r##"<line x1="{p0}" y1="{p1}" x2="{q0}" y2="{q1}" stroke="#ffffff" stroke-opacity="0.85" stroke-linecap="round" stroke-width="{}" stroke-dasharray="{} {}"/>"##, 2.2 * scale, 5. * scale, 4. * scale));
            }
        }
    }
    for (name, color) in [(start, svg_color(0x3b82f6)), (end, svg_color(0xf59e0b))] {
        if let Some(p) = d.countries.get(name) {
            svg.push_str(&format!(
                r##"<g transform="translate({} {}) scale({scale})"><path d="M0 0 C-6 -9 -8 -12 -8 -16 A8 8 0 1 1 8 -16 C8 -12 6 -9 0 0Z" fill="{color}" stroke="#ffffff" stroke-width="1.2"/><circle cx="0" cy="-16" r="3.2" fill="#ffffff"/></g>"##,
                p.0, p.1
            ));
        }
    }
    svg.push_str("</svg>");
    (svg, (vx, vy, w, h))
}

impl Shell {
    fn rota_input(&self, message: &str, window: &Window, cx: &mut Context<Self>) -> gpui::Entity<TextInput> {
        if let Some(input) = self.rota_inputs.borrow().get(message) {
            return input.clone();
        }
        let tr = self.rota_tr;
        let input = cx.new(|cx| TextInput::new(if tr { "Bir ülke yaz…" } else { "Name a country…" }, cx).look(Look { size: 13., line_height: 19.5, height: 19.5, color: Theme::ink().into(), placeholder: Hsla::from(Theme::ink()).opacity(0.5) }));
        let id = message.to_string();
        let sub = cx.subscribe(&input, move |this, input, event, cx| {
            if matches!(event, InputEvent::Submit) {
                let typed = input.read(cx).text();
                this.rota_guess(id.clone(), typed, cx);
            }
            cx.notify();
        });
        let _ = window;
        self.rota_subs.borrow_mut().push(sub);
        self.rota_inputs.borrow_mut().insert(message.to_string(), input.clone());
        input
    }

    fn rota_guess(&mut self, message: String, typed: String, cx: &mut Context<Self>) {
        if typed.trim().is_empty() {
            return;
        }
        let Some(name) = find_country(&typed) else {
            self.game_errors.insert(message, if self.rota_tr { "Haritada böyle bir ülke yok." } else { "That's not a country on the map." }.into());
            cx.notify();
            return;
        };
        if let Some(input) = self.rota_inputs.borrow().get(&message) {
            input.update(cx, |i, cx| i.clear(cx));
        }
        self.game_errors.remove(&message);
        self.game_act(message, "move", json!(name), cx);
    }

    /// RotaBoard.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn render_rota(&self, message: &Message, game: &Value, can_guess: bool, busy: bool, width: f32, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let rota = game.get("rota")?;
        let tr = self.rota_tr;
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let inner = width.min(420.) - 30.;
        let start = rota["start"].as_str().unwrap_or_default();
        let end = rota["end"].as_str().unwrap_or_default();
        let shortest = rota["shortest"].as_i64().unwrap_or(0);
        let guesses = rota["guesses"].as_array().cloned().unwrap_or_default();
        let (svg, (vx, vy, vw, vh)) = map_svg(rota, inner);
        let image = Arc::new(gpui::Image::from_bytes(gpui::ImageFormat::Svg, svg.into_bytes()));
        let map_h = inner * 9. / 16.;
        // The pins' names, where the SVG puts them (11px right of the pin, 12px up, at the map's scale).
        let mut map = div().relative().w(px(inner)).h(px(map_h)).rounded(px(10.)).border_1().border_color(ink.opacity(0.1)).overflow_hidden().child(gpui::img(image).size_full());
        for name in [start, end] {
            if let Some(c) = DATA.countries.get(name) {
                // The pin group is scaled by viewBox.w / 1000, so on screen its units are inner / 1000.
                let k = inner / vw;
                let unit = inner / 1000.;
                let x = (c.0 - vx) * k + 11. * unit;
                let baseline = (c.1 - vy) * k - 12. * unit;
                let size = 11. * unit;
                map = map.child(div().absolute().left(px(x)).top(px(baseline - size * 0.8)).text_size(px(size)).line_height(px(size)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child(label(name, tr)));
            }
        }
        let _ = vh;
        let lang = |code: &'static str, on: bool| {
            div()
                .id(SharedString::from(format!("rota-lang-{code}-{}", message.id)))
                .px(px(9.))
                .py(px(2.))
                .text_size(px(11.))
                .font_weight(FontWeight::BOLD)
                .when(on, |d| d.bg(rgb(0x2563eb)).text_color(gpui::white()))
                .when(!on, |d| d.text_color(muted))
                .cursor_pointer()
                .child(code.to_uppercase())
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.rota_tr = code == "tr";
                    this.rota_inputs.borrow_mut().clear();
                    cx.notify();
                }))
        };
        let mut col = div()
            .flex()
            .flex_col()
            .gap(px(8.))
            .child(div().flex().justify_end().child(div().flex().rounded_full().border_1().border_color(Theme::line()).overflow_hidden().child(lang("tr", tr)).child(lang("en", !tr))))
            .child(map)
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(14.))
                    .child(div().size(px(10.)).rounded_full().bg(rgb(0x3b82f6)))
                    .child(div().font_weight(FontWeight::BOLD).child(label(start, tr)))
                    // `.rota-dash`: a dotted rule with the arrow sitting on it.
                    .child(
                        div()
                            .flex_1()
                            .relative()
                            .h(px(14.))
                            .child(div().absolute().left_0().right_0().top(px(9.)).border_b_1().border_dashed().border_color(ink.opacity(0.3)))
                            .child(div().absolute().left_0().right_0().top(px(-1.)).flex().justify_center().text_size(px(14.)).text_color(muted).child("→")),
                    )
                    .child(div().font_weight(FontWeight::BOLD).child(label(end, tr)))
                    .child(div().size(px(10.)).rounded_full().bg(rgb(0xf59e0b))),
            )
            // `.rota-meta` is a <p> in the message, so the message's 16px paragraph wins over its 12px.
            .child(div().text_size(px(16.)).line_height(px(24.8)).child(format!(
                "{} · {}/{} {}",
                if tr { format!("En kısa rota: arada {shortest} ülke") } else { format!("Shortest route: {shortest} {} between", if shortest == 1 { "country" } else { "countries" }) },
                guesses.len(),
                guess_limit(shortest),
                if tr { "tahmin" } else { "guesses" }
            )));
        if !guesses.is_empty() {
            let legend = if tr { ["En kısa rotada", "1 adım uzun", "2+ adım uzun"] } else { ["On a shortest route", "1 step longer", "2+ steps longer"] };
            let mut row = div().flex().flex_wrap().gap_x(px(10.)).text_size(px(16.)).line_height(px(29.));
            for (i, text) in legend.into_iter().enumerate() {
                let color = [0x22c55e, 0xeab308, 0xef4444][i];
                row = row.child(div().flex().items_center().gap(px(5.)).child(div().size(px(7.)).rounded_full().bg(rgb(color))).child(text));
            }
            if guesses.iter().any(|g| g["by"] == 1) {
                row = row.child(div().child(if tr { "kesikli = ikinci oyuncunun tahmini" } else { "dashed = second player's guess" }));
            }
            row = row.child(div().child(if tr { "noktalı çizgi = deniz geçişi" } else { "dotted line = sea crossing" }));
            col = col.child(row);
            let mut chips = div().flex().flex_wrap().gap(px(5.));
            for g in &guesses {
                let (_, _, bg) = grade(g["off"].as_i64().unwrap_or(99));
                chips = chips.child(
                    div()
                        .px(px(9.))
                        .py(px(2.))
                        .rounded_full()
                        .bg(rgb(bg))
                        .text_size(px(12.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(gpui::white())
                        .when(g["by"] == 1, |d| d.border_2().border_dashed().border_color(ink.opacity(0.35)))
                        .child(label(g["name"].as_str().unwrap_or_default(), tr)),
                );
            }
            col = col.child(chips);
        }
        if let Some(route) = rota["route"].as_array() {
            let names: Vec<String> = route.iter().filter_map(Value::as_str).map(|n| label(n, tr)).collect();
            col = col.child(div().text_size(px(16.)).line_height(px(24.8)).child(format!("{}: {}", if tr { "Rota" } else { "Route" }, names.join(" → "))));
        }
        if can_guess {
            let input = self.rota_input(&message.id, window, cx);
            let typed = !input.read(cx).text().trim().is_empty();
            let id = message.id.clone();
            col = col.child(
                div()
                    .flex()
                    .gap(px(6.))
                    .child(div().flex_1().min_w_0().h(px(38.)).px(px(10.)).rounded(px(8.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(div().flex_1().min_w_0().child(input.clone())))
                    // The form's button keeps the browser's plain look (no `.game-actions` around it).
                    .child(
                        div()
                            .id(SharedString::from(format!("rota-go-{}", message.id)))
                            .px(px(6.))
                            .flex()
                            .items_center()
                            .text_size(px(16.))
                            .text_color(ink)
                            .when(busy || !typed, |d| d.opacity(0.7))
                            .when(!busy && typed, |d| {
                                d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| {
                                    let typed = this.rota_inputs.borrow().get(&id).map(|i| i.read(cx).text()).unwrap_or_default();
                                    this.rota_guess(id.clone(), typed, cx);
                                }))
                            })
                            .child(if tr { "Tahmin et" } else { "Guess" }),
                    ),
            );
        }
        Some(col.into_any_element())
    }
}
