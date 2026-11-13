//! The composer's media picker (components/gif-picker.tsx): Hoffy stickers, Klipy GIFs and
//! stickers, the server's stickers, and the emoji picker. Picking an item sends its link as a
//! message (the message then shows the picture).

use gpui::{AnyElement, Context, Entity, FontWeight, Hsla, ObjectFit, SharedString, Subscription, Window, div, prelude::*, px, rgb};
use serde::Deserialize;

use super::Shell;
use crate::input::{InputEvent, Look, TextInput};
use crate::theme::Theme;
use crate::ui;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default)]
pub struct MediaItem {
    pub id: String,
    pub url: String,
    pub preview: Option<String>,
    pub description: Option<String>,
    pub name: Option<String>,
}

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Tab {
    Hoffy,
    Gifs,
    Stickers,
    Server,
}

pub(super) struct GifPicker {
    pub tab: Tab,
    pub query: Entity<TextInput>,
    pub items: Vec<MediaItem>,
    pub hint: String,
    pub loading: bool,
    seq: u64,
    _sub: Subscription,
}

/// HOFFY_STICKERS and GANG_STICKERS (app/lib/hoffy-stickers.ts): id and search words.
const HOFFY: [(&str, &str); 12] = [
    ("hi", "hi hello hey wave selam merhaba"),
    ("lol", "lol haha laugh funny gülmek komik"),
    ("yay", "yay party hooray celebrate parti kutlama"),
    ("zzz", "zzz sleepy tired night uyku uykulu gece"),
    ("love", "love heart cute aşk kalp sevgi"),
    ("omg", "omg wow shocked surprised şok vay"),
    ("sad", "sad sorry cry üzgün ağlamak"),
    ("cool", "cool sunglasses hacker matrix havalı"),
    ("wink", "wink ok sure göz kırpmak"),
    ("spooky", "spooky vampire halloween vampir cadılar"),
    ("in-voice", "voice call talk headset ses arama konuş"),
    ("gg", "gg dnd dice wizard nat20 zar büyücü"),
];
const GANG: [(&str, &str); 19] = [
    ("hoffy-hi", "hi hello hey wave greeting selam merhaba"),
    ("hoffy-voice", "hop in voice chat call join talk gaming sese gel sesli sohbet"),
    ("hoffy-gg", "gg good game win victory celebrate kazandık"),
    ("hoffy-love", "love it heart aww bayıldım aşk kalp"),
    ("hoffy-gn", "gn good night sleepy tired zzz iyi geceler uykum geldi"),
    ("toast-seen", "seen left on seen read ignored ghosted görüldü"),
    ("toast-k", "k ok okay whatever dry text tmm tamam"),
    ("toast-cry", "no noooo cry crying sad tears hayır ağlıyorum üzgün"),
    ("pancake-voice", "voice note voice message rambling long sesli mesaj ses kaydı"),
    ("pancake-lol", "lol haha laughing funny lmao ahahah gülmek komik"),
    ("egg-omw", "omw on my way running late 5 min hurry yoldayım geliyorum geç kaldım"),
    ("egg-omg", "omg shocked surprised wow what oha şok şaşkın"),
    ("egg-hmm", "hmm suspicious side eye thinking sus şüpheli"),
    ("donut-muted", "you're muted mute mic unmute call meeting sesin kapalı mikrofon sessiz"),
    ("donut-dance", "dance dancing party music vibing dans parti müzik"),
    ("broccoli-salad", "i brought salad healthy broccoli veggies salata getirdim brokoli sağlıklı"),
    ("croissant-bonjour", "bonjour hello french croissant fancy bonjur kruvasan"),
    ("coffee-jitters", "too much coffee caffeine jittery hyper monday fazla kahve kafein pazartesi"),
    ("gang-yay", "yay celebrate happy excited squad party friends yaşasın kutlama arkadaşlar"),
];

/// hoffyStickerItems: Hoffy's, then the gang's (in the app's language), matching every word.
fn hoffy_items(query: &str) -> Vec<MediaItem> {
    let words: Vec<String> = query.to_lowercase().split_whitespace().map(str::to_string).collect();
    let matches = |id: &str, tags: &str| words.iter().all(|w| format!("{id} {tags}").contains(w.as_str()));
    let lang = if crate::i18n::locale() == "tr" { "tr" } else { "en" };
    let mut out: Vec<MediaItem> = HOFFY
        .iter()
        .filter(|(id, tags)| matches(id, tags))
        .map(|(id, _)| MediaItem { id: format!("hoffy-{id}"), url: format!("/hangout/stickers/hoffy/{id}.svg"), name: Some(format!("Hoffy: {id}")), ..Default::default() })
        .collect();
    out.extend(GANG.iter().filter(|(id, tags)| matches(id, tags)).map(|(id, _)| MediaItem {
        id: format!("gang-{id}"),
        url: format!("/hangout/stickers/gang/{id}-{lang}.webp"),
        preview: Some(format!("/hangout/stickers/gang/preview/{id}-{lang}.webp")),
        name: Some(id.replacen('-', ": ", 1)),
        ..Default::default()
    }));
    out
}

