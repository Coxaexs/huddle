//! EmojiPicker (app/components/emoji-picker.tsx): search, the category rail, Favorites, this server's
//! emoji, the web's own emoji list by category, and the preview footer. Used for reactions (floating
//! beside the message) and by the composer's emoji button.

use std::sync::OnceLock;

use gpui::{
    AnimationExt as _, App, Context, Entity, EventEmitter, FocusHandle, Focusable, FontWeight, Hsla, ObjectFit,
    ScrollHandle, SharedString, StyledImage as _, Subscription, Window, div, prelude::*, px, rgb, rgba,
};
use serde::Deserialize;

use crate::input::{InputEvent, Look, TextInput};
use crate::model::Emoji;
use crate::ui;

#[derive(Clone, Deserialize)]
pub struct Item {
    pub name: String,
    pub symbol: String,
    pub category: String,
}

/// EMOJI_DATASET, exported by tools/export-emoji.py.
pub fn dataset() -> &'static [Item] {
    static DATA: OnceLock<Vec<Item>> = OnceLock::new();
    DATA.get_or_init(|| {
        crate::assets::ASSETS
            .iter()
            .find(|(p, _)| *p == "emoji/dataset.json")
            .and_then(|(_, b)| serde_json::from_slice(b).ok())
            .unwrap_or_default()
    })
}

/// CATEGORIES: rail id, Lucide icon, label, and the dataset category it shows.
const CATEGORIES: [(&str, &str, &str, Option<&str>); 11] = [
    ("favorites", "star", "Favorites", None),
    ("server", "image", "Server Emojis", None),
    ("smileys", "smile", "Smileys & Emotion", Some("Smileys & Emotion")),
    ("people", "user", "People & Body", Some("People & Body")),
    ("animals", "sparkles", "Animals & Nature", Some("Animals & Nature")),
    ("food", "utensils", "Food & Drink", Some("Food & Drink")),
    ("activities", "trophy", "Activities", Some("Activities")),
    ("travel", "globe", "Travel & Places", Some("Travel & Places")),
    ("objects", "package", "Objects", Some("Objects")),
    ("symbols", "hash", "Symbols", Some("Symbols")),
    ("flags", "flag", "Flags", Some("Flags")),
];

/// What was picked: the text to use (`😀` or `:name:` for a server emoji) and the keys held.
pub struct Picked {
    pub code: String,
    pub shift: bool,
}

pub enum PickerEvent {
    Pick(Picked),
    Close,
}

#[derive(Clone)]
enum Hovered {
    Unicode(Item),
    Custom { name: String, url: String },
}

pub struct EmojiPicker {
    focus: FocusHandle,
    search: Entity<TextInput>,
    custom: Vec<Emoji>,
    /// Server emoji URLs are relative; this makes them absolute.
    absolute: Box<dyn Fn(&str) -> String>,
    active: &'static str,
    hovered: Option<Hovered>,
    favorites: Vec<String>,
    scroll: ScrollHandle,
    title: Option<(String, String)>,
    _subs: Vec<Subscription>,
}

impl EventEmitter<PickerEvent> for EmojiPicker {}

impl Focusable for EmojiPicker {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
    }
}

