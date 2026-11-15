//! Conversation games (components/game-card.tsx, lib/games.ts): the Games picker above the composer
//! and the card a game lives in: Tic-Tac-Toe, Four in a Row, Rock Paper Scissors, Minesweeper Flags
//! and Rota. Moves go to /api/games; the new state comes back as an edit of the message.

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb, rgba};
use serde_json::{Value, json};

use super::Shell;
use crate::model::Message;
use crate::theme::{Theme, mix};

/// GAME_INFO: kind, name, emoji, blurb.
pub(super) const GAMES: [(&str, &str, &str, &str); 5] = [
    ("tictactoe", "Tic-Tac-Toe", "⭕", "Three in a row on a 3×3 grid."),
    ("connect4", "Four in a Row", "🔴", "Drop counters; line up four."),
    ("rps", "Rock Paper Scissors", "✊", "Best of three, throws stay hidden."),
    ("mines", "Minesweeper Flags", "🚩", "Find the mines; first to 26 wins."),
    ("rota", "Rota", "🗺️", "Name countries to link two on the map."),
];
const SOLO_GAMES: [&str; 1] = ["rota"];
const MINES_SIZE: usize = 16;
const MINES_TO_WIN: i64 = 26;
const THROWS: [(&str, &str); 3] = [("rock", "✊"), ("paper", "✋"), ("scissors", "✌️")];

fn info(kind: &str) -> (&'static str, &'static str, &'static str) {
    GAMES.iter().find(|g| g.0 == kind).map(|g| (g.1, g.2, g.3)).unwrap_or(("Game", "🎲", ""))
}

/// Each seat's piece.
fn pieces(kind: &str) -> [&'static str; 2] {
    match kind {
        "tictactoe" => ["✕", "◯"],
        "connect4" => ["🔴", "🟡"],
        "mines" => ["🚩", "🚩"],
        _ => ["", ""],
    }
}

/// tictactoeLine(): the winning three, if any.
fn tictactoe_line(board: &[u8]) -> Option<[usize; 3]> {
    const LINES: [[usize; 3]; 8] = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    LINES.into_iter().find(|l| board.get(l[0]).is_some_and(|c| *c != b'.') && board.get(l[0]) == board.get(l[1]) && board.get(l[1]) == board.get(l[2]))
}

/// connect4Line(): the winning four, if any (7 columns × 6 rows, row 0 at the top).
fn connect4_line(board: &[u8]) -> Option<Vec<usize>> {
    if board.len() != 42 {
        return None;
    }
    for r in 0..6i32 {
        for c in 0..7i32 {
            let me = board[(r * 7 + c) as usize];
            if me == b'.' {
                continue;
            }
            for (dr, dc) in [(0, 1), (1, 0), (1, 1), (1, -1)] {
                let cells: Vec<usize> = (0..4).map(|k| (r + dr * k, c + dc * k)).filter(|(y, x)| (0..6).contains(y) && (0..7).contains(x)).map(|(y, x)| (y * 7 + x) as usize).collect();
                if cells.len() == 4 && cells.iter().all(|&i| board[i] == me) {
                    return Some(cells);
                }
            }
        }
    }
    None
}

fn strip_style(text: &str) -> String {
    crate::markdown::inline(text, "").text
}

