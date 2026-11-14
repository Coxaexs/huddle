//! Bot cards that take the place of a message's text: LyricsNow (components/lyrics-now.tsx) and
//! the /ask answer (components/ai-answer-card.tsx).

use gpui::{AnyElement, FontWeight, Hsla, Pixels, SharedString, Window, div, prelude::*, px, rgb, rgba};
use serde_json::Value;

use super::Shell;
use crate::model::Message;
use crate::theme::{Theme, mix};
use crate::ui;

/// Kinds whose card shows instead of the message's own text.
pub fn replaces_text(message: &Message) -> bool {
    match message.kind.as_deref() {
        Some("lyricsnow") => message.payload.as_ref().and_then(|p| p.get("lines")).is_some_and(|l| l.is_array()),
        Some("ai") => true,
        Some("poll") => message.payload.as_ref().and_then(|p| p.get("pollId")).is_some(),
        Some(k) if super::music_cards::KINDS.contains(&k) => message.payload.is_some(),
        Some("dnd") => message.payload.as_ref().and_then(|p| p.get("type")).and_then(Value::as_str) == Some("roll"),
        _ => false,
    }
}

fn timestamp(seconds: f64) -> String {
    let whole = seconds.max(0.).floor() as u64;
    format!("{}:{:02}", whole / 60, whole % 60)
}

impl Shell {
    /// `.lyrics-now`: header (note in a lavender circle, "Lyrics now", track — artist, expand), the
    /// lines with their times (260px, scrolling), "Lyrics from LRCLIB".
    pub(super) fn render_lyrics_card(&self, message: &Message, width: Pixels, window: &Window) -> Option<AnyElement> {
        let payload = message.payload.as_ref()?;
        let lines = payload.get("lines")?.as_array()?;
        let track = match payload.get("track") {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Object(o)) => o.get("title").and_then(Value::as_str).unwrap_or_default().to_string(),
            _ => String::new(),
        };
        let artist = payload.get("artist").and_then(Value::as_str).unwrap_or_default().to_string();
        let subtitle = [track.as_str(), artist.as_str()].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join(" — ");
        let loose = payload.get("loose").and_then(Value::as_bool).unwrap_or(false);
        let musixmatch = payload.get("source").and_then(Value::as_str) == Some("musixmatch");
        let source_url = payload.get("sourceUrl").and_then(Value::as_str).filter(|u| {
            if musixmatch { u.starts_with("https://www.musixmatch.com/") } else { u.starts_with("https://lrclib.net/") }
        });
        let link = source_url.map(str::to_string).unwrap_or_else(|| if musixmatch { "https://www.musixmatch.com/".into() } else { "https://lrclib.net/".into() });
        let muted: Hsla = Theme::muted().into();

        // The header row shrinks like Chrome's flexbox: the note circle gives way to a long title.
        let inner = f32::from(width) - 30. - 2.;
        let text_natural = f32::from(ui::text_width(window, &subtitle, FontWeight::NORMAL, 12.8)).max(f32::from(ui::text_width(window, "Lyrics now", FontWeight::BOLD, 13.)));
        let shrunk = ui::css_shrink(&[px(30.), px(text_natural)], &[px(16.), px(0.)], px(inner - 30. - 20.));
        let icon_w = shrunk[0];