impl EmojiPicker {
    pub fn new(custom: Vec<Emoji>, absolute: impl Fn(&str) -> String + 'static, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| {
            TextInput::new("Search emojis...", cx).look(Look {
                size: 13.5,
                line_height: 36.,
                height: 36.,
                color: rgb(0xf2f3f5).into(),
                placeholder: Hsla::from(rgb(0xf2f3f5)).opacity(0.5),
            })
        });
        // `autoFocus` on the search field.
        window.focus(&search.focus_handle(cx));
        // Development: HOFFLE_DEV_PICKER_SEARCH types into it.
        if let Ok(text) = std::env::var("HOFFLE_DEV_PICKER_SEARCH") {
            search.update(cx, |s, cx| s.set_text(text, cx));
        }
        let subs = vec![cx.subscribe(&search, |_, _, event, cx| match event {
            InputEvent::Changed => cx.notify(),
            InputEvent::Escape => cx.emit(PickerEvent::Close),
            InputEvent::Submit => {}
        })];
        Self {
            focus: cx.focus_handle(),
            search,
            custom,
            absolute: Box::new(absolute),
            active: "smileys",
            hovered: dataset().first().cloned().map(Hovered::Unicode),
            favorites: load_favorites(),
            scroll: ScrollHandle::new(),
            title: None,
            _subs: subs,
        }
    }

    /// "Add to Quick Reactions" mode: a banner over the search.
    #[allow(dead_code)]
    pub fn with_title(mut self, title: impl Into<String>, subtitle: impl Into<String>) -> Self {
        self.title = Some((title.into(), subtitle.into()));
        self
    }

    fn pick(&mut self, code: String, name: &str, event: &gpui::ClickEvent, cx: &mut Context<Self>) {
        let modifiers = event.modifiers();
        // Alt-click also stars it (toggleFavorite), then picks it all the same.
        if modifiers.alt {
            if let Some(ix) = self.favorites.iter().position(|n| n == name) {
                self.favorites.remove(ix);
            } else {
                self.favorites.push(name.to_string());
            }
            save_favorites(&self.favorites);
        }
        cx.emit(PickerEvent::Pick(Picked { code, shift: modifiers.shift }));
    }

    fn scroll_to(&mut self, id: &'static str, cx: &mut Context<Self>) {
        self.active = id;
        if !self.search.read(cx).is_empty() {
            self.search.update(cx, |s, cx| s.clear(cx));
        }
        let has_favorites = dataset().iter().any(|e| self.favorites.contains(&e.name));
        let ix = CATEGORIES
            .iter()
            .filter(|(cid, _, _, cat)| match *cid {
                "favorites" => has_favorites,
                "server" => true,
                _ => cat.is_some_and(|c| dataset().iter().any(|e| e.category == c)),
            })
            .position(|(cid, ..)| *cid == id);
        if let Some(ix) = ix {
            self.scroll.scroll_to_top_of_item(ix);
        }
        cx.notify();
    }

    /// One `.emoji-btn`: 34px, 20px glyph, a light square and a bigger glyph on hover.
    fn unicode_button(&self, item: &Item, cx: &mut Context<Self>) -> gpui::AnyElement {
        let code = item.symbol.clone();
        let name = item.name.clone();
        let hovered = item.clone();
        div()
            .id(SharedString::from(format!("e-{}", item.name)))
            .flex_none()
            .size(px(34.))
            .rounded(px(6.))
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(20.))
            .line_height(px(30.))
            .cursor_pointer()
            .hover(|s| s.bg(rgba(0xffffff1f)).text_size(px(23.)))
            .on_hover(cx.listener(move |this, on: &bool, _, cx| {
                if *on {
                    this.hovered = Some(Hovered::Unicode(hovered.clone()));
                    cx.notify();
                }
            }))
            .on_click(cx.listener(move |this, event, _, cx| this.pick(code.clone(), &name, event, cx)))
            .child(item.symbol.clone())
            .into_any_element()
    }

    fn custom_button(&self, emoji: &Emoji, cx: &mut Context<Self>) -> gpui::AnyElement {
        let url = (self.absolute)(&emoji.url);
        let name = emoji.name.clone();
        let hovered = Hovered::Custom { name: emoji.name.clone(), url: url.clone() };
        div()
            .id(SharedString::from(format!("c-{}", emoji.id)))
            .flex_none()
            .size(px(34.))
            .rounded(px(6.))
            .flex()
            .items_center()
            .justify_center()
            .cursor_pointer()
            .hover(|s| s.bg(rgba(0xffffff1f)))
            .on_hover(cx.listener(move |this, on: &bool, _, cx| {
                if *on {
                    this.hovered = Some(hovered.clone());
                    cx.notify();
                }
            }))
            .on_click(cx.listener(move |this, event, _, cx| this.pick(format!(":{name}:"), &name.clone(), event, cx)))
            .child(gpui::img(url).size(px(24.)).object_fit(ObjectFit::Contain))
            .into_any_element()
    }

    /// `.emoji-grid`: eight 34px columns 4px apart, 8px padding, at most 260px tall and scrolling.
    fn grid(&self, id: &str, cells: Vec<gpui::AnyElement>, empty: Option<String>) -> gpui::AnyElement {
        let mut grid = div().id(SharedString::from(format!("grid-{id}"))).max_h(px(260.)).overflow_y_scroll().p(px(8.)).flex().flex_col().gap(px(4.));
        let mut cells = cells.into_iter().peekable();
        while cells.peek().is_some() {
            let row: Vec<_> = cells.by_ref().take(8).collect();
            grid = grid.child(div().flex_none().flex().gap(px(4.)).children(row));
        }
        if let Some(text) = empty {
            grid = grid.child(div().text_size(px(16.)).line_height(px(24.)).child(text));
        }
        grid.into_any_element()
    }

    /// `.emoji-section-header`: 14px icon, bold 12px label with the count, 8px under it.
    fn header(icon: &str, label: String) -> gpui::AnyElement {
        div()
            .flex_none()
            .h(px(18.))
            .mb(px(8.))
            .flex()
            .items_center()
            .gap(px(4.))
            .text_size(px(12.))
            .line_height(px(18.))
            .font_weight(FontWeight::BOLD)
            .text_color(rgb(0x949ba4))
            .child(ui::icon(icon, 14., rgb(0x949ba4)))
            .child(label)
            .into_any_element()
    }
}

