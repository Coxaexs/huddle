//! The D&D bot's other roll cards: the face-down /gmroll (SecretRollCard) with the roller's own copy
//! (lib/secret-roll.ts keeps the real card it was sent, keyed by the roll's seed), the Vampire V5
//! roll (V5RollCard: successes, verdict, Hunger dice in red, Willpower rerolls for the roller) and
//! the Rouse check (RouseCheckCard).

use std::collections::HashMap;

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, div, prelude::*, px, rgb};
use serde_json::{Value, json};

use super::Shell;
use crate::model::Message;
use crate::theme::{Theme, mix};
use crate::ui;

/// V5_WILLPOWER_DICE.
const WILLPOWER_DICE: usize = 3;
/// Enough for a long session; the oldest are dropped first.
const KEEP: usize = 200;

/// A V5 card's Willpower state on this screen: the dice picked, the rewritten card once spent.
#[derive(Default)]
pub(super) struct Willpower {
    picks: HashMap<String, Vec<usize>>,
    spent: HashMap<String, Value>,
    busy: Option<String>,
    error: HashMap<String, String>,
}

fn store_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("secret-rolls.json"))
}

fn load_store() -> serde_json::Map<String, Value> {
    store_path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice::<Value>(&b).ok()).and_then(|v| v.as_object().cloned()).unwrap_or_default()
}

/// rememberSecretRoll(): this computer keeps what it rolled behind the screen.
pub(super) fn remember_secret_roll(seed: &str, card: &Value) {
    if seed.is_empty() {
        return;
    }
    let mut store = load_store();
    store.insert(seed.to_string(), card.clone());
    while store.len() > KEEP {
        let Some(first) = store.keys().next().cloned() else { break };
        store.remove(&first);
    }
    if let Some(path) = store_path() {
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
        let _ = std::fs::write(path, serde_json::to_vec(&Value::Object(store)).unwrap_or_default());
    }
}

fn recall_secret_roll(seed: &str) -> Option<Value> {
    if seed.is_empty() {
        return None;
    }
    load_store().get(seed).cloned()
}

/// defaultWillpowerPicks(): the lowest failed dice, up to three.
fn default_picks(normal: &[i64]) -> Vec<usize> {
    let mut failed: Vec<(i64, usize)> = normal.iter().enumerate().filter(|(_, v)| **v < 6).map(|(i, v)| (*v, i)).collect();
    failed.sort();
    let mut picks: Vec<usize> = failed.into_iter().take(WILLPOWER_DICE).map(|(_, i)| i).collect();
    picks.sort();
    picks
}

fn ints(p: &Value, key: &str) -> Vec<i64> {
    p.get(key).and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_i64).collect()).unwrap_or_default()
}

/// How a die looks: `.dnd-die` with its V5 classes.
struct Face {
    text: String,
    fg: Hsla,
    bg: Hsla,
    border: Hsla,
    opacity: f32,
    struck: bool,
    dashed: bool,
    shadow: Vec<gpui::BoxShadow>,
}

fn ring(color: Hsla, spread: f32, blur: f32) -> gpui::BoxShadow {
    gpui::BoxShadow { color, offset: gpui::point(px(0.), px(0.)), blur_radius: px(blur), spread_radius: px(spread) }
}

impl Face {
    fn plain(text: String, accent: Hsla) -> Self {
        Face { text, fg: Theme::ink().into(), bg: mix(accent, 0.09, Theme::panel()), border: accent.opacity(0.32), opacity: 1., struck: false, dashed: false, shadow: Vec::new() }
    }

    /// `.v5-die`: a success has a bright edge, a miss is dimmed, a 10 is gold; a Hunger die is red.
    fn v5(value: i64, hunger: bool, accent: Hsla) -> Self {
        let mut f = Face::plain(value.to_string(), accent);
        if value >= 6 {
            f.border = Theme::ink().into();
        } else {
            f.opacity = 0.62;
        }
        if value == 10 {
            f.fg = rgb(0xc8940f).into();
            f.bg = gpui::rgba(0xf5c84233).into();
            f.border = rgb(0xd4a017).into();
            f.opacity = 1.;
        }
        if hunger {
            f.fg = rgb(0x14060a).into();
            f.bg = if value >= 6 { rgb(0xc1121f).into() } else { mix(rgb(0xc1121f), 0.7, Theme::panel()) };
            f.border = rgb(0xff6b6b).into();
            f.opacity = 1.;
            if value == 10 {
                f.shadow = vec![ring(rgb(0xd4a017).into(), 2., 0.)];
            }
            if value == 1 {
                f.shadow = vec![ring(rgb(0x14060a).into(), 2., 0.), ring(rgb(0xe0182f).into(), 0., 10.)];
            }
        }
        f
    }

