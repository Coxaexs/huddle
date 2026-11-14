//! A bot's right-click menu (app/components/bot-menu.tsx, chat-shell-renderers.tsx): Music + Watch
//! and the D&D Bot have their own; a bot that registered one (lib/bot-menus.ts) shows its items.

use std::collections::HashMap;

use gpui::{AnyElement, Context, Focusable, FontWeight, Hsla, Pixels, Point, SharedString, Window, div, prelude::*, px, rgb};
use serde::Deserialize;
use serde_json::{Value, json};

use super::Shell;
use crate::theme::Theme;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AppMenu {
    pub application_id: String,
    pub bot_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub items: Vec<AppMenuItem>,
}

#[derive(Clone, Deserialize)]
pub(super) struct AppMenuItem {
    pub label: String,
    #[serde(default)]
    pub icon: String,
    pub command: String,
    #[serde(default)]
    pub fill: bool,
}

#[derive(Clone)]
pub(super) enum BotKind {
    Music,
    Dnd,
    /// A bot's own menu, and the message it was opened on (for "Message options…").
    App(AppMenu, Option<String>),
}

pub(super) struct BotMenu {
    pub kind: BotKind,
    pub at: Point<Pixels>,
    pub height: std::rc::Rc<std::cell::Cell<f32>>,
}

