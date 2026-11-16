//! The D&D bot's compendium cards (components/dnd-card.tsx): EntryCard for spells, monsters,
//! classes, races, feats and items (tags, ability scores that roll a check, facts, sections whose
//! dice and to-hit bonuses roll when clicked, folding past 1100 characters, the source) and
//! SuggestCard's "did you mean" buttons. Rolls go through the slash commands, as the web's do.

use std::ops::Range;

use gpui::{AnyElement, Context, FontStyle, FontWeight, Hsla, InteractiveText, SharedString, StyledText, TextRun, div, font, prelude::*, px, rgb};
use serde_json::Value;

use super::Shell;
use crate::model::Message;
use crate::theme::{DISPLAY_FONT, Theme, mix};
use crate::ui;

/// Past this many characters the full entry folds behind a button.
const FOLD_AT: usize = 1100;

fn accent(kind: &str) -> Hsla {
    rgb(match kind {
        "monster" => 0xd9534f,
        "spell" => 0x5b8def,
        "item" => 0xd49b2a,
        "class" | "subclass" => 0x9b6bdf,
        "race" | "species" => 0x3fa36b,
        "feat" => 0xe0803a,
        _ => return Theme::lavender().into(),
    })
    .into()
}

fn rgba_css(c: Hsla) -> String {
    let c = gpui::Rgba::from(c);
    format!("rgba({}, {}, {}, {})", (c.r * 255.).round(), (c.g * 255.).round(), (c.b * 255.).round(), c.a)
}

enum Piece {
    Text(String),
    Bold(String),
    Italic(String),
    Dc(String),
    /// A chip that rolls: what it shows and the command.
    Roll(String, String),
}

/// INLINE_RE: **bold**, *italic*, "+5 to hit", "2d6 + 3", "DC 15", in the order they come.
fn inline(text: &str, label: &str) -> Vec<Piece> {
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let at = |i: usize| chars.get(i).map(|c| c.1);
    let byte = |i: usize| chars.get(i).map_or(text.len(), |c| c.0);
    let word_char = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric() || c == '_');
    let digits_from = |mut i: usize| {
        let start = i;
        while at(i).is_some_and(|c| c.is_ascii_digit()) {
            i += 1;
        }
        (i > start).then_some(i)
    };
    let mut out = Vec::new();
    let (mut i, mut last) = (0, 0);
    while i < chars.len() {
        let c = chars[i].1;
        let mut matched: Option<(usize, Piece)> = None;
        if c == '*' && at(i + 1) == Some('*') {
            if let Some(end) = (i + 2..chars.len()).find(|&j| at(j) == Some('*')).filter(|&j| j > i + 2 && at(j + 1) == Some('*')) {
                matched = Some((end + 2, Piece::Bold(text[byte(i + 2)..byte(end)].to_string())));
            }
        } else if c == '*' {
            if let Some(end) = (i + 1..chars.len()).find(|&j| at(j) == Some('*')).filter(|&j| j > i + 1) {
                matched = Some((end + 1, Piece::Italic(text[byte(i + 1)..byte(end)].to_string())));
            }
        } else if (c == '+' || c == '-') && let Some(end) = digits_from(i + 1) && text[byte(end)..].starts_with(" to hit") {
            let token = text[byte(i)..byte(end)].to_string();
            let what = if label.is_empty() { "attack".to_string() } else { format!("{label} attack") };
            matched = Some((end + 7, Piece::Roll(format!("{token} to hit"), format!("/roll d20{token} {what}"))));
        } else if c == 'D' && at(i + 1) == Some('C') && at(i + 2) == Some(' ') && !word_char(if i > 0 { at(i - 1) } else { None }) && let Some(end) = digits_from(i + 3) && !word_char(at(end)) {
            matched = Some((end, Piece::Dc(text[byte(i)..byte(end)].to_string())));
        } else if c.is_ascii_digit() && !word_char(if i > 0 { at(i - 1) } else { None }) && let Some(n) = digits_from(i) && at(n) == Some('d') && let Some(mut end) = digits_from(n + 1) {
            // An optional " + 3" (also "−").
            let mut j = end;
            while at(j) == Some(' ') {
                j += 1;
            }
            if matches!(at(j), Some('+' | '-' | '−')) {
                let mut k = j + 1;
                while at(k) == Some(' ') {
                    k += 1;
                }
                if let Some(e) = digits_from(k) {
                    end = e;
                }
            }
            if !word_char(at(end)) {
                let token = text[byte(i)..byte(end)].to_string();
                let expr: String = token.chars().filter(|c| !c.is_whitespace()).collect::<String>().replace('−', "-");
                let command = format!("/roll {expr} {}", if label.is_empty() { String::new() } else { format!("{label} damage") });
                matched = Some((end, Piece::Roll(token, command.trim().to_string())));
            }
        }
        if let Some((end, piece)) = matched {
            if byte(i) > last {
                out.push(Piece::Text(text[last..byte(i)].to_string()));
            }
            out.push(piece);
            last = byte(end);
            i = end;
        } else {
            i += 1;
        }
    }
    if last < text.len() {
        out.push(Piece::Text(text[last..].to_string()));
    }
    out
}