impl Shell {
    pub(super) fn toggle_gif_picker(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.gif_picker.take().is_some() {
            window.focus(&gpui::Focusable::focus_handle(&self.composer, cx));
            cx.notify();
            return;
        }
        self.close_picker(window, cx);
        let query = cx.new(|cx| {
            TextInput::new("Search Hoffy", cx).look(Look {
                size: 16.,
                line_height: 38.,
                height: 38.,
                color: gpui::white().into(),
                placeholder: Hsla::from(Theme::ink()).opacity(0.45),
            })
        });
        window.focus(&gpui::Focusable::focus_handle(&query, cx));
        let sub = cx.subscribe_in(&query, window, |this, _, event, window, cx| match event {
            InputEvent::Changed => this.load_gif_items(cx),
            InputEvent::Escape => this.toggle_gif_picker(window, cx),
            InputEvent::Submit => {}
        });
        self.gif_picker = Some(GifPicker { tab: Tab::Hoffy, query, items: hoffy_items(""), hint: String::new(), loading: false, seq: 0, _sub: sub });
        cx.notify();
    }

    pub(super) fn dev_gif_tab(&mut self, cx: &mut Context<Self>) {
        self.set_gif_tab(Tab::Gifs, cx);
    }

    fn set_gif_tab(&mut self, tab: Tab, cx: &mut Context<Self>) {
        if let Some(picker) = self.gif_picker.as_mut() {
            picker.tab = tab;
            let placeholder = match tab {
                Tab::Gifs => "Search GIFs",
                Tab::Hoffy => "Search Hoffy",
                _ => "Search stickers",
            };
            picker.query.update(cx, |q, cx| q.set_placeholder(placeholder, cx));
        }
        self.load_gif_items(cx);
    }