impl Render for EmojiPicker {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let query = self.search.read(cx).text();
        let lower = query.to_lowercase();
        let focused = self.search.focus_handle(cx).is_focused(window);
        let mut scroll = div()
            .id("emoji-grid-scroll")
            .track_scroll(&self.scroll)
            .flex_1()
            .min_w_0()
            .h_full()
            .overflow_y_scroll()
            .px(px(12.))
            .py(px(10.))
            .flex()
            .flex_col()
            .gap(px(14.));
        if !query.is_empty() {
            let custom: Vec<_> = self.custom.iter().filter(|e| e.name.to_lowercase().contains(&lower)).cloned().collect();
            let unicode: Vec<_> =
                dataset().iter().filter(|e| e.name.to_lowercase().contains(&lower) || e.symbol.contains(query.as_str())).cloned().collect();
            let count = custom.len() + unicode.len();
            let mut cells: Vec<_> = custom.iter().map(|e| self.custom_button(e, cx)).collect();
            cells.extend(unicode.iter().map(|e| self.unicode_button(e, cx)));
            let empty = (count == 0).then(|| format!("No emojis found matching \"{query}\""));
            scroll = scroll.child(
                div()
                    .flex_none()
                    .child(Self::header("search", format!("Search Results ({count})")))
                    .child(self.grid("search", cells, empty)),
            );
        } else {
            let favorites: Vec<_> = dataset().iter().filter(|e| self.favorites.contains(&e.name)).cloned().collect();
            if !favorites.is_empty() {
                let cells = favorites.iter().map(|e| self.unicode_button(e, cx)).collect();
                scroll = scroll.child(
                    div()
                        .flex_none()
                        .child(Self::header("star", format!("Favorites ({})", favorites.len())))
                        .child(self.grid("favorites", cells, None)),
                );
            }
            let custom = self.custom.clone();
            let cells = custom.iter().map(|e| self.custom_button(e, cx)).collect();
            let empty = custom.is_empty().then(|| "No custom server emojis yet.".to_string());
            scroll = scroll.child(
                div()
                    .flex_none()
                    .child(Self::header("image", format!("Server Emojis ({})", custom.len())))
                    .child(self.grid("server", cells, empty)),
            );
            for (id, icon, label, category) in CATEGORIES.iter().skip(2) {
                let items: Vec<_> = dataset().iter().filter(|e| Some(e.category.as_str()) == *category).cloned().collect();
                if items.is_empty() {
                    continue;
                }
                let cells = items.iter().map(|e| self.unicode_button(e, cx)).collect();
                scroll = scroll.child(
                    div()
                        .flex_none()
                        .child(Self::header(icon, format!("{label} ({})", items.len())))
                        .child(self.grid(id, cells, None)),
                );
            }
        }

        // `.emoji-category-rail`: 44px, darker, 32px buttons that share the height.
        let mut rail = div()
            .flex_none()
            .w(px(44.))
            .h_full()
            .bg(rgb(0x1e1f22))
            .border_r_1()
            .border_color(rgba(0xffffff0d))
            .py(px(8.))
            .flex()
            .flex_col()
            .items_center()
            .gap(px(4.));
        for (id, icon, label, _) in CATEGORIES {
            let active = self.active == id;
            rail = rail.child(
                div()
                    .id(SharedString::from(format!("cat-{id}")))
                    .w(px(32.))
                    .h(px(32.))
                    .flex_shrink()
                    .min_h_0()
                    .rounded(px(8.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .when(active, |d| d.bg(rgba(0xffffff26)))
                    .when(!active, |d| d.hover(|s| s.bg(rgba(0xffffff14))))
                    .tooltip(ui::tooltip(label))
                    .on_click(cx.listener(move |this, _, _, cx| this.scroll_to(id, cx)))
                    .child(ui::icon(icon, 16., crate::theme::Theme::ink())),
            );
        }

        let footer = match &self.hovered {
            Some(hovered) => {
                let (icon, name) = match hovered {
                    Hovered::Unicode(item) => (
                        div().text_size(px(22.)).line_height(px(33.)).child(item.symbol.clone()).into_any_element(),
                        item.name.clone(),
                    ),
                    Hovered::Custom { name, url } => {
                        (gpui::img(url.clone()).size(px(26.)).object_fit(ObjectFit::Contain).into_any_element(), name.clone())
                    }
                };
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .child(div().flex_none().size(px(28.)).flex().items_center().justify_center().child(icon))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child(format!(":{name}:")))
                            .child(div().text_size(px(10.5)).line_height(px(15.75)).text_color(rgb(0x949ba4)).child("Hold Alt to favorite")),
                    )
                    .into_any_element()
            }
            None => div().child("Select an emoji").into_any_element(),
        };