impl Shell {
    /// One line of a section: styled runs, the roll chips clickable (`.dnd-roll-chip`).
    fn dnd_line(&self, id: String, text: &str, label: &str, size: f32, color: Hsla, accent: Hsla, cx: &mut Context<Self>) -> AnyElement {
        let base = font(crate::theme::UI_FONT);
        let mut s = String::new();
        let mut runs: Vec<TextRun> = Vec::new();
        let mut chips: Vec<(Range<usize>, String)> = Vec::new();
        let mut push = |s: &mut String, runs: &mut Vec<TextRun>, t: &str, weight: FontWeight, italic: bool, bg: Option<Hsla>| {
            let mut f = base.clone();
            f.weight = weight;
            if italic {
                f.style = FontStyle::Italic;
            }
            s.push_str(t);
            runs.push(TextRun { len: t.len(), font: f, color, background_color: bg, underline: None, strikethrough: None });
        };
        for piece in inline(text, label) {
            match piece {
                Piece::Text(t) => push(&mut s, &mut runs, &t, FontWeight::NORMAL, false, None),
                Piece::Bold(t) => push(&mut s, &mut runs, &t, FontWeight::BOLD, false, None),
                Piece::Italic(t) => push(&mut s, &mut runs, &t, FontWeight::NORMAL, true, None),
                Piece::Dc(t) => push(&mut s, &mut runs, &t, FontWeight::EXTRA_BOLD, false, None),
                Piece::Roll(t, command) => {
                    // The chip's 5px of padding, as hair spaces inside its tint.
                    let start = s.len();
                    push(&mut s, &mut runs, &format!("\u{2009}{t}\u{2009}"), FontWeight::BOLD, false, Some(accent.opacity(0.16)));
                    chips.push((start..s.len(), command));
                }
            }
        }
        let styled = StyledText::new(SharedString::from(s)).with_runs(runs);
        let body = div().text_size(px(size)).line_height(px(size * 1.55)).text_color(color);
        if chips.is_empty() {
            return body.child(styled).into_any_element();
        }
        let ranges: Vec<Range<usize>> = chips.iter().map(|(r, _)| r.clone()).collect();
        let commands: Vec<String> = chips.into_iter().map(|(_, c)| c).collect();
        let shell = cx.entity().downgrade();
        body.child(InteractiveText::new(SharedString::from(id), styled).on_click(ranges, move |ix, _, cx| {
            if let Some(command) = commands.get(ix).cloned() {
                shell.update(cx, |this, cx| this.run_command(command, cx)).ok();
            }
        }))
        .into_any_element()
    }

