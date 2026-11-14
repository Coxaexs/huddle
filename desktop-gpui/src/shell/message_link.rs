//! MessageLinkCard (message-link-card.tsx): under a copied message link, who said it, where and
//! what; clicking it opens the message. One the viewer cannot read gets an "unavailable" card.

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, div, prelude::*, px};
use serde_json::Value;

use super::Shell;
use crate::model::Message;
use crate::theme::Theme;
use crate::ui;

/// parseMessageLink: a link to this Hoffle (or another address of it) with a `?message=` id.
pub(super) fn parse(url: &str) -> Option<(String, Option<String>, Option<String>)> {
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))?;
    let (host_path, query) = rest.split_once('?')?;
    let (host, path) = host_path.split_once('/').map_or((host_path, ""), |(h, p)| (h, p));
    if !["chat.hoffle.online", "deeppixel.online", "www.deeppixel.online"].contains(&host) {
        return None;
    }
    let path = path.trim_end_matches('/');
    if !path.is_empty() && path != "hangout" {
        return None;
    }
    let query = query.split('#').next().unwrap_or_default();
    let param = |name: &str| {
        query.split('&').find_map(|kv| kv.split_once('=').filter(|(k, _)| *k == name).map(|(_, v)| v.trim().to_string())).filter(|v| !v.is_empty())
    };
    let id = param("message")?;
    if id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return None;
    }
    Some((id, param("channel"), param("server")))
}

impl Shell {
    /// `/api/messages/<id>`, once per message: Some(Some(..)) when readable, Some(None) when not.
    fn linked(&self, id: &str, cx: &mut Context<Self>) -> Option<Option<Value>> {
        if let Some(hit) = self.linked_messages.borrow().get(id) {
            return Some(hit.clone());
        }
        if !self.unfurl_pending.borrow_mut().insert(format!("message:{id}")) {
            return None;
        }
        let (client, id) = (self.client.clone(), id.to_string());
        cx.spawn(async move |this, cx| {
            let target = id.clone();
            let found = cx.background_executor().spawn(async move { client.linked_message(&target) }).await.ok();
            this.update(cx, |this, cx| {
                this.linked_messages.borrow_mut().insert(id, found);
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

    pub(super) fn render_message_link(&self, message: &Message, n: usize, url: &str, column: f32, cx: &mut Context<Self>) -> Option<AnyElement> {
        let (id, channel_hint, server_hint) = parse(url)?;
        let linked = self.linked(&id, cx)?;
        let muted: Hsla = Theme::muted().into();
        let width = column.min(440.);
        let site = |label: String| {
            div().flex().items_center().gap(px(5.)).text_size(px(12.)).line_height(px(18.)).text_color(muted).child(ui::icon("message-square-quote", 13., muted)).child(label)
        };
        let description = |text: String| div().text_size(px(13.)).line_height(px(18.2)).text_color(Theme::ink()).opacity(0.85).line_clamp(4).child(text);
        let Some(data) = linked else {
            return Some(
                Self::card_frame(Theme::lavender().into())
                    .w(px(width))
                    .child(div().flex().flex_col().gap(px(4.)).child(site("Message".into())).child(description("This message is unavailable or you can't see it.".into())))
                    .into_any_element(),
            );
        };
        let m = data.get("message").cloned().unwrap_or(Value::Null);
        let field = |k: &str| m.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
        let server_id = data.get("serverId").and_then(Value::as_str).map(str::to_string);
        let where_ = if server_id.is_some() { format!("#{}", data.get("channelName").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or("channel")) } else { "Direct message".into() };
        let text = field("text");
        let attachment = if m.get("image").is_some_and(|v| v.is_string()) || m.get("images").and_then(Value::as_array).is_some_and(|a| !a.is_empty()) {
            "🖼️ Image".to_string()
        } else if let Some(name) = m.get("files").and_then(Value::as_array).and_then(|a| a.first()).and_then(|f| f.get("name")).and_then(Value::as_str) {
            format!("📎 {name}")
        } else {
            String::new()
        };
        let color: Hsla = crate::theme::css_color(&field("color")).unwrap_or_else(|| Theme::ink().into());
        let channel = data.get("channelId").and_then(Value::as_str).map(str::to_string).or(channel_hint);
        let server = server_id.or(server_hint);
        let target = field("id");
        let mut body = div()
            .flex()
            .flex_col()
            .gap(px(4.))
            .child(site(where_))
            .child(
                div()
                    .flex()
                    .items_baseline()
                    .gap(px(8.))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .child(div().font_weight(FontWeight::BOLD).text_color(color).child(field("author")))
                    .child(div().text_size(px(11.)).line_height(px(16.5)).text_color(muted).child(super::side_panels::date_time(&field("createdAt")))),
            );
        if !text.is_empty() {
            body = body.child(description(text).line_height(px(20.15)));
        } else if !attachment.is_empty() {
            body = body.child(description(attachment));
        }
        Some(
            Self::card_frame(Theme::lavender().into())
                .id(SharedString::from(format!("ml-{}-{n}", message.id)))
                .w(px(width))
                .cursor_pointer()
                // color-mix(panel 75%, lavender 10%): the two normalised, at 85%.
                .hover(|s| s.bg(crate::theme::mix(Theme::panel(), 0.75 / 0.85, Theme::lavender()).opacity(0.85)))
                .tooltip(ui::tooltip("Jump to message"))
                .child(body)
                .on_click(cx.listener(move |this, _, window, cx| {
                    if let Some(channel) = channel.clone() {
                        this.jump_to_message(server.clone(), channel, target.clone(), window, cx);
                    }
                }))
                .into_any_element(),
        )
    }
}