    fn render(self) -> gpui::Div {
        div()
            .flex()
            .items_baseline()
            .justify_center()
            .min_w(px(34.))
            .px(px(8.))
            .py(px(3.))
            .rounded(px(8.))
            .bg(self.bg)
            .border_1()
            .when(self.dashed, |d| d.border_dashed())
            .border_color(self.border)
            .shadow(self.shadow)
            .text_size(px(15.))
            .line_height(px(23.25))
            .font_weight(FontWeight::EXTRA_BOLD)
            .text_color(self.fg)
            .opacity(self.opacity)
            .when(self.struck, |d| d.line_through())
            .child(self.text)
    }
}

/// The shared roll card: the total box, the body, and the "again" button at the top right.
fn roll_frame(accent: Hsla, glyph: &'static str, total: String, total_label: Option<&str>, body: gpui::Div, again: Option<AnyElement>) -> AnyElement {
    let rgba = gpui::Rgba::from(accent);
    let css = ui::css_static(format!("radial-gradient(circle at 100% 0, rgba({}, {}, {}, 0.14), transparent 45%)", (rgba.r * 255.).round(), (rgba.g * 255.).round(), (rgba.b * 255.).round()));
    div()
        .relative()
        .mt(px(8.))
        .max_w(px(760.))
        .px(px(18.))
        .py(px(16.))
        .rounded(px(14.))
        .bg(Theme::panel())
        .border_1()
        .border_color(mix(accent, 0.34, Theme::line()))
        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.08), offset: gpui::point(px(0.), px(10.)), blur_radius: px(30.), spread_radius: px(0.) }])
        .child(ui::css_background(css, 13.))
        .flex()
        .gap(px(16.))
        .text_size(px(14.))
        .line_height(px(21.7))
        .child(
            div().flex_none().flex().items_center().child(
                div()
                    .flex_none()
                    .min_w(px(76.))
                    .px(px(12.))
                    .py(px(8.))
                    .rounded(px(14.))
                    .bg(accent.opacity(0.14))
                    .border_1()
                    .border_color(accent.opacity(0.4))
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(2.))
                    .child(ui::icon(glyph, 18., Theme::ink()))
                    .child(div().font_family(crate::theme::DISPLAY_FONT).text_size(px(34.)).line_height(px(34.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(total))
                    .when_some(total_label, |d, l| d.child(div().text_size(px(11.)).line_height(px(17.)).font_weight(FontWeight::BOLD).text_color(Theme::muted()).child(l.to_uppercase()))),
            ),
        )
        .child(div().flex_1().min_w_0().flex().flex_col().justify_center().child(body))
        .children(again)
        .into_any_element()
}

fn kicker(text: String) -> gpui::Div {
    div().text_size(px(11.)).line_height(px(17.05)).font_weight(FontWeight::EXTRA_BOLD).text_color(Theme::ink()).child(text.to_uppercase())
}

fn expression(text: String) -> gpui::Div {
    div().text_size(px(13.5)).line_height(px(20.9)).text_color(Theme::muted()).child(text)
}

/// `.dnd-roll-badge` (with the V5 kinds' looks).
fn badge(text: String, accent: Hsla, kind: &str) -> gpui::Div {
    let plain = kind == "plain";
    div().flex().child(
        div()
            .px(px(10.))
            .py(px(1.))
            .rounded_full()
            .bg(if plain { accent.opacity(0.18) } else { accent })
            .when(kind == "messy" || kind == "bestial", |d| d.shadow(vec![ring(accent.opacity(0.55), 0., 12.)]))
            .text_size(px(12.))
            .line_height(px(18.6))
            .font_weight(FontWeight::EXTRA_BOLD)
            .text_color(if plain { Theme::ink().into() } else { Hsla::from(gpui::white()) })
            .child(text.to_uppercase()),
    )
}