        div()
            .id("emoji-picker")
            .track_focus(&self.focus)
            .w(px(380.))
            .h(px(450.))
            .rounded(px(16.))
            .bg(rgb(0x2b2d31))
            .border_1()
            .border_color(rgba(0xffffff1f))
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.6), offset: gpui::point(px(0.), px(16.)), blur_radius: px(40.), spread_radius: px(0.) }])
            .overflow_hidden()
            .flex()
            .flex_col()
            .text_color(crate::theme::Theme::ink())
            .on_key_down(cx.listener(|_, event: &gpui::KeyDownEvent, _, cx| {
                if event.keystroke.key == "escape" {
                    cx.emit(PickerEvent::Close);
                }
            }))
            .when_some(self.title.clone(), |d, (title, subtitle)| {
                d.child(
                    div()
                        .flex_none()
                        .px(px(14.))
                        .pt(px(12.))
                        .flex()
                        .flex_col()
                        .child(div().text_size(px(13.)).font_weight(FontWeight::BOLD).child(title))
                        .child(div().text_size(px(11.)).text_color(rgb(0x949ba4)).child(subtitle)),
                )
            })
            .child(
                div().flex_none().pt(px(12.)).px(px(14.)).pb(px(8.)).child(
                    div()
                        .h(px(36.))
                        .px(px(10.))
                        .rounded(px(8.))
                        .bg(rgb(0x1e1f22))
                        .flex()
                        .items_center()
                        .child(div().flex_none().mr(px(6.)).opacity(0.6).child(ui::icon("search", 14., crate::theme::Theme::ink())))
                        .child(
                            div()
                                .relative()
                                .flex_1()
                                .min_w_0()
                                .child(self.search.clone())
                                // The focused field's ring (`input:focus`: a 3px lavender shadow at 32%
                                // around the field, outside it).
                                .when(focused, |d| {
                                    d.child(
                                        div()
                                            .absolute()
                                            .top(px(-3.))
                                            .left(px(-3.))
                                            .right(px(-3.))
                                            .bottom(px(-3.))
                                            .border(px(3.))
                                            .border_color(Hsla::from(crate::theme::Theme::lavender()).opacity(0.32)),
                                    )
                                }),
                        )
                        .child(
                            div()
                                .id("picker-close")
                                .flex_none()
                                .cursor_pointer()
                                .child(ui::icon("x", 16., rgb(0xb5bac1)))
                                .on_click(cx.listener(|_, _, _, cx| cx.emit(PickerEvent::Close))),
                        ),
                ),
            )
            .child(div().flex_1().min_h_0().flex().child(rail).child(scroll))
            .child(
                div()
                    .flex_none()
                    .h(px(48.))
                    .bg(rgb(0x2b2d31))
                    .border_t_1()
                    .border_color(rgba(0xffffff14))
                    .px(px(14.))
                    .flex()
                    .items_center()
                    .child(footer),
            )
    }
}

/// The picker floating over everything, with its 0.15s pop (`reactionPickerPop`).
pub fn pop(picker: Entity<EmojiPicker>, key: String) -> impl IntoElement {
    div()
        .rounded(px(16.))
        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.75), offset: gpui::point(px(0.), px(16.)), blur_radius: px(48.), spread_radius: px(0.) }])
        .child(picker)
        .with_animation(
            SharedString::from(key),
            gpui::Animation::new(std::time::Duration::from_millis(150)).with_easing(gpui::ease_out_quint()),
            |d, t| d.relative().top(px(8. * (1. - t))).opacity(t),
        )
}

fn favorites_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("fav-emojis.json"))
}

/// `huddle-fav-emojis`: kept on this computer, like the browser's localStorage.
fn load_favorites() -> Vec<String> {
    favorites_path()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_else(|| ["transgender_flag", "heart", "sparkles"].iter().map(|s| s.to_string()).collect())
}

fn save_favorites(list: &[String]) {
    if let Some(path) = favorites_path() {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(path, serde_json::to_vec(list).unwrap_or_default());
    }
}