        let mut rows = div().id(SharedString::from(format!("lyrics-{}", message.id))).max_h(px(260.)).overflow_y_scroll().flex().flex_col().gap(px(2.));
        for (n, line) in lines.iter().enumerate() {
            let at = line.get("at").and_then(Value::as_f64).unwrap_or(0.);
            let text = line.get("line").and_then(Value::as_str).unwrap_or_default().to_string();
            let active = line.get("active").and_then(Value::as_bool).unwrap_or(false);
            rows = rows.child(
                div()
                    .id(SharedString::from(format!("lyric-{}-{n}", message.id)))
                    .flex_none()
                    .flex()
                    .gap(px(8.))
                    .px(px(8.))
                    .py(px(5.))
                    .rounded(px(6.))
                    .border_l(px(2.))
                    .border_color(if active { Theme::lavender().into() } else { gpui::transparent_black() })
                    .when(active, |d| d.bg(Hsla::from(Theme::lavender()).opacity(0.12)).font_weight(FontWeight::BOLD))
                    .text_size(px(12.))
                    .line_height(px(16.2))
                    .text_color(if active { Theme::ink().into() } else { muted })
                    .child(div().flex_none().w(px(38.)).opacity(0.65).child(timestamp(at)))
                    .child(div().flex_1().min_w_0().child(text)),
            );
        }
        let mut card = div()
            .mt(px(8.))
            .w(width)
            .max_w(px(560.))
            .px(px(15.))
            .py(px(13.))
            .rounded(px(14.))
            .border_1()
            .border_color(Hsla::from(Theme::lavender()).opacity(0.33))
            .bg(gpui::linear_gradient(
                135.,
                gpui::linear_color_stop(mix(Theme::lavender(), 0.10, Theme::panel()), 0.),
                gpui::linear_color_stop(Theme::panel(), 1.),
            ))
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.094), offset: gpui::point(px(0.), px(14.)), blur_radius: px(34.), spread_radius: px(0.) }])
            .flex()
            .flex_col()
            .child(
                div()
                    .mb(px(10.))
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .child(
                        div()
                            .flex_none()
                            .w(icon_w)
                            .h(px(30.))
                            .rounded_full()
                            .bg(Theme::lavender())
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(ui::icon("music-2", 16., rgb(0x15121f))),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child("Lyrics now"))
                            .when(!subtitle.is_empty(), |d| {
                                d.child(
                                    div()
                                        .whitespace_nowrap()
                                        .overflow_hidden()
                                        .text_size(px(12.8))
                                        .line_height(px(19.2))
                                        .text_color(muted)
                                        .child(ui::fit(window, &subtitle, FontWeight::NORMAL, 12.8, shrunk[1])),
                                )
                            }),
                    )
                    .child(
                        div()
                            .flex_none()
                            .size(px(30.))
                            .rounded_full()
                            .border_1()
                            .border_color(rgba(0xffffff12))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(ui::icon("maximize-2", 15., muted)),
                    ),
            );
        if loose {
            let sample: String = lines.iter().take(2).filter_map(|l| l.get("line").and_then(Value::as_str)).map(|l| format!(" “{l}”")).collect::<Vec<_>>().join(" /");
            card = card.child(div().mb(px(8.)).text_size(px(12.)).text_color(muted).child(format!("Matched by song name only. Is this the right song?{sample}")));
        }
        card = card.child(rows);
        if !lines.is_empty() {
            card = card.child(
                div()
                    .id(SharedString::from(format!("lyrics-src-{}", message.id)))
                    .mt(px(8.))
                    .flex()
                    .text_size(px(11.))
                    .line_height(px(15.4))
                    .text_color(muted)
                    .child("Lyrics from\u{00A0}")
                    .child(div().underline().cursor_pointer().child(if musixmatch { "Musixmatch" } else { "LRCLIB" }))
                    .on_click(move |_, _, cx| cx.open_url(&link)),
            );
        }
        Some(card.into_any_element())
    }

    /// `.ai-card`: the question in lavender with a sparkle, the answer, "Ask a follow-up".
    pub(super) fn render_ai_card(&self, message: &Message, body: AnyElement) -> AnyElement {
        let question = message.payload.as_ref().and_then(|p| p.get("question")).and_then(Value::as_str).unwrap_or_default().to_string();
        div()
            .mt(px(6.))
            .max_w(px(720.))
            .pl(px(14.))
            .pr(px(14.))
            .py(px(10.))
            .rounded(px(10.))
            .border_1()
            .border_l(px(3.))
            .border_color(mix(Theme::lavender(), 0.30, Theme::line()))
            .bg(gpui::linear_gradient(
                145.,
                gpui::linear_color_stop(mix(Theme::lavender(), 0.10, Theme::panel()), 0.),
                gpui::linear_color_stop(Theme::panel(), 0.5),
            ))
            .relative()
            // The thick left edge is all lavender.
            .child(div().absolute().left(px(-3.)).top(px(-1.)).bottom(px(-1.)).w(px(3.)).rounded_l(px(10.)).bg(Theme::lavender()))
            .text_size(px(14.))
            .line_height(px(21.))
            .flex()
            .flex_col()
            .when(!question.is_empty(), |d| {
                d.child(
                    div()
                        .mb(px(6.))
                        .flex()
                        .items_start()
                        .gap(px(6.))
                        .text_size(px(13.))
                        .line_height(px(19.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(Theme::lavender())
                        .child(div().mt(px(2.)).flex_none().child(ui::icon("sparkles", 14., Theme::lavender())))
                        .child(div().flex_1().min_w_0().child(question)),
                )
            })
            .child(body)
            .child(
                div().mt(px(8.)).flex().flex_wrap().gap(px(6.)).child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(5.))
                        .px(px(10.))
                        .py(px(3.))
                        .rounded_full()
                        .border_1()
                        .border_color(rgba(0xffffff12))
                        .text_size(px(12.))
                        .line_height(px(18.))
                        .text_color(Theme::lavender())
                        .child(ui::icon("message-square", 13., Theme::lavender()))
                        .child("Ask a follow-up"),
                ),
            )
            .into_any_element()
    }
}