fn again_button(id: String, label: &'static str, tip: String, accent: Hsla) -> gpui::Stateful<gpui::Div> {
    div()
        .id(SharedString::from(id))
        .flex_none()
        .h(px(31.4))
        .px(px(11.))
        .py(px(5.))
        .rounded(px(9.))
        .border_1()
        .border_color(Theme::line())
        .text_size(px(12.5))
        .line_height(px(19.375))
        .font_weight(FontWeight::BOLD)
        .text_color(Theme::ink())
        .cursor_pointer()
        .hover(move |s| s.bg(accent.opacity(0.12)))
        .tooltip(ui::tooltip(tip))
        .child(label)
}

impl Shell {
    /// DndCard for the roll kinds render_roll_card leaves: secret rolls, V5 and Rouse.
    pub(super) fn render_dnd_roll(&self, message: &Message, cx: &mut Context<Self>) -> Option<AnyElement> {
        let p = message.payload.as_ref()?;
        match p.get("type").and_then(Value::as_str)? {
            "v5" => Some(self.render_v5(&message.id, p, true, cx)),
            "rouse" => Some(self.render_rouse(&message.id, p, cx)),
            "roll" if p.get("secret").and_then(Value::as_bool) == Some(true) => Some(self.render_secret_roll(&message.id, p, cx)),
            _ => None,
        }
    }

    fn render_secret_roll(&self, key: &str, p: &Value, cx: &mut Context<Self>) -> AnyElement {
        let label = p.get("label").and_then(Value::as_str).filter(|s| !s.is_empty()).map(String::from);
        let seed = p.get("rollSeed").and_then(Value::as_str).unwrap_or("");
        if let Some(mut mine) = recall_secret_roll(seed) {
            mine["label"] = json!(label);
            mine["roller"] = json!("only you can see this");
            // A /gmv: the roller's own V5 card; Willpower is for open rolls.
            if mine.get("type").and_then(Value::as_str) == Some("v5") {
                mine["rollCommand"] = json!("gmv");
                return self.render_v5(key, &mine, false, cx);
            }
            mine["rollCommand"] = json!("gmroll");
            mine["secret"] = json!(false);
            return self.render_roll_value(key, &mine, cx);
        }
        let accent: Hsla = rgb(0x7c6aa8).into();
        let roller = p.get("roller").and_then(Value::as_str).map(|r| format!(" · {r}")).unwrap_or_default();
        let body = div().flex().flex_col().gap(px(3.)).child(kicker(format!("{}{roller}", label.unwrap_or_else(|| "Secret roll".into())))).child(expression("Rolled behind the DM screen".into()));
        roll_frame(accent, "eye-off", "?".into(), None, body, None)
    }