#[derive(Clone)]
enum Action {
    Prepare(&'static str),
    Run(&'static str),
    Player(&'static str),
    Dashboard(bool),
    NotHere(&'static str),
    AppItem(String, AppMenuItem),
    MessageOptions(String),
}

/// botMenuKind: which built-in menu a bot's name gets.
pub(super) fn bot_kind(author: &str) -> Option<BotKind> {
    let name = author.trim().to_lowercase();
    if name == "music + watch" {
        Some(BotKind::Music)
    } else if name.contains("d&d") {
        Some(BotKind::Dnd)
    } else {
        None
    }
}

impl Shell {
    /// A right click on a message: a bot's own menu first, else the message menu.
    pub(super) fn message_right_click(&mut self, id: String, at: Point<Pixels>, cx: &mut Context<Self>) {
        if let Some(message) = self.find_message(&id).filter(|m| m.bot) {
            if let Some(kind) = bot_kind(&message.author) {
                return self.open_bot_menu(kind, at, cx);
            }
            let bot = message.payload.as_ref().and_then(|p| p.get("botId")).and_then(Value::as_str).map(str::to_string);
            let menu = bot.and_then(|b| self.server_id.as_ref().and_then(|s| self.bot_menus.get(s)).and_then(|m| m.get(&b)).cloned());
            if let Some(menu) = menu {
                return self.open_bot_menu(BotKind::App(menu, Some(id)), at, cx);
            }
        }
        self.open_context_menu(id, at, cx);
    }

    pub(super) fn open_bot_menu(&mut self, kind: BotKind, at: Point<Pixels>, cx: &mut Context<Self>) {
        self.bot_menu = Some(BotMenu { kind, at, height: Default::default() });
        cx.notify();
    }

    /// loadBotMenus: a server's bot menus, fetched when it opens so a right click answers at once.
    pub(super) fn load_bot_menus(&mut self, cx: &mut Context<Self>) {
        let Some(server) = self.server_id.clone().filter(|_| !self.home) else { return };
        if self.bot_menus.contains_key(&server) {
            return;
        }
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let path = format!("/api/bot-menus?serverId={server}");
            let result = cx.background_executor().spawn(async move { client.settings_get(&path) }).await;
            let menus: Vec<AppMenu> = result.ok().and_then(|v| serde_json::from_value(v.get("menus").cloned().unwrap_or(Value::Null)).ok()).unwrap_or_default();
            this.update(cx, |this, _| {
                this.bot_menus.insert(server, menus.into_iter().map(|m| (m.application_id.clone(), m)).collect::<HashMap<_, _>>());
            })
            .ok();
        })
        .detach();
    }

    /// prepareCommand: the command in the box for you to finish.
    fn prepare_command(&mut self, command: &str, window: &mut Window, cx: &mut Context<Self>) {
        let text = command.to_string();
        self.composer.update(cx, |c, cx| c.set_value(text, cx));
        self.on_composer_changed(cx);
        window.focus(&self.composer.focus_handle(cx));
    }

    fn bot_menu_actions(&self, kind: &BotKind) -> Vec<(String, Action, bool)> {
        match kind {
            BotKind::Music => {
                let mut list = vec![
                    ("Play something…".to_string(), Action::Prepare("/play "), false),
                    ("Show queue".into(), Action::Prepare("/queue"), false),
                    ("Lyrics now".into(), Action::Run("/lyricsnow"), false),
                    ("Music player (full screen)".into(), Action::NotHere("The music player is not in this app yet. Open Hoffle in your browser for it."), false),
                    ("Toggle Smart Autoplay".into(), Action::Run("/autoplay"), false),
                    ("Toggle AutoMix".into(), Action::Run("/automix"), false),
                    ("Like this track".into(), Action::Run("/like"), false),
                    ("Dislike this track".into(), Action::Run("/dislike"), false),
                    ("Listening stats".into(), Action::Run("/stats"), false),
                    ("Room Wrapped".into(), Action::Run("/wrapped"), false),
                    ("Music settings".into(), Action::Run("/settings"), false),
                ];
                // What the room hears, when you are in one and something is on.
                let player = self.call.as_ref().and_then(|c| self.players.get(&c.channel_id));
                if let Some(player) = player.filter(|p| p.get("track").is_some_and(|t| !t.is_null())) {
                    let paused = player.get("paused").and_then(Value::as_bool).unwrap_or(false);
                    let live = player.get("dj").is_some_and(|d| !d.is_null());
                    list.push((if paused { "Resume" } else { "Pause" }.into(), Action::Player("toggle"), false));
                    list.push(("Skip".into(), Action::Player("skip"), false));
                    list.push((if live { "Stop playing (ends the DJ set)" } else { "Stop playing" }.into(), Action::Player("stop"), true));
                }
                if self.me.is_admin || self.has_permission(crate::model::permission::MANAGE_MESSAGES) {
                    list.push(("Set room volume…".into(), Action::Prepare("/volume "), false));
                }
                list.push(("Open dashboard".into(), Action::Dashboard(false), false));
                list.push(("Open DJ booth".into(), Action::Dashboard(true), false));
                list
            }
            BotKind::Dnd => vec![
                ("Roll dice…".to_string(), Action::Prepare("/roll "), false),
                ("Find a spell…".into(), Action::Prepare("/spell "), false),
                ("Find a monster…".into(), Action::Prepare("/monster "), false),
            ],
            BotKind::App(menu, message) => {
                let mut list: Vec<(String, Action, bool)> = menu
                    .items
                    .iter()
                    .map(|item| {
                        let label = if item.icon.is_empty() { item.label.clone() } else { format!("{} {}", item.icon, item.label) };
                        (label, Action::AppItem(menu.application_id.clone(), item.clone()), false)
                    })
                    .collect();
                if let Some(id) = message {
                    list.push(("Message options…".into(), Action::MessageOptions(id.clone()), false));
                }
                list
            }
        }
    }

    fn run_bot_action(&mut self, action: Action, window: &mut Window, cx: &mut Context<Self>) {
        let at = self.bot_menu.take().map(|m| m.at);
        match action {
            Action::Prepare(command) => self.prepare_command(command, window, cx),
            Action::Run(command) => self.run_command(command.to_string(), cx),
            Action::Player(name) => {
                if let Some(room) = self.call.as_ref().map(|c| c.channel_id.clone()) {
                    self.hub.send(json!({ "t": "player", "channelId": room, "action": { "name": name } }));
                }
            }
            Action::Dashboard(dj) => self.open_music_dashboard(dj, cx),
            Action::NotHere(text) => self.set_notice(text, cx),
            Action::MessageOptions(id) => {
                if let Some(at) = at {
                    self.open_context_menu(id, at, cx);
                }
            }
            Action::AppItem(bot, item) => {
                if item.fill {
                    self.prepare_command(&format!("{} ", item.command), window, cx);
                    return;
                }
                // Straight to that bot (POST /api/commands with its id), never to a built-in.
                let Some(channel) = self.channel_id.clone() else { return };
                let command = item.command.trim_start_matches('/').to_string();
                let (name, args) = command.split_once(' ').map(|(n, a)| (n.to_lowercase(), a.trim().to_string())).unwrap_or((command.to_lowercase(), String::new()));
                let bot_name = self.bot_menus.values().flat_map(|m| m.values()).find(|m| m.application_id == bot).map(|m| m.bot_name.clone()).unwrap_or_default();
                let client = self.client.clone();
                cx.spawn(async move |this, cx| {
                    let body = json!({ "channelId": channel, "name": name, "args": args, "botId": bot });
                    let result = cx.background_executor().spawn(async move { client.settings_post("/api/commands", body) }).await;
                    let ok = result.ok().is_some_and(|v| v.get("ok").and_then(Value::as_bool).unwrap_or(false) || matches!(v.get("reason").and_then(Value::as_str), Some("usage" | "offline")));
                    if !ok {
                        this.update(cx, |this, cx| this.set_notice(format!("{bot_name} can't run that right now."), cx)).ok();
                    }
                })
                .detach();
            }
        }
        cx.notify();
    }

    /// `.user-menu.bot-menu`: the bot's name and what it is, your mute and volume for the music
    /// bot, then its actions; 230 wide, kept 12px inside the window.
    pub(super) fn render_bot_menu(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let menu = self.bot_menu.as_ref()?;
        let (name, description) = match &menu.kind {
            BotKind::Music => ("Music + Watch".to_string(), "Music and watch-together bot".to_string()),
            BotKind::Dnd => ("D&D Bot".to_string(), "Tabletop helper bot".to_string()),
            BotKind::App(app, _) => (app.bot_name.clone(), if app.description.is_empty() { "Bot".into() } else { app.description.clone() }),
        };
        let muted: Hsla = Theme::muted().into();
        let line = rgb(0x41434f);
        let item = |id: SharedString, label: String, danger: bool| {
            div()
                .id(id)
                .flex_none()
                .p(px(8.))
                .rounded(px(8.))
                .text_size(px(13.))
                .line_height(px(19.5))
                .text_color(if danger { Theme::coral().into() } else { Hsla::from(rgb(0xe6e7ee)) })
                .cursor_pointer()
                .hover(|s| s.bg(Hsla::from(Theme::lavender()).opacity(0.24)))
                .child(label)
        };
        let mut card = div().relative().flex().flex_col().child(
            div()
                .flex_none()
                .mb(px(6.))
                .px(px(8.))
                .pt(px(12.))
                .pb(px(10.))
                .border_b_1()
                .border_color(line)
                .flex()
                .flex_col()
                .gap(px(6.))
                .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(rgb(0xf5f3ee)).child(name))
                .child(div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(description)),
        );
        if matches!(menu.kind, BotKind::Music) {
            let pref = self.voice_prefs.get("bot:music").copied().unwrap_or_default();
            let volume = pref.volume.min(100);
            let fill = volume as f32 / 100.;
            card = card
                .child(item("bm-mute".into(), if pref.muted { "Unmute bot for me" } else { "Mute bot for me" }.into(), false).on_click(cx.listener(move |this, _, _, cx| {
                    this.save_voice_pref("bot:music".into(), None, Some(!pref.muted), cx);
                })))
                .child(
                    div()
                        .flex_none()
                        .p(px(8.))
                        // The range sits on an inline line box: 5px more under it.
                        .pb(px(13.))
                        .flex()
                        .flex_col()
                        .gap(px(6.))
                        .child(div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(format!("Bot volume · {volume}%")))
                        .child(
                            div()
                                .id("bm-volume")
                                .relative()
                                .w(px(196.))
                                .h(px(16.))
                                .cursor_pointer()
                                .child(div().absolute().left_0().right_0().top(px(4.)).h(px(8.)).rounded_full().bg(rgb(0x2b2a33)).border_1().border_color(rgb(0x767680)))
                                // Chrome keeps the 16px thumb inside the track: it travels 180px.
                                .child(div().absolute().left_0().top(px(4.)).w(px(8. + 180. * fill)).h(px(8.)).rounded_full().bg(rgb(0x8ab4f8)))
                                .child(div().absolute().left(px(180. * fill)).top_0().size(px(16.)).rounded_full().bg(rgb(0x8ab4f8)))
                                .child(super::profile_card::track(&self.volume_spot))
                                .on_mouse_down(gpui::MouseButton::Left, {
                                    let spot = self.volume_spot.clone();
                                    cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                                        let b = spot.get();
                                        let share = (f32::from(e.position.x - b.origin.x) / f32::from(b.size.width)).clamp(0., 1.);
                                        this.save_voice_pref("bot:music".into(), Some((share * 100.).round() as u32), None, cx);
                                    })
                                }),
                        ),
                )
                .child(div().flex_none().my(px(6.)).h(px(1.)).bg(line));
        }
        for (n, (label, action, danger)) in self.bot_menu_actions(&menu.kind).into_iter().enumerate() {
            card = card.child(item(SharedString::from(format!("bm-{n}")), label, danger).on_click(cx.listener(move |this, _, window, cx| this.run_bot_action(action.clone(), window, cx))));
        }