/// The D&D card's accent for a roll: gold on a natural 20, red on a natural 1, else lavender.
fn roll_accent(nat20: bool, nat1: bool) -> Hsla {
    if nat20 {
        rgb(0xd4a017).into()
    } else if nat1 {
        rgb(0xd9534f).into()
    } else {
        Theme::lavender().into()
    }
}

impl Shell {
    /// DndCard's RollCard (components/dnd-card.tsx): the total in a box, what was rolled, each die,
    /// "Roll again".
    pub(super) fn render_roll_card(&self, message: &Message) -> Option<AnyElement> {
        let p = message.payload.as_ref()?;
        if p.get("type").and_then(Value::as_str) != Some("roll") || p.get("secret").and_then(Value::as_bool) == Some(true) {
            return None;
        }
        let dice = p.get("dice").and_then(Value::as_array).cloned().unwrap_or_default();
        let kept_d20: Vec<i64> = dice
            .iter()
            .filter(|d| d.get("sides").and_then(Value::as_i64) == Some(20))
            .flat_map(|d| d.get("rolls").and_then(Value::as_array).cloned().unwrap_or_default())
            .filter(|r| r.get("kept").and_then(Value::as_bool).unwrap_or(true))
            .filter_map(|r| r.get("value").and_then(Value::as_i64))
            .collect();
        let nat20 = kept_d20.contains(&20);
        let nat1 = !nat20 && kept_d20.contains(&1);
        let accent = roll_accent(nat20, nat1);
        let muted: Hsla = Theme::muted().into();
        let total = match p.get("total") {
            Some(Value::Number(n)) => n.to_string(),
            _ => String::new(),
        };
        let label = p.get("label").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or("Dice roll").to_string();
        let roller = p.get("roller").and_then(Value::as_str).map(|r| format!(" · {r}")).unwrap_or_default();
        let expression = p.get("expression").and_then(Value::as_str).unwrap_or_default().to_string();
        let mode = p.get("mode").and_then(Value::as_str).filter(|m| !m.is_empty()).map(|m| format!(" · {m}")).unwrap_or_default();
        let modifier = p.get("modifier").and_then(Value::as_i64).unwrap_or(0);

        let die = |text: String, sides: Option<i64>, kept: bool, max: bool, min: bool| {
            let (fg, bg, border): (Hsla, Hsla, Hsla) = if max {
                (rgb(0xc8940f).into(), rgba(0xf5c84233).into(), rgb(0xd4a017).into())
            } else if min {
                (rgb(0xd9534f).into(), rgba(0xd9534f22).into(), rgb(0xd9534f).into())
            } else {
                (Theme::ink().into(), mix(accent, 0.09, Theme::panel()), accent.opacity(0.32))
            };
            div()
                .flex()
                .items_baseline()
                .justify_center()
                .gap(px(3.))
                .min_w(px(34.))
                .px(px(8.))
                .py(px(3.))
                .rounded(px(8.))
                .bg(bg)
                .border_1()
                .border_color(border)
                .text_size(px(15.))
                .line_height(px(23.25))
                .font_weight(FontWeight::EXTRA_BOLD)
                .text_color(fg)
                .when(!kept, |d| d.opacity(0.45).line_through())
                .child(text)
                .when_some(sides, |d, s| d.child(div().text_size(px(10.5)).line_height(px(16.3)).font_weight(FontWeight::BOLD).text_color(muted).child(format!("d{s}"))))
        };
        let mut faces = div().mt(px(6.)).flex().flex_wrap().gap(px(6.));
        for d in &dice {
            let sides = d.get("sides").and_then(Value::as_i64).unwrap_or(0);
            let minus = d.get("sign").and_then(Value::as_i64) == Some(-1);
            for roll in d.get("rolls").and_then(Value::as_array).cloned().unwrap_or_default() {
                let value = roll.get("value").and_then(Value::as_i64).unwrap_or(0);
                let kept = roll.get("kept").and_then(Value::as_bool).unwrap_or(true);
                let text = format!("{}{value}", if minus { "−" } else { "" });
                faces = faces.child(die(text, Some(sides), kept, sides == 20 && kept && value == 20, sides == 20 && kept && value == 1));
            }
        }
        if modifier != 0 {
            let text = if modifier > 0 { format!("+{modifier}") } else { format!("−{}", modifier.abs()) };
            faces = faces.child(die(text, None, true, false, false).text_color(muted));
        }
        let details: Vec<String> = p.get("details").and_then(Value::as_array).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
        let mut body = div()
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(3.))
            .child(div().text_size(px(11.)).line_height(px(17.05)).font_weight(FontWeight::EXTRA_BOLD).text_color(Theme::ink()).child(format!("{label}{roller}").to_uppercase()))
            .child(div().text_size(px(13.5)).line_height(px(20.9)).text_color(muted).child(format!("{expression}{mode}")));
        if nat20 || nat1 {
            body = body.child(
                div().flex().child(
                    div()
                        .px(px(10.))
                        .py(px(1.))
                        .rounded_full()
                        .bg(accent)
                        .text_size(px(12.))
                        .line_height(px(18.6))
                        .font_weight(FontWeight::EXTRA_BOLD)
                        .text_color(gpui::white())
                        .child(if nat20 { "NATURAL 20" } else { "NATURAL 1" }),
                ),
            );
        }
        body = if dice.is_empty() {
            let mut chips = div().mt(px(6.)).flex().flex_wrap().gap(px(6.));
            for detail in details {
                chips = chips.child(
                    div()
                        .px(px(8.))
                        .py(px(3.))
                        .rounded(px(7.))
                        .bg(accent.opacity(0.09))
                        .border_1()
                        .border_color(accent.opacity(0.28))
                        .font_family(crate::theme::MONO_FONT)
                        .text_size(px(12.5))
                        .text_color(Theme::ink())
                        .child(detail),
                );
            }
            body.child(chips)
        } else {
            body.child(faces)
        };
        let css = if nat20 {
            "radial-gradient(circle at 100% 0, rgba(212, 160, 23, 0.14), transparent 45%)"
        } else if nat1 {
            "radial-gradient(circle at 100% 0, rgba(217, 83, 79, 0.14), transparent 45%)"
        } else {
            "radial-gradient(circle at 100% 0, rgba(167, 139, 250, 0.14), transparent 45%)"
        };
        Some(
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
                // The total and the dice sit in the middle; "Roll again" at the top.
                .flex()
                .gap(px(16.))
                .text_size(px(14.))
                .line_height(px(21.7))
                .child(div().flex_none().flex().items_center().child(
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
                        .child(ui::icon("dices", 18., Theme::ink()))
                        .child(div().font_family(crate::theme::DISPLAY_FONT).text_size(px(34.)).line_height(px(34.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(total)),
                ))
                .child(div().flex_1().min_w_0().flex().flex_col().justify_center().child(body))
                .when(!expression.is_empty(), |d| {
                    d.child(
                        div()
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
                            .child("Roll again"),
                    )
                })
                .into_any_element(),
        )
    }
}