    fn render_v5(&self, key: &str, card: &Value, can_willpower: bool, cx: &mut Context<Self>) -> AnyElement {
        // The socket brings the rewritten card to everyone; until then, the reply does.
        let spent = self.willpower.spent.get(key).filter(|_| card.get("willpower").is_none_or(Value::is_null));
        let mut shown = card.clone();
        if let (Some(spent), Some(obj)) = (spent.and_then(Value::as_object), shown.as_object_mut()) {
            for (k, v) in spent {
                obj.insert(k.clone(), v.clone());
            }
        }
        let flag = |k: &str| shown.get(k).and_then(Value::as_bool).unwrap_or(false);
        let kind = if flag("bestial") {
            "bestial"
        } else if flag("messy") {
            "messy"
        } else if flag("critical") && shown.get("win") != Some(&json!(false)) {
            "crit"
        } else if flag("totalFailure") || shown.get("win") == Some(&json!(false)) {
            "fail"
        } else if flag("win") {
            "win"
        } else {
            "plain"
        };
        let accent: Hsla = rgb(match kind {
            "messy" | "bestial" => 0xe0182f,
            "crit" => 0xd4a017,
            "win" => 0x2f9e6a,
            "fail" => 0x7a6f78,
            _ => 0xb3122a,
        })
        .into();
        let normal = ints(&shown, "normal");
        let hunger = ints(&shown, "hungerDice");
        let pool = shown.get("pool").and_then(Value::as_i64).unwrap_or(normal.len() as i64 + hunger.len() as i64);
        let difficulty = shown.get("difficulty").and_then(Value::as_i64);
        let successes = shown.get("successes").and_then(Value::as_i64).unwrap_or(0);
        let label = shown.get("label").and_then(Value::as_str).filter(|s| !s.is_empty()).map(String::from);
        let roller = shown.get("roller").and_then(Value::as_str).map(|r| format!(" · {r}")).unwrap_or_default();
        let willpower = shown.get("willpower").filter(|w| w.is_object()).cloned();
        let rerolled: Vec<usize> = willpower.as_ref().map(|w| ints(w, "picks").into_iter().map(|i| i as usize).collect()).unwrap_or_default();
        let can_spend = can_willpower && shown.get("rollerId").and_then(Value::as_str) == Some(self.me.id.as_str()) && flag("verified") && willpower.is_none() && !normal.is_empty();
        let picks = self.willpower.picks.get(key).cloned().unwrap_or_else(|| default_picks(&normal));

        let mut faces = div().mt(px(6.)).flex().flex_wrap().gap(px(6.));
        for (i, value) in normal.iter().enumerate() {
            let mut face = Face::v5(*value, false, accent);
            face.dashed = rerolled.contains(&i);
            let picked = can_spend && picks.contains(&i);
            if picked {
                face.opacity = 1.;
                face.shadow = vec![ring(rgb(0x4f8df7).into(), 3., 0.)];
            }
            let el = face.render();
            faces = faces.child(if can_spend {
                let k = key.to_string();
                let normal = normal.clone();
                el.id(SharedString::from(format!("v5-{key}-{i}")))
                    .cursor_pointer()
                    .hover(|s| s.opacity(1.))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        let entry = this.willpower.picks.entry(k.clone()).or_insert_with(|| default_picks(&normal));
                        if let Some(at) = entry.iter().position(|p| *p == i) {
                            entry.remove(at);
                        } else if entry.len() < WILLPOWER_DICE {
                            entry.push(i);
                            entry.sort();
                        }
                        cx.notify();
                    }))
                    .into_any_element()
            } else {
                el.into_any_element()
            });
        }
        for value in &hunger {
            faces = faces.child(Face::v5(*value, true, accent).render());
        }
        let mut detail = format!("{pool} {}", if pool == 1 { "die" } else { "dice" });
        if !hunger.is_empty() {
            detail.push_str(&format!(" · {} Hunger", hunger.len()));
        }
        if let Some(d) = difficulty {
            detail.push_str(&format!(" · Difficulty {d}"));
        }
        let note = |text: String, error: bool| div().text_size(px(12.)).line_height(px(18.6)).text_color(if error { rgb(0xe0182f).into() } else { Hsla::from(Theme::muted()) }).child(text);
        let mut body = div()
            .flex()
            .flex_col()
            .gap(px(3.))
            .child(kicker(format!("{}{roller}", label.clone().unwrap_or_else(|| "V5 roll".into()))))
            .child(expression(detail))
            .child(badge(shown.get("outcome").and_then(Value::as_str).unwrap_or("").to_string(), accent, kind))
            .when(flag("bestialRisk"), |d| d.child(note("A Hunger die shows 1: bestial if this fails.".into(), false)))
            .child(faces);
        if can_spend {
            let busy = self.willpower.busy.as_deref() == Some(key);
            let n = picks.len();
            let text = if busy {
                "Rerolling…".to_string()
            } else if n > 0 {
                format!("Willpower: reroll {n} {}", if n == 1 { "die" } else { "dice" })
            } else {
                "Willpower: pick dice".to_string()
            };
            let k = key.to_string();
            let picks2 = picks.clone();
            body = body.child(
                div()
                    .mt(px(6.))
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(8.))
                    .child(
                        again_button(format!("wp-{key}"), "", "Take 1 Superficial Willpower damage".into(), accent)
                            .child(text)
                            .when(n == 0 || busy, |d| d.opacity(0.5))
                            .when(n > 0 && !busy, |d| d.on_click(cx.listener(move |this, _, _, cx| this.spend_willpower(k.clone(), picks2.clone(), cx)))),
                    )
                    .child(note(format!("Pick up to {WILLPOWER_DICE}; Hunger dice stay."), false)),
            );
        }
        if !rerolled.is_empty() {
            body = body.child(note(format!("Willpower spent: {} rerolled.", rerolled.len()), false));
        }
        if let Some(e) = self.willpower.error.get(key) {
            body = body.child(note(e.clone(), true));
        }
        let verb = shown.get("rollCommand").and_then(Value::as_str).unwrap_or("v").to_string();
        let mut again = vec![format!("/{verb} {pool}")];
        if !hunger.is_empty() {
            again.push(format!("h{}", hunger.len()));
        }
        if let Some(d) = difficulty {
            again.push(format!("d{d}"));
        }
        again.extend(label);
        let command = again.join(" ");
        let button = again_button(format!("v5-again-{key}"), "Roll again", "Roll the same pool yourself".into(), accent)
            .on_click(cx.listener(move |this, _, _, cx| this.run_command(command.clone(), cx)))
            .into_any_element();
        roll_frame(accent, "droplet", successes.to_string(), Some(if successes == 1 { "success" } else { "successes" }), body, Some(button))
    }

    /// POST /api/integrations/dnd/willpower: the picked dice rerolled, the card rewritten.
    fn spend_willpower(&mut self, key: String, picks: Vec<usize>, cx: &mut Context<Self>) {
        if self.willpower.busy.is_some() {
            return;
        }
        self.willpower.busy = Some(key.clone());
        self.willpower.error.remove(&key);
        let client = self.client.clone();
        let body = json!({ "messageId": key, "picks": picks, "channelId": self.call.as_ref().map(|c| c.channel_id.clone()) });
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/integrations/dnd/willpower", body) }).await;
            this.update(cx, |this, cx| {
                this.willpower.busy = None;
                match result {
                    Ok(v) if v.get("error").is_none() && v.get("payload").is_some_and(Value::is_object) => {
                        this.willpower.spent.insert(key, v["payload"].clone());
                    }
                    Ok(v) => {
                        this.willpower.error.insert(key, v.get("error").and_then(Value::as_str).unwrap_or("The reroll failed.").to_string());
                    }
                    Err(e) => {
                        let text = e.to_string();
                        this.willpower.error.insert(key, if text.is_empty() { "The reroll failed.".into() } else { text });
                    }
                }
                this.remeasure_messages(cx);
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    fn render_rouse(&self, key: &str, card: &Value, cx: &mut Context<Self>) -> AnyElement {
        let success = card.get("success").and_then(Value::as_bool).unwrap_or(false);
        let at_max = card.get("atMax").and_then(Value::as_bool).unwrap_or(false);
        let kind = if success { "win" } else if at_max { "bestial" } else { "fail" };
        let accent: Hsla = rgb(match kind {
            "win" => 0x2f9e6a,
            "bestial" => 0xe0182f,
            _ => 0x7a6f78,
        })
        .into();
        let dice = ints(card, "dice");
        let best = card.get("best").and_then(Value::as_i64).unwrap_or(0);
        let best_at = dice.iter().position(|d| *d == best);
        let label = card.get("label").and_then(Value::as_str).filter(|s| !s.is_empty()).map(String::from);
        let roller = card.get("roller").and_then(Value::as_str).map(|r| format!(" · {r}")).unwrap_or_default();
        let hunger_after = card.get("hungerAfter").and_then(Value::as_i64);
        let mut faces = div().mt(px(6.)).flex().flex_wrap().gap(px(6.));
        for (i, value) in dice.iter().enumerate() {
            let mut face = Face::v5(*value, true, accent);
            face.shadow = Vec::new();
            if Some(i) != best_at {
                face.opacity = 0.45;
                face.struck = true;
            }
            faces = faces.child(face.render());
        }
        let body = div()
            .flex()
            .flex_col()
            .gap(px(3.))
            .child(kicker(format!("{}{roller}", label.clone().unwrap_or_else(|| "Rouse check".into()))))
            .child(badge(card.get("outcome").and_then(Value::as_str).unwrap_or("").to_string(), accent, kind))
            .child(faces);
        let mut again = vec!["/rouse".to_string()];
        if dice.len() > 1 {
            again.push(dice.len().to_string());
        }
        if let Some(h) = hunger_after {
            again.push(format!("h{h}"));
        }
        again.extend(label);
        let command = again.join(" ");
        let tip = hunger_after.map(|h| format!("Rouse again at Hunger {h}")).unwrap_or_else(|| "Rouse again".into());
        let button = again_button(format!("rouse-again-{key}"), "Rouse again", tip, accent).on_click(cx.listener(move |this, _, _, cx| this.run_command(command.clone(), cx))).into_any_element();
        roll_frame(accent, "droplet", best.to_string(), Some("rouse"), body, Some(button))
    }
}