        let size = window.viewport_size();
        let (vw, vh) = (f32::from(size.width), f32::from(size.height));
        let height = menu.height.get().min(vh - 24.);
        let (x, y) = (f32::from(menu.at.x), f32::from(menu.at.y));
        let left = if x + 230. > vw - 12. { (vw - 230. - 12.).max(12.) } else { x };
        let top = if y + height > vh - 12. { (vh - height - 12.).max(12.) } else { y };
        let measured = menu.height.clone();
        let at = menu.at;
        Some(
            div()
                .id("bot-menu")
                .absolute()
                .left(px(left))
                .top(px(top))
                .w(px(230.))
                .max_h(px(vh - 24.))
                .overflow_y_scroll()
                // `.user-menu-head` is sticky at top: -8px, so the name sits at the card's top edge.
                .px(px(8.))
                .pb(px(8.))
                .rounded(px(14.))
                .bg(rgb(0x202129))
                .border_1()
                .border_color(line)
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.45), offset: gpui::point(px(0.), px(24.)), blur_radius: px(60.), spread_radius: px(0.) }])
                .text_color(rgb(0xf5f3ee))
                .child(card.child(gpui::canvas(move |b, _, _| measured.set(f32::from(b.size.height) + 10.), |_, _, _, _| {}).absolute().top_0().left_0().size_full()))
                .on_mouse_down_out(cx.listener(move |this, _, _, cx| {
                    if this.bot_menu.as_ref().is_some_and(|m| m.at == at) {
                        this.bot_menu = None;
                        cx.notify();
                    }
                }))
                .into_any_element(),
        )
    }
}