    /// RichText: lines become paragraphs (a "• " line a bullet), runs of "a | b" lines a table.
    fn dnd_rich(&self, key: &str, text: &str, name: &str, width: f32, accent: Hsla, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let line_color: Hsla = Theme::line().into();
        let mut col = div().flex().flex_col().gap(px(7.));
        let mut table: Vec<Vec<String>> = Vec::new();
        let flush = |table: &mut Vec<Vec<String>>, col: gpui::Div, n: usize| -> gpui::Div {
            if table.is_empty() {
                return col;
            }
            let rows = std::mem::take(table);
            let cols = rows.iter().map(|r| r.len()).max().unwrap_or(1).max(1);
            let mut grid = div().w(px(width)).flex().flex_col();
            for (r, row) in rows.iter().enumerate() {
                let mut line = div().flex().border_b_1().border_color(line_color);
                for c in 0..cols {
                    let cell = row.get(c).cloned().unwrap_or_default().replace("**", "");
                    line = line.child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .px(px(8.))
                            .py(px(5.))
                            .when(r == 0, |d| d.text_size(px(11.5)).font_weight(FontWeight::BOLD).text_color(muted).child(cell.to_uppercase()))
                            .when(r > 0, |d| d.text_size(px(13.)).text_color(ink).child(cell)),
                    );
                }
                grid = grid.child(line);
            }
            let _ = n;
            col.child(grid)
        };
        for (n, line) in text.split('\n').enumerate() {
            if line.contains(" | ") {
                table.push(line.split(" | ").map(String::from).collect());
                continue;
            }
            col = flush(&mut table, col, n);
            if line.trim().is_empty() {
                continue;
            }
            // The bolded lead ("**Scimitar.**") names the rolls on this line.
            let lead = line.trim_start().trim_start_matches("• ").strip_prefix("**").and_then(|r| r.split_once("**")).map(|(l, _)| l.trim_end_matches('.').to_string());
            let label: String = [name.to_string(), lead.unwrap_or_default()].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join(" ").chars().take(60).collect();
            let bullet = line.trim_start().starts_with("• ");
            let body = if bullet { line.trim_start().trim_start_matches("• ") } else { line };
            // `.message-body p`: the chat text size wins over the card's 14px.
            let text = self.dnd_line(format!("{key}-{n}"), body, &label, 16., ink, accent, cx);
            col = col.child(if bullet {
                div().relative().pl(px(16.)).child(div().absolute().left(px(3.)).top_0().text_size(px(16.)).line_height(px(24.8)).text_color(accent).child("•")).child(text).into_any_element()
            } else {
                text
            });
        }
        col = flush(&mut table, col, usize::MAX);
        col.into_any_element()
    }

    /// DndCard for everything but rolls (those are render_roll_card's).
    pub(super) fn render_dnd_card(&self, message: &Message, column: f32, cx: &mut Context<Self>) -> Option<AnyElement> {
        let p = message.payload.as_ref()?;
        let kind = p.get("type").and_then(Value::as_str).unwrap_or("").to_string();
        if matches!(kind.as_str(), "roll" | "v5" | "rouse") {
            return None;
        }
        let str_of = |k: &str| p.get(k).and_then(Value::as_str).filter(|s| !s.is_empty()).map(String::from);
        let list = |k: &str| p.get(k).and_then(Value::as_array).cloned().unwrap_or_default();
        let name = str_of("name").unwrap_or_default();
        let accent = accent(&kind);
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let width = column.min(720.);
        let inner = width - 2. - 36.;
        let suggest = kind == "suggest";
        let glyph = match kind.as_str() {
            "spell" => "sparkles",
            "monster" => "swords",
            "suggest" => "search",
            _ => "book-open",
        };
        let rune = div()
            .flex_none()
            .size(px(46.))
            .rounded(px(12.))
            .bg(gpui::linear_gradient(135., gpui::linear_color_stop(mix(accent, 0.7, gpui::white()), 0.), gpui::linear_color_stop(accent, 1.)))
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 1., 0.4), offset: gpui::point(px(0.), px(1.)), blur_radius: px(0.), spread_radius: px(0.) }])
            .flex()
            .items_center()
            .justify_center()
            .child(ui::icon(glyph, 20., gpui::white()));
        let image = str_of("image").filter(|_| !suggest);
        let head = div()
            .flex()
            .items_center()
            .gap(px(14.))
            .child(rune)
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(2.))
                    .child(
                        div()
                            .text_size(px(11.))
                            .line_height(px(17.))
                            .font_weight(FontWeight::EXTRA_BOLD)
                            .text_color(ink)
                            .child(if suggest { "COMPENDIUM".to_string() } else { if kind.is_empty() { "Compendium".to_string() } else { kind.clone() }.to_uppercase() }),
                    )
                    .child(div().font_family(DISPLAY_FONT).text_size(px(21.)).line_height(px(25.2)).font_weight(FontWeight::BOLD).text_color(ink).child(name.clone()))
                    .when_some(str_of("subtitle"), |d, s| d.child(div().text_size(px(13.5)).line_height(px(21.)).italic().text_color(muted).child(s))),
            )
            .when_some(image, |d, src| {
                d.child(
                    div().flex_none().size(px(88.)).rounded(px(12.)).bg(accent.opacity(0.08)).child(
                        gpui::img(ui::cover(gpui::Resource::Uri(self.client.absolute(&super::links::proxied(&src)).into()), 1.)).size(px(88.)).rounded(px(12.)).object_fit(gpui::ObjectFit::Contain),
                    ),
                )
            });
        let mut card = div().flex().flex_col().child(head);
        let key = format!("dnd-{}", message.id);

        if suggest {
            let lookup = str_of("lookupKind").unwrap_or_else(|| "spell".into());
            let mut row = div().mt(px(14.)).flex().flex_wrap().gap(px(8.));
            for (n, s) in list("suggestions").iter().filter_map(Value::as_str).enumerate() {
                let command = format!("/{lookup} {s}");
                row = row.child(
                    div()
                        .id(SharedString::from(format!("{key}-s{n}")))
                        .px(px(13.))
                        .py(px(5.))
                        .rounded_full()
                        .bg(accent.opacity(0.10))
                        .border_1()
                        .border_color(accent.opacity(0.35))
                        .text_size(px(13.5))
                        .line_height(px(20.9))
                        .text_color(ink)
                        .cursor_pointer()
                        .hover(move |st| st.bg(accent.opacity(0.22)))
                        .child(s.to_string())
                        .on_click(cx.listener(move |this, _, _, cx| this.run_command(command.clone(), cx))),
                );
            }
            card = card.child(row);
        } else {
            let tags: Vec<String> = list("tags").iter().filter_map(Value::as_str).map(String::from).collect();
            if !tags.is_empty() {
                card = card.child(div().mt(px(12.)).flex().flex_wrap().gap(px(6.)).children(tags.into_iter().map(|t| {
                    div().px(px(10.)).py(px(2.)).rounded_full().bg(accent.opacity(0.14)).border_1().border_color(accent.opacity(0.35)).text_size(px(12.)).line_height(px(18.6)).font_weight(FontWeight::BOLD).text_color(ink).child(t)
                })));
            }
            let abilities = list("abilities");
            if !abilities.is_empty() {
                let cell_w = (inner - 6. * 5.) / 6.;
                let mut row = div().mt(px(14.)).flex().gap(px(6.));
                for (n, a) in abilities.iter().enumerate() {
                    let label = a.get("label").and_then(Value::as_str).unwrap_or("").to_string();
                    let score = a.get("score").map(|v| v.to_string()).unwrap_or_default();
                    let m = a.get("mod").and_then(Value::as_str).unwrap_or("").to_string();
                    let command = format!("/roll d20{m} {name} {label} check");
                    row = row.child(
                        div()
                            .id(SharedString::from(format!("{key}-a{n}")))
                            .w(px(cell_w))
                            .py(px(7.))
                            .px(px(4.))
                            .rounded(px(10.))
                            .bg(accent.opacity(0.08))
                            .border_1()
                            .border_color(accent.opacity(0.28))
                            .flex()
                            .flex_col()
                            .items_center()
                            .gap(px(1.))
                            .cursor_pointer()
                            .hover(move |st| st.bg(accent.opacity(0.18)))
                            .tooltip(ui::tooltip(format!("Roll a {label} check (d20{m})")))
                            .child(div().text_size(px(11.)).line_height(px(17.)).font_weight(FontWeight::EXTRA_BOLD).text_color(muted).child(label.clone()))
                            .child(div().text_size(px(17.)).line_height(px(18.7)).font_weight(FontWeight::BOLD).text_color(ink).child(score))
                            .child(div().text_size(px(12.5)).line_height(px(19.4)).font_weight(FontWeight::BOLD).text_color(muted).child(m))
                            .on_click(cx.listener(move |this, _, _, cx| this.run_command(command.clone(), cx))),
                    );
                }
                card = card.child(row);
            }
            // `.dnd-facts`: columns of at least 160px, long values across the whole row.
            let facts = list("facts");
            if !facts.is_empty() {
                let cols = (((inner + 8.) / 168.).floor() as usize).max(1);
                let cell_w = (inner - 8. * (cols as f32 - 1.)) / cols as f32;
                let mut grid = div().mt(px(14.)).flex().flex_wrap().gap(px(8.));
                let mut used = 0;
                for f in &facts {
                    let label = f.get("label").and_then(Value::as_str).unwrap_or("").to_string();
                    let value = f.get("value").and_then(Value::as_str).unwrap_or("").to_string();
                    let wide = value.chars().count() > 42;
                    let w = if wide { inner } else { cell_w };
                    if wide && used > 0 {
                        used = 0;
                    }
                    used = if wide { 0 } else { (used + 1) % cols };
                    grid = grid.child(
                        div()
                            .w(px(w))
                            .px(px(11.))
                            .py(px(8.))
                            .rounded(px(10.))
                            .bg(accent.opacity(0.07))
                            .border_1()
                            .border_color(accent.opacity(0.22))
                            .child(div().text_size(px(11.)).line_height(px(17.)).font_weight(FontWeight::EXTRA_BOLD).text_color(muted).child(label.to_uppercase()))
                            .child(div().mt(px(3.)).text_size(px(14.)).line_height(px(21.7)).font_weight(FontWeight::SEMIBOLD).text_color(ink).child(value)),
                    );
                }
                card = card.child(grid);
            }
            // Sections (or the older one-paragraph description), folded past FOLD_AT.
            let mut all: Vec<(String, String)> = list("sections")
                .iter()
                .map(|s| (s.get("title").and_then(Value::as_str).unwrap_or("").to_string(), s.get("body").and_then(Value::as_str).unwrap_or("").to_string()))
                .collect();
            if all.is_empty()
                && let Some(d) = str_of("description")
            {
                all.push((String::new(), d));
            }
            let total: usize = all.iter().map(|(_, b)| b.encode_utf16().count()).sum();
            let foldable = total > FOLD_AT;
            let expanded = self.dnd_expanded.contains(&message.id);
            let keep = |(i, (title, _)): &(usize, &(String, String))| *i == 0 || title == "Actions";
            let visible: Vec<(usize, &(String, String))> = all.iter().enumerate().filter(|e| !foldable || expanded || keep(e)).collect();
            let hidden: Vec<String> = if foldable && !expanded { all.iter().enumerate().filter(|e| !keep(e)).map(|(_, (t, _))| t.clone()).filter(|t| !t.is_empty()).collect() } else { Vec::new() };
            let show_fold = foldable && (expanded || visible.len() < all.len());
            for (i, (title, body)) in visible {
                card = card.child(
                    div()
                        .mt(px(14.))
                        .pt(px(12.))
                        .border_t_1()
                        .border_color(Theme::line())
                        .when(!title.is_empty(), |d| {
                            d.child(div().mb(px(6.)).text_size(px(12.)).line_height(px(18.6)).font_weight(FontWeight::EXTRA_BOLD).text_color(ink).child(title.to_uppercase()))
                        })
                        .child(self.dnd_rich(&format!("{key}-{i}"), body, &name, inner, accent, cx)),
                );
            }
            if show_fold {
                let id = message.id.clone();
                let label = if expanded { "Show less".to_string() } else if !hidden.is_empty() { format!("Show {}", hidden.join(", ").to_lowercase()) } else { "Show the full entry".to_string() };
                card = card.child(
                    div()
                        .id(SharedString::from(format!("{key}-fold")))
                        .mt(px(12.))
                        .p(px(7.))
                        .rounded(px(9.))
                        .border_1()
                        .border_dashed()
                        .border_color(accent.opacity(0.45))
                        .flex()
                        .justify_center()
                        .text_size(px(13.))
                        .line_height(px(20.15))
                        .font_weight(FontWeight::BOLD)
                        .text_color(ink)
                        .cursor_pointer()
                        .child(label)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if !this.dnd_expanded.remove(&id) {
                                this.dnd_expanded.insert(id.clone());
                            }
                            this.remeasure_messages(cx);
                        })),
                );
            }
            let source = str_of("source").map(|s| match p.get("page").and_then(Value::as_i64) {
                Some(n) if n > 0 => format!("{s}, p. {n}"),
                _ => s,
            });
            let others: Vec<String> = list("otherVersions").iter().filter_map(Value::as_str).map(String::from).collect();
            if source.is_some() || !others.is_empty() {
                card = card.child(
                    div()
                        .mt(px(14.))
                        .pt(px(10.))
                        .border_t_1()
                        .border_color(Theme::line())
                        .flex()
                        .flex_wrap()
                        .justify_between()
                        .gap_x(px(14.))
                        .gap_y(px(4.))
                        .text_size(px(12.))
                        .line_height(px(18.6))
                        .text_color(muted)
                        .children(source)
                        .when(!others.is_empty(), |d| d.child(format!("Also in {}", others.join(", ")))),
                );
            }
        }
        let bg = ui::css_static(format!("radial-gradient(circle at 100% 0, {} 0%, rgba(0, 0, 0, 0) 45%)", rgba_css(accent.opacity(0.14))));
        Some(
            div()
                .relative()
                .mt(px(8.))
                .w(px(width))
                .rounded(px(14.))
                .bg(Theme::panel())
                .border_1()
                .border_color(mix(accent, 0.34, Theme::line()))
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.08), offset: gpui::point(px(0.), px(10.)), blur_radius: px(30.), spread_radius: px(0.) }])
                .child(ui::css_background(bg, 14.))
                .child(div().relative().px(px(18.)).py(px(16.)).child(card))
                .into_any_element(),
        )
    }

    /// Rows changed height: the list measures them again.
    pub(super) fn remeasure_messages(&mut self, cx: &mut Context<Self>) {
        if let Some(list) = self.channel_id.as_ref().and_then(|c| self.messages.get(c)) {
            self.list.splice(0..list.len(), list.len());
        }
        cx.notify();
    }
}