impl Shell {
    pub(super) fn start_game(&mut self, kind: &'static str, solo: bool, cx: &mut Context<Self>) {
        let Some(channel) = self.channel_id.clone() else { return };
        self.games_open = false;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/games", json!({ "action": "start", "channelId": channel, "kind": kind, "solo": solo })) }).await;
            this.update(cx, |this, cx| {
                if let Err(e) = result {
                    this.status = Some(if e.to_string().is_empty() { "Couldn't start the game.".to_string() } else { e.to_string() }.into());
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// act(): a move, join, decline or resign.
    pub(super) fn game_act(&mut self, message: String, action: &'static str, mv: Value, cx: &mut Context<Self>) {
        if !self.game_busy.insert(message.clone()) {
            return;
        }
        self.game_errors.remove(&message);
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let id = message.clone();
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/games", json!({ "action": action, "messageId": id, "move": mv })) }).await;
            this.update(cx, |this, cx| {
                this.game_busy.remove(&message);
                if let Err(e) = result {
                    this.game_errors.insert(message, if e.to_string().is_empty() { "That didn't work.".into() } else { e.to_string() });
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// GamesPicker: above the composer.
    pub(super) fn render_games_picker(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.games_open {
            return None;
        }
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let mut list = div().flex().flex_col().gap(px(6.));
        // repeat(auto-fill, minmax(200px, 1fr)): two columns at the composer's width here.
        for pair in GAMES.chunks(2) {
            let mut line = div().flex().gap(px(6.));
            for (kind, name, emoji, blurb) in pair {
                let kind: &'static str = kind;
                let mut row = div().flex_1().min_w_0().flex().gap(px(4.)).child(
                    div()
                        .id(SharedString::from(format!("game-{kind}")))
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .px(px(10.))
                        .py(px(8.))
                        .rounded(px(10.))
                        .bg(ink.opacity(0.05))
                        .border_1()
                        .border_color(gpui::transparent_black())
                        .cursor_pointer()
                        .hover(move |s| s.border_color(lavender.opacity(0.5)))
                        .child(div().text_size(px(22.)).child(*emoji))
                        .child(div().min_w_0().flex().flex_col().child(div().font_weight(FontWeight::BOLD).child(*name)).child(div().text_size(px(10.83)).line_height(px(16.25)).text_color(muted).child(*blurb)))
                        .on_click(cx.listener(move |this, _, _, cx| this.start_game(kind, false, cx))),
                );
                if SOLO_GAMES.contains(&kind) {
                    row = row.child(
                        div()
                            .id(SharedString::from(format!("game-solo-{kind}")))
                            .flex_none()
                            .px(px(10.))
                            .rounded(px(10.))
                            .bg(ink.opacity(0.05))
                            .border_1()
                            .border_color(gpui::transparent_black())
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_size(px(12.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .cursor_pointer()
                            .hover(move |s| s.border_color(lavender.opacity(0.5)))
                            .child("Play alone")
                            .on_click(cx.listener(move |this, _, _, cx| this.start_game(kind, true, cx))),
                    );
                }
                line = line.child(row);
            }
            if pair.len() == 1 {
                line = line.child(div().flex_1());
            }
            list = list.child(line);
        }
        let in_voice = self.call.is_some();
        Some(
            div()
                .id("games-picker")
                .mb(px(8.))
                .px(px(12.))
                .py(px(10.))
                .rounded(px(16.))
                .bg(Theme::panel())
                .border_1()
                .border_color(ink.opacity(0.12))
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(24.)), blur_radius: px(60.), spread_radius: px(0.) }])
                .text_size(px(13.))
                .line_height(px(19.5))
                .text_color(ink)
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(div().font_weight(FontWeight::BOLD).child("Games"))
                        .child(div().id("games-close").text_size(px(18.)).text_color(muted).cursor_pointer().child("×").on_click(cx.listener(|this, _, _, cx| {
                            this.games_open = false;
                            cx.notify();
                        }))),
                )
                .child(div().mt(px(4.)).mb(px(8.)).text_color(muted).child("Invite everyone in this conversation to play:"))
                .child(list)
                .child(
                    div()
                        .id("games-more")
                        .mt(px(8.))
                        .p(px(6.))
                        .flex()
                        .justify_center()
                        .text_color(lavender)
                        .cursor_pointer()
                        .child(if in_voice { "Voice activities: Whiteboard, Draw & Guess, DeepPixel…" } else { "Join a voice room for Whiteboard, Draw & Guess and more" })
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.games_open = false;
                            if let Some(room) = this.call.as_ref().map(|c| c.channel_id.clone()) {
                                this.open_stage(room, window, cx);
                            }
                            cx.notify();
                        })),
                )
                .into_any_element(),
        )
    }

    /// GameCard for a `game` message.
    pub(super) fn render_game(&self, message: &Message, width: f32, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        if message.kind.as_deref() != Some("game") {
            return None;
        }
        let game = message.payload.as_ref()?.get("game")?.clone();
        let kind = game["kind"].as_str().unwrap_or_default().to_string();
        let kind_static: &'static str = GAMES.iter().find(|g| g.0 == kind).map(|g| g.0).unwrap_or("tictactoe");
        let (name, emoji, _) = info(&kind);
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let status = game["status"].as_str().unwrap_or_default();
        let players = game["players"].as_array().cloned().unwrap_or_default();
        let host = players.first().cloned().unwrap_or(Value::Null);
        let guest = players.get(1).cloned().filter(|g| !g.is_null());
        let seat: Option<usize> = if host["id"] == self.me.id.as_str() {
            Some(0)
        } else if guest.as_ref().is_some_and(|g| g["id"] == self.me.id.as_str()) {
            Some(1)
        } else {
            None
        };
        let turn = game["turn"].as_u64().unwrap_or(0) as usize;
        let solo = game["solo"] == true;
        let my_turn = status == "playing" && seat.is_some() && (kind == "rps" || Some(turn) == seat);
        let over = status == "won" || status == "draw";
        let winner = game["winner"].as_u64().map(|w| w as usize);
        let name_of = |i: usize| strip_style(if i == 0 { host["name"].as_str().unwrap_or_default() } else { guest.as_ref().and_then(|g| g["name"].as_str()).unwrap_or("…") });
        let busy = self.game_busy.contains(&message.id);
        let rps = &game["rps"];
        let line = match status {
            "waiting" => {
                if seat == Some(0) {
                    "Waiting for someone to accept…".to_string()
                } else {
                    format!("{} has invited you to play {name}.", name_of(0))
                }
            }
            "declined" => "The invitation was declined.".into(),
            "cancelled" => {
                if solo {
                    format!("{} gave up.", name_of(0))
                } else {
                    format!("{} cancelled the invitation.", name_of(0))
                }
            }
            "draw" => (if solo { "Out of guesses!" } else { "It's a draw!" }).into(),
            "won" => {
                if winner == seat && seat.is_some() {
                    "You won! 🎉".into()
                } else {
                    format!("{} won!", name_of(winner.unwrap_or(0)))
                }
            }
            _ if solo => {
                if seat == Some(0) {
                    "Name a country.".into()
                } else {
                    format!("{} is playing solo.", name_of(0))
                }
            }
            _ if kind == "rps" => {
                let round = rps["round"].as_i64().unwrap_or(1);
                match seat {
                    Some(s) if rps["thrown"][s] == true => format!("Waiting for {} to throw…", name_of(1 - s)),
                    Some(_) => format!("Round {round}: pick your throw."),
                    None => format!("Round {round}"),
                }
            }
            _ => {
                if my_turn {
                    "Your turn.".into()
                } else {
                    format!("{}'s turn.", name_of(turn))
                }
            }
        };

        let mut card = div()
            .relative()
            .mt(px(8.))
            .w(px(width.min(if kind == "mines" { 460. } else { 420. })))
            .px(px(14.))
            .py(px(12.))
            .rounded(px(14.))
            .bg(mix(Theme::paper(), 0.92, Theme::lavender()))
            .border_1()
            .border_color(mix(Theme::line(), 0.7, Theme::lavender()))
            .when(my_turn, |d| d.shadow(vec![gpui::BoxShadow { color: lavender.opacity(0.55), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(2.) }]))
            .text_color(ink);
        if status == "won" {
            let text = if winner == seat && seat.is_some() { "🏆 You win!".to_string() } else { format!("🏆 {} wins!", name_of(winner.unwrap_or(0))) };
            card = card.child(div().mb(px(8.)).px(px(10.)).py(px(5.)).rounded(px(6.)).border_1().border_color(rgb(0xe0b030)).bg(gpui::linear_gradient(180., gpui::linear_color_stop(rgb(0xfff6c4), 0.), gpui::linear_color_stop(rgb(0xffd95a), 1.))).flex().justify_center().font_weight(FontWeight::EXTRA_BOLD).text_color(rgb(0x6b4e00)).child(text));
        }
        card = card.child(
            div()
                .flex()
                .items_center()
                .gap(px(10.))
                .child(div().flex_none().size(px(36.)).rounded(px(10.)).bg(lavender.opacity(0.18)).flex().items_center().justify_center().text_size(px(20.)).child(emoji))
                .child(div().min_w_0().flex().flex_col().gap(px(1.)).child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).child(name)).child(div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(line))),
        );

        // The players: each seat's piece, name and score.
        let mut seats = div().mt(px(10.)).mb(px(8.)).flex().justify_between().gap(px(8.)).text_size(px(12.)).line_height(px(18.));
        for i in if solo { vec![0] } else { vec![0, 1] } {
            let to_move = status == "playing" && kind != "rps" && turn == i;
            let won = over && winner == Some(i);
            let piece = pieces(&kind)[i];
            let label: AnyElement = if i == 1 && guest.is_none() {
                div().italic().child("Open seat").into_any_element()
            } else {
                div().child(name_of(i)).into_any_element()
            };
            seats = seats.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(5.))
                    .px(px(9.))
                    .py(px(3.))
                    .rounded_full()
                    .border_1()
                    .border_color(gpui::transparent_black())
                    .text_color(muted)
                    .when(to_move, |d| d.text_color(ink).border_color(lavender.opacity(0.55)).bg(lavender.opacity(0.14)).font_weight(FontWeight::BOLD))
                    .when(won, |d| d.text_color(rgb(0x1f7a3a)).border_color(rgb(0x4ade80)).bg(Hsla::from(rgb(0x4ade80)).opacity(0.18)).font_weight(FontWeight::BOLD))
                    .when(!piece.is_empty(), |d| {
                        if kind == "mines" && i == 0 {
                            d.child(gpui::svg().path("icons/flag-solid.svg").size(px(13.)).text_color(rgb(0x2f6fe0)))
                        } else {
                            d.child(div().when(kind == "tictactoe", |d| d.text_size(px(11.))).child(piece))
                        }
                    })
                    .child(label)
                    .when(matches!(kind.as_str(), "mines" | "rps" | "rota"), |d| d.child(div().px(px(5.)).rounded(px(6.)).bg(ink.opacity(0.1)).font_weight(FontWeight::BOLD).child(game["scores"][i].as_i64().unwrap_or(0).to_string()))),
            );
        }
        card = card.child(seats);

        let board: Vec<u8> = game["board"].as_str().unwrap_or_default().bytes().collect();
        let last = game["last"].as_u64().map(|l| l as usize);
        let id = message.id.clone();
        let show_board = !matches!(status, "waiting" | "declined") && (status != "cancelled" || solo);
        if show_board {
            match kind.as_str() {
                "tictactoe" => {
                    let win = tictactoe_line(&board);
                    let side = ((width.min(420.) - 30.).min(210.) - 8.) / 3.;
                    let mut grid = div().w(px(side * 3. + 8.)).mx_auto().flex().flex_col().gap(px(4.));
                    for r in 0..3 {
                        let mut row = div().flex().gap(px(4.));
                        for c in 0..3 {
                            let i = r * 3 + c;
                            let cell = board.get(i).copied().unwrap_or(b'.');
                            let playable = my_turn && cell == b'.' && !busy;
                            let winning = win.is_some_and(|w| w.contains(&i));
                            let id = id.clone();
                            row = row.child(
                                div()
                                    .id(SharedString::from(format!("ttt-{}-{i}", message.id)))
                                    .size(px(side))
                                    .rounded(px(8.))
                                    .bg(if winning { Hsla::from(rgb(0x4ade80)).opacity(0.3) } else { ink.opacity(0.07) })
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    // Chrome draws ✕ / ◯ from a fallback face, about half the 30px size.
                                    .text_size(px(17.))
                                    .font_weight(FontWeight::EXTRA_BOLD)
                                    .child(match cell {
                                        b'X' => "✕",
                                        b'O' => "◯",
                                        _ => "",
                                    })
                                    .when(playable, |d| d.cursor_pointer().hover(move |s| s.bg(lavender.opacity(0.22))).on_click(cx.listener(move |this, _, _, cx| this.game_act(id.clone(), "move", json!(i), cx)))),
                            );
                        }
                        grid = grid.child(row);
                    }
                    card = card.child(grid);
                }
                "connect4" => {
                    let win = connect4_line(&board);
                    let outer = (width.min(420.) - 30.).min(300.);
                    let cell = (outer - 12. - 24.) / 7.;
                    let mut grid = div().w(px(outer)).mx_auto().p(px(6.)).rounded(px(10.)).bg(rgb(0x2f5bd3)).flex().flex_col().gap(px(4.));
                    for r in 0..6 {
                        let mut row = div().flex().gap(px(4.));
                        for c in 0..7 {
                            let i = r * 7 + c;
                            let v = board.get(i).copied().unwrap_or(b'.');
                            let playable = my_turn && !busy && board.get(c) == Some(&b'.');
                            let winning = win.as_ref().is_some_and(|w| w.contains(&i));
                            let disc = cell * 0.86;
                            let fill = match v {
                                // radial-gradient(circle at 35% 30%, light, dark): the light side up and left.
                                b'R' => div().bg(gpui::linear_gradient(135., gpui::linear_color_stop(rgb(0xff8a80), 0.), gpui::linear_color_stop(rgb(0xd32f2f), 0.75))),
                                b'Y' => div().bg(gpui::linear_gradient(135., gpui::linear_color_stop(rgb(0xfff59d), 0.), gpui::linear_color_stop(rgb(0xf9a825), 0.75))),
                                _ => div().bg(Theme::paper()),
                            };
                            let id = id.clone();
                            row = row.child(
                                div()
                                    .id(SharedString::from(format!("c4-{}-{i}", message.id)))
                                    .size(px(cell))
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .child(fill.size(px(disc)).rounded_full().when(winning, |d| d.border_2().border_color(rgb(0x4ade80))))
                                    .when(playable, |d| d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| this.game_act(id.clone(), "move", json!(c), cx)))),
                            );
                        }
                        grid = grid.child(row);
                    }
                    card = card.child(grid);
                }
                "rps" => {
                    let mut area = div().flex().flex_col().items_center().gap(px(8.));
                    if rps["lastRound"].is_object() {
                        let throw = |t: &Value| THROWS.iter().find(|(id, _)| t == *id).map(|(_, e)| *e).unwrap_or("");
                        let lr = &rps["lastRound"];
                        let verdict = match lr["winner"].as_u64() {
                            None => "tie!".to_string(),
                            Some(w) => format!("{} takes it", name_of(w as usize)),
                        };
                        area = area.child(div().mt(px(1.)).w_full().text_size(px(16.)).line_height(px(24.8)).child(format!("{} {} vs {} {} — {verdict}", throw(&lr["throws"][0]), name_of(0), name_of(1), throw(&lr["throws"][1]))));
                    }
                    if status == "playing" && seat.is_some_and(|s| rps["thrown"][s] != true) {
                        let mut throws = div().flex().gap(px(8.));
                        for (t, e) in THROWS {
                            let id = id.clone();
                            throws = throws.child(
                                div()
                                    .id(SharedString::from(format!("rps-{}-{t}", message.id)))
                                    .min_w(px(76.))
                                    .px(px(10.))
                                    .py(px(8.))
                                    .rounded(px(10.))
                                    .bg(ink.opacity(0.07))
                                    .border_1()
                                    .border_color(gpui::transparent_black())
                                    .flex()
                                    .flex_col()
                                    .items_center()
                                    .gap(px(2.))
                                    .text_size(px(12.))
                                    .line_height(px(18.))
                                    .when(!busy, |d| d.cursor_pointer().hover(move |s| s.border_color(lavender)).on_click(cx.listener(move |this, _, _, cx| this.game_act(id.clone(), "move", json!(t), cx))))
                                    .child(div().text_size(px(28.)).line_height(px(42.)).child(e))
                                    .child({
                                        let mut name = t.to_string();
                                        name[..1].make_ascii_uppercase();
                                        name
                                    }),
                            );
                        }
                        area = area.child(throws);
                    }
                    card = card.child(area);
                }
                "mines" => {
                    card = card.child(div().mt(px(1.)).mb(px(6.)).flex().justify_center().text_size(px(16.)).line_height(px(24.8)).child(format!("First to {MINES_TO_WIN} mines wins. Find one and you go again.")));
                    let outer = (width.min(460.) - 30.).min(400.);
                    let cell = (outer - 4. - 15.) / MINES_SIZE as f32;
                    let mut grid = div().w(px(outer)).mx_auto().p(px(2.)).bg(rgb(0x7b7b7b)).flex().flex_col().gap(px(1.));
                    for r in 0..MINES_SIZE {
                        let mut row = div().flex().gap(px(1.));
                        for c in 0..MINES_SIZE {
                            let i = r * MINES_SIZE + c;
                            let v = board.get(i).copied().unwrap_or(b'.');
                            let playable = my_turn && v == b'.' && !busy;
                            let number_color = match v {
                                b'1' => 0x1c4fd8,
                                b'2' => 0x1b8a2a,
                                b'3' => 0xd32f2f,
                                b'4' => 0x1a237e,
                                b'5' => 0x8b1a1a,
                                b'6' => 0x00838f,
                                b'7' => 0x000000,
                                _ => 0x555555,
                            };
                            let base = div().id(SharedString::from(format!("mn-{}-{i}", message.id))).size(px(cell)).flex().items_center().justify_center().text_size(px(13.)).font_weight(FontWeight::EXTRA_BOLD).line_height(px(13.));
                            let id = id.clone();
                            let el = match v {
                                b'.' => base
                                    .bg(gpui::linear_gradient(135., gpui::linear_color_stop(rgb(0xe6eefc), 0.), gpui::linear_color_stop(rgb(0xb8cbe8), 1.)))
                                    .border_t_1()
                                    .border_l_1()
                                    .border_color(rgb(0xffffff))
                                    .when(playable, |d| d.cursor_pointer().hover(|s| s.bg(rgb(0xeef4fd))).on_click(cx.listener(move |this, _, _, cx| this.game_act(id.clone(), "move", json!(i), cx)))),
                                // `.flag-A`: the flag hue-rotated to blue (an emoji can't be tinted here).
                                b'A' => base.bg(rgb(0xcfe0ff)).child(gpui::svg().path("icons/flag-solid.svg").size(px(14.)).text_color(rgb(0x2f6fe0))),
                                b'B' => base.bg(rgb(0xffd4d0)).child("🚩"),
                                b'0' => base.bg(rgb(0xdcdcdc)),
                                n => base.bg(rgb(0xdcdcdc)).text_color(rgb(number_color)).child((n as char).to_string()),
                            };
                            row = row.child(el.when(last == Some(i), |d| d.border_2().border_color(rgb(0xf5c542))));
                        }
                        grid = grid.child(row);
                    }
                    card = card.child(grid);
                }
                "rota" => {
                    if let Some(board) = self.render_rota(message, &game, my_turn, busy, width, window, cx) {
                        card = card.child(board);
                    }
                }
                _ => {}
            }
        }

        // The actions.
        let action = |id: String, label: &'static str, primary: bool| {
            div()
                .id(SharedString::from(id))
                .px(px(11.))
                .py(px(4.))
                .rounded(px(8.))
                .border_1()
                .border_color(gpui::transparent_black())
                .bg(if primary { lavender } else { ink.opacity(0.08) })
                .text_size(px(12.))
                .line_height(px(18.))
                .font_weight(FontWeight::BOLD)
                .text_color(if primary { rgb(0x15121f).into() } else { ink })
                .when(!busy, |d| d.cursor_pointer())
                .child(label)
        };
        let mut actions = div().mt(px(10.)).flex().gap(px(6.));
        let mut any = false;
        let mid = message.id.clone();
        if status == "waiting" && seat.is_none() {
            any = true;
            let (a, b) = (mid.clone(), mid.clone());
            actions = actions
                .child(action(format!("g-join-{mid}"), "Accept", true).on_click(cx.listener(move |this, _, _, cx| this.game_act(a.clone(), "join", Value::Null, cx))))
                .child(action(format!("g-decline-{mid}"), "Decline", false).on_click(cx.listener(move |this, _, _, cx| this.game_act(b.clone(), "decline", Value::Null, cx))));
        }
        if status == "waiting" && seat == Some(0) {
            any = true;
            let a = mid.clone();
            actions = actions.child(action(format!("g-cancel-{mid}"), "Cancel", false).on_click(cx.listener(move |this, _, _, cx| this.game_act(a.clone(), "decline", Value::Null, cx))));
        }
        if status == "playing" && seat.is_some() {
            any = true;
            let a = mid.clone();
            actions = actions.child(action(format!("g-resign-{mid}"), "Give up", false).on_click(cx.listener(move |this, _, _, cx| this.game_act(a.clone(), "resign", Value::Null, cx))));
        }
        if over || status == "declined" || (solo && status == "cancelled") {
            any = true;
            actions = actions.child(action(format!("g-again-{mid}"), "Play again", true).on_click(cx.listener(move |this, _, _, cx| this.start_game(kind_static, solo, cx))));
        }
        if any {
            card = card.child(actions);
        }
        if let Some(error) = self.game_errors.get(&message.id) {
            card = card.child(div().mt(px(6.)).text_size(px(12.)).text_color(Theme::coral()).child(error.clone()));
        }
        let _ = rgba;
        Some(card.into_any_element())
    }
}