impl super::Shell {
    /// handleOpenReactionPicker: 450px tall, 200px above the button (kept 16px inside the window),
    /// its right edge 8px left of the button. The same button again closes it.
    pub(super) fn open_reaction_picker(&mut self, message_id: String, anchor: gpui::Point<gpui::Pixels>, window: &mut Window, cx: &mut Context<Self>) {
        let target = super::PickerTarget::Reaction { message_id, left: f32::from(anchor.x), top: f32::from(anchor.y) };
        if self.picker.as_ref().is_some_and(|p| p.target == target) {
            self.close_picker(window, cx);
            return;
        }
        self.open_picker(target, window, cx);
    }

    pub(super) fn toggle_composer_picker(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.picker.as_ref().is_some_and(|p| p.target == super::PickerTarget::Composer) {
            self.close_picker(window, cx);
        } else {
            self.open_picker(super::PickerTarget::Composer, window, cx);
        }
    }

    fn open_picker(&mut self, target: super::PickerTarget, window: &mut Window, cx: &mut Context<Self>) {
        // No server emoji in a DM (`serverId` is null there).
        let custom = if self.home { Vec::new() } else { self.server_id.as_ref().and_then(|s| self.emojis.get(s)).cloned().unwrap_or_default() };
        let client = self.client.clone();
        let entity = cx.new(|cx| EmojiPicker::new(custom, move |u| client.absolute(u), window, cx));
        let sub = cx.subscribe_in(&entity, window, |this, _, event, window, cx| match event {
            PickerEvent::Close => this.close_picker(window, cx),
            PickerEvent::Pick(picked) => {
                let Some(open) = this.picker.as_ref() else { return };
                let target = open.target.clone();
                match target {
                    super::PickerTarget::Reaction { message_id, .. } => {
                        if picked.shift {
                            this.add_quick_reaction(picked.code.clone(), cx);
                        } else {
                            this.toggle_reaction(message_id, picked.code.clone(), cx);
                        }
                    }
                    super::PickerTarget::Composer => {
                        let text = format!("{}{} ", this.composer.read(cx).value(), picked.code);
                        this.composer.update(cx, |c, cx| c.set_value(&text, cx));
                    }
                }
                this.close_picker(window, cx);
            }
        });
        self.picker_seq += 1;
        self.picker = Some(super::OpenPicker { target, entity, key: self.picker_seq, _sub: sub });
        cx.notify();
    }

    pub(super) fn close_picker(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.picker.take().is_some() {
            window.focus(&self.composer.focus_handle(cx));
            cx.notify();
        }
    }

    /// addQuickReaction: onto the end of your toolbar's reactions (the starters if you had none).
    fn add_quick_reaction(&mut self, code: String, cx: &mut Context<Self>) {
        let base: Vec<String> = if self.me.quick_reactions.is_empty() {
            ["👍", "❤️", "😂"].iter().map(|s| s.to_string()).collect()
        } else {
            self.me.quick_reactions.clone()
        };
        if base.contains(&code) {
            self.toast(format!("{code} is already in quick reactions"), cx);
            return;
        }
        let mut next = base;
        next.push(code);
        self.me.quick_reactions = next.clone();
        let client = self.client.clone();
        cx.background_executor().spawn(async move { client.set_quick_reactions(&next) }).detach();
        cx.notify();
    }

    /// The reaction picker floats over everything on a clear backdrop that closes it; the composer's
    /// (`.popover-picker`) sits 60px over the chat card's bottom, 20px in from its right, with no
    /// backdrop: it stays until its button, Esc, × or a pick closes it.
    pub(super) fn render_picker(&self, window: &Window, cx: &mut Context<Self>) -> Option<gpui::AnyElement> {
        let open = self.picker.as_ref()?;
        let size = window.viewport_size();
        Some(match &open.target {
            super::PickerTarget::Reaction { left, top, .. } => {
                let (w, h) = (f32::from(size.width), f32::from(size.height));
                let mut top = (top - 200.).max(16.);
                if top + 450. > h - 16. {
                    top = h - 450. - 16.;
                }
                let right = (w - left + 8.).max(16.);
                div()
                .absolute()
                .top_0()
                .left_0()
                .w(size.width)
                .h(size.height)
                .child(
                    div()
                        .id("picker-backdrop")
                        .absolute()
                        .inset_0()
                        .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, window, cx| this.close_picker(window, cx))),
                )
                .child(div().absolute().top(px(top)).right(px(right)).child(pop(open.entity.clone(), format!("picker-{}", open.key))))
                .into_any_element()
            }
            super::PickerTarget::Composer => {
                let right = f32::from(size.width) - 300. - f32::from(self.chat_panel_width(window)) + 20.;
                div().absolute().bottom(px(60.)).right(px(right)).child(open.entity.clone()).into_any_element()
            }
        })
    }
}