    /// The tab's items: Hoffy's at once; Klipy's after a 300ms pause in typing; the server's pack.
    fn load_gif_items(&mut self, cx: &mut Context<Self>) {
        let server = if self.home { None } else { self.server_id.clone() };
        let Some(picker) = self.gif_picker.as_mut() else { return };
        let query = picker.query.read(cx).text();
        picker.seq += 1;
        let seq = picker.seq;
        match picker.tab {
            Tab::Hoffy => {
                picker.items = hoffy_items(&query);
                picker.hint.clear();
                picker.loading = false;
                cx.notify();
                return;
            }
            Tab::Server if server.is_none() => {
                picker.items.clear();
                picker.hint = "Open a server to see its stickers.".into();
                cx.notify();
                return;
            }
            _ => {}
        }
        picker.loading = true;
        let tab = picker.tab;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            if tab != Tab::Server {
                cx.background_executor().timer(std::time::Duration::from_millis(300)).await;
            }
            if this.update(cx, |this, _| this.gif_picker.as_ref().is_none_or(|p| p.seq != seq)).unwrap_or(true) {
                return;
            }
            let result = cx
                .background_executor()
                .spawn(async move {
                    match tab {
                        Tab::Gifs => client.media("gifs", &query),
                        Tab::Stickers => client.media("stickers", &query),
                        _ => client.server_stickers(server.as_deref().unwrap_or_default()),
                    }
                })
                .await;
            this.update(cx, |this, cx| {
                let Some(picker) = this.gif_picker.as_mut().filter(|p| p.seq == seq) else { return };
                picker.loading = false;
                match result {
                    Ok((items, hint)) => {
                        picker.items = items;
                        picker.hint = hint;
                    }
                    Err(_) => {
                        picker.items.clear();
                        picker.hint = if tab == Tab::Server { "Could not load server stickers.".into() } else { "Search is unavailable right now.".into() };
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// Picking: the link goes out as a message of its own.
    fn send_media(&mut self, url: String, window: &mut Window, cx: &mut Context<Self>) {
        self.gif_picker = None;
        window.focus(&gpui::Focusable::focus_handle(&self.composer, cx));
        let Some(channel) = self.channel_id.clone() else { return };
        let client = self.client.clone();
        let reply = self.reply_to.take().map(|(id, _)| id);
        cx.spawn(async move |this, cx| {
            let sent = cx.background_executor().spawn(async move { client.send(&channel, &url, reply.as_deref()) }).await;
            this.update(cx, |this, cx| match sent {
                Ok(message) => this.add_message(message, cx),
                Err(e) => this.set_notice(e.to_string(), cx),
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// `.gif-picker`: in the composer's place above the box, 360px at most, scrolling.
    pub(super) fn render_gif_picker(&self, width: f32, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let picker = self.gif_picker.as_ref()?;
        let muted: Hsla = Theme::muted().into();
        let tab = |id: &'static str, label: &'static str, which: Tab| {
            let active = picker.tab == which;
            div()
                .id(id)
                .px(px(10.))
                .py(px(6.))
                .rounded_t(px(8.))
                .text_size(px(13.))
                .line_height(px(19.5))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(if active { Theme::ink().into() } else { muted })
                .when(active, |d| d.bg(Theme::panel()))
                .cursor_pointer()
                .child(label)
                .on_click(cx.listener(move |this, _, _, cx| this.set_gif_tab(which, cx)))
        };
        let tabs = div()
            .flex()
            .items_center()
            .gap(px(4.))
            .px(px(8.))
            .pt(px(6.))
            .child(tab("gt-hoffy", "Hoffy", Tab::Hoffy))
            .child(tab("gt-gifs", "GIFs", Tab::Gifs))
            .child(tab("gt-stickers", "Stickers", Tab::Stickers))
            .child(tab("gt-server", "Server", Tab::Server))
            .child(
                div()
                    .id("gt-emoji")
                    .px(px(10.))
                    .py(px(6.))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(muted)
                    .cursor_pointer()
                    .child("Emoji")
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.gif_picker = None;
                        this.toggle_composer_picker(window, cx);
                    })),
            )
            .child(div().flex_1())
            .child(
                div()
                    .id("gt-close")
                    .px(px(10.))
                    .py(px(6.))
                    .text_size(px(16.))
                    .line_height(px(19.5))
                    .text_color(muted)
                    .cursor_pointer()
                    .child("×")
                    .on_click(cx.listener(|this, _, window, cx| this.toggle_gif_picker(window, cx))),
            );
        let focused = gpui::Focusable::focus_handle(&picker.query, cx).is_focused(window);
        let search = (picker.tab != Tab::Server).then(|| {
            div()
                // The focused field's 3px lavender ring.
                .when(focused, |d| {
                    d.shadow(vec![gpui::BoxShadow { color: Hsla::from(Theme::lavender()).opacity(0.32), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(3.) }])
                })
                .h(px(38.))
                .px(px(12.))
                .rounded(px(10.))
                .bg(rgb(0x17181e))
                .border_1()
                .border_color(rgb(0x4b4d5b))
                .child(picker.query.clone())
        });
        // `.gif-grid`: four columns 6px apart; each picture 96px tall, as wide as its shape (at most
        // the column).
        let inner = width - 22.;
        let column = (inner - 18.) / 4.;
        let mut grid = div().mt(px(10.)).flex().flex_wrap().gap(px(6.));
        for item in &picker.items {
            let src = self.client.absolute(item.preview.as_deref().unwrap_or(&item.url));
            let resource = gpui::Resource::Uri(src.clone().into());
            let w = cell_width(&resource, column, cx);
            let url = item.url.clone();
            grid = grid.child(
                div().w(px(column)).h(px(102.)).child(
                    div()
                        .id(SharedString::from(format!("gif-{}", item.id)))
                        .w(px(w))
                        .h(px(96.))
                        .rounded(px(10.))
                        .overflow_hidden()
                        .cursor_pointer()
                        .child(gpui::img(ui::cover(resource, w / 96.)).size_full().rounded(px(10.)).object_fit(ObjectFit::Cover))
                        .on_click(cx.listener(move |this, _, window, cx| this.send_media(url.clone(), window, cx))),
                ),
            );
        }
        let hint = if !picker.hint.is_empty() {
            Some(picker.hint.clone())
        } else if picker.items.is_empty() {
            Some(if picker.loading { "Looking…".into() } else if picker.tab == Tab::Server { "No server stickers yet.".into() } else { "Nothing matched that.".into() })
        } else {
            None
        };
        Some(
            div()
                .id("gif-picker")
                .flex_none()
                .mb(px(8.))
                .max_h(px(360.))
                .overflow_y_scroll()
                .p(px(10.))
                .rounded(px(16.))
                .bg(rgb(0x202129))
                .border_1()
                .border_color(rgb(0x41434f))
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(24.)), blur_radius: px(60.), spread_radius: px(0.) }])
                .child(tabs)
                .children(search)
                .children(hint.map(|h| div().mx(px(4.)).my(px(10.)).text_size(px(12.)).line_height(px(18.)).text_color(muted).child(h)))
                .child(grid)
                .on_key_down(cx.listener(|this, e: &gpui::KeyDownEvent, window, cx| {
                    if e.keystroke.key == "escape" {
                        this.toggle_gif_picker(window, cx);
                    }
                }))
                .into_any_element(),
        )
    }
}

/// A grid picture's width at 96px tall, from its shape once it has loaded (square until then; the
/// picker redraws when it arrives).
fn cell_width(resource: &gpui::Resource, column: f32, cx: &mut Context<Shell>) -> f32 {
    let (task, first) = cx.fetch_asset::<gpui::ImgResourceLoader>(resource);
    match smol::future::block_on(smol::future::poll_once(task.clone())) {
        Some(Ok(image)) => {
            let size = image.size(0);
            let (w, h) = (size.width.0 as f32, size.height.0 as f32);
            if h > 0. { (96. * w / h).min(column) } else { 96f32.min(column) }
        }
        Some(Err(_)) => 96f32.min(column),
        None => {
            if first {
                cx.spawn(async move |this, cx| {
                    task.await.ok();
                    this.update(cx, |_, cx| cx.notify()).ok();
                })
                .detach();
            }
            96f32.min(column)
        }
    }
}
