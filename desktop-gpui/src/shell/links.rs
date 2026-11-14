//! What links in a message turn into (components/message-body.tsx, link-preview.tsx): picture links
//! as the picture (`.message-gif`), YouTube links as a card with the thumbnail and a play button,
//! and other links as a preview card from `/api/unfurl` (three at most).

use gpui::{AnyElement, Context, FontWeight, Hsla, ObjectFit, SharedString, Window, div, prelude::*, px, rgb, rgba};
use serde::Deserialize;

use super::Shell;
use crate::model::Message;
use crate::theme::Theme;
use crate::ui;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preview {
    pub site_name: String,
    pub title: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub large_image: bool,
    pub theme_color: Option<String>,
    pub gif: bool,
}

/// youtubeId: watch, youtu.be, shorts, embed and live links.
pub fn youtube_id(raw: &str) -> Option<String> {
    let url = url::Url::parse(raw).ok()?;
    let host = url.host_str()?.trim_start_matches("www.").trim_start_matches("m.").trim_start_matches("music.");
    let id = if host == "youtu.be" {
        url.path().trim_start_matches('/').split('/').next().map(str::to_string)
    } else if host == "youtube.com" || host == "youtube-nocookie.com" {
        if url.path() == "/watch" {
            url.query_pairs().find(|(k, _)| k == "v").map(|(_, v)| v.to_string())
        } else {
            let mut parts = url.path().trim_start_matches('/').split('/');
            match parts.next() {
                Some("shorts" | "embed" | "live") => parts.next().map(str::to_string),
                _ => None,
            }
        }
    } else {
        None
    }?;
    (id.len() >= 6 && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')).then_some(id)
}

/// isGifPageUrl: a Tenor or Giphy page.
pub fn is_gif_page(raw: &str) -> bool {
    let Ok(url) = url::Url::parse(raw) else { return false };
    let host = url.host_str().unwrap_or("").trim_start_matches("www.");
    let segments: Vec<&str> = url.path().trim_matches('/').split('/').collect();
    (host == "tenor.com" && segments.iter().any(|s| *s == "view")) || (host == "giphy.com" && matches!(segments.first(), Some(&"gifs" | &"stickers")))
}

/// proxiedImage: outside pictures load through Hoffle, so a link cannot collect readers' addresses.
fn proxied(url: &str) -> String {
    if url.starts_with("http://") || url.starts_with("https://") {
        format!("/hangout/api/unfurl/image?url={}", url::form_urlencoded::byte_serialize(url.as_bytes()).collect::<String>())
    } else {
        url.to_string()
    }
}

impl Shell {
    /// The preview for a link once `/api/unfurl` answered (asked for once per link).
    fn preview(&self, url: &str, cx: &mut Context<Self>) -> Option<Preview> {
        if let Some(hit) = self.unfurls.borrow().get(url) {
            return hit.clone();
        }
        if !self.unfurl_pending.borrow_mut().insert(url.to_string()) {
            return None;
        }
        let (client, link) = (self.client.clone(), url.to_string());
        cx.spawn(async move |this, cx| {
            let target = link.clone();
            let preview = cx.background_executor().spawn(async move { client.unfurl(&target) }).await.ok().flatten();
            this.update(cx, |this, cx| {
                this.unfurls.borrow_mut().insert(link, preview);
                // Rows were measured without it.
                if let Some(list) = this.channel_id.as_ref().and_then(|c| this.messages.get(c)) {
                    this.list.splice(0..list.len(), list.len());
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        None
    }

    /// Everything a message's links add under its text.
    pub(super) fn render_link_extras(&self, message: &Message, column: f32, window: &mut Window, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let (images, links) = crate::markdown::link_parts(&message.text);
        let mut out = Vec::new();
        for (n, url) in images.iter().enumerate() {
            out.push(self.render_gif(message, n, &proxied(url), window, cx));
        }
        // A message that is only a Tenor/Giphy page: just the GIF.
        let trimmed = message.text.trim();
        if links.len() == 1 && trimmed == links[0] && is_gif_page(trimmed) {
            if let Some(gif) = self.preview(trimmed, cx).filter(|p| p.gif).and_then(|p| p.image) {
                out.push(self.render_gif(message, 100, &gif, window, cx));
            }
            return out;
        }
        for (n, url) in links.iter().take(3).enumerate() {
            if super::message_link::parse(url).is_some() {
                out.extend(self.render_message_link(message, n, url, column, cx));
                continue;
            }
            let preview = self.preview(url, cx);
            if let Some(id) = youtube_id(url) {
                out.push(self.render_youtube(message, n, url, &id, preview, column));
            } else if let Some(p) = preview {
                if p.gif && p.image.is_some() {
                    out.push(self.render_gif(message, 200 + n, p.image.as_deref().unwrap_or_default(), window, cx));
                } else {
                    out.push(self.render_preview(message, n, url, p, column));
                }
            }
        }
        out
    }

    /// `.message-image.message-gif`: at its own size, 320 wide at most, 10px corners, a thin edge.
    fn render_gif(&self, message: &Message, n: usize, src: &str, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let link = self.client.absolute(src);
        let resource = gpui::Resource::Uri(link.clone().into());
        let (w, h) = match ui::image_size(&resource, window, cx) {
            // `max-width: 320px` counts the 1px edge (border-box).
            Some((w, h)) if w > 0. => {
                let width = (w + 2.).min(320.) - 2.;
                (width, width * h / w)
            }
            _ => (318., 179.),
        };
        if self.sized.borrow_mut().insert(format!("{}-gif-{n}", message.id)) && ui::image_size(&resource, window, cx).is_some() {
            let id = message.id.clone();
            cx.defer_in(window, move |this, _, cx| {
                this.refresh_message(&id);
                cx.notify();
            });
        }
        let open = link.clone();
        div()
            .id(SharedString::from(format!("gif-{}-{n}", message.id)))
            .mt(px(8.))
            .w(px(w + 2.))
            .h(px(h + 2.))
            .rounded(px(10.))
            .border_1()
            .border_color(rgb(0xe0d9d2))
            .cursor_pointer()
            .child(gpui::img(link).size_full().rounded(px(9.)).object_fit(ObjectFit::Cover).with_loading(|| div().into_any_element()))
            .on_click(move |_, _, cx| cx.open_url(&open))
            .into_any_element()
    }

    pub(super) fn card_frame(accent: Hsla) -> gpui::Div {
        div()
            .mt(px(8.))
            .pl(px(12.))
            .pr(px(14.))
            .pt(px(10.))
            .pb(px(12.))
            .rounded(px(6.))
            .bg(Hsla::from(rgb(0x231f31)).opacity(0.89))
            .border_1()
            .border_color(rgba(0xffffff12))
            .relative()
            // The 4px coloured edge on the left.
            .child(div().absolute().left(px(-1.)).top(px(-1.)).bottom(px(-1.)).w(px(4.)).rounded_l(px(6.)).bg(accent))
    }

    fn render_youtube(&self, message: &Message, n: usize, url: &str, id: &str, preview: Option<Preview>, column: f32) -> AnyElement {
        let width = column.min(480.);
        let inner = width - 4. - 12. - 14.;
        let title = preview.as_ref().map(|p| p.title.clone()).filter(|t| !t.is_empty()).unwrap_or_else(|| "YouTube video".into());
        let thumb = preview.as_ref().and_then(|p| p.image.clone()).unwrap_or_else(|| proxied(&format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg")));
        let open = url.to_string();
        let open_title = url.to_string();
        Self::card_frame(rgb(0xff0033).into())
            .w(px(width))
            .flex()
            .flex_col()
            .gap(px(4.))
            .child(div().pl(px(4.)).text_size(px(12.)).line_height(px(18.)).text_color(Theme::muted()).child("YouTube"))
            .when_some(preview.as_ref().and_then(|p| p.author.clone()), |d, author| {
                d.child(div().pl(px(4.)).text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::SEMIBOLD).text_color(Theme::ink()).child(author))
            })
            .child(
                div()
                    .id(SharedString::from(format!("yt-title-{}-{n}", message.id)))
                    .pl(px(4.))
                    .text_size(px(14.))
                    .line_height(px(18.2))
                    .font_weight(FontWeight::BOLD)
                    .text_color(rgb(0x3b9ef5))
                    .cursor_pointer()
                    .hover(|s| s.underline())
                    .child(title)
                    .on_click(move |_, _, cx| cx.open_url(&open_title)),
            )
            .child(
                // `.link-preview-player`: 16:9 under the title; playing opens YouTube.
                div()
                    .id(SharedString::from(format!("yt-{}-{n}", message.id)))
                    .ml(px(4.))
                    .mt(px(6.))
                    .w(px(inner))
                    .h(px(inner * 9. / 16.))
                    .rounded(px(6.))
                    .bg(gpui::black())
                    .relative()
                    .cursor_pointer()
                    .group("yt-play")
                    .child(gpui::img(ui::cover(gpui::Resource::Uri(self.client.absolute(&thumb).into()), 16. / 9.)).size_full().rounded(px(6.)).object_fit(ObjectFit::Cover))
                    .child(
                        div().absolute().inset_0().flex().items_center().justify_center().child(
                            div()
                                .size(px(60.))
                                .rounded_full()
                                .bg(rgba(0x000000a6))
                                .group_hover("yt-play", |s| s.bg(rgb(0xff0033)))
                                .flex()
                                .items_center()
                                .justify_center()
                                .child(ui::icon("play-filled", 26., gpui::white())),
                        ),
                    )
                    .on_click(move |_, _, cx| cx.open_url(&open)),
            )
            .into_any_element()
    }

    /// LinkPreviewCard: site, author, title (blue), four lines of description, and the picture
    /// (wide under the text, or an 80px square beside it).
    fn render_preview(&self, message: &Message, n: usize, url: &str, p: Preview, column: f32) -> AnyElement {
        let accent: Hsla = p.theme_color.as_deref().and_then(crate::theme::css_color).unwrap_or_else(|| Theme::lavender().into());
        let width = column.min(440.);
        let open = url.to_string();
        let image = p.image.clone().map(|src| self.client.absolute(&src));
        let mut text = div()
            .flex_1()
            .min_w_0()
            .pl(px(4.))
            .flex()
            .flex_col()
            .gap(px(4.))
            .child(div().text_size(px(12.)).line_height(px(18.)).text_color(Theme::muted()).child(p.site_name.clone()))
            .when_some(p.author.clone(), |d, a| d.child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::SEMIBOLD).text_color(Theme::ink()).child(a)))
            .child(
                div()
                    .id(SharedString::from(format!("lp-title-{}-{n}", message.id)))
                    .text_size(px(14.))
                    .line_height(px(18.2))
                    .font_weight(FontWeight::BOLD)
                    .text_color(rgb(0x3b9ef5))
                    .cursor_pointer()
                    .hover(|s| s.underline())
                    .child(p.title.clone())
                    .on_click(move |_, _, cx| cx.open_url(&open)),
            )
            .when_some(p.description.clone().filter(|d| !d.is_empty()), |d, desc| {
                d.child(div().text_size(px(13.)).line_height(px(18.2)).text_color(Theme::ink()).opacity(0.85).line_clamp(4).child(desc))
            });
        if p.large_image
            && let Some(src) = image.clone()
        {
            let inner = width - 4. - 12. - 14. - 4.;
            let h = (inner * 9. / 16.).min(260.);
            text = text.child(gpui::img(ui::cover(gpui::Resource::Uri(src.into()), inner / h)).mt(px(8.)).w(px(inner)).h(px(h)).rounded(px(6.)).object_fit(ObjectFit::Cover));
        }
        Self::card_frame(accent)
            .w(px(width))
            .flex()
            .gap(px(14.))
            .child(text)
            .when(!p.large_image, |d| {
                d.when_some(image, |d, src| d.child(gpui::img(ui::cover(gpui::Resource::Uri(src.into()), 1.)).flex_none().size(px(80.)).rounded(px(6.)).object_fit(ObjectFit::Cover)))
            })
            .into_any_element()
    }
}
